const $ = (id) => document.getElementById(id)

const elements = {
  pairView: $('pair-view'),
  pairForm: $('pair-form'),
  pairCode: $('pair-code'),
  pairStatus: $('pair-status'),
  appView: $('app-view'),
  connectionStatus: $('connection-status'),
  refreshButton: $('refresh-button'),
  attentionCount: $('attention-count'),
  attentionList: $('attention-list'),
  exitedAgents: $('exited-agents'),
  exitedCount: $('exited-count'),
  exitedList: $('exited-list'),
  workstreamList: $('workstream-list'),
  listView: $('list-view'),
  detailView: $('detail-view'),
  backButton: $('back-button'),
  detailPath: $('detail-path'),
  detailTitle: $('detail-title'),
  detailStatus: $('detail-status'),
  detailUpdate: $('detail-update'),
  continueButton: $('continue-button'),
  continuationDialog: $('continuation-dialog'),
  continuationForm: $('continuation-form'),
  continuationSession: $('continuation-session'),
  continuationState: $('continuation-state'),
  continuationRepository: $('continuation-repository'),
  continuationSubmit: $('continuation-submit'),
  continuationStatus: $('continuation-status'),
  stateSummary: $('state-summary'),
  stateForm: $('state-form'),
  editStateButton: $('edit-state-button'),
  cancelStateButton: $('cancel-state-button'),
  stateFormStatus: $('state-form-status'),
  terminalList: $('terminal-list'),
  terminalPanel: $('terminal-panel'),
  terminalKind: $('terminal-kind'),
  terminalTitle: $('terminal-title'),
  terminalStatus: $('terminal-status'),
  terminalOutput: $('terminal-output'),
  terminalTextSmaller: $('terminal-text-smaller'),
  terminalTextLarger: $('terminal-text-larger'),
  terminalTextSize: $('terminal-text-size'),
  terminalLatest: $('terminal-latest'),
  quickChoices: $('quick-choices'),
  choiceButtons: $('choice-buttons'),
  decisionCard: $('decision-card'),
  decisionPrompt: $('decision-prompt'),
  decisionGoal: $('decision-goal'),
  decisionNext: $('decision-next'),
  decisionNote: $('decision-note'),
  decisionReceipt: $('decision-receipt'),
  receiptTime: $('receipt-time'),
  receiptChoice: $('receipt-choice'),
  receiptStatus: $('receipt-status'),
  receiptViewOutput: $('receipt-view-output'),
  feedbackForm: $('feedback-form'),
  feedbackText: $('feedback-text'),
  feedbackStatus: $('feedback-status'),
  sendFeedbackButton: $('send-feedback-button'),
  signoutButton: $('signout-button'),
  workspaceConnection: $('workspace-connection'),
  workspaceEmpty: $('workspace-empty'),
  inputLabel: $('input-label'),
  nextAgentButton: $('next-agent-button'),
  terminalWrap: $('terminal-wrap'),
  terminalSections: $('terminal-sections'),
  contextDialog: $('context-dialog'),
  agentsDialog: $('agents-dialog'),
  displayDialog: $('display-dialog'),
}

const state = {
  projects: [],
  attention: [],
  terminals: [],
  selectedProjectId: null,
  selectedTerminalId: null,
  projectDetail: null,
  terminalLog: '',
  decision: null,
  paired: false,
  dashboardBusy: false,
  logRequests: new Set(),
  navigationVersion: 0,
  logLoaded: false,
  terminalMemory: Object.create(null),
  deliveries: new Map(),
  submittedDecisions: new Map(),
  lastSelection: null,
  switcherSignature: '',
  afterSheetClose: null,
  terminalFontSize: 11,
  separateOutput: true,
  continuationReview: null,
}

const MEMORY_KEY = 'gogoagent.mobile.workspace'
const sheets = [elements.contextDialog, elements.agentsDialog, elements.displayDialog, elements.continuationDialog]

function terminalMemory(id) {
  return state.terminalMemory[id] ??= { draft: '', scrollTop: 0, follow: true }
}

function persistWorkspace() {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ terminals: state.terminalMemory, selection: state.lastSelection }))
  } catch {
    // Keep the in-memory draft even if browser storage is unavailable or full.
  }
}

function rememberTerminal() {
  if (!state.selectedTerminalId) return
  const memory = terminalMemory(state.selectedTerminalId)
  memory.draft = elements.feedbackText.value
  if (state.logLoaded) {
    memory.scrollTop = elements.terminalOutput.scrollTop
    memory.follow = terminalIsAtBottom()
  }
  persistWorkspace()
}

function resizeComposer() {
  const follow = state.selectedTerminalId && terminalMemory(state.selectedTerminalId).follow
  elements.feedbackText.style.height = 'auto'
  elements.feedbackText.style.height = `${elements.feedbackText.scrollHeight}px`
  if (follow) elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight
}

function syncViewport() {
  const viewport = window.visualViewport
  document.documentElement.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`)
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`)
  document.documentElement.style.setProperty('--viewport-bottom', `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`)
  if (state.selectedTerminalId && terminalMemory(state.selectedTerminalId).follow) {
    elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight
  }
}

function syncHistory() {
  if (!state.selectedProjectId) return
  state.lastSelection = { projectId: state.selectedProjectId, terminalId: state.selectedTerminalId }
  history.replaceState({ ...history.state, workspace: state.lastSelection }, '')
  persistWorkspace()
}

