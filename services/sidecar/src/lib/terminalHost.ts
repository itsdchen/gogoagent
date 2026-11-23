import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as pty from 'node-pty'
import { compactHomePath } from './utils.js'

export type TerminalKind = 'shell' | 'claude' | 'codex' | 'agy'
type TerminalStatus = 'running' | 'exited'

export interface TerminalSessionRecord {
  id: string
  kind: TerminalKind
  title: string
  cwd: string
  workstreamId?: string
  gitBranch?: string
  resumeSessionId?: string
  command: string
  status: TerminalStatus
  userInteracted?: boolean
  needsInput?: boolean
  exitCode?: number
  startedAt: string
  lastActivityAt?: string
  endedAt?: string
  logPath?: string
  logBytes: number
  logError?: string
}

interface TerminalSession {
  record: TerminalSessionRecord
  ptyProcess: pty.IPty
  logStream?: fs.WriteStream
  metadataPath?: string
  closed?: boolean
  finalized?: boolean
  lastWriteBreadcrumbAt?: number
  lastActivityMetadataWriteAt?: number
  recentVisibleOutput?: string
}

export type TerminalEvent =
  | { type: 'created'; payload: TerminalSessionRecord }
  | { type: 'data'; payload: { id: string; data: string; logBytes?: number; lastActivityAt?: string; needsInput?: boolean; needsInputChanged?: boolean } }
  | { type: 'exit'; payload: { id: string; record: TerminalSessionRecord } }
  | { type: 'closed'; payload: { id: string } }

export interface TerminalLogReplay {
  data: string
  bytes: number
  truncated: boolean
  logPath?: string
}

export interface CreateTerminalInput {
  kind?: TerminalKind
  cwd?: string
  title?: string
  workstreamId?: string
  gitBranch?: string
  resumeSessionId?: string
  cols?: number
  rows?: number
  indexImmediately?: boolean
}

const terminalSessions = new Map<string, TerminalSession>()
const terminalListeners = new Set<(event: TerminalEvent) => void>()
const MAX_LOG_REPLAY_BYTES = 1024 * 1024
const ACTIVITY_METADATA_WRITE_INTERVAL_MS = 15_000
const NEEDS_INPUT_CONTEXT_CHARS = 6000

function emit(event: TerminalEvent) {
  for (const listener of terminalListeners) listener(event)
}

export function addTerminalEventListener(listener: (event: TerminalEvent) => void) {
  terminalListeners.add(listener)
  return () => terminalListeners.delete(listener)
}

function safeCwd(cwd: string | undefined) {
  if (!cwd) return os.homedir()
  try {
    if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) return cwd
  } catch {
    // Fall through to home.
  }
  return os.homedir()
}

function shellArg(value: string) {
  if (/^[A-Za-z0-9._:-]+$/.test(value)) return value
  return `'${value.replace(/'/g, "'\\''")}'`
}

function makeTerminalCommand(kind: TerminalKind, input: CreateTerminalInput) {
  const shell = process.env.SHELL || '/bin/bash'
  if (kind === 'shell') {
    return { command: shell, args: ['-l'], label: path.basename(shell) || 'shell' }
  }
  if (kind === 'claude') {
    const resumeSessionId = input.resumeSessionId?.trim()
    const commandLine = resumeSessionId ? `claude --resume ${shellArg(resumeSessionId)}` : 'claude'
    return { command: shell, args: ['-lc', commandLine], label: 'claude' }
  }
  if (kind === 'agy') {
    const resumeSessionId = input.resumeSessionId?.trim()
    const commandLine = resumeSessionId ? `agy --conversation ${shellArg(resumeSessionId)}` : 'agy'
    return { command: shell, args: ['-lc', commandLine], label: 'agy' }
  }
  const resumeSessionId = input.resumeSessionId?.trim()
  const commandLine = resumeSessionId ? `codex resume ${shellArg(resumeSessionId)}` : 'codex'
  return { command: shell, args: ['-lc', commandLine], label: 'codex' }
}

function terminalLogRoot() {
  const root = process.env.GOGOAGENT_TERMINAL_LOG_DIR ?? path.join(os.homedir(), '.gogoagent', 'terminal-logs')
  fs.mkdirSync(root, { recursive: true })
  return root
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'terminal'
}

function makeTerminalLogPath(record: TerminalSessionRecord) {
  const stamp = record.startedAt.replace(/[:.]/g, '-')
  return path.join(terminalLogRoot(), `${stamp}-${record.kind}-${slugPart(record.title)}-${record.id}.ansi.log`)
}

