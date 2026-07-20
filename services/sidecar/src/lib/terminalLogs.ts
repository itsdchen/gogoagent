import { open, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ArtifactEvidence, ArtifactKind, ArtifactRecord, SessionMessageRecord } from '@gogoagent/shared'
import type { ParseTranscriptDeps, TranscriptParseResult } from './parseTranscript.js'
import { walkFiles } from './discovery.js'
import { clampTitle, safeJsonParse, stableId } from './utils.js'

const MAX_INDEX_BYTES = 1024 * 1024
const MESSAGE_CHUNK_CHARS = 4000

interface TerminalLogMetadata {
  version?: number
  id?: string
  kind?: 'shell' | 'claude' | 'codex'
  title?: string
  cwd?: string
  workstreamId?: string
  gitBranch?: string
  resumeSessionId?: string
  command?: string
  status?: 'running' | 'exited'
  userInteracted?: boolean
  exitCode?: number
  startedAt?: string
  lastActivityAt?: string
  endedAt?: string
  logPath?: string
  logBytes?: number
  logError?: string
}

function stripAnsi(text: string) {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function terminalTitle(metadata: TerminalLogMetadata, sessionId: string) {
  const prefix = metadata.kind === 'claude' ? 'Claude terminal' : metadata.kind === 'codex' ? 'Codex terminal' : 'Shell terminal'
  return clampTitle(metadata.title ? `${prefix}: ${metadata.title}` : `${prefix}: ${sessionId}`, 88)
}

function artifactKey(sessionId: string, kind: ArtifactKind, value: string) {
  return `${sessionId}::${kind}::${value}`
}

function makeArtifact(
  sessionId: string,
  kind: ArtifactKind,
  label: string,
  args: { path?: string; detail?: string; evidence?: ArtifactEvidence; timestamp?: string },
): ArtifactRecord {
  const { timestamp, ...artifactArgs } = args
  return {
    id: stableId('artifact', artifactKey(sessionId, kind, args.path ?? args.detail ?? label)),
    sessionId,
    kind,
    label,
    ...artifactArgs,
    occurrenceCount: 1,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    eventTimestamps: timestamp ? [timestamp] : undefined,
  }
}

function collectPathArtifacts(sessionId: string, content: string, timestamp: string) {
  const artifacts: ArtifactRecord[] = []
  const seen = new Set<string>()
  const matches = content.match(/\/[A-Za-z0-9._\-\/]+/g) ?? []
  for (const rawPath of matches) {
    const cleaned = rawPath.replace(/[.,;:!?]+$/, '')
    if (!cleaned.startsWith('/') || seen.has(cleaned)) continue
    seen.add(cleaned)
    const kind: ArtifactKind = path.extname(cleaned) ? 'file' : 'directory'
    artifacts.push(makeArtifact(sessionId, kind, kind === 'file' ? 'Path mentioned in terminal log' : 'Directory mentioned in terminal log', {
      path: cleaned,
      evidence: 'mentioned',
      timestamp,
    }))
  }
  return artifacts
}

function chunkTerminalMessages(sessionId: string, text: string, timestamp: string): SessionMessageRecord[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const chunks: string[] = []
  let current = ''
  for (const line of normalized.split('\n')) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > MESSAGE_CHUNK_CHARS && current) {
      chunks.push(current)
      current = line
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)

  return chunks.map((chunk, index) => ({
    id: stableId('message', `${sessionId}:terminal:${index}:${chunk.slice(0, 120)}`),
    sessionId,
    role: 'terminal',
    timestamp,
    text: chunk,
  }))
}

async function readLogTail(logPath: string) {
  const info = await stat(logPath)
  const start = Math.max(0, info.size - MAX_INDEX_BYTES)
  const buffer = Buffer.alloc(info.size - start)
  const handle = await open(logPath, 'r')
  try {
    await handle.read(buffer, 0, buffer.length, start)
  } finally {
    await handle.close()
  }
  const prefix = start > 0 ? `[Earlier terminal output omitted from index; using last ${MAX_INDEX_BYTES} bytes.]\n` : ''
  return {
    text: `${prefix}${stripAnsi(buffer.toString('utf8'))}`,
    bytes: info.size,
  }
}

async function resolveLogPath(metadataPath: string, recordedLogPath: string) {
  const copiedLogPath = metadataPath.replace(/\.json$/, '.ansi.log')
  try {
    await stat(copiedLogPath)
    return copiedLogPath
  } catch {
    return recordedLogPath
  }
}

export async function loadTerminalLogSessions(
  terminalLogDir: string,
  deps: Pick<ParseTranscriptDeps, 'resolveProjectRoot' | 'projectIdForRoot'>,
): Promise<TranscriptParseResult[]> {
  const metadataFiles = await walkFiles(terminalLogDir, (entryPath) => entryPath.endsWith('.json'))
  const results: Array<TranscriptParseResult | null> = await Promise.all(
    metadataFiles.map(async (metadataPath) => {
      try {
        const metadata = safeJsonParse<TerminalLogMetadata>(await readFile(metadataPath, 'utf8'))
        if (!metadata?.id || !metadata.cwd || !metadata.startedAt || !metadata.logPath) return null
        if (metadata.userInteracted === false) return null

        const sessionId = `terminal-${metadata.id}`
        const workstreamId = metadata.workstreamId ?? `terminal-workstream-${metadata.id}`
        const projectRoot = await deps.resolveProjectRoot(metadata.cwd)
        const projectId = deps.projectIdForRoot(projectRoot)
        // Legacy metadata can point at its old app directory. Prefer the log
        // that sits beside the copied metadata so imported history is portable.
        const logPath = await resolveLogPath(metadataPath, metadata.logPath)
        const log = await readLogTail(logPath)
        const updatedAt = metadata.endedAt ?? metadata.lastActivityAt ?? metadata.startedAt
        const messages = chunkTerminalMessages(sessionId, log.text, updatedAt)
        // A persisted log only proves that a terminal existed. The sidecar
        // process that owned it may have exited without updating metadata, so
        // live status is applied later from the in-memory terminal registry.
        const status = 'archived'
        const artifacts = [
          makeArtifact(sessionId, 'terminal_log', 'Terminal log', {
            path: logPath,
            detail: `${metadata.kind ?? 'terminal'} · ${log.bytes} bytes`,
            evidence: 'mentioned',
            timestamp: updatedAt,
          }),
          makeArtifact(sessionId, 'cwd', 'Working directory', {
            path: metadata.cwd,
            evidence: 'workspace_root',
            timestamp: updatedAt,
          }),
          ...(projectRoot !== metadata.cwd
            ? [
                makeArtifact(sessionId, 'directory', 'Inferred project root', {
                  path: projectRoot,
                  evidence: 'workspace_root',
                  timestamp: updatedAt,
                }),
              ]
            : []),
          ...collectPathArtifacts(sessionId, log.text, updatedAt),
        ]

        const result: TranscriptParseResult = {
          session: {
            id: sessionId,
            projectId,
            workstreamId,
            title: terminalTitle(metadata, sessionId),
            cwd: metadata.cwd,
            transcriptPath: logPath,
            status,
            startedAt: metadata.startedAt,
            updatedAt,
            messageCount: messages.length,
            toolCallCount: 0,
            tokenCount: 0,
            gitBranch: metadata.gitBranch,
          },
          artifacts,
          messages,
          candidates: [],
          terminalResumeSessionId: metadata.resumeSessionId,
        }
        return result
      } catch {
        return null
      }
    }),
  )

  return results.filter((result): result is TranscriptParseResult => result !== null)
}
