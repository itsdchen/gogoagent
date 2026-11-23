#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testHome = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-claude-link-'))
const workdir = path.join(testHome, 'demo-repo')
const logDir = path.join(testHome, '.gogoagent', 'terminal-logs')
const sessionId = '11111111-2222-4333-8444-555555555555'
const failedWorkstreamId = 'terminal-workstream-failed-launch'
const actualWorkstreamId = 'terminal-workstream-actual-launch'
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

async function saveTerminal(name, startedAt, endedAt, workstreamId) {
  const logPath = path.join(logDir, `${name}.ansi.log`)
  await writeFile(logPath, 'Synthetic Claude terminal output\n')
  await writeFile(path.join(logDir, `${name}.json`), JSON.stringify({
    id: name,
    kind: 'claude',
    title: `Claude · ${name}`,
    cwd: workdir,
    workstreamId,
    startedAt,
    endedAt,
    lastActivityAt: endedAt ?? '2026-11-14T13:00:00.000Z',
    userInteracted: true,
    logPath,
  }))
}

try {
  await mkdir(path.join(workdir, '.git'), { recursive: true })
  await mkdir(path.join(testHome, '.claude', 'projects', 'demo-repo'), { recursive: true })
  await mkdir(logDir, { recursive: true })
  await saveTerminal('failed-launch', '2026-11-14T12:08:43.423Z', '2026-11-14T12:08:43.445Z', failedWorkstreamId)
  await saveTerminal('actual-launch', '2026-11-14T12:15:18.442Z', undefined, actualWorkstreamId)
  await writeFile(path.join(testHome, '.claude', 'projects', 'demo-repo', `${sessionId}.jsonl`), [
    { sessionId, cwd: workdir, gitBranch: 'main', timestamp: '2026-11-14T12:15:44.059Z', type: 'user', message: { role: 'user', content: 'Synthetic task' } },
    { sessionId, cwd: workdir, gitBranch: 'main', timestamp: '2026-11-14T12:16:00.000Z', type: 'assistant', message: { role: 'assistant', content: 'Working' } },
  ].map((line) => JSON.stringify(line)).join('\n') + '\n')

  const port = await freePort()
  sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: testHome,
      CODEX_HOME: path.join(testHome, '.codex'),
      GOGOAGENT_AGY_CACHE_DIR: path.join(testHome, '.gemini', 'antigravity-cli', 'cache'),
      GOGOAGENT_AUTH_TOKEN_FILE: path.join(testHome, '.gogoagent', `sidecar-${port}.token`),
      GOGOAGENT_CACHE_DIR: path.join(testHome, '.gogoagent', 'cache'),
      GOGOAGENT_STATE_DIR: path.join(testHome, '.gogoagent', 'state'),
      GOGOAGENT_TERMINAL_LOG_DIR: logDir,
      GOGOAGENT_PORT: String(port),
    },
    stdio: 'ignore',
  })
  await waitForHealth(port)
  const token = (await readFile(path.join(testHome, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
  const request = async (route) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`${route} returned ${response.status}: ${await response.text()}`)
    return response.json()
  }

  const snapshot = await request('/snapshot')
  assert.equal(snapshot.sessions.find((session) => session.id === sessionId)?.workstreamId, actualWorkstreamId)
  assert(snapshot.workstreams.find((workstream) => workstream.id === actualWorkstreamId)?.sessionIds.includes(sessionId))
  assert(!snapshot.workstreams.find((workstream) => workstream.id === failedWorkstreamId)?.sessionIds.includes(sessionId))
  const review = await request(`/workstreams/${actualWorkstreamId}/continuation`)
  assert(review.sessions.some((session) => session.id === sessionId), 'Claude conversation is available to resume in its workstream')
  console.log('Claude session link smoke test passed: a failed earlier launch cannot claim a later conversation.')
} finally {
  if (sidecar?.exitCode === null) {
    sidecar.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => sidecar.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
    if (sidecar.exitCode === null) sidecar.kill('SIGKILL')
  }
  await rm(testHome, { recursive: true, force: true })
}