function showList() {
  rememberTerminal()
  if (state.selectedProjectId) void markProjectViewed(state.selectedProjectId, state.selectedTerminalId)
  state.navigationVersion++
  state.selectedProjectId = null
  state.selectedTerminalId = null
  state.projectDetail = null
  state.decision = null
  state.logLoaded = false
  state.lastSelection = null
  elements.detailView.hidden = true
  elements.listView.hidden = false
  document.body.classList.remove('working')
  persistWorkspace()
}

function openSheet(dialog) {
  if (!state.selectedProjectId) return
  elements.feedbackText.blur()
  if (dialog === elements.agentsDialog) renderTerminals()
  history.pushState({ ...history.state, sheet: dialog.id }, '')
  dialog.showModal()
}

function closeSheet(afterClose = null) {
  state.afterSheetClose = afterClose
  if (history.state?.sheet) history.back()
  else {
    sheets.forEach((sheet) => { if (sheet.open) sheet.close() })
    state.afterSheetClose = null
    afterClose?.()
  }
}

function setConnection(message, kind = '') {
  for (const element of [elements.connectionStatus, elements.workspaceConnection]) {
    element.textContent = message
    element.className = `connection ${kind}`
  }
}

function nextWaitingAgent() {
  return state.terminals.find((terminal) => terminal.id !== state.selectedTerminalId
    && terminal.status === 'running' && terminal.needsInput && terminal.kind !== 'shell'
    && state.projects.some((project) => project.id === terminal.workstreamId && !project.archivedAt))
}

function terminalIsAtBottom() {
  const output = elements.terminalOutput
  return output.scrollHeight - output.scrollTop - output.clientHeight < 32
}