function makeTerminalMetadataPath(record: TerminalSessionRecord) {
  const stamp = record.startedAt.replace(/[:.]/g, '-')
  return path.join(terminalLogRoot(), `${stamp}-${record.kind}-${slugPart(record.title)}-${record.id}.json`)
}

function writeTerminalMetadata(session: TerminalSession) {
  if (!session.metadataPath) return
  try {
    fs.writeFileSync(session.metadataPath, `${JSON.stringify({ version: 1, ...session.record }, null, 2)}\n`)
  } catch (error) {
    session.record.logError = error instanceof Error ? error.message : String(error)
  }
}

function terminalBreadcrumbPath() {
  return path.join(terminalLogRoot(), 'terminal-events.jsonl')
}

function recordTerminalBreadcrumb(
  record: TerminalSessionRecord,
  action: string,
  detail: Record<string, unknown> = {},
) {
  try {
    fs.appendFileSync(terminalBreadcrumbPath(), `${JSON.stringify({
      ts: new Date().toISOString(),
      action,
      id: record.id,
      kind: record.kind,
      title: record.title,
      cwd: record.cwd,
      workstreamId: record.workstreamId,
      status: record.status,
      ...detail,
    })}\n`)
  } catch (error) {
    record.logError = error instanceof Error ? error.message : String(error)
  }
}

function appendTerminalLog(session: TerminalSession, data: string) {
  if (!session.logStream) return
  session.record.logBytes += Buffer.byteLength(data)
  session.logStream.write(data)
}

function markTerminalActivity(session: TerminalSession, persist = false) {
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  session.record.lastActivityAt = now

  if (
    persist ||
    nowMs - (session.lastActivityMetadataWriteAt ?? 0) >= ACTIVITY_METADATA_WRITE_INTERVAL_MS
  ) {
    session.lastActivityMetadataWriteAt = nowMs
    writeTerminalMetadata(session)
  }

  return now
}

function startTerminalLog(record: TerminalSessionRecord) {
  try {
    record.logPath = makeTerminalLogPath(record)
    const stream = fs.createWriteStream(record.logPath, { flags: 'a' })
    stream.on('error', (error) => {
      record.logError = error.message
    })
    return stream
  } catch (error) {
    record.logError = (error as Error).message
    return undefined
  }
}

function terminalLogHeader(record: TerminalSessionRecord) {
  return [
    '\x1b[90mgogoagent terminal log\x1b[0m\r\n',
    `title: ${record.title}\r\n`,
    `kind: ${record.kind}\r\n`,
    `cwd: ${compactHomePath(record.cwd, os.homedir())}\r\n`,
    `command: ${record.command}\r\n`,
    `started: ${record.startedAt}\r\n`,
    '\r\n',
  ].join('')
}

function terminalLogFooter(record: TerminalSessionRecord) {
  return `\r\n\x1b[90m[process exited with code ${record.exitCode ?? 'unknown'} at ${record.endedAt ?? new Date().toISOString()}]\x1b[0m\r\n`
}

function hasMeaningfulUserInput(data: string) {
  if (!data) return false
  if (data.includes('\r') || data.includes('\n')) return true
  const withoutAnsiControls = data
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  return /[^\x00-\x1f\x7f]/.test(withoutAnsiControls)
}

function submitsUserInput(data: string) {
  return data.includes('\r') || data.includes('\n')
}

function terminalInputBreadcrumbDetail(data: string) {
  return {
    bytes: Buffer.byteLength(data),
    meaningful: hasMeaningfulUserInput(data),
    submitted: submitsUserInput(data),
    escape: data.includes('\x1b'),
    ctrlC: data.includes('\x03'),
    ctrlD: data.includes('\x04'),
  }
}

function visibleTerminalText(data: string) {
  return data
    .replace(/\x1b\]0;([^\x07]*(?:\x1b(?!\\)[^\x07]*)*)(?:\x07|\x1b\\)/g, '\n$1\n')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '\n')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[PX^_].*?\x1b\\/gs, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim()
}

export function appendNeedsInputContext(previous: string | undefined, data: string) {
  const visible = visibleTerminalText(data)
  if (!visible) return previous ?? ''
  return `${previous ?? ''}\n${visible}`.slice(-NEEDS_INPUT_CONTEXT_CHARS)
}

