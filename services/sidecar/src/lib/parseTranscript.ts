import path from 'node:path'
import os from 'node:os'
import type {
  ArtifactEvidence,
  ArtifactKind,
  ArtifactRecord,
  ExtractionCandidate,
  SessionMessageRecord,
  SessionRecord,
  SessionStatus,
} from '@gogoagent/shared'
import { extractCandidates } from './extractCandidates.js'
import { inferSessionTitle } from './inferTitle.js'
import { clampTitle, roleForLine, stableId } from './utils.js'

export interface HistoryEntry {
  display?: string
  timestamp?: number
  project?: string
  sessionId?: string
}

export interface SessionMeta {
  pid?: number
  sessionId?: string
  cwd?: string
  startedAt?: number
}

export interface TranscriptParseResult {
  session: SessionRecord
  artifacts: ArtifactRecord[]
  messages: SessionMessageRecord[]
  candidates: ExtractionCandidate[]
  terminalResumeSessionId?: string
}

function sumUsage(usage: Record<string, unknown> | undefined) {
  if (!usage) return 0
  const keys = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
  return keys.reduce((total, key) => total + (typeof usage[key] === 'number' ? (usage[key] as number) : 0), 0)
}

function artifactKey(sessionId: string, kind: ArtifactKind, value: string) {
  return `${sessionId}::${kind}::${value}`
}

const evidenceRank: Record<ArtifactEvidence, number> = {
  mentioned: 1,
  inspected: 2,
  touched: 3,
  workspace_root: 4,
}

function withArtifactEvent<T extends ArtifactRecord>(artifact: T, timestamp?: string): T {
  artifact.occurrenceCount = artifact.occurrenceCount ?? 1
  if (timestamp) {
    artifact.firstSeenAt = artifact.firstSeenAt ?? timestamp
    artifact.lastSeenAt = artifact.lastSeenAt && artifact.lastSeenAt > timestamp ? artifact.lastSeenAt : timestamp
    artifact.eventTimestamps = [...(artifact.eventTimestamps ?? []), timestamp]
  }
  return artifact
}

function upsertArtifact(artifactMap: Map<string, ArtifactRecord>, artifact: ArtifactRecord) {
  const key = artifactKey(
    artifact.sessionId,
    artifact.kind,
    `${artifact.path ?? artifact.detail ?? artifact.label}:${artifact.evidence ?? 'mentioned'}`,
  )
  const existing = artifactMap.get(key)
  if (!existing) {
    artifactMap.set(key, {
      ...artifact,
      occurrenceCount: artifact.occurrenceCount ?? Math.max(1, artifact.eventTimestamps?.length ?? 0),
    })
    return
  }

  existing.occurrenceCount = (existing.occurrenceCount ?? 1) + (artifact.occurrenceCount ?? Math.max(1, artifact.eventTimestamps?.length ?? 0))
  existing.eventTimestamps = [
    ...(existing.eventTimestamps ?? []),
    ...(artifact.eventTimestamps ?? []),
  ]
  if (artifact.firstSeenAt && (!existing.firstSeenAt || artifact.firstSeenAt < existing.firstSeenAt)) {
    existing.firstSeenAt = artifact.firstSeenAt
  }
  if (artifact.lastSeenAt && (!existing.lastSeenAt || artifact.lastSeenAt > existing.lastSeenAt)) {
    existing.lastSeenAt = artifact.lastSeenAt
  }
  const incomingEvidence = artifact.evidence ?? 'mentioned'
  const existingEvidence = existing.evidence ?? 'mentioned'
  if (evidenceRank[incomingEvidence] > evidenceRank[existingEvidence]) {
    existing.evidence = incomingEvidence
    existing.label = artifact.label
    existing.detail = artifact.detail ?? existing.detail
  }
}

function collectPathArtifacts(
  sessionId: string,
  content: string,
  artifactMap: Map<string, ArtifactRecord>,
  evidence: ArtifactEvidence = 'mentioned',
  timestamp?: string,
) {
  const matches = content.match(/\/[A-Za-z0-9._\-\/]+/g) ?? []
  for (const rawPath of matches) {
    const cleaned = rawPath.replace(/[.,;:!?]+$/, '')
    if (!cleaned.startsWith('/')) continue
    const kind: ArtifactKind = path.extname(cleaned) ? 'file' : 'directory'
    upsertArtifact(artifactMap, withArtifactEvent({
      id: stableId('artifact', artifactKey(sessionId, kind, `${cleaned}:${evidence}`)),
      sessionId,
      kind,
      label: kind === 'file' ? 'Referenced file path' : 'Referenced directory path',
      path: cleaned,
      evidence,
    }, timestamp))
  }
}

