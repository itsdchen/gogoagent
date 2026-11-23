import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ArtifactRecord } from '@gogoagent/shared'
import type { ParseTranscriptDeps, TranscriptParseResult } from './parseTranscript.js'
import { clampTitle, stableId } from './utils.js'

const MAX_METADATA_BYTES = 8 * 1024 * 1024
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ObjectValue = Record<string, unknown>

function object(value: unknown): ObjectValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null
}

function workspacePath(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const uri of value) {
    if (typeof uri !== 'string' || !uri.startsWith('file://')) continue
    try {
      const cwd = fileURLToPath(uri)
      if (path.isAbsolute(cwd)) return cwd
    } catch { /* Skip non-local or malformed workspace URIs. */ }
  }
  return null
}

function isoDate(value: unknown) {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

async function readJson(filePath: string): Promise<unknown> {
  const info = await stat(filePath)
  if (info.size > MAX_METADATA_BYTES) return null
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

// The CLI's metadata cache describes conversations but does not contain their
// complete transcript. App conversations can appear in this same cache; only
// CLI conversations (or IDs in the CLI's workspace resume map) are resumable.
export async function loadAgyConversationSessions(
  cacheDir: string,
  deps: Pick<ParseTranscriptDeps, 'resolveProjectRoot' | 'projectIdForRoot'>,
): Promise<TranscriptParseResult[]> {
  const metadataPath = path.join(cacheDir, 'conversation_metadata.json')
  const resumeMapPath = path.join(cacheDir, 'last_conversations.json')
  let metadata: ObjectValue | null = null
  try { metadata = object(await readJson(metadataPath)) } catch { /* The CLI resume map may still be available. */ }
  const conversations = object(metadata?.conversations) ?? {}
  let resumeMap: ObjectValue = {}
  let resumeMapUpdatedAt: string | null = null
  try {
    resumeMap = object(await readJson(resumeMapPath)) ?? {}
    resumeMapUpdatedAt = (await stat(resumeMapPath)).mtime.toISOString()
  } catch { /* The resume map is absent until the CLI saves a conversation. */ }
  const knownCliIds = new Set<string>()
  for (const id of Object.values(resumeMap)) {
    if (typeof id === 'string' && CONVERSATION_ID.test(id)) knownCliIds.add(id)
  }

  const results: TranscriptParseResult[] = []
  const indexedIds = new Set<string>()
  for (const [key, raw] of Object.entries(conversations).slice(0, 10_000)) {
    const entry = object(raw)
    const summary = object(entry?.summary)
    const id = typeof summary?.ID === 'string' ? summary.ID : key
    if (!summary || !CONVERSATION_ID.test(id) || id !== key || summary.Cloud === true) continue
    const appDataDir = typeof summary.AppDataDir === 'string' ? path.basename(summary.AppDataDir) : ''
    if (appDataDir !== 'antigravity-cli' && !knownCliIds.has(id)) continue
    const cwd = workspacePath(summary.WorkspaceURIs)
    const updatedAt = isoDate(summary.UpdatedAt) ?? isoDate(entry?.last_modified_time)
    if (!cwd || !updatedAt) continue
    const projectRoot = await deps.resolveProjectRoot(cwd)
    const projectId = deps.projectIdForRoot(projectRoot)
    const title = typeof summary.Title === 'string' && summary.Title.trim()
      ? summary.Title.trim()
      : 'Antigravity conversation'
    const artifact: ArtifactRecord = {
      id: stableId('artifact', `${id}:workspace-root:${projectRoot}`),
      sessionId: id,
      kind: 'cwd',
      label: 'Inferred project root',
      path: projectRoot,
      evidence: 'workspace_root',
      occurrenceCount: 1,
      firstSeenAt: updatedAt,
      lastSeenAt: updatedAt,
    }
    results.push({
      session: {
        id,
        projectId,
        agentKind: 'agy',
        title: clampTitle(title, 88),
        cwd,
        transcriptPath: metadataPath,
        metadataOnly: true,
        status: 'archived',
        startedAt: updatedAt,
        updatedAt,
        messageCount: 0,
        toolCallCount: 0,
      },
      artifacts: [artifact],
      messages: [],
      candidates: [],
    })
    indexedIds.add(id)
  }

  // AGY can update its workspace resume map before the metadata index. The map
  // itself is written by the CLI and contains IDs accepted by --conversation.
  for (const [cwd, id] of Object.entries(resumeMap)) {
    if (typeof id !== 'string' || !CONVERSATION_ID.test(id) || indexedIds.has(id)) continue
    if (!path.isAbsolute(cwd) || !resumeMapUpdatedAt) continue
    try { if (!(await stat(cwd)).isDirectory()) continue } catch { continue }
    const projectRoot = await deps.resolveProjectRoot(cwd)
    const projectId = deps.projectIdForRoot(projectRoot)
    const artifact: ArtifactRecord = {
      id: stableId('artifact', `${id}:workspace-root:${projectRoot}`),
      sessionId: id,
      kind: 'cwd',
      label: 'Inferred project root',
      path: projectRoot,
      evidence: 'workspace_root',
      occurrenceCount: 1,
      firstSeenAt: resumeMapUpdatedAt,
      lastSeenAt: resumeMapUpdatedAt,
    }
    results.push({
      session: {
        id,
        projectId,
        agentKind: 'agy',
        title: 'Antigravity CLI conversation',
        cwd,
        transcriptPath: resumeMapPath,
        metadataOnly: true,
        status: 'archived',
        startedAt: resumeMapUpdatedAt,
        updatedAt: resumeMapUpdatedAt,
        messageCount: 0,
        toolCallCount: 0,
      },
      artifacts: [artifact],
      messages: [],
      candidates: [],
    })
    indexedIds.add(id)
  }
  return results
}