function setTerminalFontSize(size) {
  const atBottom = terminalIsAtBottom()
  state.terminalFontSize = Math.max(8, Math.min(18, size))
  elements.terminalOutput.style.setProperty('--terminal-font-size', `${state.terminalFontSize}px`)
  elements.terminalTextSize.textContent = `${state.terminalFontSize} px`
  elements.terminalTextSmaller.disabled = state.terminalFontSize === 8
  elements.terminalTextLarger.disabled = state.terminalFontSize === 18
  if (atBottom) elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight
  try {
    localStorage.setItem('gogoagent.mobile.terminalFontSize', String(state.terminalFontSize))
  } catch {
    // Text size still works when browser storage is unavailable.
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (response.status === 401 && path !== '/api/pair') {
    showPairing()
  }
  if (!response.ok) {
    const message = payload.error || payload.detail || `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload
}

function setStatus(element, message, isError = false) {
  element.textContent = message
  element.classList.toggle('error', isError)
}

function showPairing() {
  rememberTerminal()
  state.navigationVersion++
  state.paired = false
  sheets.forEach((sheet) => { if (sheet.open) sheet.close() })
  document.body.classList.remove('working')
  elements.appView.hidden = true
  elements.pairView.hidden = false
  elements.pairCode.focus()
}

function showApp() {
  state.paired = true
  elements.pairView.hidden = true
  elements.appView.hidden = false
  document.body.classList.toggle('working', Boolean(state.selectedProjectId))
}

function emptyCard(message) {
  const card = document.createElement('div')
  card.className = 'empty-card'
  card.textContent = message
  return card
}

function formatTime(value) {
  if (!value) return 'No recent activity'
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function kindLabel(kind) {
  if (kind === 'claude') return 'Claude'
  if (kind === 'codex') return 'Codex'
  return 'Shell'
}

function createCard(title, detail, meta, className, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  const titleElement = document.createElement('strong')
  titleElement.className = 'card-title'
  titleElement.textContent = title
  button.append(titleElement)
  if (detail) {
    const detailElement = document.createElement('span')
    detailElement.className = 'card-detail'
    detailElement.textContent = detail
    button.append(detailElement)
  }
  if (meta?.length) {
    const metaElement = document.createElement('span')
    metaElement.className = 'card-meta'
    for (const item of meta) {
      const entry = document.createElement('span')
      entry.textContent = item
      metaElement.append(entry)
    }
    button.append(metaElement)
  }
  button.addEventListener('click', onClick)
  return button
}

function renderAttention() {
  const terminalById = new Map(state.terminals.map((terminal) => [terminal.id, terminal]))
  const attention = state.attention.filter((item) => {
    if (item.kind === 'agent_exited') return false
    if (item.kind !== 'needs_input') return true
    const terminal = terminalById.get(item.terminalId)
    return terminal?.status === 'running' && terminal.needsInput
  })
  const exited = state.attention.filter((item) => item.kind === 'agent_exited')
  elements.exitedAgents.hidden = exited.length === 0
  elements.exitedCount.textContent = String(exited.length)
  elements.exitedList.replaceChildren()
  for (const item of exited) {
    const terminal = terminalById.get(item.terminalId)
    const status = typeof terminal?.exitCode === 'number' && terminal.exitCode !== 0
      ? `Exited (${terminal.exitCode})`
      : 'Exited'
    elements.exitedList.append(createCard(
      item.title || 'Workstream',
      item.reason || 'Agent exited.',
      [status, formatTime(item.since)],
      'workstream-card',
      () => selectProject(item.workstreamId, item.terminalId),
    ))
  }
  elements.attentionList.replaceChildren()
  elements.attentionCount.textContent = String(attention.length)
  if (!attention.length) {
    elements.attentionList.append(emptyCard('Nothing needs your attention right now.'))
    return
  }
  for (const item of attention) {
    const card = createCard(
      item.title || 'Workstream',
      item.kind === 'needs_input' && item.question ? `Agent asks: ${item.question}` : item.reason || 'Review requested',
      [item.priority === 'urgent' ? 'Waiting now' : 'Review', formatTime(item.since)],
      'attention-card',
      () => selectProject(item.workstreamId, item.terminalId),
    )
    elements.attentionList.append(card)
  }
}

function renderWorkstreams() {
  elements.workstreamList.replaceChildren()
  const projects = state.projects.filter((project) => !project.archivedAt)
  if (!projects.length) {
    elements.workstreamList.append(emptyCard('No workstreams have been discovered yet.'))
    return
  }
  for (const project of projects) {
    const active = state.terminals.filter((terminal) => terminal.workstreamId === project.id && terminal.status === 'running')
    const activeCount = active.length
    const waitingCount = active.filter((terminal) => terminal.needsInput).length
    const activity = waitingCount ? 'waiting' : activeCount ? 'active' : 'idle'
    const status = waitingCount
      ? `${waitingCount} waiting`
      : activeCount
        ? `${activeCount} active`
        : 'Idle'
    const card = createCard(
      project.name || 'Untitled workstream',
      project.state?.currentState || project.repoRoot || '',
      [status, ...(project.newSinceLastView ? ['New since last visit'] : []), formatTime(project.lastUpdatedAt)],
      `workstream-card workstream-${activity}`,
      () => selectProject(project.id),
    )
    const heading = document.createElement('span')
    heading.className = 'workstream-card-heading'
    const badge = document.createElement('span')
    badge.className = 'workstream-status'
    badge.textContent = activity === 'waiting' ? 'Waiting' : project.newSinceLastView ? 'New' : activity === 'active' ? 'Active' : 'Idle'
    heading.append(card.querySelector('.card-title'), badge)
    card.prepend(heading)
    elements.workstreamList.append(card)
  }
}

function renderStateEntries(target, capsule = {}) {
  const entries = [
    ['Goal', capsule.goal],
    ['Current', capsule.currentState],
    ['Blocker', capsule.blocker],
    ['Next', capsule.nextAction],
    ['Verified', capsule.lastVerification],
  ]
  target.replaceChildren()
  for (const [label, value] of entries) {
    const row = document.createElement('div')
    const term = document.createElement('dt')
    const description = document.createElement('dd')
    term.textContent = label
    description.textContent = value || 'Not recorded'
    row.append(term, description)
    target.append(row)
  }
}

function renderStateSummary(project) {
  renderStateEntries(elements.stateSummary, project.state)
}

function fillStateForm(project) {
  const capsule = project.state || {}
  $('state-goal').value = capsule.goal || ''
  $('state-current').value = capsule.currentState || ''
  $('state-blocker').value = capsule.blocker || ''
  $('state-next').value = capsule.nextAction || ''
  $('state-verification').value = capsule.lastVerification || ''
}

function projectTerminals(projectId) {
  const rank = (terminal) => terminal.status === 'running' ? (terminal.needsInput ? 0 : 1) : 2
  return state.terminals
    .filter((terminal) => terminal.workstreamId === projectId)
    .sort((left, right) => rank(left) - rank(right))
}

function renderTerminals() {
  const projects = new Map(state.projects.filter((project) => !project.archivedAt).map((project) => [project.id, project]))
  const rank = (terminal) => terminal.status === 'running' ? (terminal.needsInput ? 0 : 1) : 2
  const terminals = state.terminals.filter((terminal) => projects.has(terminal.workstreamId))
    .sort((left, right) => rank(left) - rank(right))
  const selected = currentTerminal()
  elements.workspaceEmpty.hidden = Boolean(selected)
  elements.terminalPanel.hidden = !selected
  elements.workspaceEmpty.textContent = 'No terminal selected. Open Context to review this workstream, or return to your workstreams.'
  elements.nextAgentButton.hidden = !nextWaitingAgent()
  const signature = JSON.stringify([state.selectedTerminalId, terminals.map((terminal) => [
    terminal.id, terminal.title, terminal.kind, terminal.status, terminal.needsInput, terminal.exitCode,
    projects.get(terminal.workstreamId)?.name, Boolean(terminalMemory(terminal.id).draft),
  ])])
  if (signature === state.switcherSignature) return
  state.switcherSignature = signature
  elements.terminalList.replaceChildren()
  for (const terminal of terminals) {
    const status = terminal.status === 'running'
      ? terminal.needsInput ? 'Waiting for input' : 'Running'
      : `Exited${typeof terminal.exitCode === 'number' ? ` (${terminal.exitCode})` : ''}`
    const button = createCard(
      terminal.title || `${kindLabel(terminal.kind)} terminal`,
      projects.get(terminal.workstreamId)?.name || '',
      [kindLabel(terminal.kind), status, ...(terminalMemory(terminal.id).draft ? ['Draft'] : [])],
      `terminal-button${terminal.id === state.selectedTerminalId ? ' selected' : ''}`,
      () => closeSheet(() => selectProject(terminal.workstreamId, terminal.id)),
    )
    button.setAttribute('aria-pressed', String(terminal.id === state.selectedTerminalId))
    elements.terminalList.append(button)
  }
  if (!terminals.length) elements.terminalList.append(emptyCard('No agent terminals are available.'))
}

function currentTerminal() {
  return state.terminals.find((terminal) => terminal.id === state.selectedTerminalId)
}

function stripTerminalCodes(value) {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001bP[\s\S]*?\u001b\\/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

// These are visual blocks, not inferred user/assistant roles. Keep every character
// and leave fenced code intact; terminal redraws do not provide reliable turns.
function terminalOutputParts(value) {
  const parts = []
  let start = 0
  let offset = 0
  let afterBlank = false
  let promptStart = false
  let fence = null
  for (const line of value.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const blank = /^[\t \r\n]*$/.test(line)
    const prompt = !fence && /^[\t ]{0,3}[›❯](?:[\t ]|\r?\n?$)/.test(line)
    if (offset > start && !blank && !fence && (afterBlank || prompt)) {
      parts.push({ text: value.slice(start, offset), prompt: promptStart })
      start = offset
      promptStart = prompt
    } else if (offset === start) {
      promptStart = prompt
    }
    const marker = line.match(/^[\t ]{0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^[\t \r\n]*$/.test(line.slice(marker[0].length))) fence = null
    }
    afterBlank = blank && !fence
    offset += line.length
  }
  if (start < value.length) parts.push({ text: value.slice(start), prompt: promptStart })
  return parts
}

let renderedOutput = null
let renderedSections = null
function renderTerminalOutput(value) {
  if (renderedOutput === value && renderedSections === state.separateOutput) return
  const output = elements.terminalOutput
  if (!state.separateOutput) output.textContent = value
  else {
    if (renderedSections !== true) output.replaceChildren()
    const parts = terminalOutputParts(value)
    // Reuse unchanged blocks so polling does not disturb text selection in them.
    parts.forEach((part, index) => {
      let block = output.children[index]
      if (!block) {
        block = document.createElement('span')
        output.append(block)
      }
      block.className = `output-part${part.prompt ? ' prompt-start' : ''}`
      if (block.textContent !== part.text) block.textContent = part.text
    })
    while (output.children.length > parts.length) output.lastElementChild.remove()
  }
  renderedOutput = value
  renderedSections = state.separateOutput
}

function renderQuickChoices(terminal) {
  const prompt = state.decision?.waiting && terminal?.needsInput ? state.decision.prompt : null
  const choices = prompt?.choices || []
  if (prompt && state.submittedDecisions.get(terminal.id) !== prompt.id) state.submittedDecisions.delete(terminal.id)
  elements.choiceButtons.replaceChildren()
  elements.quickChoices.hidden = choices.length === 0
  for (const choice of choices) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'choice-button'
    button.disabled = Boolean(state.deliveries.get(terminal.id)?.pending || state.submittedDecisions.get(terminal.id) === prompt.id)
    button.textContent = choice.label
    button.addEventListener('click', () => sendResponse(choice.value, button, true, prompt.id))
    elements.choiceButtons.append(button)
  }
}

function renderDecisionCard(terminal) {
  const waiting = terminal?.status === 'running' && terminal.kind !== 'shell' && terminal.needsInput && state.decision?.waiting !== false
  elements.decisionCard.hidden = !waiting
  if (!waiting) return
  const prompt = state.decision?.waiting ? state.decision.prompt : null
  const saved = state.projectDetail?.project?.state || {}
  elements.decisionPrompt.textContent = prompt?.excerpt || 'Review the latest terminal output for the exact request.'
  elements.decisionGoal.textContent = saved.goal || 'No goal saved.'
  elements.decisionNext.textContent = saved.nextAction || 'No next step saved.'
  elements.decisionNote.textContent = saved.goal || saved.nextAction
    ? 'Saved workstream context may help explain the work; check the prompt for why this specific action needs approval.'
    : 'The workstream has no saved explanation. Check the terminal output before approving.'
  renderQuickChoices(terminal)
}

function renderDecisionReceipt() {
  const decision = state.decision
  const receipt = decision?.receipt
  elements.decisionReceipt.hidden = !receipt || decision.waiting
  if (!receipt || decision.waiting) return
  elements.receiptTime.textContent = formatTime(receipt.sentAt)
  elements.receiptChoice.textContent = `${receipt.choiceLabel} · sent key ${receipt.choiceValue}`
  elements.receiptStatus.textContent = receipt.outputAt
    ? 'New terminal output is available. Review whether the agent accepted the choice.'
    : receipt.terminalStatus === 'exited'
      ? 'The session ended without further output.'
      : 'Sent to terminal. Waiting for new output; acceptance is not confirmed.'
}

elements.receiptViewOutput.addEventListener('click', () => {
  elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight
  elements.terminalOutput.focus({ preventScroll: true })
  elements.terminalLatest.hidden = true
})

function renderTerminalPanel() {
  const terminal = currentTerminal()
  if (!terminal) {
    elements.terminalPanel.hidden = true
    elements.workspaceEmpty.hidden = false
    return
  }
  elements.workspaceEmpty.hidden = true
  elements.terminalPanel.hidden = false
  elements.terminalKind.textContent = `${kindLabel(terminal.kind)} agent`
  elements.terminalTitle.textContent = terminal.title || 'Terminal'
  elements.terminalStatus.textContent = terminal.needsInput && terminal.status === 'running' && state.decision?.waiting !== false ? 'waiting' : terminal.status
  elements.terminalStatus.className = `pill ${terminal.status}`
  const output = state.terminalLog || 'No terminal output has been recorded yet.'
  renderTerminalOutput(output)
  const delivery = state.deliveries.get(terminal.id)
  const canRespond = terminal.status === 'running' && terminal.kind !== 'shell' && !delivery?.pending
  elements.inputLabel.textContent = `To ${terminal.title || kindLabel(terminal.kind)}`
  elements.inputLabel.title = elements.inputLabel.textContent
  elements.sendFeedbackButton.textContent = delivery?.pending ? 'Sending…' : 'Send'
  setStatus(elements.feedbackStatus, delivery?.message || '', delivery?.error)
  elements.feedbackText.disabled = !canRespond
  elements.sendFeedbackButton.disabled = !canRespond
  elements.feedbackText.placeholder = canRespond
    ? 'Message this agent…'
    : 'This terminal is not accepting input.'
  renderDecisionCard(terminal)
  renderDecisionReceipt()
}

async function refreshDashboard(showActivity = false) {
  if (!state.paired || state.dashboardBusy || document.hidden) return
  state.dashboardBusy = true
  if (showActivity) {
    elements.refreshButton.disabled = true
    setConnection('Refreshing')
  }
  try {
    const dashboard = await api('/api/dashboard')
    state.projects = Array.isArray(dashboard.projects) ? dashboard.projects : []
    state.attention = Array.isArray(dashboard.attention) ? dashboard.attention : []
    state.terminals = Array.isArray(dashboard.terminals) ? dashboard.terminals : []
    setConnection('Connected', 'online')
    renderAttention()
    renderWorkstreams()
    if (state.selectedProjectId) renderTerminals()
    if (state.selectedTerminalId) await refreshTerminalLog()
  } catch (error) {
    setConnection('Offline · reconnecting', 'offline')
    if (showActivity) setStatus(elements.feedbackStatus, error.message, true)
  } finally {
    state.dashboardBusy = false
    elements.refreshButton.disabled = false
  }
}

async function selectProject(projectId, terminalId, navigate = true) {
  if (!projectId) return
  rememberTerminal()
  if (state.selectedProjectId && state.selectedProjectId !== projectId) {
    void markProjectViewed(state.selectedProjectId, state.selectedTerminalId)
  }
  const version = ++state.navigationVersion
  const opening = !state.selectedProjectId
  const sameProject = state.selectedProjectId === projectId
  if (navigate && opening) history.pushState({ workspace: { projectId, terminalId } }, '')
  state.selectedProjectId = projectId
  state.selectedTerminalId = null
  state.logLoaded = false
  state.terminalLog = ''
  state.decision = null
  elements.listView.hidden = true
  elements.detailView.hidden = false
  elements.terminalPanel.hidden = true
  elements.workspaceEmpty.hidden = true
  document.body.classList.add('working')
  elements.detailTitle.textContent = state.projects.find((project) => project.id === projectId)?.name || 'Loading…'
  $('context-button').disabled = true
  elements.continueButton.disabled = true
  syncViewport()
  try {
    const detail = sameProject && state.projectDetail?.project?.id === projectId
      ? state.projectDetail
      : await api(`/api/projects/${encodeURIComponent(projectId)}`)
    if (version !== state.navigationVersion || !state.paired) return
    state.projectDetail = detail
    const project = detail.project || state.projects.find((entry) => entry.id === projectId)
    if (!project) throw new Error('Workstream was not found')
    elements.detailTitle.textContent = project.name || 'Untitled workstream'
    elements.detailPath.textContent = project.branch ? `Branch · ${project.branch}` : 'Workstream'
    elements.detailStatus.textContent = project.repoRoot || ''
    elements.detailUpdate.hidden = !project.newSinceLastView
    elements.detailUpdate.textContent = project.newSinceLastView
      ? `Updated since your last visit${project.view?.viewedAt ? ` · last viewed ${formatTime(project.view.viewedAt)}` : ''}`
      : ''
    if (!sameProject) {
      renderStateSummary(project)
      fillStateForm(project)
      elements.stateSummary.hidden = false
      elements.stateForm.hidden = true
      elements.editStateButton.textContent = 'Edit'
    }
    $('context-button').disabled = false
    elements.continueButton.disabled = false
    const terminals = projectTerminals(projectId)
    const selected = terminals.find((terminal) => terminal.id === terminalId)
      || terminals.find((terminal) => terminal.id === project.view?.terminalId)
      || terminals[0]
    if (selected) await selectTerminal(selected.id)
    else {
      renderTerminals()
      syncHistory()
      await markProjectViewed(projectId)
    }
  } catch (error) {
    if (version !== state.navigationVersion) return
    elements.workspaceEmpty.hidden = false
    elements.workspaceEmpty.textContent = `Could not open workstream: ${error.message}. Go back and try again.`
  }
}

async function selectTerminal(terminalId) {
  rememberTerminal()
  state.selectedTerminalId = terminalId
  state.terminalLog = ''
  state.decision = null
  state.logLoaded = false
  elements.feedbackText.value = terminalMemory(terminalId).draft
  renderTerminals()
  renderTerminalPanel()
  resizeComposer()
  syncHistory()
  if (state.selectedProjectId) void markProjectViewed(state.selectedProjectId, terminalId)
  await refreshTerminalLog()
}

async function markProjectViewed(projectId, terminalId) {
  try {
    const response = await api(`/api/projects/${encodeURIComponent(projectId)}/view`, {
      method: 'POST', body: JSON.stringify({ terminalId }),
    })
    const project = state.projects.find((entry) => entry.id === projectId)
    if (project) {
      project.view = response.view
      project.newSinceLastView = false
    }
    if (state.projectDetail?.project?.id === projectId) {
      state.projectDetail.project.view = response.view
      state.projectDetail.project.newSinceLastView = false
    }
    renderWorkstreams()
  } catch {
    // Keep the existing marker if the sidecar is temporarily unavailable.
  }
}

async function openContinuationReview() {
  const projectId = state.selectedProjectId
  if (!projectId) return
  state.continuationReview = null
  elements.continuationSession.replaceChildren()
  elements.continuationSubmit.disabled = true
  setStatus(elements.continuationStatus, 'Loading sessions and repository state…')
  openSheet(elements.continuationDialog)
  try {
    const review = await api(`/api/projects/${encodeURIComponent(projectId)}/continuation`)
    if (state.selectedProjectId !== projectId || !elements.continuationDialog.open) return
    state.continuationReview = review
    renderStateEntries(elements.continuationState, review.project.state)
    elements.continuationRepository.textContent = `Repository: ${review.repository.summary}`
    for (const session of review.sessions) {
      const option = document.createElement('option')
      option.value = session.id
      option.textContent = `${session.agentKind === 'codex' ? 'Codex' : 'Claude'} · ${session.title} · ${formatTime(session.updatedAt)}`
      elements.continuationSession.append(option)
    }
    elements.continuationSubmit.disabled = review.sessions.length === 0
    setStatus(elements.continuationStatus, review.sessions.length ? '' : 'No native Claude or Codex session is available to resume.')
  } catch (error) {
    setStatus(elements.continuationStatus, error.message, true)
  }
}

async function submitContinuation(event) {
  event.preventDefault()
  const projectId = state.selectedProjectId
  const review = state.continuationReview
  if (!projectId || !review) return
  elements.continuationSubmit.disabled = true
  setStatus(elements.continuationStatus, 'Resuming session…')
  try {
    const response = await api(`/api/projects/${encodeURIComponent(projectId)}/continuation`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: elements.continuationSession.value,
        repositoryFingerprint: review.repository.fingerprint || 'unavailable',
      }),
    })
    if (state.selectedProjectId !== projectId) return
    state.terminals = state.terminals.filter((terminal) => terminal.id !== response.terminal.id)
    state.terminals.push(response.terminal)
    await refreshDashboard(true)
    closeSheet(() => selectTerminal(response.terminal.id))
  } catch (error) {
    setStatus(elements.continuationStatus, error.message, true)
    elements.continuationSubmit.disabled = false
  }
}

async function refreshTerminalLog(scrollToBottom = false) {
  if (!state.selectedTerminalId || document.hidden) return
  const terminalId = state.selectedTerminalId
  const version = state.navigationVersion
  const requestKey = `${version}:${terminalId}`
  if (state.logRequests.has(requestKey)) return
  state.logRequests.add(requestKey)
  try {
    const log = await api(`/api/terminals/${encodeURIComponent(terminalId)}/log`)
    const terminal = state.terminals.find((entry) => entry.id === terminalId)
    const decision = terminal && terminal.kind !== 'shell'
      ? await api(`/api/terminals/${encodeURIComponent(terminalId)}/decision`).catch(() => null)
      : null
    if (terminalId !== state.selectedTerminalId || version !== state.navigationVersion || !state.paired) return
    const memory = terminalMemory(terminalId)
    const followOutput = scrollToBottom || (state.logLoaded ? terminalIsAtBottom() : memory.follow)
    const previousScrollTop = state.logLoaded ? elements.terminalOutput.scrollTop : memory.scrollTop
    state.terminalLog = stripTerminalCodes(typeof log.data === 'string' ? log.data : '')
    state.decision = decision
    renderTerminalPanel()
    elements.terminalOutput.scrollTop = followOutput ? elements.terminalOutput.scrollHeight : previousScrollTop
    state.logLoaded = true
    memory.follow = followOutput
    memory.scrollTop = elements.terminalOutput.scrollTop
    elements.terminalLatest.hidden = terminalIsAtBottom()
  } catch (error) {
    if (terminalId === state.selectedTerminalId && version === state.navigationVersion) {
      setStatus(elements.feedbackStatus, `Output unavailable: ${error.message}`, true)
    }
  } finally {
    state.logRequests.delete(requestKey)
  }
}

async function sendResponse(text, sourceButton, isQuickChoice = false, decisionId = undefined) {
  const terminal = currentTerminal()
  if (!terminal || terminal.status !== 'running' || terminal.kind === 'shell' || state.deliveries.get(terminal.id)?.pending) return
  rememberTerminal()
  const originalDraft = terminalMemory(terminal.id).draft
  const delivery = { pending: true, message: 'Sending…', error: false }
  state.deliveries.set(terminal.id, delivery)
  renderTerminalPanel()
  try {
    const response = await api(`/api/terminals/${encodeURIComponent(terminal.id)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ text, submit: true, choice: isQuickChoice, decisionId }),
    })
    if (state.deliveries.get(terminal.id) !== delivery) return
    delivery.message = 'Sent to terminal.'
    if (isQuickChoice && decisionId) state.submittedDecisions.set(terminal.id, decisionId)
    if (isQuickChoice && response.receipt && state.selectedTerminalId === terminal.id) {
      terminal.needsInput = false
      state.decision = { waiting: false, prompt: null, receipt: response.receipt }
      renderAttention()
      renderTerminals()
    }
    // A quick choice must not discard a separately composed message.
    if (!isQuickChoice && terminalMemory(terminal.id).draft === originalDraft) {
      terminalMemory(terminal.id).draft = ''
      if (state.selectedTerminalId === terminal.id) elements.feedbackText.value = ''
      persistWorkspace()
    }
    window.setTimeout(() => {
      if (state.paired && state.selectedTerminalId === terminal.id) refreshTerminalLog(true)
    }, 350)
  } catch (error) {
    delivery.message = `Send not confirmed. Check the output before retrying. ${error.message}`
    delivery.error = true
    if (isQuickChoice && decisionId) window.setTimeout(() => refreshTerminalLog(true), 0)
  } finally {
    delivery.pending = false
    if (state.paired && state.selectedTerminalId === terminal.id) {
      renderTerminalPanel()
      resizeComposer()
    }
  }
}