function textSignalsAwaitingInput(compact: string) {
  return /\b(?:awaiting|waiting for|needs) (?:user )?input\b/i.test(compact)
    || /\binput required\b/i.test(compact)
    || /\bapproval required\b/i.test(compact)
    || /\bpress (?:enter|y|n)\b/i.test(compact)
    || /\benter to select\b/i.test(compact)
    || /\btab\/arrow keys? to navigate\b/i.test(compact)
    || /\btab to amend\b/i.test(compact)
    || /\bctrl\+e to explain\b/i.test(compact)
    || /\bselect (?:one|an option)\b/i.test(compact)
    || /\bchoose (?:one|an option|a number)\b/i.test(compact)
    || /\b1\.\s*yes\b.*\b2\.\s*no\b/i.test(compact)
    || /\bi need from you\b/i.test(compact)
    || /\bplease (?:confirm|provide|choose|select|approve)\b/i.test(compact)
    || /\bdo you want to\b/i.test(compact)
}

export function inferNeedsInput(
  record: Pick<TerminalSessionRecord, 'kind' | 'needsInput'>,
  data: string,
  recentVisibleOutput = '',
) {
  if (record.kind === 'shell') return record.needsInput ?? false

  const text = visibleTerminalText(data)
  if (!text) return record.needsInput ?? false

  const compact = text.replace(/\s+/g, ' ').trim()
  const recentCompact = recentVisibleOutput.replace(/\s+/g, ' ').trim()
  const isNonBlockingStatus = /\bno response requested\b/i.test(compact)
    || /\bno need to (?:check in|respond)\b/i.test(compact)
    || /\bi'?ll (?:ping|come back|let you know)\b/i.test(compact)
    || /\b(?:shells?|commands?|jobs?) still running\b/i.test(compact)
    || /\bbackground command\b/i.test(compact)
    || /\bwaiting on (?:the )?background\b/i.test(compact)
    || /\bwaiting on .* to complete\b/i.test(compact)
  const isWorking = /\besc to interrupt\b/i.test(compact)
    || /\b(?:thinking|tokens?)\b/i.test(compact)
    || /\b(?:shells?|commands?|jobs?) still running\b/i.test(compact)
    || /\b(?:canoodling|catapulting|embellishing|cooking|running|reading|writing|editing|searching)\u2026/i.test(compact)
  const isAwaitingInput = textSignalsAwaitingInput(compact)

  if (isNonBlockingStatus) return false
  if (isAwaitingInput) return true
  if (isWorking) return false
  if (textSignalsAwaitingInput(recentCompact)) return true
  return record.needsInput ?? false
}

function updateNeedsInput(session: TerminalSession, needsInput: boolean) {
  if ((session.record.needsInput ?? false) === needsInput) return false
  session.record.needsInput = needsInput || undefined
  writeTerminalMetadata(session)
  recordTerminalBreadcrumb(session.record, 'needs_input_changed', { needsInput })
  return true
}

function closeTerminalLog(session: TerminalSession) {
  if (!session.logStream) return
  session.logStream.end()
  session.logStream = undefined
}

function finalizeTerminalSession(session: TerminalSession, exitCode?: number, notify = true) {
  if (!session.finalized) {
    session.finalized = true
    session.record.status = 'exited'
    session.record.needsInput = undefined
    if (exitCode !== undefined) session.record.exitCode = exitCode
    session.record.endedAt = session.record.endedAt ?? new Date().toISOString()
    appendTerminalLog(session, terminalLogFooter(session.record))
    recordTerminalBreadcrumb(session.record, 'exited', { exitCode: session.record.exitCode })
  }
  closeTerminalLog(session)
  writeTerminalMetadata(session)
  if (notify && !session.closed) emit({ type: 'exit', payload: { id: session.record.id, record: session.record } })
}

export function terminalRecords() {
  return [...terminalSessions.values()].map((session) => session.record)
}

export function hasTerminal(id: string) {
  return terminalSessions.has(id)
}

