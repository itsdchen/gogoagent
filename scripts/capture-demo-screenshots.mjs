import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const desktopDir = path.join(repoRoot, 'apps', 'desktop')
const outputDirectory = path.resolve(process.argv[2] ?? path.join(repoRoot, 'docs', 'screenshots'))
const demoRoot = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-screenshot-demo-'))
const demoHome = path.join(demoRoot, 'home')
const authTokenPath = path.join(demoRoot, 'sidecar.token')
const sidecarEntry = path.join(repoRoot, 'services', 'sidecar', 'dist', 'services', 'sidecar', 'src', 'index.js')
const electronCli = path.join(desktopDir, 'node_modules', 'electron', 'cli.js')
let sidecar
let electron
let sidecarOutput = ''

function stableId(prefix, value) {
  const hash = createHash('sha1').update(value).digest('hex').slice(0, 12)
  return `${prefix}-${hash}`
}

function isoAt(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForHealth(baseUrl, timeoutMs = 20_000) {
  const startedAt = Date.now()
  let lastError = 'not ready'
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 125))
  }
  throw new Error(`demo sidecar did not become healthy: ${lastError}\n${sidecarOutput}`)
}

async function requestJson(baseUrl, route, authToken, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${authToken}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${route} returned ${response.status}: ${JSON.stringify(payload)}`)
  }
  return payload
}

async function waitForTerminalInput(baseUrl, authToken, terminalId, timeoutMs = 10_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await requestJson(baseUrl, '/terminals', authToken)
    const terminal = payload.terminals?.find((entry) => entry.id === terminalId)
    if (terminal?.status === 'running' && terminal.needsInput) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`synthetic Claude terminal ${terminalId} did not reach the needs-input state`)
}

function transcriptLines(fixture) {
  const firstAt = isoAt(fixture.minutesAgo)
  const responseAt = isoAt(fixture.minutesAgo - 3)
  const followupAt = isoAt(fixture.minutesAgo - 7)
  const doneAt = isoAt(fixture.minutesAgo - 10)
  return {
    firstAt,
    lines: [
      {
        type: 'user',
        sessionId: fixture.sessionId,
        cwd: fixture.repoRoot,
        gitBranch: fixture.branch,
        timestamp: firstAt,
        message: { content: fixture.prompt },
      },
      {
        type: 'assistant',
        sessionId: fixture.sessionId,
        cwd: fixture.repoRoot,
        gitBranch: fixture.branch,
        timestamp: responseAt,
        message: {
          content: [
            { type: 'text', text: fixture.response },
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: path.join(fixture.repoRoot, fixture.readPath) },
            },
          ],
          usage: { input_tokens: 1840, output_tokens: 620 },
        },
      },
      {
        type: 'user',
        sessionId: fixture.sessionId,
        cwd: fixture.repoRoot,
        gitBranch: fixture.branch,
        timestamp: followupAt,
        message: { content: fixture.followup },
      },
      {
        type: 'assistant',
        sessionId: fixture.sessionId,
        cwd: fixture.repoRoot,
        gitBranch: fixture.branch,
        timestamp: doneAt,
        message: {
          content: [
            { type: 'text', text: fixture.done },
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: path.join(fixture.repoRoot, fixture.writePath) },
            },
          ],
          usage: { input_tokens: 2310, output_tokens: 880 },
        },
      },
    ],
  }
}

async function seedDemoHome() {
  const codeRoot = path.join(demoHome, 'Code')
  const fixtures = [
    {
      sessionId: 'demo-refresh-token-1',
      repoName: 'ledger-api',
      branch: 'fix/refresh-token-race',
      minutesAgo: 96,
      prompt: 'Users occasionally get signed out when two browser tabs refresh an expired access token at the same time. Trace the refresh-token path and add a regression test.',
      response: 'Both requests can validate the same refresh token before either one revokes it. I am tracing the transaction boundary around rotation and reuse detection.',
      followup: 'Keep the change scoped to the auth service. Do not add a distributed lock yet.',
      done: 'Added a transaction-level advisory lock keyed by session ID and a concurrent refresh regression test. The unit suite passes.',
      readPath: 'src/auth/refresh-token.service.ts',
      writePath: 'test/auth/refresh-token.concurrent.test.ts',
    },
    {
      sessionId: 'demo-refresh-token-2',
      repoName: 'ledger-api',
      branch: 'fix/refresh-token-race',
      minutesAgo: 18,
      prompt: 'Review the refresh-token race fix and run the auth integration suite.',
      response: 'The lock scope and rollback behavior look correct. The remaining coverage uses PostgreSQL and Redis, so it needs the Docker-backed integration environment.',
      followup: 'Run only the auth suite first. If that passes, we can run everything.',
      done: 'The focused integration command is ready. I am waiting before starting the local containers.',
      readPath: 'docker-compose.yml',
      writePath: 'src/auth/refresh-token.service.ts',
    },
    {
      sessionId: 'demo-csv-import',
      repoName: 'inventory-web',
      branch: 'feature/csv-import-preview',
      minutesAgo: 205,
      prompt: 'Add a preview step to product CSV import so users can correct column mappings before anything is uploaded.',
      response: 'The importer currently parses and submits in one action. I split parsing from persistence so the browser can validate mappings and render a preview first.',
      followup: 'Show the first 20 valid rows and group mapping errors by column.',
      done: 'The preview table, mapping validation, and error summary are wired up. Large-file performance still needs profiling.',
      readPath: 'src/features/import/parse-products.ts',
      writePath: 'src/features/import/ImportPreview.tsx',
    },
    {
      sessionId: 'demo-feed-query',
      repoName: 'community-api',
      branch: 'perf/home-feed-query',
      minutesAgo: 430,
      prompt: 'The home feed endpoint regressed from about 120 ms to more than a second for accounts following a few hundred people. Profile it without changing feed order.',
      response: 'The query plan repeatedly scans reactions after sorting candidate posts. I am testing a grouped join and a covering index against the production-shaped fixture.',
      followup: 'Capture the before and after plans, and keep the existing pagination cursor compatible.',
      done: 'The grouped join and covering index cut the fixture p95 from 1.3 seconds to 180 ms without changing result order.',
      readPath: 'src/feed/home-feed.query.ts',
      writePath: 'migrations/20260721_feed_reactions_index.sql',
    },
    {
      sessionId: 'demo-checkout-flake',
      repoName: 'storefront',
      branch: 'test/checkout-flake',
      minutesAgo: 1100,
      prompt: 'The checkout Playwright spec fails intermittently after applying a discount code. Make it reliable without adding arbitrary sleeps.',
      response: 'The assertion races the debounced cart recalculation and sometimes reads the total before the pricing response is applied.',
      followup: 'Wait on the state transition or network response, not a timeout.',
      done: 'The test now waits for the pricing response and rendered cart version. Fifty headed retries passed.',
      readPath: 'tests/e2e/checkout.spec.ts',
      writePath: 'src/checkout/usePricing.ts',
    },
  ].map((fixture) => ({ ...fixture, repoRoot: path.join(codeRoot, fixture.repoName) }))

  const firstSessionByRepo = new Map()
  for (const fixture of fixtures) {
    await mkdir(path.join(fixture.repoRoot, '.git'), { recursive: true })
    await mkdir(path.join(fixture.repoRoot, 'src'), { recursive: true })
    const transcript = transcriptLines(fixture)
    const transcriptDir = path.join(demoHome, '.claude', 'projects', fixture.repoName)
    await mkdir(transcriptDir, { recursive: true })
    await writeFile(
      path.join(transcriptDir, `${fixture.sessionId}.jsonl`),
      `${transcript.lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    )
    const key = `${fixture.repoRoot}:${fixture.branch}`
    const previous = firstSessionByRepo.get(key)
    if (!previous || transcript.firstAt < previous.firstAt) {
      firstSessionByRepo.set(key, { fixture, firstAt: transcript.firstAt })
    }
  }

  const workstreamIds = new Map()
  for (const { fixture, firstAt } of firstSessionByRepo.values()) {
    const projectId = stableId('project', fixture.repoRoot)
    const bucketKey = `${projectId}::${fixture.branch}`
    workstreamIds.set(fixture.repoName, stableId('workstream', `${bucketKey}:${firstAt}`))
  }

  const cacheDir = path.join(demoHome, '.cache', 'gogoagent')
  const stateDir = path.join(demoHome, '.gogoagent', 'state')
  await mkdir(cacheDir, { recursive: true })
  await mkdir(stateDir, { recursive: true })
  const createdAt = new Date().toISOString()
  await writeFile(path.join(cacheDir, 'auto-titles.json'), JSON.stringify({
    version: '1',
    entries: {
      [workstreamIds.get('ledger-api')]: {
        name: 'Fix Token Refresh Race',
        summary: 'Serialize concurrent refresh-token rotation safely.',
        promptVersion: 'demo',
        createdAt,
      },
      [workstreamIds.get('inventory-web')]: {
        name: 'CSV Import Preview',
        summary: 'Validate mappings before importing product rows.',
        promptVersion: 'demo',
        createdAt,
      },
      [workstreamIds.get('storefront')]: {
        name: 'Stabilize Checkout Test',
        summary: 'Remove the race from discount-code assertions.',
        promptVersion: 'demo',
        createdAt,
      },
    },
  }, null, 2))
  await writeFile(path.join(stateDir, 'title-overrides.json'), JSON.stringify({
    version: '1',
    sessions: {},
    projects: {
      [workstreamIds.get('community-api')]: 'Home Feed Query Latency',
    },
  }, null, 2))

  const authFix = fixtures.find((fixture) => fixture.repoName === 'ledger-api')
  const authFixWorkstreamId = workstreamIds.get('ledger-api')
  if (!authFix || !authFixWorkstreamId) throw new Error('demo auth fixture is incomplete')

  const demoBin = path.join(demoHome, 'bin')
  await mkdir(demoBin, { recursive: true })
  const fakeClaudePath = path.join(demoBin, 'claude')
  await writeFile(fakeClaudePath, `#!/usr/bin/env bash
printf '\\033[1;36mClaude Code\\033[0m\\r\\n\\r\\n'
printf 'I reviewed the refresh-token locking change and regression coverage.\\r\\n'
printf 'The remaining auth suite starts PostgreSQL and Redis with Docker Compose.\\r\\n\\r\\n'
printf 'Run this command?\\r\\n'
printf '  docker compose run --rm api pnpm test:integration auth\\r\\n\\r\\n'
printf '  1. Yes, run it\\r\\n'
printf '  2. No, stop here\\r\\n\\r\\n'
printf '\\033[2mEsc to cancel · Tab to amend\\033[0m\\r\\n'
IFS= read -r answer
printf '\\r\\nReceived: %s\\r\\n' "$answer"
`)
  await chmod(fakeClaudePath, 0o755)

  return {
    recentDirectories: [...new Set(fixtures.map((fixture) => fixture.repoRoot))],
    waitingTerminal: {
      cwd: authFix.repoRoot,
      workstreamId: authFixWorkstreamId,
      gitBranch: authFix.branch,
    },
  }
}

