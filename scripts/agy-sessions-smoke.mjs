#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliId = '11111111-2222-4333-8444-555555555555'
const appId = '66666666-7777-4888-8999-000000000000'
const mapOnlyId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const testHome = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-agy-sessions-'))
const workdir = path.join(testHome, 'demo-repo')
const mapOnlyWorkdir = path.join(testHome, 'map-only-repo')
const cacheDir = path.join(testHome, '.gemini', 'antigravity-cli', 'cache')
const binDir = path.join(testHome, 'bin')
let sidecar

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
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return
    } catch { /* starting */ }
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

try {
  await mkdir(path.join(workdir, '.git'), { recursive: true })
  await mkdir(path.join(mapOnlyWorkdir, '.git'), { recursive: true })
  await mkdir(cacheDir, { recursive: true })
  await mkdir(binDir)
  const summary = (id, appDataDir) => ({
    ID: id,
    Title: id === cliId ? 'Fix the build race' : 'Antigravity app conversation',
    UpdatedAt: '2026-11-14T12:00:00.000Z',
    WorkspaceURIs: [pathToFileURL(workdir).href],
    AppDataDir: appDataDir,
    Cloud: false,
  })
  await writeFile(path.join(cacheDir, 'conversation_metadata.json'), JSON.stringify({ conversations: {
    [cliId]: { summary: summary(cliId, path.join(testHome, '.gemini', 'antigravity-cli')) },
    [appId]: { summary: summary(appId, path.join(testHome, '.gemini', 'antigravity')) },
  } }))
  const resumeMapPath = path.join(cacheDir, 'last_conversations.json')
  await writeFile(resumeMapPath, JSON.stringify({ [workdir]: cliId, [mapOnlyWorkdir]: mapOnlyId }))
  await utimes(resumeMapPath, new Date('2026-11-14T13:00:00.000Z'), new Date('2026-11-14T13:00:00.000Z'))
  const terminalLogDir = path.join(testHome, '.gogoagent', 'terminal-logs')
  await mkdir(terminalLogDir, { recursive: true })
  const logPath = path.join(terminalLogDir, 'map-only.ansi.log')
  await writeFile(logPath, `Antigravity conversation ${mapOnlyId}\r\n`)
  await writeFile(path.join(terminalLogDir, 'map-only.json'), JSON.stringify({
    id: 'term-map-only', kind: 'agy', title: 'Antigravity · Exploration', cwd: mapOnlyWorkdir,
    workstreamId: 'terminal-workstream-term-map-only', status: 'exited', userInteracted: true,
    startedAt: '2026-11-14T11:00:00.000Z', lastActivityAt: '2026-11-14T11:10:00.000Z',
    endedAt: '2026-11-14T11:20:00.000Z', logPath,
  }))
  const fakeAgy = path.join(binDir, 'agy')
  await writeFile(fakeAgy, '#!/bin/sh\nprintf "%s\\n" "$@" > "$GOGOAGENT_TEST_AGY_ARGS"\nsleep 5\n')
  await chmod(fakeAgy, 0o755)

  const port = await freePort()
  sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: testHome,
      PATH: `${binDir}:${process.env.PATH}`,
      GOGOAGENT_AGY_CACHE_DIR: cacheDir,
      GOGOAGENT_TEST_AGY_ARGS: path.join(testHome, 'agy-args.txt'),
      GOGOAGENT_PORT: String(port),
    },
    stdio: 'ignore',
  })
  await waitForHealth(port)
  const token = (await readFile(path.join(testHome, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
  const request = async (route, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
    })
    if (!response.ok) throw new Error(`${route} returned ${response.status}: ${await response.text()}`)
    return response.json()
  }

  const snapshot = await request('/snapshot')
  const session = snapshot.sessions.find((entry) => entry.id === cliId)
  assert(session, 'Antigravity CLI conversation should be discovered')
  assert.equal(session.agentKind, 'agy')
  assert.equal(session.metadataOnly, true)
  assert.equal(session.title, 'Fix the build race')
  assert.equal(snapshot.sessions.some((entry) => entry.id === appId), false,
    'App conversations should not be presented as directly resumable CLI sessions')
  const mapOnlySession = snapshot.sessions.find((entry) => entry.id === mapOnlyId)
  assert(mapOnlySession, 'A CLI resume-map entry should be discovered without conversation metadata')
  assert.equal(mapOnlySession.agentKind, 'agy')
  assert.equal(mapOnlySession.metadataOnly, true)
  const mapOnlyWorkstream = snapshot.workstreams.find((entry) => entry.sessionIds.includes(mapOnlyId))
  assert.equal(mapOnlyWorkstream?.id, 'terminal-workstream-term-map-only',
    'A map-only conversation mentioned by its terminal should attach to that workstream')
  const mapOnlyReview = await request(`/workstreams/${encodeURIComponent(mapOnlyWorkstream.id)}/continuation`)
  assert(mapOnlyReview.sessions.some((entry) => entry.id === mapOnlyId))
  const workstream = snapshot.workstreams.find((entry) => entry.sessionIds.includes(cliId))
  assert(workstream)
  const review = await request(`/workstreams/${encodeURIComponent(workstream.id)}/continuation`)
  assert.deepEqual(review.sessions.map((entry) => entry.id), [cliId])
  const resumed = await request(`/workstreams/${encodeURIComponent(workstream.id)}/continuation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: cliId, repositoryFingerprint: review.repository.fingerprint ?? 'unavailable' }),
  })
  assert.equal(resumed.terminal.kind, 'agy')
  assert.equal(resumed.terminal.resumeSessionId, cliId)
  assert.match(resumed.terminal.command, new RegExp(`agy --conversation ${cliId}`))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await readFile(path.join(testHome, 'agy-args.txt'), 'utf8')).trim() === `--conversation\n${cliId}`) break
    } catch { /* CLI has not started yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal((await readFile(path.join(testHome, 'agy-args.txt'), 'utf8')).trim(), `--conversation\n${cliId}`)
  console.log('Antigravity sessions smoke test passed: metadata and resume-map discovery, terminal attachment, App filtering, reviewed phone resume, and agy --conversation launch.')
} finally {
  await stop(sidecar)
  await rm(testHome, { recursive: true, force: true })
}
