#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reservePort() {
  const server = http.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address !== 'string', 'could not reserve a local test port')
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function waitForHealth(baseUrl, childOutput) {
  let lastError = 'not ready'
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(125)
  }
  throw new Error(`sidecar did not become healthy: ${lastError}\n${childOutput()}`)
}

async function requestJson(baseUrl, authToken, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${authToken}` },
  })
  if (!response.ok) throw new Error(`${pathName} returned ${response.status}: ${await response.text()}`)
  return response.json()
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function main() {
  const testHome = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-clean-start-'))
  let sidecar
  let output = ''

  try {
    const port = await reservePort()
    const baseUrl = `http://127.0.0.1:${port}`
    sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: testHome,
        GOGOAGENT_PORT: String(port),
        GOGOAGENT_AUTO_TITLES: '0',
        GOGOAGENT_SNAPSHOT_CACHE_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    sidecar.stdout.on('data', (chunk) => { output += chunk })
    sidecar.stderr.on('data', (chunk) => { output += chunk })

    await waitForHealth(baseUrl, () => output)
    const token = (await readFile(path.join(testHome, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
    assert(token, 'sidecar did not create an authentication token')

    const emptySnapshot = await requestJson(baseUrl, token, '/snapshot')
    assert.equal(emptySnapshot.sessions.length, 0, 'a clean home should have no sessions')
    assert.equal(emptySnapshot.workstreams.length, 0, 'a clean home should have no workstreams')

    const fixtureDir = path.join(testHome, '.claude', 'projects', 'clean-start-fixture')
    await mkdir(fixtureDir, { recursive: true })
    await writeFile(path.join(fixtureDir, 'clean-start-session.jsonl'), `${JSON.stringify({
      type: 'user',
      sessionId: 'clean-start-session',
      cwd: path.join(testHome, 'fixture-repo'),
      gitBranch: 'main',
      timestamp: '2026-01-02T03:04:05.000Z',
      message: { content: 'Create the clean-start fixture workstream.' },
    })}\n`)

    const debugState = await requestJson(baseUrl, token, '/debug/rescan', { method: 'POST' })
    assert.equal(debugState.counts.transcriptFiles, 1, 'fixture transcript was not discovered')

    const populatedSnapshot = await requestJson(baseUrl, token, '/snapshot')
    assert.equal(populatedSnapshot.sessions.length, 1, 'fixture did not become a session')
    assert.equal(populatedSnapshot.workstreams.length, 1, 'fixture did not become a workstream')
    assert.match(populatedSnapshot.workstreams[0].name, /clean-start fixture/i)

    console.log('Clean-start smoke test passed: empty home and fixture discovery both work.')
  } finally {
    await stop(sidecar)
    await rm(testHome, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