async function waitForExit(child, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Electron screenshot capture timed out')), timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Electron screenshot capture exited with ${code ?? signal}`))
    })
  })
}

async function cleanup() {
  if (electron && electron.exitCode === null) electron.kill('SIGTERM')
  if (sidecar && sidecar.exitCode === null) sidecar.kill('SIGTERM')
  if (process.env.GOGOAGENT_KEEP_DEMO_HOME !== '1') {
    await rm(demoRoot, { recursive: true, force: true })
  }
}

try {
  console.log('[gogoagent/screenshots] building the app...')
  await run('corepack', ['pnpm', 'build'])
  const demo = await seedDemoHome()
  const port = await findFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const demoEnv = {
    ...process.env,
    HOME: demoHome,
    PATH: `${path.join(demoHome, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    GOGOAGENT_PORT: String(port),
    GOGOAGENT_AUTH_TOKEN_FILE: authTokenPath,
    GOGOAGENT_SNAPSHOT_CACHE_MS: '0',
  }

  sidecar = spawn(process.execPath, [sidecarEntry], {
    cwd: repoRoot,
    env: demoEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  sidecar.stdout.on('data', (chunk) => { sidecarOutput += chunk })
  sidecar.stderr.on('data', (chunk) => { sidecarOutput += chunk })
  await waitForHealth(baseUrl)
  const authToken = (await readFile(authTokenPath, 'utf8')).trim()
  const waitingTerminal = await requestJson(baseUrl, '/terminals', authToken, {
    method: 'POST',
    body: {
      kind: 'claude',
      title: 'Claude · Fix Token Refresh Race',
      cwd: demo.waitingTerminal.cwd,
      workstreamId: demo.waitingTerminal.workstreamId,
      gitBranch: demo.waitingTerminal.gitBranch,
      cols: 106,
      rows: 18,
    },
  })
  await waitForTerminalInput(baseUrl, authToken, waitingTerminal.id)

  await mkdir(outputDirectory, { recursive: true })
  electron = spawn(process.execPath, [electronCli, '.'], {
    cwd: desktopDir,
    env: {
      ...demoEnv,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      GOGOAGENT_CAPTURE_NO_SANDBOX: '1',
      GOGOAGENT_CAPTURE_EXPECT_INPUT: '1',
      GOGOAGENT_CAPTURE_SCREENSHOTS_DIR: outputDirectory,
      GOGOAGENT_CAPTURE_RECENT_DIRECTORIES: JSON.stringify(demo.recentDirectories.slice(0, 4)),
    },
    stdio: 'inherit',
  })
  await waitForExit(electron)

  await access(path.join(outputDirectory, 'overview.png'))
  await access(path.join(outputDirectory, 'launcher.png'))
  if (process.env.GOGOAGENT_CAPTURE_PHONE === '1') {
    await access(path.join(outputDirectory, 'phone.png'))
  }
  console.log(`[gogoagent/screenshots] wrote synthetic screenshots to ${outputDirectory}`)
  console.log('[gogoagent/screenshots] no real Claude history, gogoagent state, repositories, or terminal logs were read.')
} finally {
  await cleanup()
}