elements.pairForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const code = elements.pairCode.value.replace(/\D/g, '')
  if (code.length !== 6) {
    setStatus(elements.pairStatus, 'Enter all six digits.', true)
    return
  }
  const button = elements.pairForm.querySelector('button')
  button.disabled = true
  setStatus(elements.pairStatus, 'Pairing…')
  try {
    await api('/api/pair', { method: 'POST', body: JSON.stringify({ code }) })
    elements.pairCode.value = ''
    setStatus(elements.pairStatus, '')
    showApp()
    await refreshDashboard(true)
    await restoreWorkspace()
  } catch (error) {
    setStatus(elements.pairStatus, error.message, true)
  } finally {
    button.disabled = false
  }
})

elements.pairCode.addEventListener('input', () => {
  elements.pairCode.value = elements.pairCode.value.replace(/\D/g, '').slice(0, 6)
})

elements.refreshButton.addEventListener('click', () => refreshDashboard(true))

elements.terminalTextSmaller.addEventListener('click', () => setTerminalFontSize(state.terminalFontSize - 1))
elements.terminalTextLarger.addEventListener('click', () => setTerminalFontSize(state.terminalFontSize + 1))
elements.terminalLatest.addEventListener('click', () => {
  elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight
})

elements.backButton.addEventListener('click', () => {
  if (history.state?.workspace) history.back()
  else showList()
})

