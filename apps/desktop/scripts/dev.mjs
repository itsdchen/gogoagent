import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(rootDir, '../..')
const sidecarDir = path.resolve(rootDir, '../../services/sidecar')

const requestedPort = Number(process.env.GOGOAGENT_PORT ?? 43111)
const env = { ...process.env, GOGOAGENT_PORT: String(requestedPort) }
const reuseExistingSidecar = process.env.GOGOAGENT_REUSE_SIDECAR !== '0'
const keepSidecarOnExit = process.env.GOGOAGENT_KEEP_SIDECAR_ON_EXIT !== '0'
const sidecarDevScript = process.env.GOGOAGENT_WATCH_SIDECAR === '1' ? 'dev:watch' : 'dev'

function sidecarBaseUrl() {
  return `http://127.0.0.1:${env.GOGOAGENT_PORT}`
}

function run(command, args, cwd, options = {}) {
  return spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: Boolean(options.detached) && process.platform !== 'win32',
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isSidecarHealthy() {
  try {
    const response = await fetch(`${sidecarBaseUrl()}/health`)
    if (!response.ok) return false
    const health = await response.json()
    return health?.service === 'gogoagent-sidecar'
  } catch {
    return false
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`could not find a free sidecar port starting at ${startPort}`)
}

async function waitForSidecar(timeoutMs = 15000) {
  const startedAt = Date.now()
  let lastError = 'not ready'
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${sidecarBaseUrl()}/health`)
      if (response.ok) return
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(250)
  }
  throw new Error(`sidecar did not become healthy at ${sidecarBaseUrl()}: ${lastError}`)
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) return ''
  return result.stdout.trim()
}

function listenerDetails(port) {
  const output = commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
  if (!output) return ''
  return output
    .split('\n')
    .slice(0, 8)
    .map((line) => `  ${line}`)
    .join('\n')
}

function printSidecarCleanupHint(port, reason) {
  if (reason) console.warn(`[gogoagent/desktop] ${reason}`)
  const details = listenerDetails(port)
  if (details) {
    console.warn(`[gogoagent/desktop] listener on port ${port}:`)
    console.warn(details)
  }
  console.warn(`[gogoagent/desktop] cleanup: lsof -tiTCP:${port} -sTCP:LISTEN | xargs -r kill`)
  console.warn("[gogoagent/desktop] inspect: pgrep -af 'tsx.*src/index.ts|services/sidecar|gogoagent'")
  console.warn('[gogoagent/desktop] force a fresh sidecar: GOGOAGENT_REUSE_SIDECAR=0 corepack pnpm --filter @gogoagent/desktop dev')
  console.warn('[gogoagent/desktop] stop sidecar on exit: GOGOAGENT_KEEP_SIDECAR_ON_EXIT=0 corepack pnpm --filter @gogoagent/desktop dev')
}

function killChild(child, signal = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) return
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal)
      return
    }
  } catch {
    // Fall back to killing just the direct child.
  }
  try {
    child.kill(signal)
  } catch {
    // Already gone.
  }
}

// Desktop's build script builds shared first, so this avoids a duplicate
// shared build before every dev launch.
// We intentionally skip sidecar here; its build may be broken during refactors
// and shouldn't block launching the app.
const build = run(
  'corepack',
  ['pnpm', '--filter', '@gogoagent/desktop', 'build'],
  workspaceRoot
)

build.on('exit', async (code) => {
  if (code && code !== 0) {
    process.exit(code)
  }

  const existingSidecar = await isSidecarHealthy()
  let sidecar = null
  if (existingSidecar && reuseExistingSidecar) {
    console.warn(`[gogoagent/desktop] reusing existing sidecar at ${sidecarBaseUrl()}`)
  } else {
    if (existingSidecar) {
      printSidecarCleanupHint(Number(env.GOGOAGENT_PORT), 'A healthy gogoagent sidecar is already running.')
      if (process.env.GOGOAGENT_PORT) {
        console.error(`[gogoagent/desktop] ${sidecarBaseUrl()} is already serving a sidecar. Stop it first, choose a different GOGOAGENT_PORT, or set GOGOAGENT_REUSE_SIDECAR=1.`)
        process.exit(1)
      }
      const devPort = await findFreePort(requestedPort + 1)
      console.warn(`[gogoagent/desktop] ${sidecarBaseUrl()} already has a sidecar; starting this dev run on http://127.0.0.1:${devPort}`)
      env.GOGOAGENT_PORT = String(devPort)
    } else if (!(await isPortFree(Number(env.GOGOAGENT_PORT)))) {
      printSidecarCleanupHint(Number(env.GOGOAGENT_PORT), 'The default port is occupied by a process that is not a healthy gogoagent sidecar. This launch will use the next available port.')
      if (process.env.GOGOAGENT_PORT) {
        console.error(`[gogoagent/desktop] port ${env.GOGOAGENT_PORT} is already in use. Stop that process or choose a different GOGOAGENT_PORT.`)
        process.exit(1)
      }
      const devPort = await findFreePort(requestedPort + 1)
      console.warn(`[gogoagent/desktop] port ${env.GOGOAGENT_PORT} is occupied; starting this dev run on http://127.0.0.1:${devPort}`)
      env.GOGOAGENT_PORT = String(devPort)
    }
    sidecar = run('corepack', ['pnpm', sidecarDevScript], sidecarDir, { detached: true })
    if (keepSidecarOnExit) sidecar.unref()
  }
  let electron = null

  let shuttingDown = false
  function shutdown(exitCode = 0, options = {}) {
    if (shuttingDown) return
    shuttingDown = true
    const killSidecar = options.killSidecar ?? !keepSidecarOnExit
    if (killSidecar) killChild(sidecar)
    killChild(electron)
    if (!killSidecar) {
      process.exit(exitCode)
      return
    }
    setTimeout(() => {
      killChild(sidecar, 'SIGKILL')
      killChild(electron, 'SIGKILL')
      process.exit(exitCode)
    }, 2000)
  }

  sidecar?.on('exit', (exitCode) => {
    if (exitCode && exitCode !== 0) shutdown(exitCode)
  })

  process.on('SIGINT', () => shutdown(0, { killSidecar: true }))
  process.on('SIGTERM', () => shutdown(0, { killSidecar: true }))

  try {
    await waitForSidecar()
  } catch (error) {
    console.error(`[gogoagent/desktop] ${error instanceof Error ? error.message : String(error)}`)
    shutdown(1, { killSidecar: true })
    return
  }

  electron = run('node', [path.join(rootDir, 'node_modules/electron/cli.js'), '.'], rootDir, { detached: true })
  electron.on('exit', (exitCode) => shutdown(exitCode ?? 0))
})