function collectMessageText(message: Record<string, unknown> | undefined) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (!block || typeof block !== 'object') return ''
        const typedBlock = block as Record<string, unknown>
        if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') return typedBlock.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function classifyCommandEvidence(command: string): ArtifactEvidence {
  const normalized = command.toLowerCase()
  if (/\b(cat|less|head|tail|grep|rg|find|ls|tree|stat|file|sed -n|awk|git status|git diff|git show)\b/.test(normalized)) return 'inspected'
  if (/\b(mv|cp|touch|mkdir|tee|echo\s+.*>|printf\s+.*>|sed -i|perl -pi|apply_patch|patch|git apply|git commit|chmod|chown)\b/.test(normalized)) return 'touched'
  return 'mentioned'
}

function classifyToolEvidence(toolName: string, input: Record<string, unknown> | undefined): ArtifactEvidence {
  const normalized = toolName.toLowerCase()
  if (/(write|edit|patch|multiedit)/.test(normalized)) return 'touched'
  if (/(read|view|grep|glob|search|find|bash)/.test(normalized)) {
    const command = typeof input?.command === 'string' ? input.command : ''
    return command ? classifyCommandEvidence(command) : 'inspected'
  }
  return 'mentioned'
}

function collectToolInputArtifacts(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown> | undefined,
  artifactMap: Map<string, ArtifactRecord>,
  timestamp?: string,
) {
  if (!input) return
  const evidence = classifyToolEvidence(toolName, input)
  const candidateKeys = ['path', 'file_path', 'target_file', 'cwd', 'directory']

  for (const key of candidateKeys) {
    const value = input[key]
    if (typeof value === 'string' && value.startsWith('/')) {
      const kind: ArtifactKind = path.extname(value) ? 'file' : 'directory'
      upsertArtifact(artifactMap, withArtifactEvent({
        id: stableId('artifact', artifactKey(sessionId, kind, `${value}:${evidence}`)),
        sessionId,
        kind,
        label: evidence === 'touched' ? 'Touched path from tool input' : 'Tool input path',
        path: value,
        evidence,
      }, timestamp))
    }
  }

  const command = typeof input.command === 'string' ? input.command : undefined
  if (command) collectPathArtifacts(sessionId, command, artifactMap, classifyCommandEvidence(command), timestamp)
}

export interface ParseTranscriptDeps {
  readJsonlLines: <T>(filePath: string) => Promise<T[]>
  resolveProjectRoot: (cwd: string) => Promise<string>
  projectIdForRoot: (rootPath: string) => string
}