$('context-button').addEventListener('click', () => openSheet(elements.contextDialog))
elements.continueButton.addEventListener('click', openContinuationReview)
elements.continuationForm.addEventListener('submit', submitContinuation)
$('switch-agent-button').addEventListener('click', () => openSheet(elements.agentsDialog))
$('display-button').addEventListener('click', () => openSheet(elements.displayDialog))
elements.nextAgentButton.addEventListener('click', () => {
  const terminal = nextWaitingAgent()
  if (terminal) selectProject(terminal.workstreamId, terminal.id)
})
for (const sheet of sheets) {
  sheet.querySelector('[data-close-sheet]').addEventListener('click', () => closeSheet())
  sheet.addEventListener('cancel', (event) => { event.preventDefault(); closeSheet() })
  sheet.addEventListener('click', (event) => {
    const bounds = sheet.getBoundingClientRect()
    if (event.target === sheet && (event.clientY < bounds.top || event.clientY > bounds.bottom
      || event.clientX < bounds.left || event.clientX > bounds.right)) closeSheet()
  })
}
window.addEventListener('popstate', (event) => {
  sheets.forEach((sheet) => { if (sheet.open) sheet.close() })
  const afterClose = state.afterSheetClose
  state.afterSheetClose = null
  if (!state.paired) return
  const selection = event.state?.workspace
  if (!selection) showList()
  else if (selection.projectId !== state.selectedProjectId || selection.terminalId !== state.selectedTerminalId) {
    selectProject(selection.projectId, selection.terminalId, false)
  }
  if (event.state?.sheet) $(event.state.sheet)?.showModal()
  afterClose?.()
})

