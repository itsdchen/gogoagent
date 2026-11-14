#!/usr/bin/env node
// Browser checks against synthetic data only. Requires Chrome/Chromium and Node 22+.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-workspace-test-'))
const projects = [
  { id: 'alpha', name: 'Improve the phone workspace', repoRoot: '/demo/alpha', branch: 'mobile', state: { goal: 'Make phone work comfortable', nextAction: 'Check the new layout' }, newSinceLastView: true, view: { viewedAt: '2026-10-18T12:00:00Z' } },
  { id: 'beta', name: 'Investigate test failures', repoRoot: '/demo/beta', state: {} },
  { id: 'empty', name: 'No terminals', state: {} },
]
const terminals = [
  { id: 'old', workstreamId: 'alpha', title: 'Previous session', kind: 'codex', status: 'exited', needsInput: true, exitCode: 0 },
  { id: 'a', workstreamId: 'alpha', title: 'Codex · implementation', kind: 'codex', status: 'running', needsInput: true },
  { id: 'b', workstreamId: 'beta', title: 'Claude · test review', kind: 'claude', status: 'running', needsInput: true },
]
let outputSuffix = ''
let rejectSend = false
let delaySend = 0
let slowAlpha = false
let delayedLog = false
const sends = []
const receipts = new Map()
const continuations = []
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const json = (payload, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  }
  if (url.pathname === '/api/session') return json({ paired: true })
  if (url.pathname === '/api/signout') return json({ ok: true })
  if (url.pathname === '/api/dashboard') return json({
    projects, terminals, attention: [
      { id: 'waiting', kind: 'needs_input', terminalId: 'a', workstreamId: 'alpha', title: projects[0].name, priority: 'urgent', question: 'Approve this layout check?' },
      { id: 'old', kind: 'agent_exited', terminalId: 'old', workstreamId: 'alpha', title: 'Previous session' },
    ],
  })
  if (url.pathname.endsWith('/view') && req.method === 'POST') {
    const project = projects.find((entry) => url.pathname === `/api/projects/${entry.id}/view`)
    if (!project) return json({ error: 'Unknown workstream' }, 404)
    let body = ''
    for await (const chunk of req) body += chunk
    project.view = { viewedAt: new Date().toISOString(), terminalId: JSON.parse(body).terminalId }
    project.newSinceLastView = false
    return json({ view: project.view })
  }
  if (url.pathname.endsWith('/continuation')) {
    const project = projects.find((entry) => url.pathname === `/api/projects/${entry.id}/continuation`)
    if (!project) return json({ error: 'Unknown workstream' }, 404)
    if (req.method === 'GET') return json({ project, sessions: [
      { id: 'codex-old', agentKind: 'codex', title: 'Earlier implementation', updatedAt: '2026-10-18T12:00:00Z' },
    ], repository: { summary: 'mobile · clean', fingerprint: 'reviewed' } })
    let body = ''
    for await (const chunk of req) body += chunk
    continuations.push(JSON.parse(body))
    const terminal = { id: 'resumed', workstreamId: project.id, title: 'Codex · resumed', kind: 'codex', status: 'running' }
    terminals.push(terminal)
    return json({ terminal }, 201)
  }
  const project = projects.find((entry) => url.pathname === `/api/projects/${entry.id}`)
  if (project) {
    if (slowAlpha && project.id === 'alpha') await new Promise((resolve) => setTimeout(resolve, 250))
    return json({ project })
  }
  if (url.pathname.endsWith('/log')) {
    const text = Array.from({ length: 180 }, (_, i) => `${String(i + 1).padStart(3)}  Inspecting layout, navigation and terminal input.`).join('\n')
      + '\n\n› Make the phone output easier to read.\n\nI will adjust the spacing and keep the input composer visible.\n\nChanges made:\n  - Added output separators\n  - Kept code blocks together\n  - Added smaller text sizes\n\n❯ Check the result at a phone-sized viewport.\n\nThe layout fits. The composer remains visible and all output is preserved.\n'
    if (delayedLog && url.pathname.includes('/a/')) await new Promise((resolve) => setTimeout(resolve, 250))
    return json({ data: text + outputSuffix })
  }
  if (url.pathname.endsWith('/decision')) {
    const terminalId = url.pathname.split('/')[3]
    const terminal = terminals.find((entry) => entry.id === terminalId)
    return json({ waiting: Boolean(terminal?.needsInput && terminal.status === 'running'), prompt: terminal?.needsInput ? {
    id: url.pathname.includes('/a/') ? 'prompt-alpha' : 'prompt-beta',
    excerpt: 'Approve this layout check?\n1. Yes, run it\n2. No, cancel',
    choices: [{ value: '1', label: '1. Yes, run it' }, { value: '2', label: '2. No, cancel' }],
    } : null, receipt: receipts.get(terminalId) || null })
  }
  if (url.pathname.endsWith('/respond')) {
    let body = ''
    for await (const chunk of req) body += chunk
    const sent = { path: url.pathname, ...JSON.parse(body) }
    sends.push(sent)
    let receipt = null
    if (sent.decisionId) {
      const terminalId = url.pathname.split('/')[3]
      const terminal = terminals.find((entry) => entry.id === terminalId)
      terminal.needsInput = false
      receipt = { choiceValue: sent.text, choiceLabel: sent.text === '1' ? '1. Yes, run it' : '2. No, cancel', promptId: sent.decisionId, sentAt: new Date().toISOString(), terminalStatus: 'running' }
      receipts.set(terminalId, receipt)
    }
    if (delaySend) await new Promise((resolve) => setTimeout(resolve, delaySend))
    return json(rejectSend ? { error: 'Synthetic send failure' } : { ok: true, receipt }, rejectSend ? 503 : 200)
  }
  const file = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/icon.svg': 'icon.svg', '/manifest.webmanifest': 'manifest.webmanifest' }[url.pathname]
  if (!file) return json({ error: 'Unknown test route' }, 404)
  const type = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' }[file.split('.').pop()]
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
  })
  res.end(await readFile(path.join(root, 'services/mobile/public', file)))
})
let browser
let socket
const errors = []
async function eventually(check, message = 'condition', timeout = 8000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error(`Timed out: ${message}`)
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const base = `http://127.0.0.1:${server.address().port}`
  let browserOutput = ''
  browser = spawn(process.env.GOGOAGENT_TEST_BROWSER || 'google-chrome', [
    '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${temporary}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  browser.on('error', (error) => errors.push(error.message))
  browser.stderr.on('data', (chunk) => { browserOutput += chunk })
  await eventually(() => /DevTools listening on (ws:\/\/[^\s]+)/.test(browserOutput), `Chrome startup (${process.env.GOGOAGENT_TEST_BROWSER || 'google-chrome'})`)
  const endpoint = browserOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1]
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
  let sequence = 0
  const requests = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    const pending = requests.get(message.id)
    if (pending) {
      requests.delete(message.id)
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
    }
  })
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    requests.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const check = async (expression, message) => assert.equal(await evaluate(expression), true, message)
  const click = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`)
  const draft = (text) => evaluate(`elements.feedbackText.value = ${JSON.stringify(text)}; elements.feedbackText.dispatchEvent(new Event('input'));`)
  const metrics = (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
  const waitFor = (expression, message) => eventually(() => evaluate(expression), message)
  await command('Runtime.enable')
  await command('Page.enable')
  await metrics(390, 844)
  await command('Page.navigate', { url: base })
  await waitFor("typeof state !== 'undefined' && state.projects.length === 3", 'dashboard')
  await check("elements.attentionCount.textContent === '1' && !elements.exitedAgents.open", 'Exited agents stay out of the attention count')
  await check("elements.attentionList.textContent.includes('Agent asks: Approve this layout check?')", 'Inbox previews the current question')
  await check("elements.workstreamList.textContent.includes('New since last visit')", 'Shared view marks changed workstreams')
  await evaluate("selectProject('alpha')")
  await waitFor("state.projects[0].newSinceLastView === false", 'Opening clears shared new marker')
  await check("!elements.detailUpdate.hidden && elements.detailUpdate.textContent.includes('Updated since your last visit')", 'Workspace explains what was new on entry')
  await check("state.selectedTerminalId === 'a'", 'Waiting terminal opens before exited terminal')
  await check("!elements.decisionCard.hidden && elements.decisionGoal.textContent === 'Make phone work comfortable' && elements.decisionNext.textContent === 'Check the new layout'", 'Decision card shows saved context')
  await check("elements.decisionPrompt.textContent.includes('Approve this layout check?') && elements.choiceButtons.children.length === 2", 'Decision card shows current prompt and choices')
  await evaluate("elements.choiceButtons.querySelector('button').click()")
  await eventually(() => sends.length > 0, 'choice sent')
  assert.equal(sends.at(-1).decisionId, 'prompt-alpha', 'Choice is tied to visible prompt')
  await waitFor("!elements.decisionReceipt.hidden && elements.receiptChoice.textContent.includes('sent key 1')", 'choice receipt shows exact input')
  await check("elements.terminalStatus.textContent === 'running' && elements.decisionCard.hidden", 'sent choice clears stale waiting indicator')
  await check("elements.receiptStatus.textContent.includes('acceptance is not confirmed')", 'receipt does not claim agent accepted input')
  receipts.get('a').outputAt = new Date().toISOString()
  await evaluate('refreshTerminalLog()')
  await check("elements.receiptStatus.textContent.includes('New terminal output')", 'receipt reflects later terminal output')
  await metrics(390, 430)
  await evaluate('syncViewport()')
  if (!(await evaluate("elements.feedbackText.getBoundingClientRect().bottom <= visualViewport.height + 1 && elements.terminalOutput.getBoundingClientRect().height >= 100"))) console.log('Receipt geometry:', await evaluate("({receipt: elements.decisionReceipt.getBoundingClientRect().toJSON(), output: elements.terminalOutput.getBoundingClientRect().toJSON(), input: elements.feedbackText.getBoundingClientRect().toJSON()})"))
  await check("elements.feedbackText.getBoundingClientRect().bottom <= visualViewport.height + 1 && elements.terminalOutput.getBoundingClientRect().height >= 100", 'Receipt leaves room for output and composer with keyboard open')
  await metrics(390, 844)
  await evaluate('syncViewport()')
  await check("getComputedStyle(elements.terminalOutput).fontSize === '11px'", 'Compact default font')
  await check(`(() => {
    const sample = '› Please review this change\\n\\nThe implementation looks correct.\\n\\n\`\`\`js\\nconst x = 1;\\n\\nconst y = 2;\\n\`\`\`\\n\\n❯ Run the tests\\n';
    const parts = terminalOutputParts(sample);
    return parts.map(part => part.text).join('') === sample
      && parts.filter(part => part.prompt).length === 2
      && parts.some(part => part.text.includes('const x = 1;\\n\\nconst y = 2;'));
  })()`, 'Output blocks preserve all text and fenced code')
  await check(`(() => {
    const sample = '<img src=x onerror=alert(1)>\\n\\nSecond paragraph';
    renderTerminalOutput(sample);
    const safe = elements.terminalOutput.textContent === sample && !elements.terminalOutput.querySelector('img');
    const first = elements.terminalOutput.firstElementChild;
    renderTerminalOutput(sample + '\\nMore output');
    const reused = elements.terminalOutput.firstElementChild === first;
    renderTerminalPanel();
    return safe && reused;
  })()`, 'Output is escaped and unchanged blocks are reused')
  const geometry = `(() => {
    const input = elements.feedbackText.getBoundingClientRect();
    const send = elements.sendFeedbackButton.getBoundingClientRect();
    const output = elements.terminalOutput.getBoundingClientRect();
    return input.bottom <= visualViewport.height + 1 && send.bottom <= visualViewport.height + 1
      && output.height >= 100 && output.bottom <= input.top && document.documentElement.scrollWidth <= innerWidth;
  })()`
  await check(geometry, 'Output and composer fit portrait viewport')
  if (process.env.GOGOAGENT_TEST_SCREENSHOT) {
    const result = await command('Page.captureScreenshot', { format: 'png' })
    await writeFile(process.env.GOGOAGENT_TEST_SCREENSHOT, Buffer.from(result.data, 'base64'))
  }
  await draft('Draft for alpha')
  await evaluate('elements.terminalOutput.scrollTop = 140; rememberTerminal()')
  outputSuffix = '\nMore output while reading'
  await evaluate('refreshTerminalLog()')
  await check('Math.abs(elements.terminalOutput.scrollTop - 140) < 2', 'Polling preserves reading position')
  await click('switch-agent-button')
  await check('elements.agentsDialog.open', 'Agent switcher opens')
  await evaluate("[...elements.terminalList.children].find(el => el.textContent.includes('Claude')).click()")
  await waitFor("state.selectedTerminalId === 'b' && state.logLoaded", 'switch to beta')
  await check("elements.feedbackText.value === ''", 'Draft does not leak across agents')
  await draft('Draft for beta')
  terminals.find((entry) => entry.id === 'a').needsInput = true
  await evaluate('refreshDashboard()')
  await click('next-agent-button')
  await waitFor("state.selectedTerminalId === 'a' && state.logLoaded", 'next waiting')
  await check("elements.feedbackText.value === 'Draft for alpha' && Math.abs(elements.terminalOutput.scrollTop - 140) < 2", 'Switch restores draft and position')
  await command('Page.reload')
  await waitFor("typeof state !== 'undefined' && state.selectedTerminalId === 'a' && state.logLoaded", 'reload restore')
  await check("elements.feedbackText.value === 'Draft for alpha' && Math.abs(elements.terminalOutput.scrollTop - 140) < 2", 'Reload restores draft, terminal and position')
  await click('context-button')
  await evaluate('history.back()')
  await waitFor('!elements.contextDialog.open', 'Back closes context')
  await check("state.selectedTerminalId === 'a'", 'Closing context retains terminal')
  await click('back-button')
  await waitFor('!elements.listView.hidden', 'Back returns to workstreams')
  await evaluate('history.forward()')
  await waitFor("state.selectedTerminalId === 'a' && state.logLoaded", 'Forward restores workspace')
  for (const [width, height] of [[390, 430], [320, 568], [844, 390]]) {
    await metrics(width, height)
    await evaluate('syncViewport()')
    if (!(await evaluate(geometry))) console.log('Geometry:', await evaluate(`(() => ({ viewport: visualViewport.height, card: elements.decisionCard.getBoundingClientRect().toJSON(), output: elements.terminalOutput.getBoundingClientRect().toJSON(), input: elements.feedbackText.getBoundingClientRect().toJSON(), send: elements.sendFeedbackButton.getBoundingClientRect().toJSON() }))()`))
    await check(geometry, `Composer fits ${width}×${height} (keyboard / narrow / landscape)`)
  }
  await metrics(390, 844)
  await click('display-button')
  await click('terminal-text-larger')
  await click('terminal-wrap')
  await check("getComputedStyle(elements.terminalOutput).fontSize === '12px' && elements.terminalOutput.classList.contains('no-wrap')", 'Display settings apply')
  await evaluate("for (let i = 0; i < 10; i++) elements.terminalTextSmaller.click()")
  await check("getComputedStyle(elements.terminalOutput).fontSize === '8px' && elements.terminalTextSmaller.disabled", 'Text can shrink to 8 px')
  await click('terminal-sections')
  await check("elements.terminalOutput.children.length === 0 && elements.terminalOutput.textContent === state.terminalLog", 'Plain output remains available without text loss')
  await click('terminal-sections')
  await check("elements.terminalOutput.children.length > 0 && elements.terminalOutput.textContent === state.terminalLog", 'Separated output preserves exact text')
  await evaluate('history.back()')
  await waitFor('!elements.displayDialog.open')
  rejectSend = true
  await evaluate("sendResponse(elements.feedbackText.value)")
  await check("elements.feedbackText.value === 'Draft for alpha' && elements.feedbackStatus.textContent.includes('not confirmed')", 'Failed send preserves draft')
  rejectSend = false
  delaySend = 250
  const before = sends.length
  await evaluate("void sendResponse(elements.feedbackText.value); void sendResponse(elements.feedbackText.value)")
  await evaluate("selectProject('beta', 'b')")
  await waitFor("!state.deliveries.get('a').pending", 'pending send resolves')
  assert.equal(sends.length, before + 1, 'Repeated send is suppressed while pending')
  assert.equal(sends.at(-1).path, '/api/terminals/a/respond', 'Send remains bound to original terminal')
  await check("elements.feedbackText.value === 'Draft for beta' && !elements.feedbackStatus.textContent.includes('Sent')", 'Late success does not clear another agent draft or status')
  await evaluate("selectProject('alpha', 'a')")
  await check("elements.feedbackText.value === ''", 'Successful send clears only original draft')
  await draft('Keep this while choosing')
  await evaluate("sendResponse('1', null, true)")
  await check("elements.feedbackText.value === 'Keep this while choosing'", 'Quick choice preserves composed draft')
  slowAlpha = true
  await evaluate("selectProject('beta', 'b')")
  await evaluate("Promise.all([selectProject('alpha', 'a'), selectProject('beta', 'b')])")
  await check("state.selectedProjectId === 'beta' && state.projectDetail.project.id === 'beta'", 'Late navigation response does not replace current project')
  delayedLog = true
  await evaluate("Promise.all([selectProject('alpha', 'a'), selectProject('beta', 'b')])")
  await check("state.selectedTerminalId === 'b'", 'Stale terminal load is ignored')
  await evaluate("selectProject('alpha', 'old')")
  await check('elements.sendFeedbackButton.disabled', 'Exited terminal remains read-only')
  await click('continue-button')
  await waitFor('elements.continuationSession.options.length === 1', 'Continuation review loads')
  await check("elements.continuationRepository.textContent.includes('mobile · clean') && elements.continuationState.textContent.includes('Make phone work comfortable')", 'Review shows Git and handoff')
  await evaluate("elements.continuationForm.requestSubmit()")
  await waitFor("state.selectedTerminalId === 'resumed'", 'Resume opens the new terminal')
  assert.deepEqual(continuations, [{ sessionId: 'codex-old', repositoryFingerprint: 'reviewed' }])
  await evaluate("selectProject('empty')")
  await check('!elements.workspaceEmpty.hidden && elements.terminalPanel.hidden', 'Empty workstream remains usable')
  await evaluate("selectProject('alpha', 'a')")
  await draft('Pending while unpairing')
  await evaluate("void sendResponse(elements.feedbackText.value)")
  await click('back-button')
  await waitFor('!elements.listView.hidden')
  await click('signout-button')
  await waitFor('!state.paired')
  await new Promise((resolve) => setTimeout(resolve, 350))
  await check("Object.keys(JSON.parse(localStorage.getItem(MEMORY_KEY)).terminals).length === 0", 'Unpair clears drafts even with an outstanding send')
  assert.deepEqual(errors, [], 'No uncaught browser exceptions')
  console.log('Mobile workspace checks passed: layout, drafts, navigation, sends, races, and reviewed continuation.')
} finally {
  socket?.close()
  if (browser && browser.exitCode === null) {
    const stopped = new Promise((resolve) => browser.once('exit', resolve))
    browser.kill('SIGTERM')
    await stopped
  }
  await new Promise((resolve) => server.close(resolve))
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