export async function parseTranscript(
  transcriptPath: string,
  historyIndex: Map<string, HistoryEntry[]>,
  sessionMeta: Map<string, SessionMeta>,
  todoCounts: Map<string, number>,
  deps: ParseTranscriptDeps,
): Promise<TranscriptParseResult | null> {
  const lines = await deps.readJsonlLines<Record<string, unknown>>(transcriptPath)
  if (!lines.length) return null

  let sessionId = ''
  let cwd = ''
  let startedAt = ''
  let updatedAt = ''
  let firstUserText = ''
  let messageCount = 0
  let toolCallCount = 0
  let tokenCount = 0
  let gitBranch = ''
  let sawActiveSessionMeta = false

  const artifactMap = new Map<string, ArtifactRecord>()
  const messages: SessionMessageRecord[] = []

  for (const line of lines) {
    const lineSessionId = typeof line.sessionId === 'string' ? line.sessionId : undefined
    const lineCwd = typeof line.cwd === 'string' ? line.cwd : undefined
    const lineTimestamp = typeof line.timestamp === 'string' ? line.timestamp : undefined
    const lineType = typeof line.type === 'string' ? line.type : undefined
    const lineGitBranch = typeof line.gitBranch === 'string' ? line.gitBranch : undefined
    const message = line.message as Record<string, unknown> | undefined

    if (!gitBranch && lineGitBranch) gitBranch = lineGitBranch
    if (!sessionId && lineSessionId) sessionId = lineSessionId
    if (!cwd && lineCwd) cwd = lineCwd
    if (!startedAt && lineTimestamp) startedAt = lineTimestamp
    if (lineTimestamp) updatedAt = lineTimestamp

    const rawText = collectMessageText(message).trim()
    if (rawText && lineTimestamp) {
      messages.push({
        id: stableId('message', `${lineTimestamp}:${sessionId}:${messages.length}`),
        sessionId: sessionId || 'pending',
        role: roleForLine(lineType),
        timestamp: lineTimestamp,
        text: rawText,
      })
      collectPathArtifacts(sessionId || 'pending', rawText, artifactMap, 'mentioned', lineTimestamp)
    }

    if (lineType === 'user' || lineType === 'assistant') messageCount += 1
    if (!firstUserText && lineType === 'user' && rawText && !rawText.startsWith('<local-command-caveat>')) {
      firstUserText = rawText.replace(/\s+/g, ' ').trim()
    }

    if (lineType === 'assistant' && message) {
      const usage = message.usage as Record<string, unknown> | undefined
      tokenCount += sumUsage(usage)
      const content = Array.isArray(message.content) ? message.content : []
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        const typedBlock = block as Record<string, unknown>
        if (typedBlock.type === 'tool_use') {
          toolCallCount += 1
          const toolName = typeof typedBlock.name === 'string' ? typedBlock.name : 'tool'
          const input = typedBlock.input as Record<string, unknown> | undefined
          const command = typeof input?.command === 'string' ? input.command : undefined
          const description = typeof input?.description === 'string' ? input.description : undefined
          const toolEvidence = classifyToolEvidence(toolName, input)
          upsertArtifact(artifactMap, withArtifactEvent({
            id: stableId('artifact', artifactKey(sessionId || 'pending', 'tool_call', `${toolName}:${command ?? description ?? ''}:${toolEvidence}`)),
            sessionId: sessionId || 'pending',
            kind: 'tool_call',
            label: toolEvidence === 'touched' ? `${toolName} mutating tool call` : `${toolName} tool call`,
            detail: clampTitle(command ?? description ?? toolName, 140),
            evidence: toolEvidence,
          }, lineTimestamp))
          collectToolInputArtifacts(sessionId || 'pending', toolName, input, artifactMap, lineTimestamp)
          if (command) {
            const evidence = classifyCommandEvidence(command)
            upsertArtifact(artifactMap, withArtifactEvent({
              id: stableId('artifact', artifactKey(sessionId || 'pending', 'command', `${command}:${evidence}`)),
              sessionId: sessionId || 'pending',
              kind: 'command',
              label: evidence === 'touched' ? 'Mutating command' : 'Command',
              detail: clampTitle(command, 140),
              evidence,
            }, lineTimestamp))
            collectPathArtifacts(sessionId || 'pending', command, artifactMap, evidence, lineTimestamp)
          }
        }
      }
    }
  }

  if (!sessionId) sessionId = path.basename(transcriptPath, '.jsonl')
  const meta = sessionMeta.get(sessionId)
  if (meta?.startedAt && !startedAt) startedAt = new Date(meta.startedAt).toISOString()
  if (meta?.cwd && !cwd) cwd = meta.cwd
  sawActiveSessionMeta = Boolean(meta)

  const history = historyIndex.get(sessionId) ?? []
  if (!firstUserText) {
    const fromHistory = history.find((entry) => entry.display && entry.display.trim())?.display?.trim()
    if (fromHistory) firstUserText = fromHistory
  }

  if (!cwd) cwd = os.homedir()
  if (!startedAt) startedAt = new Date(0).toISOString()
  if (!updatedAt) updatedAt = startedAt

  const projectRoot = await deps.resolveProjectRoot(cwd)
  const projectId = deps.projectIdForRoot(projectRoot)
  const title = inferSessionTitle(firstUserText, {
    repoRoot: projectRoot,
    branch: gitBranch || undefined,
    startedAt,
  })

  upsertArtifact(artifactMap, withArtifactEvent({
    id: stableId('artifact', artifactKey(sessionId, 'cwd', cwd)),
    sessionId,
    kind: 'cwd',
    label: 'Working directory',
    path: cwd,
    evidence: 'workspace_root',
  }, updatedAt))

  if (projectRoot !== cwd) {
    upsertArtifact(artifactMap, withArtifactEvent({
      id: stableId('artifact', artifactKey(sessionId, 'directory', projectRoot)),
      sessionId,
      kind: 'directory',
      label: 'Inferred project root',
      path: projectRoot,
      evidence: 'workspace_root',
    }, updatedAt))
  }

  const todoCount = todoCounts.get(sessionId) ?? 0
  if (todoCount > 0) {
    upsertArtifact(artifactMap, {
      id: stableId('artifact', artifactKey(sessionId, 'todo', String(todoCount))),
      sessionId,
      kind: 'todo',
      label: 'Todo artifact',
      detail: `${todoCount} todo items captured by Claude Code`,
    })
  }

  const status: SessionStatus = sawActiveSessionMeta ? 'active' : 'archived'
  const normalizedMessages = messages.map((message) => message.sessionId === 'pending' ? { ...message, sessionId } : message)
  const candidates = extractCandidates(sessionId, normalizedMessages)
  const lessonCount = candidates.filter((candidate) => candidate.kind === 'lesson').length

  return {
    session: {
      id: sessionId,
      projectId,
      title,
      cwd,
      transcriptPath,
      status,
      startedAt,
      updatedAt,
      messageCount,
      toolCallCount,
      tokenCount,
      lessonCount,
      gitBranch: gitBranch || undefined,
    },
    artifacts: [...artifactMap.values()].map((artifact) => artifact.sessionId === 'pending' ? { ...artifact, sessionId } : artifact),
    messages: normalizedMessages,
    candidates,
  }
}
