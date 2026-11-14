import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopRoot = path.join(workspaceRoot, 'apps/desktop')
const target = process.argv[2]
const remotePort = Number(process.env.GOGOAGENT_REMOTE_PORT ?? process.env.GOGOAGENT_PORT ?? 43111)

if (!target || target.startsWith('-') || !/^[\w.@:-]+$/.test(target)) {
  console.error('Usage: ./start.sh --remote <ssh-host-or-user@host>')
  process.exit(2)
}
if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
  console.error('GOGOAGENT_REMOTE_PORT must be a TCP port from 1 to 65535.')
  process.exit(2)
}

function childExit(child) {
  return new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: 1, error }))
    child.once('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), signal }))
  })
}

async function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' })
  activeChild = child
  const result = await childExit(child)
  activeChild = null
  if (result.code !== 0) throw new Error(`${command} exited with code ${result.code}${result.error ? `: ${result.error.message}` : ''}`)
}

async function readRemoteIdentity() {
  const command = `printf '%s\\n' "$HOME"; cat "$HOME/.gogoagent/sidecar-${remotePort}.token"`
  const child = spawn('ssh', ['-o', 'ConnectTimeout=15', target, command], { stdio: ['inherit', 'pipe', 'inherit'] })
  activeChild = child
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { output += chunk })
  const result = await childExit(child)
  activeChild = null
  if (result.code !== 0) throw new Error(`SSH could not read the remote sidecar token (exit ${result.code}). Is the sidecar running under this SSH user?`)
  const newline = output.indexOf('\n')
  const home = output.slice(0, newline).trim()
  const token = output.slice(newline + 1).trim()
  if (newline < 1 || !home.startsWith('/') || !/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new Error('The remote sidecar identity was invalid. Check the SSH login and sidecar token file.')
  }
  return { home, token }
}

async function reserveLocalPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve) => server.close(resolve))
  if (!port) throw new Error('Could not select a local tunnel port.')
  return port
}

async function waitForSidecar(localPort, token, tunnelExit) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const result = await Promise.race([
      tunnelExit.then((exit) => ({ exit })),
      fetch(`http://127.0.0.1:${localPort}/health`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      }).then(async (response) => ({ response, body: response.ok ? await response.json() : null }))
        .catch(() => ({})),
    ])
    if ('exit' in result) throw new Error(`SSH tunnel exited before the sidecar was reachable (code ${result.exit.code}).`)
    if (result.response?.status === 401) throw new Error('The remote sidecar rejected its token. Restart this attachment after checking the remote sidecar.')
    if (result.response?.ok && result.body?.service === 'gogoagent-sidecar') return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('The SSH tunnel opened, but the remote gogoagent sidecar did not respond.')
}

let tunnel
let electron
let activeChild
let tunnelExited
let electronExited
let temporaryDirectory
let stopping = false

function stopChildren() {
  stopping = true
  activeChild?.kill('SIGTERM')
  electron?.kill('SIGTERM')
  tunnel?.kill('SIGTERM')
}

async function finishChild(child, exit) {
  if (!exit) return
  let timeout
  await Promise.race([
    exit,
    new Promise((resolve) => { timeout = setTimeout(resolve, 2000) }),
  ])
  clearTimeout(timeout)
  if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

process.on('SIGINT', stopChildren)
process.on('SIGTERM', stopChildren)

try {
  await run('corepack', ['pnpm', 'build:ui'], workspaceRoot)
  if (stopping) throw new Error('Remote attachment was stopped.')
  const { home, token } = await readRemoteIdentity()
  if (stopping) throw new Error('Remote attachment was stopped.')
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-remote-'))
  const tokenFile = path.join(temporaryDirectory, 'sidecar.token')
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 })
  const localPort = await reserveLocalPort()
  tunnel = spawn('ssh', [
    '-o', 'ConnectTimeout=15',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-N', '-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    target,
  ], { stdio: 'inherit' })
  tunnelExited = childExit(tunnel)
  await waitForSidecar(localPort, token, tunnelExited)
  if (stopping) throw new Error('Remote attachment was stopped.')

  console.log(`[gogoagent/remote] Attached to ${target}. Project files and terminals stay on the remote machine.`)
  electron = spawn('node', [path.join(desktopRoot, 'node_modules/electron/cli.js'), '.'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOGOAGENT_PORT: String(localPort),
      GOGOAGENT_AUTH_TOKEN_FILE: tokenFile,
      GOGOAGENT_REMOTE_ATTACH: '1',
      GOGOAGENT_REMOTE_HOME: home,
      GOGOAGENT_REMOTE_TARGET: target,
    },
  })
  electronExited = childExit(electron)
  const outcome = await Promise.race([
    electronExited.then((exit) => ({ kind: 'electron', exit })),
    tunnelExited.then((exit) => ({ kind: 'tunnel', exit })),
  ])
  if (outcome.kind === 'tunnel' && !stopping) {
    console.error(`[gogoagent/remote] SSH tunnel closed (code ${outcome.exit.code}).`)
    process.exitCode = 1
  } else if (outcome.kind === 'electron') {
    process.exitCode = stopping ? 0 : outcome.exit.code
  }
} catch (error) {
  if (!stopping) {
    console.error(`[gogoagent/remote] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
} finally {
  stopChildren()
  await finishChild(electron, electronExited)
  await finishChild(tunnel, tunnelExited)
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
}