elements.feedbackText.addEventListener('input', () => {
  if (!state.selectedTerminalId) return
  terminalMemory(state.selectedTerminalId).draft = elements.feedbackText.value
  persistWorkspace()
  resizeComposer()
})
elements.terminalOutput.addEventListener('scroll', () => {
  elements.terminalLatest.hidden = terminalIsAtBottom()
  if (state.logLoaded) rememberTerminal()
}, { passive: true })
elements.terminalWrap.addEventListener('change', () => {
  elements.terminalOutput.classList.toggle('no-wrap', !elements.terminalWrap.checked)
  try { localStorage.setItem('gogoagent.mobile.wrap', String(elements.terminalWrap.checked)) } catch {}
})
elements.terminalSections.addEventListener('change', () => {
  const follow = terminalIsAtBottom()
  const previousTop = elements.terminalOutput.scrollTop
  state.separateOutput = elements.terminalSections.checked
  renderTerminalPanel()
  elements.terminalOutput.scrollTop = follow ? elements.terminalOutput.scrollHeight : previousTop
  elements.terminalLatest.hidden = terminalIsAtBottom()
  rememberTerminal()
  try { localStorage.setItem('gogoagent.mobile.sections', String(state.separateOutput)) } catch {}
})
window.visualViewport?.addEventListener('resize', syncViewport)
window.visualViewport?.addEventListener('scroll', syncViewport)
window.addEventListener('resize', syncViewport)
window.addEventListener('pagehide', rememberTerminal)

