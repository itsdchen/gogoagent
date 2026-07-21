#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000),
    ])
  }
}

async function verifyLabelJobDedup(testHome) {
  process.env.GOGOAGENT_STATE_DIR = path.join(testHome, 'label-job-state')
  process.env.GOGOAGENT_CACHE_DIR = path.join(testHome, 'label-job-cache')
  const modulePath = path.join(repoRoot, 'services/sidecar/dist/services/sidecar/src/lib/workstreamLabelJobs.js')
  const { startWorkstreamLabelJob } = await import(pathToFileURL(modulePath).href)
  const labelStorePath = path.join(repoRoot, 'services/sidecar/dist/services/sidecar/src/lib/workstreamLabels.js')
  const { applyCachedWorkstreamLabels, putManualWorkstreamLabel } = await import(pathToFileURL(labelStorePath).href)

  const startedAt = '2026-01-02T03:04:05.000Z'
  const workstreamId = 'workstream-label-dedupe'
  const sessionId = 'session-label-dedupe'
  const workstream = {
    id: workstreamId,
    name: 'Fallback name',
    repoRoot: path.join(testHome, 'label-repo'),
    repoId: 'label-repo',
    branch: 'main',
    sessionIds: [sessionId],
    firstStartedAt: startedAt,
    lastUpdatedAt: startedAt,
    sessionCount: 1,
    keptLessonCount: 0,
    touchedPathCount: 0,
  }
  const sessionResult = {
    session: {
      id: sessionId,
      projectId: 'label-repo',
      workstreamId,
      title: 'Fix duplicate naming',
      cwd: workstream.repoRoot,
      transcriptPath: path.join(testHome, 'label.jsonl'),
      status: 'archived',
      startedAt,
      updatedAt: startedAt,
      messageCount: 1,
      toolCallCount: 0,
      tokenCount: 0,
    },
    artifacts: [],
    messages: [{
      id: 'label-message',
      sessionId,
      role: 'user',
      timestamp: startedAt,
      text: 'Fix duplicate background naming jobs.',
    }],
    candidates: [],
  }

  let runnerCalls = 0
  let releaseRunner
  const runnerGate = new Promise((resolve) => { releaseRunner = resolve })
  const runner = async () => {
    runnerCalls += 1
    await runnerGate
    return JSON.stringify({ labels: [{ workstreamId, name: 'Naming Job Deduplication' }] })
  }
  const args = {
    workstreams: [workstream],
    sessionResults: [sessionResult],
    workLocations: [],
    runner,
  }

  const first = await startWorkstreamLabelJob(args)
  const duplicate = await startWorkstreamLabelJob(args)
  assert.equal(duplicate.jobId, first.jobId, 'identical active label requests should share one job')
  releaseRunner()

  for (let attempt = 0; attempt < 100 && first.state !== 'done' && first.state !== 'error'; attempt += 1) {
    await delay(20)
  }
  assert.equal(first.state, 'done', `deduplicated label job did not finish: ${JSON.stringify(first.errors)}`)
  assert.equal(runnerCalls, 1, 'duplicate label requests should invoke the LLM once')
  assert.equal(first.generated, 1, 'deduplicated label job should persist one label')

  const generatedWorkstream = { ...workstream }
  await applyCachedWorkstreamLabels([generatedWorkstream], [sessionResult], [])
  assert.equal(generatedWorkstream.name, 'Naming Job Deduplication', 'generated label should be applied')
  assert.equal(generatedWorkstream.nameSource, 'generated', 'generated label should expose its source')

  await putManualWorkstreamLabel(workstreamId, 'Manual Naming Choice')
  const manualWorkstream = { ...workstream }
  await applyCachedWorkstreamLabels([manualWorkstream], [sessionResult], [])
  assert.equal(manualWorkstream.name, 'Manual Naming Choice', 'manual label should take precedence')
  assert.equal(manualWorkstream.nameSource, 'manual', 'manual label should expose its source')
}

async function verifyNeedsInputDetection() {
  const modulePath = path.join(repoRoot, 'services/sidecar/dist/services/sidecar/src/lib/terminalHost.js')
  const { appendNeedsInputContext, inferNeedsInput } = await import(pathToFileURL(modulePath).href)
  const record = { kind: 'codex', needsInput: undefined }

  let context = appendNeedsInputContext('', 'Do you want to pro')
  record.needsInput = inferNeedsInput(record, 'Do you want to pro', context)
  context = appendNeedsInputContext(context, 'ceed?\r\n› 1. Ye')
  record.needsInput = inferNeedsInput(record, 'ceed?\r\n› 1. Ye', context)
  assert.equal(record.needsInput, true, 'split Codex confirmation prompt should require input')

  record.needsInput = inferNeedsInput(record, 'Esc to interrupt', context)
  assert.equal(record.needsInput, false, 'working indicator should clear an older prompt')

  const footer = 'Esc to cancel · Tab to amend · ctrl+e to explain'
  assert.equal(
    inferNeedsInput({ kind: 'codex', needsInput: undefined }, footer, footer),
    true,
    'Codex confirmation footer should require input',
  )
}

