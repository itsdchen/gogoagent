#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-mobile-lifecycle-'))
let sidecar

async function freePort() {
  const server = http.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function until(check, label, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const value = await check()
      if (value) return value
    } catch { /* Keep trying until the process is ready. */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

try {
  const port = await freePort()
  const sidecarUrl = `http://127.0.0.1:${port}`
  sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOME: temporary,
      GOGOAGENT_PORT: String(port),
      GOGOAGENT_MOBILE_PORT: '0',
      GOGOAGENT_MOBILE_ENTRY: path.join(root, 'services/mobile/dist/index.js'),
    },
    stdio: 'ignore',
  })
  await until(async () => (await fetch(`${sidecarUrl}/health`)).ok, 'sidecar')
  const token = (await readFile(path.join(temporary, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
  const control = async (route, method = 'GET') => {
    const response = await fetch(`${sidecarUrl}${route}`, {
      method, headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`)
    return response.json()
  }
  const unauthorized = await fetch(`${sidecarUrl}/mobile/status`)
  assert.equal(unauthorized.status, 401)
  assert.equal((await control('/mobile/status')).running, false)

  const first = await control('/mobile/start', 'POST')
  assert.equal(first.running, true)
  assert.match(first.pairingToken, /^[A-Za-z0-9_-]{40,}$/)
  const mobilePort = Number(new URL(first.connections[0].url).port)
  const mobileUrl = `http://127.0.0.1:${mobilePort}`
  const paired = await fetch(`${mobileUrl}/api/pair`, {
    method: 'POST',
    headers: { origin: mobileUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ code: first.pairingToken }),
  })
  assert.equal(paired.status, 200)
  const cookie = paired.headers.get('set-cookie')?.split(';')[0]
  assert(cookie)
  assert.equal((await control('/mobile/status')).pairedDevices, 1)

  // Desktop windows connect through these authenticated routes. Their exit
  // has no ownership over the gateway, and a new window sees the same session.
  const reopened = await control('/mobile/status')
  assert.equal(reopened.running, true)
  assert.equal(Number(new URL(reopened.connections[0].url).port), mobilePort)
  assert.equal((await fetch(`${mobileUrl}/api/dashboard`, { headers: { cookie } })).status, 200)
  assert.equal((await control('/mobile/start', 'POST')).pairedDevices, 1, 'Starting again reuses the gateway')

  assert.equal((await control('/mobile/stop', 'POST')).running, false)
  await until(async () => {
    try { await fetch(`${mobileUrl}/api/session`); return false } catch { return true }
  }, 'phone gateway shutdown')
  const restarted = await control('/mobile/start', 'POST')
  assert.equal(restarted.running, true)
  const restartedUrl = `http://127.0.0.1:${new URL(restarted.connections[0].url).port}`
  assert.equal((await fetch(`${restartedUrl}/api/session`, { headers: { cookie } })).status, 200)
  assert.equal((await (await fetch(`${restartedUrl}/api/session`, { headers: { cookie } })).json()).paired, false,
    'Explicit stop invalidates old phone pairings')

  sidecar.kill('SIGKILL')
  await until(async () => {
    try { await fetch(`${restartedUrl}/api/session`); return false } catch { return true }
  }, 'gateway shutdown after sidecar crash')
  console.log('Mobile lifecycle smoke passed: pairing survives desktop reconnect, explicit stop revokes it, and sidecar loss stops the gateway.')
} finally {
  if (sidecar?.exitCode === null) sidecar.kill('SIGTERM')
  await rm(temporary, { recursive: true, force: true })
}