elements.editStateButton.addEventListener('click', () => {
  const editing = !elements.stateForm.hidden
  elements.stateForm.hidden = editing
  elements.stateSummary.hidden = !editing
  elements.editStateButton.textContent = editing ? 'Edit' : 'Close editor'
  setStatus(elements.stateFormStatus, '')
  if (!editing) $('state-goal').focus()
})

elements.cancelStateButton.addEventListener('click', () => {
  if (state.projectDetail?.project) fillStateForm(state.projectDetail.project)
  elements.stateForm.hidden = true
  elements.stateSummary.hidden = false
  elements.editStateButton.textContent = 'Edit'
  setStatus(elements.stateFormStatus, '')
})

elements.stateForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.selectedProjectId) return
  const submitButton = elements.stateForm.querySelector('button[type="submit"]')
  submitButton.disabled = true
  setStatus(elements.stateFormStatus, 'Saving…')
  const projectId = state.selectedProjectId
  const capsule = {
    goal: $('state-goal').value.trim(),
    currentState: $('state-current').value.trim(),
    blocker: $('state-blocker').value.trim(),
    nextAction: $('state-next').value.trim(),
    lastVerification: $('state-verification').value.trim(),
  }
  try {
    const response = await api(`/api/projects/${encodeURIComponent(projectId)}/state`, {
      method: 'PATCH',
      body: JSON.stringify(capsule),
    })
    if (!response.project) throw new Error('The updated workstream was not returned')
    if (state.selectedProjectId !== projectId) return
    state.projectDetail.project = response.project
    renderStateSummary(state.projectDetail.project)
    elements.stateForm.hidden = true
    elements.stateSummary.hidden = false
    elements.editStateButton.textContent = 'Edit'
    setStatus(elements.stateFormStatus, '')
    await refreshDashboard()
  } catch (error) {
    if (state.selectedProjectId === projectId) setStatus(elements.stateFormStatus, error.message, true)
  } finally {
    submitButton.disabled = false
  }
})