async function verifyTerminalLogCache(testHome) {
  const modulePath = path.join(repoRoot, 'services/sidecar/dist/services/sidecar/src/lib/terminalLogs.js')
  const { loadTerminalLogSessions } = await import(pathToFileURL(modulePath).href)
  const terminalDir = path.join(testHome, 'terminal-cache-fixture')
  const logPath = path.join(terminalDir, 'cached.ansi.log')
  const metadataPath = path.join(terminalDir, 'cached.json')
  await mkdir(terminalDir, { recursive: true })
  await writeFile(logPath, 'first terminal cache line\n')
  await writeFile(metadataPath, JSON.stringify({
    version: 1,
    id: 'terminal-cache-fixture',
    kind: 'shell',
    title: 'Terminal cache fixture',
    command: 'bash',
    cwd: path.join(testHome, 'terminal-cache-repo'),
    startedAt: '2026-01-02T03:04:05.000Z',
    lastActivityAt: '2026-01-02T03:05:05.000Z',
    status: 'exited',
    logPath,
    logBytes: 26,
    userInteracted: true,
  }))
  const deps = {
    resolveProjectRoot: async (cwd) => cwd,
    projectIdForRoot: (cwd) => `project:${cwd}`,
  }

  const first = await loadTerminalLogSessions(terminalDir, deps)
  const cached = await loadTerminalLogSessions(terminalDir, deps)
  assert.equal(first.length, 1, 'terminal cache fixture was not indexed')
  assert.strictEqual(cached[0], first[0], 'unchanged terminal logs should reuse their parsed result')

  await writeFile(logPath, 'first terminal cache line\nsecond line\n')
  const refreshed = await loadTerminalLogSessions(terminalDir, deps)
  assert.notStrictEqual(refreshed[0], first[0], 'changed terminal logs should invalidate their parsed result')
  assert.match(refreshed[0].messages.map((message) => message.text).join('\n'), /second line/)
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
        GOGOAGENT_SNAPSHOT_CACHE_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    sidecar.stdout.on('data', (chunk) => { output += chunk })
    sidecar.stderr.on('data', (chunk) => { output += chunk })

    await waitForHealth(baseUrl, () => output)
    const token = (await readFile(path.join(testHome, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
    assert(token, 'sidecar did not create an authentication token')

    const staleHealth = await fetch(`${baseUrl}/health`, {
      headers: { authorization: 'Bearer stale-clean-start-token' },
    })
    assert.equal(staleHealth.status, 401, 'health should reject a supplied stale token')
    const authenticatedHealth = await fetch(`${baseUrl}/health`, {
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(authenticatedHealth.status, 200, 'health should accept the current sidecar token')

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

    const projectId = populatedSnapshot.workstreams[0].id
    await requestJson(baseUrl, token, `/projects/${encodeURIComponent(projectId)}`)
    const beforeSessionDetail = await requestJson(baseUrl, token, '/debug/state')
    const sessionDetail = await requestJson(baseUrl, token, '/sessions/clean-start-session')
    const afterSessionDetail = await requestJson(baseUrl, token, '/debug/state')
    assert.equal(sessionDetail.session.id, 'clean-start-session')
    assert.equal(sessionDetail.messages.length, 1)
    assert.equal(
      afterSessionDetail.lastScan.startedAt,
      beforeSessionDetail.lastScan.startedAt,
      'session detail should reuse the project snapshot generation instead of rescanning',
    )

    const terminalLogDir = path.join(testHome, '.gogoagent', 'terminal-logs')
    const historicalTerminalId = 'clean-start-historical'
    const historicalLogPath = path.join(terminalLogDir, `${historicalTerminalId}.ansi.log`)
    await mkdir(terminalLogDir, { recursive: true })
    await writeFile(historicalLogPath, 'historical terminal output\n')
    await writeFile(path.join(terminalLogDir, `${historicalTerminalId}.json`), JSON.stringify({
      version: 1,
      id: historicalTerminalId,
      kind: 'shell',
      title: 'Historical terminal',
      command: 'bash',
      cwd: path.join(testHome, 'fixture-repo'),
      startedAt: '2026-01-02T03:04:05.000Z',
      lastActivityAt: '2026-01-02T03:05:05.000Z',
      status: 'running',
      logPath: historicalLogPath,
      logBytes: 27,
      userInteracted: true,
    }))

    await requestJson(baseUrl, token, '/debug/rescan', { method: 'POST' })
    const historicalSnapshot = await requestJson(baseUrl, token, '/snapshot')
    const historicalTerminal = historicalSnapshot.sessions.find(
      (session) => session.id === `terminal-${historicalTerminalId}`,
    )
    assert(historicalTerminal, 'historical terminal log was not discovered')
    assert.equal(historicalTerminal.status, 'archived', 'historical terminal should not look live')

    await stop(sidecar)

    const legacyCacheDir = path.join(testHome, '.cache', 'gogoagent')
    await mkdir(legacyCacheDir, { recursive: true })
    await writeFile(path.join(legacyCacheDir, 'title-overrides.json'), JSON.stringify({
      version: '1',
      sessions: { 'migration-sentinel': 'Migrated session name' },
      projects: { 'migration-sentinel': 'Migrated project name' },
    }))
    await writeFile(path.join(legacyCacheDir, 'workstream-archive.json'), JSON.stringify({
      version: 'v1',
      entries: { 'migration-sentinel': { archivedAt: '2026-01-02T03:06:05.000Z' } },
    }))
    await writeFile(path.join(legacyCacheDir, 'workstream-labels.json'), JSON.stringify({
      version: 'v4',
      entries: {
        'migration-sentinel': {
          key: 'manual',
          name: 'Migrated Workstream',
          source: 'manual',
          updatedAt: '2026-01-02T03:06:05.000Z',
          version: 'v4',
        },
      },
    }))
    await writeFile(path.join(legacyCacheDir, 'refined-lessons.json'), JSON.stringify({
      version: 'v1',
      entries: {
        'migration-sentinel': {
          id: 'migration-sentinel',
          sessionId: 'migration-sentinel',
          sourceCandidateId: 'migration-sentinel',
          rule: 'Preserve migrated state.',
          why: 'It is durable user data.',
          scope: 'global',
          keep: true,
          promptVersion: 'v1',
          createdAt: '2026-01-02T03:06:05.000Z',
        },
      },
    }))

    output = ''
    sidecar = spawn(process.execPath, ['services/sidecar/dist/services/sidecar/src/index.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: testHome,
        GOGOAGENT_PORT: String(port),
        GOGOAGENT_SNAPSHOT_CACHE_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    sidecar.stdout.on('data', (chunk) => { output += chunk })
    sidecar.stderr.on('data', (chunk) => { output += chunk })
    await waitForHealth(baseUrl, () => output)

    const rotatedToken = (await readFile(path.join(testHome, '.gogoagent', `sidecar-${port}.token`), 'utf8')).trim()
    assert.notEqual(rotatedToken, token, 'sidecar restart should rotate its authentication token')
    const oldTokenHealth = await fetch(`${baseUrl}/health`, {
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(oldTokenHealth.status, 401, 'restarted sidecar should reject the previous token')
    await requestJson(baseUrl, rotatedToken, '/snapshot')
    await requestJson(baseUrl, rotatedToken, '/lessons/refined')

    const stateDir = path.join(testHome, '.gogoagent', 'state')
    const migratedTitles = JSON.parse(await readFile(path.join(stateDir, 'title-overrides.json'), 'utf8'))
    const migratedArchive = JSON.parse(await readFile(path.join(stateDir, 'workstream-archive.json'), 'utf8'))
    const migratedLabels = JSON.parse(await readFile(path.join(stateDir, 'workstream-labels.json'), 'utf8'))
    const migratedLessons = JSON.parse(await readFile(path.join(stateDir, 'refined-lessons.json'), 'utf8'))
    assert.equal(migratedTitles.projects['migration-sentinel'], 'Migrated project name')
    assert.equal(migratedArchive.entries['migration-sentinel'].archivedAt, '2026-01-02T03:06:05.000Z')
    assert.equal(migratedLabels.entries['migration-sentinel'].name, 'Migrated Workstream')
    assert.equal(migratedLessons.entries['migration-sentinel'].rule, 'Preserve migrated state.')
    await readFile(path.join(legacyCacheDir, 'title-overrides.json'), 'utf8')

    await verifyLabelJobDedup(testHome)
    await verifyNeedsInputDetection()
    await verifyTerminalLogCache(testHome)

    console.log('Clean-start smoke test passed: discovery, auth restart, generation reuse, terminal caching, historical terminals, durable-state migration, label deduplication, and input detection work.')
  } finally {
    await stop(sidecar)
    await rm(testHome, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