export function createTerminal(input: CreateTerminalInput) {
  const kind = input.kind ?? 'shell'
  const cwd = safeCwd(input.cwd)
  const { command, args, label } = makeTerminalCommand(kind, input)
  const now = new Date().toISOString()
  const id = `term-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const title = input.title?.trim() || `${label} · ${path.basename(cwd) || cwd}`
  const workstreamId = input.workstreamId ?? `terminal-workstream-${id}`

  const ptyProcess = pty.spawn(command, args, {
    name: 'xterm-256color',
    cwd,
    cols: input.cols ?? 100,
    rows: input.rows ?? 28,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  })

  const record: TerminalSessionRecord = {
    id,
    kind,
    title,
    cwd,
    workstreamId,
    gitBranch: input.gitBranch,
    resumeSessionId: kind === 'shell' ? undefined : input.resumeSessionId?.trim() || undefined,
    command: [command, ...args].join(' '),
    status: 'running',
    userInteracted: input.indexImmediately === true,
    startedAt: now,
    lastActivityAt: now,
    logBytes: 0,
  }

  const session: TerminalSession = { record, ptyProcess }
  session.logStream = startTerminalLog(record)
  session.metadataPath = makeTerminalMetadataPath(record)
  appendTerminalLog(session, terminalLogHeader(record))
  writeTerminalMetadata(session)
  recordTerminalBreadcrumb(record, 'created', {
    command: record.command,
    resumeSessionId: record.resumeSessionId,
  })
  terminalSessions.set(id, session)

  ptyProcess.onData((data) => {
    appendTerminalLog(session, data)
    const lastActivityAt = markTerminalActivity(session)
    session.recentVisibleOutput = appendNeedsInputContext(session.recentVisibleOutput, data)
    const needsInput = inferNeedsInput(record, data, session.recentVisibleOutput)
    const needsInputChanged = updateNeedsInput(session, needsInput)
    emit({ type: 'data', payload: { id, data, logBytes: record.logBytes, lastActivityAt, needsInput: record.needsInput ?? false, needsInputChanged } })
  })
  ptyProcess.onExit(({ exitCode }) => {
    finalizeTerminalSession(session, exitCode)
  })

  emit({ type: 'created', payload: record })
  return record
}

export function readTerminalLog(id: string, maxBytes: number | undefined): TerminalLogReplay {
  const session = terminalSessions.get(id)
  if (!session?.record.logPath) {
    return { data: '', bytes: 0, truncated: false }
  }

  const replayBytes = Math.max(0, Math.min(maxBytes ?? MAX_LOG_REPLAY_BYTES, MAX_LOG_REPLAY_BYTES))
  const stat = fs.statSync(session.record.logPath)
  session.record.logBytes = stat.size

  if (stat.size === 0 || replayBytes === 0) {
    return { data: '', bytes: stat.size, truncated: stat.size > 0, logPath: session.record.logPath }
  }

  const start = Math.max(0, stat.size - replayBytes)
  const length = stat.size - start
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(session.record.logPath, 'r')
  try {
    fs.readSync(fd, buffer, 0, length, start)
  } finally {
    fs.closeSync(fd)
  }

  return {
    data: buffer.toString('utf8'),
    bytes: stat.size,
    truncated: start > 0,
    logPath: session.record.logPath,
  }
}

export function writeTerminal(id: string, data: string) {
  const session = terminalSessions.get(id)
  if (!session) return false
  const inputDetail = terminalInputBreadcrumbDetail(data)
  if (data) {
    markTerminalActivity(session, inputDetail.meaningful || inputDetail.submitted || inputDetail.ctrlC || inputDetail.ctrlD)
  }
  const shouldBreadcrumbWrite = inputDetail.submitted
    || inputDetail.escape
    || inputDetail.ctrlC
    || inputDetail.ctrlD
    || (inputDetail.meaningful && Date.now() - (session.lastWriteBreadcrumbAt ?? 0) > 1000)
  if (shouldBreadcrumbWrite) {
    session.lastWriteBreadcrumbAt = Date.now()
    recordTerminalBreadcrumb(session.record, 'write', inputDetail)
  }
  let interactionRecorded = false
  if (!session.record.userInteracted && hasMeaningfulUserInput(data)) {
    session.record.userInteracted = true
    interactionRecorded = true
    writeTerminalMetadata(session)
  }
  const submitted = submitsUserInput(data)
  if (submitted) session.recentVisibleOutput = ''
  const needsInputChanged = submitted ? updateNeedsInput(session, false) : false
  session.ptyProcess.write(data)
  if (needsInputChanged) {
    emit({ type: 'data', payload: { id, data: '', logBytes: session.record.logBytes, needsInput: false, needsInputChanged: true } })
  }
  return interactionRecorded
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  terminalSessions.get(id)?.ptyProcess.resize(cols, rows)
}

export function killTerminal(id: string) {
  const session = terminalSessions.get(id)
  if (!session) return
  recordTerminalBreadcrumb(session.record, 'kill_requested')
  session.ptyProcess.kill()
}

export function closeTerminal(id: string) {
  const session = terminalSessions.get(id)
  if (!session) return
  session.closed = true
  recordTerminalBreadcrumb(session.record, 'close_requested', { wasRunning: session.record.status === 'running' })
  if (session.record.status === 'running') session.ptyProcess.kill()
  finalizeTerminalSession(session, undefined, false)
  terminalSessions.delete(id)
  emit({ type: 'closed', payload: { id } })
}
