#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for the mobile gateway')
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, init)
  const payload = await response.json()
  return { response, payload }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-mobile-smoke-'))
  const tokenPath = path.join(tempRoot, 'sidecar.token')
  const expectedToken = 'mobile-smoke-token'
  await writeFile(tokenPath, expectedToken, { mode: 0o600 })

  let responseBody
  let continued = false
  const project = {
    id: 'project-1',
    name: 'Mobile smoke project',
    repoRoot: '/tmp/mobile-smoke',
    repoId: 'repo-1',
    sessionIds: [],
    firstStartedAt: '2026-09-15T10:00:00.000Z',
    lastUpdatedAt: '2026-09-15T11:00:00.000Z',
    sessionCount: 1,
    keptLessonCount: 0,
    touchedPathCount: 1,
    activeTerminalIds: ['terminal-1'],
    needsInputTerminalIds: ['terminal-1'],
    state: { workstreamId: 'project-1', goal: 'Ship phone UI' },
  }
  const terminal = {
    id: 'terminal-1',
    kind: 'codex',
    title: 'Codex',
    cwd: '/tmp/mobile-smoke',
    workstreamId: 'project-1',
    command: 'codex',
    status: 'running',
    needsInput: true,
    startedAt: '2026-09-15T10:00:00.000Z',
    logBytes: 24,
  }

  const sidecar = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${expectedToken}`) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    responseBody = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
    res.setHeader('content-type', 'application/json')
    if (req.url === '/health') res.end(JSON.stringify({ ok: true }))
    else if (req.url === '/projects') res.end(JSON.stringify({ projects: [project] }))
    else if (req.url === '/attention') res.end(JSON.stringify({ items: [{ id: 'attention-1', workstreamId: project.id, terminalId: terminal.id, title: project.name, reason: 'Codex is waiting for your input.', question: 'Continue this task?', priority: 'urgent', kind: 'needs_input', since: terminal.startedAt }] }))
    else if (req.url === '/terminals') res.end(JSON.stringify({ terminals: [terminal] }))
    else if (req.url === '/projects/project-1') res.end(JSON.stringify({ project, sessions: [], refinedLessons: [], touchedPaths: [] }))
    else if (req.url === '/workstreams/project-1/view' && req.method === 'POST') {
      project.view = { viewedAt: new Date().toISOString(), terminalId: responseBody.terminalId }
      res.end(JSON.stringify({ view: project.view }))
    } else if (req.url === '/workstreams/project-1/continuation' && req.method === 'GET') {
      res.end(JSON.stringify({ project, sessions: [{ id: 'session-1', agentKind: 'codex', title: 'Earlier session' }], repository: { summary: 'main · clean', fingerprint: 'reviewed' } }))
    } else if (req.url === '/workstreams/project-1/continuation' && req.method === 'POST') {
      continued = true
      res.end(JSON.stringify({ terminal: { ...terminal, id: 'terminal-2', resumeSessionId: responseBody.sessionId } }))
    }
    else if (req.url === '/terminals/terminal-1/log?maxBytes=262144') res.end(JSON.stringify({ data: 'Choose one:\n1. Continue\n2. Stop\n', bytes: 33, truncated: false }))
    else if (req.url === '/terminals/terminal-1/decision') res.end(JSON.stringify({ waiting: true, prompt: { id: 'current-prompt', excerpt: 'Choose one:\n1. Continue\n2. Stop', choices: [{ value: '1', label: '1. Continue' }, { value: '2', label: '2. Stop' }] }, receipt: null }))
    else if (req.url === '/terminals/terminal-1/respond' && req.method === 'POST') res.end(JSON.stringify({ ok: true, submitted: true, receipt: { choiceLabel: '1. Continue', choiceValue: '1', promptId: 'current-prompt', sentAt: '2026-10-20T12:00:00Z', terminalStatus: 'running' } }))
    else if (req.url === '/workstreams/project-1/state' && req.method === 'PATCH') {
      project.state = { workstreamId: project.id, ...responseBody, updatedAt: new Date().toISOString() }
      res.end(JSON.stringify({ project }))
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ error: 'Not found' }))
    }
  })

  let mobile
  try {
    const sidecarAddress = await listen(sidecar)
    assert(sidecarAddress && typeof sidecarAddress !== 'string')

    const portProbe = http.createServer()
    const mobileAddress = await listen(portProbe)
    assert(mobileAddress && typeof mobileAddress !== 'string')
    const mobilePort = mobileAddress.port
    await close(portProbe)

    let output = ''
    mobile = spawn(process.execPath, ['services/mobile/dist/index.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GOGOAGENT_PORT: String(sidecarAddress.port),
        GOGOAGENT_AUTH_TOKEN_FILE: tokenPath,
        GOGOAGENT_MOBILE_HOST: '127.0.0.1',
        GOGOAGENT_MOBILE_PORT: String(mobilePort),
        GOGOAGENT_MOBILE_CONTROL: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    mobile.stdout.on('data', (chunk) => { output += chunk })
    mobile.stderr.on('data', (chunk) => { output += chunk })

    const pairingCode = await waitFor(() => output.match(/pairing code: (\d{6})/)?.[1])
    const initialControl = await waitFor(() => {
      const line = output.split('\n').find((entry) => entry.startsWith('[gogoagent/mobile-control] '))
      return line ? JSON.parse(line.slice('[gogoagent/mobile-control] '.length)) : undefined
    })
    assert.equal(initialControl.pairingCode, pairingCode)
    assert.match(initialControl.pairingToken, /^[A-Za-z0-9_-]{40,}$/)
    const baseUrl = `http://127.0.0.1:${mobilePort}`

    const page = await fetch(baseUrl)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Pair phone/)
    assert.match(page.headers.get('content-security-policy') || '', /default-src 'self'/)

    const unauthorized = await jsonRequest(`${baseUrl}/api/dashboard`)
    assert.equal(unauthorized.response.status, 401)

    const wrongPairing = await jsonRequest(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ code: '000000' }),
    })
    assert.equal(wrongPairing.response.status, 401)

    const paired = await jsonRequest(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ code: initialControl.pairingToken }),
    })
    assert.equal(paired.response.status, 200)
    const cookie = paired.response.headers.get('set-cookie')?.split(';')[0]
    assert(cookie, 'pairing did not issue a session cookie')
    const rotatedControl = await waitFor(() => {
      const controls = output
        .split('\n')
        .filter((entry) => entry.startsWith('[gogoagent/mobile-control] '))
        .map((entry) => JSON.parse(entry.slice('[gogoagent/mobile-control] '.length)))
      return controls.find((entry) => entry.pairingToken !== initialControl.pairingToken)
    })
    assert.equal(rotatedControl.pairedDevices, 1)

    const fallbackPairing = await jsonRequest(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ code: pairingCode }),
    })
    assert.equal(fallbackPairing.response.status, 200, 'six-digit fallback pairing should remain available')

    const authenticatedHeaders = { cookie }
    const dashboard = await jsonRequest(`${baseUrl}/api/dashboard`, { headers: authenticatedHeaders })
    assert.equal(dashboard.response.status, 200)
    assert.equal(dashboard.payload.projects[0].id, project.id)
    assert.equal(dashboard.payload.attention[0].terminalId, terminal.id)
    assert.equal(dashboard.payload.attention[0].question, 'Continue this task?')

    const log = await jsonRequest(`${baseUrl}/api/terminals/terminal-1/log`, { headers: authenticatedHeaders })
    assert.match(log.payload.data, /1\. Continue/)

    const decision = await jsonRequest(`${baseUrl}/api/terminals/terminal-1/decision`, { headers: authenticatedHeaders })
    assert.equal(decision.payload.prompt.id, 'current-prompt')

    const response = await jsonRequest(`${baseUrl}/api/terminals/terminal-1/respond`, {
      method: 'POST',
      headers: { ...authenticatedHeaders, 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ text: '1', submit: true, choice: true, decisionId: decision.payload.prompt.id }),
    })
    assert.equal(response.response.status, 200)
    assert.deepEqual(responseBody, { text: '1', submit: true, choice: true, decisionId: 'current-prompt' })
    assert.equal(response.payload.receipt.choiceValue, '1')

    const updated = await jsonRequest(`${baseUrl}/api/projects/project-1/state`, {
      method: 'PATCH',
      headers: { ...authenticatedHeaders, 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ currentState: 'Phone smoke passed' }),
    })
    assert.equal(updated.payload.project.state.currentState, 'Phone smoke passed')

    const view = await jsonRequest(`${baseUrl}/api/projects/project-1/view`, {
      method: 'POST', headers: { ...authenticatedHeaders, 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ terminalId: terminal.id, cwd: '/untrusted' }),
    })
    assert.equal(view.payload.view.terminalId, terminal.id)
    assert.deepEqual(responseBody, { terminalId: terminal.id }, 'Gateway forwards only the viewed terminal')

    const review = await jsonRequest(`${baseUrl}/api/projects/project-1/continuation`, { headers: authenticatedHeaders })
    assert.equal(review.payload.repository.fingerprint, 'reviewed')
    const rejectedOrigin = await jsonRequest(`${baseUrl}/api/projects/project-1/continuation`, {
      method: 'POST', headers: { ...authenticatedHeaders, 'content-type': 'application/json', origin: 'http://untrusted.invalid' },
      body: JSON.stringify({ sessionId: 'session-1', repositoryFingerprint: 'reviewed' }),
    })
    assert.equal(rejectedOrigin.response.status, 403)
    assert.equal(continued, false)
    const resumed = await jsonRequest(`${baseUrl}/api/projects/project-1/continuation`, {
      method: 'POST', headers: { ...authenticatedHeaders, 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ sessionId: 'session-1', repositoryFingerprint: 'reviewed', kind: 'shell', cwd: '/untrusted' }),
    })
    assert.equal(resumed.response.status, 201)
    assert.equal(resumed.payload.terminal.resumeSessionId, 'session-1')
    assert.deepEqual(responseBody, { sessionId: 'session-1', repositoryFingerprint: 'reviewed' }, 'Gateway forwards no shell or cwd override')

    console.log('Mobile smoke test passed: pairing, dashboard, responses, shared view, and reviewed continuation use narrow gateway routes.')
  } finally {
    if (mobile?.exitCode === null) mobile.kill('SIGTERM')
    await close(sidecar)
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
