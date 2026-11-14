import { createReadStream } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import type { ArtifactRecord, SessionMessageRecord } from '@gogoagent/shared'
import { extractCandidates } from './extractCandidates.js'
import { inferSessionTitle } from './inferTitle.js'
import type { ParseTranscriptDeps, TranscriptParseResult } from './parseTranscript.js'
import { clampTitle, stableId } from './utils.js'

interface CodexLine {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

function textContent(value: unknown) {
  if (!Array.isArray(value)) return ''
  return value
    .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === 'object')
    .filter((block) => block.type === 'input_text' || block.type === 'output_text')
    .map((block) => typeof block.text === 'string' ? block.text : '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

function isSetupMessage(text: string) {
  return text.startsWith('<environment_context>') || text.startsWith('# AGENTS.md instructions')
}

function toolDetail(payload: Record<string, unknown>) {
  const raw = payload.arguments ?? payload.input
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const input = parsed as Record<string, unknown>
        for (const key of ['cmd', 'command', 'path', 'file_path']) {
          if (typeof input[key] === 'string') return input[key] as string
        }
      }
    } catch {
      return raw
    }
    return raw
  }
  return ''
}

export async function parseCodexTranscript(
  transcriptPath: string,
  deps: Pick<ParseTranscriptDeps, 'resolveProjectRoot' | 'projectIdForRoot'>,
): Promise<TranscriptParseResult | null> {
  const eventMessages: Array<{ role: 'user' | 'assistant'; timestamp: string; text: string }> = []
  const responseMessages: typeof eventMessages = []
  const toolCalls: Array<{ timestamp: string; name: string; detail: string }> = []
  let metadata: Record<string, unknown> | undefined
  let lastTimestamp = ''
  const reader = createInterface({ input: createReadStream(transcriptPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const rawLine of reader) {
    let line: CodexLine
    try {
      line = JSON.parse(rawLine) as CodexLine
    } catch {
      continue
    }
    if (line.type === 'session_meta' && !metadata) metadata = line.payload
    const timestamp = line.timestamp
    if (!timestamp || !Number.isFinite(Date.parse(timestamp))) continue
    if (timestamp > lastTimestamp) lastTimestamp = timestamp
    const payload = line.payload
    if (!payload) continue
    if (line.type === 'event_msg') {
      if (payload.type === 'user_message' && typeof payload.message === 'string') {
        eventMessages.push({ role: 'user', timestamp, text: payload.message.trim() })
      } else if (payload.type === 'agent_message' && typeof payload.message === 'string') {
        eventMessages.push({ role: 'assistant', timestamp, text: payload.message.trim() })
      }
    } else if (line.type === 'response_item') {
      if (payload.type === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
        responseMessages.push({ role: payload.role, timestamp, text: textContent(payload.content) })
      } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
        toolCalls.push({
          timestamp,
          name: typeof payload.name === 'string' ? payload.name : 'tool',
          detail: toolDetail(payload),
        })
      }
    }
  }
  const sessionId = typeof metadata?.id === 'string' ? metadata.id : ''
  const cwd = typeof metadata?.cwd === 'string' ? metadata.cwd : ''
  if (!sessionId || !path.isAbsolute(cwd)) return null

  const git = metadata?.git && typeof metadata.git === 'object'
    ? metadata.git as Record<string, unknown>
    : undefined
  const gitBranch = typeof git?.branch === 'string' ? git.branch : undefined
  const startedAt = typeof metadata?.timestamp === 'string' ? metadata.timestamp : lastTimestamp
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return null

  const updatedAt = lastTimestamp > startedAt ? lastTimestamp : startedAt
  let firstUserText = ''
  const messageSource = (['user', 'assistant'] as const)
    .flatMap((role) => {
      const events = eventMessages.filter((message) => message.role === role)
      return events.length ? events : responseMessages.filter((message) => message.role === role)
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const messages: SessionMessageRecord[] = messageSource
    .filter(({ role, text }) => Boolean(text) && !(role === 'user' && isSetupMessage(text)))
    .map(({ role, text, timestamp }, index) => {
      if (role === 'user' && !firstUserText) firstUserText = text.replace(/\s+/g, ' ').trim()
      return { id: stableId('message', `${sessionId}:${timestamp}:${index}`), sessionId, role, timestamp, text }
    })
  if (!messages.length && !toolCalls.length) return null
  const artifacts: ArtifactRecord[] = toolCalls.map(({ timestamp, name, detail }, index) => ({
    id: stableId('artifact', `${sessionId}:tool:${timestamp}:${index}`),
    sessionId,
    kind: 'tool_call',
    label: `${name} tool call`,
    detail: clampTitle(detail || name, 140),
    evidence: 'mentioned',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    eventTimestamps: [timestamp],
  }))
  const projectRoot = await deps.resolveProjectRoot(cwd)
  const projectId = deps.projectIdForRoot(projectRoot)
  artifacts.push({
    id: stableId('artifact', `${sessionId}:cwd:${cwd}`),
    sessionId,
    kind: 'cwd',
    label: 'Working directory',
    path: cwd,
    evidence: 'workspace_root',
    firstSeenAt: startedAt,
    lastSeenAt: updatedAt,
    eventTimestamps: [startedAt, updatedAt],
  })
  if (projectRoot !== cwd) {
    artifacts.push({
      id: stableId('artifact', `${sessionId}:root:${projectRoot}`),
      sessionId,
      kind: 'directory',
      label: 'Inferred project root',
      path: projectRoot,
      evidence: 'workspace_root',
      firstSeenAt: startedAt,
      lastSeenAt: updatedAt,
      eventTimestamps: [startedAt, updatedAt],
    })
  }
  const candidates = extractCandidates(sessionId, messages)
  return {
    session: {
      id: sessionId,
      projectId,
      agentKind: 'codex',
      title: inferSessionTitle(firstUserText, { repoRoot: projectRoot, branch: gitBranch, startedAt }),
      cwd,
      transcriptPath,
      status: 'archived',
      startedAt,
      updatedAt,
      messageCount: messages.length,
      toolCallCount: toolCalls.length,
      lessonCount: candidates.filter((candidate) => candidate.kind === 'lesson').length,
      gitBranch,
    },
    artifacts,
    messages,
    candidates,
  }
}