elements.feedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = elements.feedbackText.value.trim()
  if (!text) {
    setStatus(elements.feedbackStatus, 'Write a response first.', true)
    return
  }
  await sendResponse(text)
})

elements.signoutButton.addEventListener('click', async () => {
  try {
    await api('/api/signout', { method: 'POST', body: JSON.stringify({}) })
  } finally {
    showList()
    state.terminalMemory = Object.create(null)
    state.deliveries.clear()
    persistWorkspace()
    history.replaceState({}, '')
    state.projects = []
    state.attention = []
    state.terminals = []
    showPairing()
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) rememberTerminal()
  else if (state.paired) { syncViewport(); refreshDashboard() }
})

async function restoreWorkspace() {
  const selection = state.lastSelection
  if (selection && state.projects.some((project) => project.id === selection.projectId && !project.archivedAt)) {
    await selectProject(selection.projectId, selection.terminalId)
  }
}

async function boot() {
  syncViewport()
  history.replaceState({}, '')
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    for (const [id, entry] of Object.entries(saved.terminals || {}).slice(-100)) {
      if (!entry || typeof entry !== 'object') continue
      state.terminalMemory[id] = {
        draft: typeof entry.draft === 'string' ? entry.draft.slice(0, 4000) : '',
        scrollTop: Number.isFinite(entry.scrollTop) ? Math.max(0, entry.scrollTop) : 0,
        follow: entry.follow !== false,
      }
    }
    if (typeof saved.selection?.projectId === 'string') state.lastSelection = saved.selection
    const wrap = localStorage.getItem('gogoagent.mobile.wrap') !== 'false'
    elements.terminalWrap.checked = wrap
    elements.terminalOutput.classList.toggle('no-wrap', !wrap)
    state.separateOutput = localStorage.getItem('gogoagent.mobile.sections') !== 'false'
    elements.terminalSections.checked = state.separateOutput
  } catch {
    // Ignore invalid or unavailable browser storage.
  }
  try {
    const savedSize = Number(localStorage.getItem('gogoagent.mobile.terminalFontSize'))
    if (Number.isInteger(savedSize) && savedSize >= 8 && savedSize <= 18) setTerminalFontSize(savedSize)
  } catch {
    // Use the compact default when browser storage is unavailable.
  }
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const pairingToken = fragment.get('pair')
  if (pairingToken) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    showPairing()
    setStatus(elements.pairStatus, 'Pairing this phone…')
    try {
      await api('/api/pair', { method: 'POST', body: JSON.stringify({ code: pairingToken }) })
      setStatus(elements.pairStatus, '')
      showApp()
      await refreshDashboard(true)
      await restoreWorkspace()
      return
    } catch (error) {
      setStatus(elements.pairStatus, `Pairing link failed: ${error.message}`, true)
      return
    }
  }
  try {
    const session = await api('/api/session')
    if (!session.paired) {
      showPairing()
      return
    }
    showApp()
    await refreshDashboard(true)
    await restoreWorkspace()
  } catch (error) {
    showPairing()
    setStatus(elements.pairStatus, `Gateway unavailable: ${error.message}`, true)
  }
}

window.setInterval(() => refreshDashboard(), 3000)
boot()
