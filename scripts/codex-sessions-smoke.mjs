#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sessionId = '11111111-2222-4333-8444-555555555555'
const newerSessionId = '66666666-7777-4888-8999-000000000000'
const testHome = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-codex-sessions-'))
const workdir = path.join(testHome, 'demo-repo')
const codexHome = path.join(testHome, '.codex')
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
  await mkdir(path.join(codexHome, 'sessions', '2026', '10', '19'), { recursive: true })
  await mkdir(path.join(workdir, '.git'), { recursive: true })
  await mkdir(binDir)
  const lines = [
    { timestamp: '2026-10-19T12:00:00.000Z', type: 'session_meta', payload: {
      id: sessionId, timestamp: '2026-10-19T12:00:00.000Z', cwd: workdir,
      originator: 'codex_cli_rs', git: { branch: 'feature/native-resume' },
    } },
    { timestamp: '2026-10-19T12:00:01.000Z', type: 'response_item', payload: {
      type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>synthetic setup</environment_context>' }],
    } },
    { timestamp: '2026-10-19T12:00:02.000Z', type: 'event_msg', payload: {
      type: 'user_message', message: 'Fix the parser race in this repo',
    } },
    { timestamp: '2026-10-19T12:00:03.000Z', type: 'response_item', payload: {
      type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: 'rg parser' }),
    } },
    { timestamp: '2026-10-19T12:00:04.000Z', type: 'event_msg', payload: {
      type: 'agent_message', message: 'The parser race is fixed.',
    } },
  ]
  await writeFile(path.join(codexHome, 'sessions', '2026', '10', '19', `rollout-${sessionId}.jsonl`),
    `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const newerLines = lines.map((line) => ({
    ...line,
    timestamp: line.timestamp.replace('T12:', 'T13:'),
    payload: {
      ...line.payload,
      ...(line.type === 'session_meta'
        ? { id: newerSessionId, timestamp: line.payload.timestamp.replace('T12:', 'T13:') }
        : {}),
    },
  }))
  await writeFile(path.join(codexHome, 'sessions', '2026', '10', '19', `rollout-${newerSessionId}.jsonl`),
    `${newerLines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const fakeCodex = path.join(binDir, 'codex')
  await writeFile(fakeCodex, '#!/bin/sh\nprintf "%s\\n" "$@" > "$GOGOAGENT_TEST_CODEX_ARGS"\nsleep 5\n')
  await chmod(fakeCodex, 0o755)

  const port = await freePort()
  sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: testHome,
      CODEX_HOME: codexHome,
      PATH: `${binDir}:${process.env.PATH}`,
      GOGOAGENT_TEST_CODEX_ARGS: path.join(testHome, 'codex-args.txt'),
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
  const session = snapshot.sessions.find((entry) => entry.id === sessionId)
  assert(session, 'saved Codex session should be discovered')
  assert.equal(session.agentKind, 'codex')
  assert.match(session.title, /parser race/i)
  assert.equal(session.messageCount, 2, 'setup messages and duplicate response items should be skipped')
  assert.equal(session.toolCallCount, 1)
  const workstream = snapshot.workstreams.find((entry) => entry.sessionIds.includes(sessionId))
  assert(workstream, 'saved Codex session should have a workstream')
  assert(workstream.sessionIds.includes(newerSessionId), 'sessions from the same work should group together')

  const continuationRoute = `/workstreams/${encodeURIComponent(workstream.id)}/continuation`
  const review = await request(continuationRoute)
  assert.deepEqual(review.sessions.map((entry) => entry.id), [newerSessionId, sessionId], 'Phone review lists native sessions newest first')
  const postContinuation = (sessionToResume, fingerprint) => fetch(`http://127.0.0.1:${port}${continuationRoute}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionToResume, repositoryFingerprint: fingerprint }),
  })
  assert.equal((await postContinuation('unrelated-session', review.repository.fingerprint ?? 'unavailable')).status, 400)
  assert.equal((await postContinuation(sessionId, 'stale-review')).status, 409)
  const resumed = await postContinuation(sessionId, review.repository.fingerprint ?? 'unavailable')
  assert.equal(resumed.status, 201)
  assert.equal((await resumed.json()).terminal.resumeSessionId, sessionId)
  assert.equal((await postContinuation(sessionId, review.repository.fingerprint ?? 'unavailable')).status, 409,
    'Phone must not resume the same live session twice')
  const revisionBeforeView = (await request('/health')).workstreamViewRevision
  const marked = await request(`/workstreams/${encodeURIComponent(workstream.id)}/view`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ terminalId: 'not-owned' }),
  })
  assert.equal(marked.view.terminalId, undefined, 'A forged terminal id is not saved')
  assert.equal((await request('/health')).workstreamViewRevision, revisionBeforeView + 1,
    'Desktop health polling sees phone view changes')
  const savedViews = JSON.parse(await readFile(path.join(testHome, '.gogoagent', 'state', 'workstream-views.json'), 'utf8'))
  assert.equal(savedViews.entries[workstream.id].viewedAt, marked.view.viewedAt, 'View state is durable')
  const viewed = (await request('/projects')).projects.find((entry) => entry.id === workstream.id)
  assert(viewed.view?.viewedAt, 'Shared workstream view is exposed to desktop and phone')
  assert.equal(viewed.newSinceLastView, false)

  const terminal = await request('/terminals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'codex', cwd: workdir, workstreamId: workstream.id, resumeSessionId: sessionId }),
  })
  assert.equal(terminal.resumeSessionId, sessionId)
  assert.match(terminal.command, new RegExp(`codex resume ${sessionId}`))
  await request(`/terminals/${terminal.id}/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: 'hello' }),
  })
  const after = await request('/snapshot')
  assert.equal(after.sessions.filter((entry) => entry.id === sessionId).length, 1)
  assert.equal(after.workstreams.find((entry) => entry.id === workstream.id)?.sessionIds.includes(sessionId), true)
  assert.equal(after.sessions.filter((entry) => entry.id.startsWith('terminal-')).length, 0,
    'terminal log should attach to the native Codex session')
  assert.equal((await readFile(path.join(testHome, 'codex-args.txt'), 'utf8')).trim(), `resume\n${sessionId}`)
  console.log('Codex sessions smoke test passed: discovery, reviewed phone resume, shared view, selected older session resume, and deduplication.')
} finally {
  await stop(sidecar)
  await rm(testHome, { recursive: true, force: true })
}
