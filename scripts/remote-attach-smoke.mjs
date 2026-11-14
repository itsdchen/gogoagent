#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function freePort() {
  const server = http.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address !== 'string')
  await new Promise((resolve) => server.close(resolve))
  return address.port
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch { /* startup in progress */ }
    await new Promise((resolve) => setTimeout(resolve, 125))
  }
  throw new Error('Test sidecar did not start.')
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

const testHome = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-remote-smoke-'))
const binDir = path.join(testHome, 'bin')
const fakeElectron = path.join(testHome, 'fake-electron.cjs')
let sidecar
let launcher

try {
  await mkdir(binDir)
  const remotePort = await freePort()
  const remoteTokenFile = path.join(testHome, '.gogoagent', `sidecar-${remotePort}.token`)
  await writeFile(path.join(binDir, 'ssh'), `#!/usr/bin/env node
const fs = require('node:fs')
const net = require('node:net')
const args = process.argv.slice(2)
if (!args.includes('-N')) {
  process.stdout.write(process.env.TEST_REMOTE_HOME + '\\n' + fs.readFileSync(process.env.TEST_REMOTE_TOKEN_FILE, 'utf8'))
} else {
  const bind = args[args.indexOf('-L') + 1].split(':')
  const localPort = Number(bind[1])
  const remotePort = Number(bind[3])
  const server = net.createServer((client) => {
    const upstream = net.connect(remotePort, '127.0.0.1')
    client.pipe(upstream).pipe(client)
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
  })
  server.listen(localPort, '127.0.0.1')
  process.on('SIGTERM', () => server.close())
}
`)
  await chmod(path.join(binDir, 'ssh'), 0o755)
  await writeFile(path.join(binDir, 'node'), `#!/bin/sh
case "$1" in
  */electron/cli.js) exec "$TEST_REAL_NODE" "$TEST_FAKE_ELECTRON" ;;
  *) exec "$TEST_REAL_NODE" "$@" ;;
esac
`)
  await chmod(path.join(binDir, 'node'), 0o755)
  await writeFile(fakeElectron, `const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
  assert.equal(process.env.GOGOAGENT_REMOTE_ATTACH, '1')
  assert.equal(process.env.GOGOAGENT_REMOTE_TARGET, 'mock-host')
  assert.equal(process.env.GOGOAGENT_REMOTE_HOME, process.env.TEST_REMOTE_HOME)
  assert.notEqual(process.env.GOGOAGENT_PORT, process.env.TEST_REMOTE_PORT)
  const token = fs.readFileSync(process.env.GOGOAGENT_AUTH_TOKEN_FILE, 'utf8').trim()
  const response = await fetch('http://127.0.0.1:' + process.env.GOGOAGENT_PORT + '/fs/inspect-directory?input=~', {
    headers: { authorization: 'Bearer ' + token },
  })
  assert.equal(response.status, 200)
  const directory = await response.json()
  assert.equal(directory.path, process.env.TEST_REMOTE_HOME)
  assert.equal(directory.isDirectory, true)
  process.stdout.write('remote-attach-ok\\n')
})().catch((error) => { console.error(error); process.exitCode = 1 })
`)

  sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
    cwd: repoRoot,
    env: { ...process.env, HOME: testHome, GOGOAGENT_PORT: String(remotePort) },
    stdio: 'ignore',
  })
  await waitForHealth(remotePort)
  assert((await readFile(remoteTokenFile, 'utf8')).trim())

  launcher = spawn('./start.sh', ['--remote', 'mock-host'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      GOGOAGENT_REMOTE_PORT: String(remotePort),
      TEST_REAL_NODE: process.execPath,
      TEST_FAKE_ELECTRON: fakeElectron,
      TEST_REMOTE_HOME: testHome,
      TEST_REMOTE_PORT: String(remotePort),
      TEST_REMOTE_TOKEN_FILE: remoteTokenFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  launcher.stdout.on('data', (chunk) => { output += chunk })
  launcher.stderr.on('data', (chunk) => { output += chunk })
  let timeout
  const result = await Promise.race([
    new Promise((resolve) => launcher.once('exit', (code) => resolve({ code }))),
    new Promise((resolve) => { timeout = setTimeout(() => resolve({ timeout: true }), 45000) }),
  ])
  clearTimeout(timeout)
  assert(!result.timeout, `remote launcher timed out:\n${output}`)
  assert.equal(result.code, 0, `remote launcher failed:\n${output}`)
  assert.match(output, /remote-attach-ok/, `frontend did not reach the remote sidecar:\n${output}`)
  const stillRunning = await fetch(`http://127.0.0.1:${remotePort}/health`)
  assert.equal(stillRunning.status, 200, 'closing the frontend should leave the sidecar running')
  console.log('Remote attach smoke test passed: SSH tunnel, token, remote directory, and sidecar lifecycle.')
} finally {
  await stop(launcher)
  await stop(sidecar)
  await rm(testHome, { recursive: true, force: true })
}
