import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import { readdir, unlink } from 'node:fs/promises'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { buildSnapshotModel } from './lib/buildSnapshotModel.js'
import {
  loadHistoryIndex,
  loadSessionMeta,
  loadTodoCounts,
  projectIdForRoot,
  readJsonlLines,
  resolveProjectRoot,
  walkFiles,
} from './lib/discovery.js'
import {
  type ParseTranscriptDeps,
  type TranscriptParseResult,
  parseTranscript,
} from './lib/parseTranscript.js'
import { getAllAutoTitles } from './lib/autoTitleStore.js'
import { getAllRefined, getRefinedForSession } from './lib/refineCache.js'
import { dryRunRefine, getJob, startRefineJob } from './lib/refineJobs.js'
import { suggestProjectTitle, type SessionOpener } from './lib/refineTitles.js'
import { beginScan, endScan, getLastActivity, getState, recordActivity, recordError, runStep, setCount, setPaths } from './lib/state.js'
import {
  addTerminalEventListener,
  closeTerminal,
  createTerminal,
  hasTerminal,
  killTerminal,
  readTerminalLog,
  resizeTerminal,
  terminalRecords,
  writeTerminal,
  type CreateTerminalInput,
  type TerminalSessionRecord,
} from './lib/terminalHost.js'
import { loadTerminalLogSessions } from './lib/terminalLogs.js'
import {
  flushTranscriptCache,
  getCachedTranscript,
  pruneTranscriptCache,
  putCachedTranscript,
  stampTranscript,
} from './lib/transcriptParseCache.js'
import { clampTitle, stableId } from './lib/utils.js'
import { applyArchivedWorkstreamState, archiveWorkstream, restoreWorkstream } from './lib/workstreamArchive.js'
import { getWorkstreamLabelJob, startWorkstreamLabelJob } from './lib/workstreamLabelJobs.js'
import {
  buildWorkstreamLabelInput,
  getStoredWorkstreamLabelIds,
  putManualWorkstreamLabel,
  putSuggestedWorkstreamLabel,
} from './lib/workstreamLabels.js'
import { getAllOverrides, setProjectTitle, setSessionTitle } from './lib/titleStore.js'
import { migrateLegacyClauderatorState } from './lib/legacyClauderatorMigration.js'
import type {
  ArtifactEvidence,
  MessageSearchResponse,
  Project,
  ProjectDetail,
  SessionDetail,
  SidecarSnapshot,
  WorkLocationRecord,
} from '@gogoagent/shared'

const port = Number(process.env.GOGOAGENT_PORT ?? 43111)
const authToken = randomBytes(32).toString('base64url')
const authTokenPath = process.env.GOGOAGENT_AUTH_TOKEN_FILE
  ?? path.join(os.homedir(), '.gogoagent', `sidecar-${port}.token`)
const claudeDir = path.join(os.homedir(), '.claude')
const historyPath = path.join(claudeDir, 'history.jsonl')
const projectsDir = path.join(claudeDir, 'projects')
const sessionsDir = path.join(claudeDir, 'sessions')
const todosDir = path.join(claudeDir, 'todos')
const terminalLogDir = process.env.GOGOAGENT_TERMINAL_LOG_DIR ?? path.join(os.homedir(), '.gogoagent', 'terminal-logs')
const cacheDir = process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const stateDir = process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')

const parseTranscriptDeps: ParseTranscriptDeps = {
  readJsonlLines,
  resolveProjectRoot,
  projectIdForRoot,
}

function writeAuthTokenFile() {
  mkdirSync(path.dirname(authTokenPath), { recursive: true, mode: 0o700 })
  writeFileSync(authTokenPath, authToken, { encoding: 'utf8', mode: 0o600 })
  // writeFile preserves an existing file's mode, so correct it on every run.
  chmodSync(authTokenPath, 0o600)
}

function tokenMatches(value: string | undefined) {
  if (!value) return false
  const expected = Buffer.from(authToken)
  const received = Buffer.from(value)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function requestIsAuthorized(req: http.IncomingMessage, url: URL) {
  const authorization = req.headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return tokenMatches(authorization.slice('Bearer '.length))
  }
  // EventSource does not support request headers. Its token remains confined to
  // preload, which constructs this URL and never exposes it to the renderer.
  return url.pathname === '/terminals/events' && tokenMatches(url.searchParams.get('token') ?? undefined)
}

function setRendererCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  // Electron's file-backed renderer can serialize its origin as either value.
  // Never use `*`: authentication is the primary boundary, and this keeps the
  // browser contract deliberately narrow as well.
  const origin = req.headers.origin
  if (origin === 'file://' || origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    res.setHeader('Vary', 'Origin')
  }
}

function makeTranscriptCacheContext(
  historyIndex: Awaited<ReturnType<typeof loadHistoryIndex>>,
  sessionMeta: Awaited<ReturnType<typeof loadSessionMeta>>,
  todoCounts: Awaited<ReturnType<typeof loadTodoCounts>>,
) {
  const historyParts = [...historyIndex.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, entries]) => {
      const latest = entries.at(-1)
      return ['history', sessionId, entries.length, latest?.timestamp ?? '', latest?.display ?? '', latest?.project ?? ''].join('\t')
    })
  const sessionParts = [...sessionMeta.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, meta]) =>
      ['session', sessionId, meta.pid ?? '', meta.cwd ?? '', meta.startedAt ?? ''].join('\t'),
    )
  const todoParts = [...todoCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, count]) => ['todo', sessionId, count].join('\t'))
  return stableId('transcript-context', [...historyParts, ...sessionParts, ...todoParts].join('\n'))
}

// Wraps the lib discovery helpers with runStep instrumentation so /debug/state
// shows per-phase counts and timings. The lib helpers themselves are
// instrumentation-free so they can be reused in tests.
async function loadTranscripts(): Promise<TranscriptParseResult[]> {
  const [historyIndex, sessionMeta, todoCounts] = await Promise.all([
    runStep('history', () => loadHistoryIndex(historyPath), (value) => ({ count: value.size })),
    runStep('sessionMeta', () => loadSessionMeta(sessionsDir), (value) => ({ count: value.size })),
    runStep('todoCounts', () => loadTodoCounts(todosDir), (value) => ({ count: value.size })),
  ])

  const transcriptFiles = await runStep(
    'walkTranscripts',
    // Skip `<sessionId>/subagents/*.jsonl` — those are subagent transcripts
    // that share the parent session's id and would produce duplicate sessions.
    () =>
      walkFiles(
        projectsDir,
        (entryPath) => entryPath.endsWith('.jsonl') && !entryPath.includes('/subagents/'),
      ),
    (value) => ({ count: value.length, detail: `under ${projectsDir}` }),
  )
  setCount('transcriptFiles', transcriptFiles.length)

  const cacheContext = makeTranscriptCacheContext(historyIndex, sessionMeta, todoCounts)
  let cacheHits = 0
  let cacheMisses = 0
  return runStep(
    'parseTranscripts',
    async () => {
      const parsed = await Promise.all(
        transcriptFiles.map(async (filePath) => {
          try {
            const stamp = await stampTranscript(filePath, cacheContext)
            const cached = await getCachedTranscript(stamp)
            if (cached) {
              cacheHits += 1
              return cached
            }

            cacheMisses += 1
            const result = await parseTranscript(
              filePath,
              historyIndex,
              sessionMeta,
              todoCounts,
              parseTranscriptDeps,
            )
            if (result) await putCachedTranscript(stamp, result)
            return result
          } catch (error) {
            recordError('parseTranscript', error instanceof Error ? error.message : String(error), filePath)
            return null
          }
        }),
      )
      const results = parsed.filter((result): result is TranscriptParseResult => result !== null)
      try {
        await pruneTranscriptCache(new Set(transcriptFiles))
        await flushTranscriptCache()
      } catch (error) {
        recordError('transcriptCache', error instanceof Error ? error.message : String(error))
      }
      return results
    },
    (value) => ({ count: value.length, detail: `${cacheHits} cached, ${cacheMisses} parsed` }),
  )
}

async function loadTerminalLogs(): Promise<TranscriptParseResult[]> {
  return runStep(
    'terminalLogs',
    async () => {
      const results = await loadTerminalLogSessions(terminalLogDir, parseTranscriptDeps)
      const activeSessionIds = new Set(
        terminalRecords()
          .filter((terminal) => terminal.status === 'running')
          .map((terminal) => `terminal-${terminal.id}`),
      )
      for (const result of results) {
        result.session.status = activeSessionIds.has(result.session.id) ? 'active' : 'archived'
      }
      setCount('terminalLogFiles', results.length)
      return results
    },
    (value) => ({ count: value.length, detail: `under ${terminalLogDir}` }),
  )
}

function normalizedPathKey(value: string) {
  return path.resolve(value).replace(/\/+$/, '')
}

function isClaudeTerminalLog(result: TranscriptParseResult) {
  return result.session.id.startsWith('terminal-') && result.session.title.toLowerCase().startsWith('claude terminal')
}

function isNativeClaudeTranscript(result: TranscriptParseResult) {
  return !result.session.id.startsWith('terminal-') && result.session.transcriptPath.includes(`${path.sep}.claude${path.sep}projects${path.sep}`)
}

function findNativeTranscriptForTerminal(
  terminalResult: TranscriptParseResult,
  nativeResults: TranscriptParseResult[],
  usedNativeSessionIds: Set<string>,
  workstreamIdByNativeSessionId: Map<string, string>,
) {
  const resumeSessionId = terminalResult.terminalResumeSessionId?.trim()
  if (resumeSessionId) {
    const existingWorkstreamId = workstreamIdByNativeSessionId.get(resumeSessionId)
    if (!existingWorkstreamId || existingWorkstreamId === terminalResult.session.workstreamId) {
      const resumedResult = nativeResults.find((candidate) => candidate.session.id === resumeSessionId)
      if (resumedResult) return resumedResult
    }
  }

  const terminalStarted = Date.parse(terminalResult.session.startedAt)
  const terminalCwd = normalizedPathKey(terminalResult.session.cwd)
  if (!Number.isFinite(terminalStarted)) return undefined

  return nativeResults
    .filter((candidate) => !usedNativeSessionIds.has(candidate.session.id))
    .filter((candidate) => candidate.session.projectId === terminalResult.session.projectId)
    .filter((candidate) => normalizedPathKey(candidate.session.cwd) === terminalCwd)
    .map((candidate) => ({ candidate, deltaMs: Date.parse(candidate.session.startedAt) - terminalStarted }))
    .filter(({ deltaMs }) => Number.isFinite(deltaMs) && deltaMs >= 0 && deltaMs <= 30 * 60 * 1000)
    .sort((a, b) => a.deltaMs - b.deltaMs)[0]?.candidate
}

function attachTerminalWorkstreamsToNativeTranscripts(
  claudeSessions: TranscriptParseResult[],
  terminalSessions: TranscriptParseResult[],
) {
  const nativeClaudeSessions = claudeSessions.filter(isNativeClaudeTranscript)
  const usedNativeSessionIds = new Set<string>()
  const workstreamIdByNativeSessionId = new Map<string, string>()
  const workstreamTitleByNativeSessionId = new Map<string, string>()
  const keptTerminalSessions: TranscriptParseResult[] = []

  for (const terminalResult of terminalSessions) {
    if (!isClaudeTerminalLog(terminalResult) || !terminalResult.session.workstreamId) {
      keptTerminalSessions.push(terminalResult)
      continue
    }

    const nativeResult = findNativeTranscriptForTerminal(
      terminalResult,
      nativeClaudeSessions,
      usedNativeSessionIds,
      workstreamIdByNativeSessionId,
    )
    if (!nativeResult) {
      keptTerminalSessions.push(terminalResult)
      continue
    }

    workstreamIdByNativeSessionId.set(nativeResult.session.id, terminalResult.session.workstreamId)
    const terminalTitle = terminalResult.session.title
      .replace(/^(?:claude|codex|shell) terminal:\s*/i, '')
      .replace(/^(?:claude|codex|shell)\s*[·:]\s*/i, '')
      .trim()
    if (terminalTitle) workstreamTitleByNativeSessionId.set(nativeResult.session.id, terminalTitle)
    usedNativeSessionIds.add(nativeResult.session.id)
  }

  const attachedClaudeSessions = claudeSessions.map((result) => {
    const workstreamId = workstreamIdByNativeSessionId.get(result.session.id)
    const terminalTitle = workstreamTitleByNativeSessionId.get(result.session.id)
    return workstreamId
      ? { ...result, session: { ...result.session, workstreamId, title: terminalTitle ?? result.session.title } }
      : result
  })

  return [...attachedClaudeSessions, ...keptTerminalSessions]
}

async function loadIndexedSessions(): Promise<TranscriptParseResult[]> {
  const [claudeSessions, terminalSessions] = await Promise.all([
    loadTranscripts(),
    loadTerminalLogs(),
  ])
  return attachTerminalWorkstreamsToNativeTranscripts(claudeSessions, terminalSessions)
}

interface SnapshotGeneration {
  snapshot: SidecarSnapshot
  sessionResults: TranscriptParseResult[]
  sessionResultById: Map<string, TranscriptParseResult>
  builtAt: number
}

let scanInFlight: Promise<SnapshotGeneration> | null = null
let snapshotCache: SnapshotGeneration | null = null
const SNAPSHOT_CACHE_MS = Number(process.env.GOGOAGENT_SNAPSHOT_CACHE_MS ?? 1000)

function terminalKindLabel(kind: TerminalSessionRecord['kind']) {
  if (kind === 'claude') return 'Claude'
  if (kind === 'codex') return 'Codex'
  return 'Shell'
}

function latestTerminalTime(record: TerminalSessionRecord) {
  return record.endedAt ?? record.lastActivityAt ?? record.startedAt
}

function latestIso(values: string[]) {
  return values.slice().sort((a, b) => b.localeCompare(a))[0]
}

function earliestIso(values: string[]) {
  return values.slice().sort((a, b) => a.localeCompare(b))[0]
}

async function applyTerminalWorkstreams(snapshot: SidecarSnapshot) {
  const terminalsByWorkstream = new Map<string, TerminalSessionRecord[]>()
  for (const terminal of terminalRecords()) {
    if (!terminal.workstreamId) continue
    const terminals = terminalsByWorkstream.get(terminal.workstreamId) ?? []
    terminals.push(terminal)
    terminalsByWorkstream.set(terminal.workstreamId, terminals)
  }

  const workstreamById = new Map(snapshot.workstreams.map((workstream) => [workstream.id, workstream]))
  for (const [workstreamId, terminals] of terminalsByWorkstream) {
    const activeTerminalIds = terminals
      .filter((terminal) => terminal.status === 'running')
      .map((terminal) => terminal.id)
    const needsInputTerminalIds = terminals
      .filter((terminal) => terminal.status === 'running' && terminal.needsInput)
      .map((terminal) => terminal.id)
    const latest = latestIso(terminals.map(latestTerminalTime))
    const existing = workstreamById.get(workstreamId)

    if (existing) {
      existing.activeTerminalIds = activeTerminalIds.length ? activeTerminalIds : undefined
      existing.needsInputTerminalIds = needsInputTerminalIds.length ? needsInputTerminalIds : undefined
      existing.draft = existing.sessionIds.length === 0 && terminals.every((terminal) => !terminal.userInteracted)
      if (latest && latest.localeCompare(existing.lastUpdatedAt) > 0) existing.lastUpdatedAt = latest
      continue
    }

    if (!terminals.some((terminal) => terminal.status === 'running' || terminal.userInteracted)) continue

    const first = terminals.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]
    if (!first) continue
    const repoRoot = await resolveProjectRoot(first.cwd)
    const branch = first.gitBranch && first.gitBranch !== 'HEAD' ? first.gitBranch : undefined
    const title = first.title?.trim() || `${terminalKindLabel(first.kind)} · ${path.basename(first.cwd) || first.cwd}`
    const workstream: Project = {
      id: workstreamId,
      name: clampTitle(title, 52),
      nameSource: 'fallback',
      repoRoot,
      repoId: projectIdForRoot(repoRoot),
      branch,
      sessionIds: [],
      firstStartedAt: earliestIso(terminals.map((terminal) => terminal.startedAt)) ?? first.startedAt,
      lastUpdatedAt: latest ?? first.startedAt,
      sessionCount: 0,
      keptLessonCount: 0,
      touchedPathCount: 0,
      draft: terminals.every((terminal) => !terminal.userInteracted),
      activeTerminalIds: activeTerminalIds.length ? activeTerminalIds : undefined,
      needsInputTerminalIds: needsInputTerminalIds.length ? needsInputTerminalIds : undefined,
    }
    snapshot.workstreams.push(workstream)
    workstreamById.set(workstream.id, workstream)
  }

  snapshot.workstreams.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))
}

addTerminalEventListener((event) => {
  if (event.type === 'exit' || event.type === 'closed' || (event.type === 'data' && event.payload.needsInputChanged)) {
    snapshotCache = null
  }
})

async function buildSnapshotGeneration(force = false, allowStale = false): Promise<SnapshotGeneration> {
  // Coalesce concurrent scans so /snapshot, /debug/rescan, etc. don't all
  // re-walk the filesystem in parallel.
  if (
    !force &&
    snapshotCache &&
    (allowStale || Date.now() - snapshotCache.builtAt < SNAPSHOT_CACHE_MS)
  ) {
    return snapshotCache
  }
  if (scanInFlight) return scanInFlight
  scanInFlight = (async () => {
    beginScan()
    await setPaths([
      { name: 'projectsDir', path: projectsDir },
      { name: 'historyPath', path: historyPath },
      { name: 'sessionsDir', path: sessionsDir },
      { name: 'todosDir', path: todosDir },
      { name: 'terminalLogDir', path: terminalLogDir },
      { name: 'stateDir', path: stateDir },
    ])
    try {
      const sessionResults = await loadIndexedSessions()
      const snapshot = await runStep(
        'buildSnapshotModel',
        async () => buildSnapshotModel(sessionResults),
        (value) => ({ count: value.sessions.length }),
      )
      await applyTerminalWorkstreams(snapshot)
      const overrides = await getAllOverrides()
      const autoTitles = await getAllAutoTitles()
      const storedWorkstreamLabelIds = await getStoredWorkstreamLabelIds()
      for (const session of snapshot.sessions) {
        const override = overrides.sessions[session.id]
        if (override) session.title = override
      }
      for (const workstream of snapshot.workstreams) {
        const auto = autoTitles[workstream.id]
        // Preserve old auto-titles only when the canonical label store has no
        // entry. The former auto-title worker and the label job used to race
        // and repeatedly overwrite one another with different names.
        if (!storedWorkstreamLabelIds.has(workstream.id) && auto?.name) {
          workstream.name = auto.name
          workstream.nameSource = 'generated'
        }
        const override = overrides.projects[workstream.id]
        if (override) {
          workstream.name = override
          workstream.nameSource = 'manual'
        }
      }
      await applyArchivedWorkstreamState(snapshot.workstreams)
      setCount('projects', snapshot.projects.length)
      setCount('sessions', snapshot.sessions.length)
      setCount('artifacts', snapshot.artifacts.length)
      setCount('workLocations', snapshot.workLocations.length)
      setCount('clusters', snapshot.clusters.length)
      const generation: SnapshotGeneration = {
        snapshot,
        sessionResults,
        sessionResultById: new Map(sessionResults.map((result) => [result.session.id, result])),
        builtAt: Date.now(),
      }
      snapshotCache = generation
      endScan(true)
      recordActivity(`Scanned ${snapshot.workstreams.length} projects, ${snapshot.sessions.length} sessions`)
      return generation
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      endScan(false, message)
      recordError('buildSnapshot', message)
      throw error
    } finally {
      scanInFlight = null
    }
  })()
  return scanInFlight
}

async function buildSnapshot(force = false): Promise<SidecarSnapshot> {
  return (await buildSnapshotGeneration(force)).snapshot
}

const detailEvidenceRank: Record<ArtifactEvidence, number> = {
  mentioned: 1,
  inspected: 2,
  touched: 3,
  workspace_root: 4,
}

function isPathInside(childPath: string, parentPath: string) {
  const relative = path.relative(parentPath, childPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function workAreaPath(rawPath: string, repoRoot: string) {
  const normalized = path.normalize(rawPath).replace(/\/+$/, '')
  const directory = path.extname(normalized) ? path.dirname(normalized) : normalized

  if (isPathInside(directory, repoRoot)) {
    const relative = path.relative(repoRoot, directory)
    const segments = relative.split(path.sep).filter(Boolean)
    if (!segments.length) return repoRoot
    return path.join(repoRoot, ...segments.slice(0, Math.min(2, segments.length)))
  }

  return directory
}

function mergeWorkArea(target: WorkLocationRecord, source: WorkLocationRecord, sessionSet: Set<string>) {
  const sourceSessions = source.sessionIds.filter((id) => sessionSet.has(id))
  for (const sessionId of sourceSessions) {
    if (!target.sessionIds.includes(sessionId)) target.sessionIds.push(sessionId)
  }
  for (const projectId of source.projectIds) {
    if (!target.projectIds.includes(projectId)) target.projectIds.push(projectId)
  }
  for (const clusterId of source.clusterIds) {
    if (!target.clusterIds.includes(clusterId)) target.clusterIds.push(clusterId)
  }

  target.count += source.count
  target.readCount = (target.readCount ?? 0) + (source.readCount ?? 0)
  target.writeCount = (target.writeCount ?? 0) + (source.writeCount ?? 0)
  target.mentionCount = (target.mentionCount ?? 0) + (source.mentionCount ?? 0)
  target.activeMs = (target.activeMs ?? 0) + (source.activeMs ?? 0)
  target.importance = (target.importance ?? 0) + (source.importance ?? 0)

  if (source.firstActivityAt && (!target.firstActivityAt || source.firstActivityAt < target.firstActivityAt)) {
    target.firstActivityAt = source.firstActivityAt
  }
  if (source.lastActivityAt && (!target.lastActivityAt || source.lastActivityAt > target.lastActivityAt)) {
    target.lastActivityAt = source.lastActivityAt
  }
  if (detailEvidenceRank[source.evidence] > detailEvidenceRank[target.evidence]) {
    target.evidence = source.evidence
  }
}

function isMeaningfulWorkArea(location: WorkLocationRecord) {
  const readCount = location.readCount ?? 0
  const writeCount = location.writeCount ?? 0
  const activeMs = location.activeMs ?? 0
  return writeCount > 0 || readCount >= 2 || activeMs >= 90_000 || (location.sessionIds.length > 1 && readCount > 0)
}

function buildProjectWorkAreas(project: ProjectDetail['project'], locations: WorkLocationRecord[]) {
  const sessionSet = new Set(project.sessionIds)
  const byArea = new Map<string, WorkLocationRecord>()

  for (const location of locations) {
    if (location.evidence !== 'touched' && location.evidence !== 'inspected') continue
    if (!location.sessionIds.some((id) => sessionSet.has(id))) continue

    const areaPath = workAreaPath(location.path, project.repoRoot)
    const existing = byArea.get(areaPath)
    if (existing) {
      mergeWorkArea(existing, location, sessionSet)
      continue
    }

    const sourceSessions = location.sessionIds.filter((id) => sessionSet.has(id))
    byArea.set(areaPath, {
      ...location,
      id: stableId('workarea', `${project.id}:${areaPath}`),
      path: areaPath,
      sessionIds: sourceSessions,
      projectIds: [project.id],
      clusterIds: [...location.clusterIds],
    })
  }

  return [...byArea.values()]
    .filter(isMeaningfulWorkArea)
    .sort((a, b) => {
      const byImportance = (b.importance ?? 0) - (a.importance ?? 0)
      if (byImportance !== 0) return byImportance
      const byEvidence = detailEvidenceRank[b.evidence] - detailEvidenceRank[a.evidence]
      if (byEvidence !== 0) return byEvidence
      return (b.activeMs ?? 0) - (a.activeMs ?? 0)
    })
}

async function buildProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const snapshot = await buildSnapshot()
  const project = snapshot.workstreams.find((entry) => entry.id === projectId)
  if (!project) return null

  const sessions = snapshot.sessions.filter((s) => project.sessionIds.includes(s.id))
  const touchedPaths = buildProjectWorkAreas(project, snapshot.workLocations)

  const allRefined = await getAllRefined()
  const refinedLessons = allRefined.filter(
    (lesson) => lesson.keep && project.sessionIds.includes(lesson.sessionId),
  )

  return { project, sessions, refinedLessons, touchedPaths }
}

async function buildSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  // A project detail request establishes the generation shown by the renderer.
  // Session details should reuse it even after the short discovery TTL expires;
  // otherwise a large timeline multiplies the same filesystem scan per session.
  const generation = await buildSnapshotGeneration(false, true)
  const snapshot = generation.snapshot
  const session = snapshot.sessions.find((entry) => entry.id === sessionId)
  if (!session) return null

  const result = generation.sessionResultById.get(sessionId)
  if (!result) return null

  return {
    session,
    artifacts: snapshot.artifacts.filter((artifact) => artifact.sessionId === sessionId),
    messages: result.messages,
    relatedClusters: snapshot.clusters.filter((cluster) => cluster.sessionIds.includes(sessionId)),
    candidates: result.candidates,
  }
}

function makeSnippet(text: string, query: string, radius = 80) {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return clampTitle(text.replace(/\s+/g, ' '), 180)

  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ')}${suffix}`
}

async function searchMessages(query: string): Promise<MessageSearchResponse> {
  const normalized = query.trim()
  if (!normalized) return { query: normalized, results: [] }

  const lowerQuery = normalized.toLowerCase()
  const generation = await buildSnapshotGeneration()
  const results = generation.sessionResults
    .flatMap((entry) =>
      entry.messages
        .filter((message) => message.text.toLowerCase().includes(lowerQuery))
        .map((message) => ({
          sessionId: entry.session.id,
          messageId: message.id,
          role: message.role,
          timestamp: message.timestamp,
          snippet: makeSnippet(message.text, normalized),
        })),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100)

  return { query: normalized, results }
}

function expandDirectoryInput(input: string) {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  if (path.isAbsolute(input)) return input
  return path.resolve(os.homedir(), input)
}

function displayDirectoryCompletion(input: string, absolutePath: string) {
  const home = os.homedir()
  if (input === '~' || input.startsWith('~/')) {
    const relative = path.relative(home, absolutePath)
    if (!relative) return '~/'
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) return `~/${relative}/`
  }
  return `${absolutePath.replace(/\/+$/, '')}/`
}

async function completeDirectoryInput(input: string) {
  const expanded = expandDirectoryInput(input)
  const completeChildren = input === '' || input.endsWith('/')
  const baseDir = completeChildren ? expanded : path.dirname(expanded)
  const namePrefix = completeChildren ? '' : path.basename(expanded)
  const entries = await readdir(baseDir, { withFileTypes: true })
  const completions = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name.startsWith(namePrefix))
    .filter((entry) => namePrefix.startsWith('.') || !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 100)
    .map((entry) => displayDirectoryCompletion(input, path.join(baseDir, entry.name)))

  return { input, completions }
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > 1_000_000) throw new Error('Request body too large')
    chunks.push(buf)
  }
  if (chunks.length === 0) return null
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return null
  return JSON.parse(text) as Record<string, unknown>
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400)
    res.end('Missing URL')
    return
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`)

  setRendererCorsHeaders(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (url.pathname === '/health') {
    // Launchers may probe health without a token. If a caller does provide a
    // token, reject stale credentials so a restarted renderer can re-read the
    // new per-run token instead of appearing healthy with a dead bridge.
    if (typeof req.headers.authorization === 'string' && !requestIsAuthorized(req, url)) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'gogoagent-sidecar', lastActivity: getLastActivity() }))
    return
  }

  if (!requestIsAuthorized(req, url)) {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  if (url.pathname === '/debug/state') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(getState()))
    return
  }

  if (url.pathname === '/fs/complete-directory' && req.method === 'GET') {
    try {
      const input = url.searchParams.get('input') ?? ''
      const result = await completeDirectoryInput(input)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        input: url.searchParams.get('input') ?? '',
        completions: [],
        error: error instanceof Error ? error.message : String(error),
      }))
    }
    return
  }

  if (url.pathname === '/debug/rescan' && req.method === 'POST') {
    try {
      await buildSnapshot(true)
    } catch {
      // The error is already recorded in debug state; respond with the state.
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(getState()))
    return
  }

  if (url.pathname === '/snapshot') {
    try {
      const snapshot = await buildSnapshot()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(snapshot))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to build snapshot', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  if (url.pathname === '/terminals/events' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    const remove = addTerminalEventListener((event) => {
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`)
    })
    req.on('close', remove)
    return
  }

  if (url.pathname === '/terminals') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ terminals: terminalRecords() }))
      return
    }

    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const input: CreateTerminalInput = {
          kind: body?.kind === 'claude' || body?.kind === 'codex' || body?.kind === 'shell' ? body.kind : undefined,
          cwd: typeof body?.cwd === 'string' ? body.cwd : undefined,
          title: typeof body?.title === 'string' ? body.title : undefined,
          workstreamId: typeof body?.workstreamId === 'string' ? body.workstreamId : undefined,
          gitBranch: typeof body?.gitBranch === 'string' ? body.gitBranch : undefined,
          resumeSessionId: typeof body?.resumeSessionId === 'string' ? body.resumeSessionId : undefined,
          cols: typeof body?.cols === 'number' ? body.cols : undefined,
          rows: typeof body?.rows === 'number' ? body.rows : undefined,
        }
        const terminal = createTerminal(input)
        snapshotCache = null
        recordActivity(`Started ${terminalKindLabel(terminal.kind)} terminal in ${terminal.cwd}`)
        res.writeHead(201, { 'content-type': 'application/json' })
        res.end(JSON.stringify(terminal))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to create terminal', detail: error instanceof Error ? error.message : String(error) }))
      }
      return
    }
  }

  const terminalMatch = url.pathname.match(/^\/terminals\/([^/]+)\/(log|write|resize|kill|close)$/)
  if (terminalMatch) {
    const id = decodeURIComponent(terminalMatch[1])
    const action = terminalMatch[2]
    try {
      if (action !== 'log' && !hasTerminal(id)) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Terminal not found', detail: id }))
        return
      }

      if (action === 'log' && req.method === 'GET') {
        const maxBytesParam = url.searchParams.get('maxBytes')
        const maxBytes = maxBytesParam ? Number(maxBytesParam) : undefined
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(readTerminalLog(id, Number.isFinite(maxBytes) ? maxBytes : undefined)))
        return
      }

      if (action === 'write' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const interactionRecorded = writeTerminal(id, typeof body?.data === 'string' ? body.data : '')
        if (interactionRecorded) {
          snapshotCache = null
          recordActivity('Saved terminal interaction to workstream')
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (action === 'resize' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const cols = typeof body?.cols === 'number' ? body.cols : 100
        const rows = typeof body?.rows === 'number' ? body.rows : 28
        resizeTerminal(id, cols, rows)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (action === 'kill' && req.method === 'POST') {
        killTerminal(id)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (action === 'close' && req.method === 'POST') {
        closeTerminal(id)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: `Failed to ${action} terminal`, detail: error instanceof Error ? error.message : String(error) }))
      return
    }
  }

  if (url.pathname === '/workstreams/label' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const projectIds = Array.isArray(body?.projectIds)
        ? (body!.projectIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : undefined
      const force = Boolean(body?.force)
      const generation = await buildSnapshotGeneration()
      const { snapshot, sessionResults } = generation
      const selected = projectIds && projectIds.length > 0
        ? snapshot.workstreams.filter((workstream) => projectIds.includes(workstream.id))
        : snapshot.workstreams.filter((workstream) => !workstream.archivedAt)
      const status = await startWorkstreamLabelJob({
        workstreams: selected,
        sessionResults,
        workLocations: snapshot.workLocations,
        force,
      })
      if (status.state === 'done' || status.state === 'error') snapshotCache = null
      res.writeHead(202, { 'content-type': 'application/json' })
      res.end(JSON.stringify(status))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to start workstream label job', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const labelJobMatch = url.pathname.match(/^\/workstreams\/label\/status\/([^/]+)$/)
  if (labelJobMatch) {
    const job = getWorkstreamLabelJob(decodeURIComponent(labelJobMatch[1]))
    if (!job) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Job not found' }))
      return
    }
    if (job.state === 'done' || job.state === 'error') snapshotCache = null
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(job))
    return
  }

  const renameWorkstreamMatch = url.pathname.match(/^\/workstreams\/([^/]+)\/name$/)
  if (renameWorkstreamMatch && req.method === 'POST') {
    try {
      const workstreamId = decodeURIComponent(renameWorkstreamMatch[1])
      const body = await readJsonBody(req)
      const name = typeof body?.name === 'string' ? body.name : ''
      const currentSnapshot = await buildSnapshot()
      if (!currentSnapshot.workstreams.some((workstream) => workstream.id === workstreamId)) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Workstream not found' }))
        return
      }

      const label = await putManualWorkstreamLabel(workstreamId, name)
      if (!label) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Name is too short' }))
        return
      }
      await setProjectTitle(workstreamId, label)
      recordActivity(`Renamed project: "${label}"`)

      snapshotCache = null
      const snapshot = await buildSnapshot(true)
      const project = snapshot.workstreams.find((workstream) => workstream.id === workstreamId)
      if (!project) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Renamed workstream was not found after rescan' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to rename workstream', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const archiveWorkstreamMatch = url.pathname.match(/^\/workstreams\/([^/]+)\/archive$/)
  if (archiveWorkstreamMatch && req.method === 'POST') {
    try {
      const workstreamId = decodeURIComponent(archiveWorkstreamMatch[1])
      const currentSnapshot = await buildSnapshot()
      if (!currentSnapshot.workstreams.some((workstream) => workstream.id === workstreamId)) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Workstream not found' }))
        return
      }

      await archiveWorkstream(workstreamId)
      snapshotCache = null
      const snapshot = await buildSnapshot(true)
      const project = snapshot.workstreams.find((workstream) => workstream.id === workstreamId)
      if (!project) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Archived workstream was not found after rescan' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to archive workstream', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const restoreWorkstreamMatch = url.pathname.match(/^\/workstreams\/([^/]+)\/restore$/)
  if (restoreWorkstreamMatch && req.method === 'POST') {
    try {
      const workstreamId = decodeURIComponent(restoreWorkstreamMatch[1])
      const currentSnapshot = await buildSnapshot()
      if (!currentSnapshot.workstreams.some((workstream) => workstream.id === workstreamId)) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Workstream not found' }))
        return
      }

      await restoreWorkstream(workstreamId)
      snapshotCache = null
      const snapshot = await buildSnapshot(true)
      const project = snapshot.workstreams.find((workstream) => workstream.id === workstreamId)
      if (!project) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Restored workstream was not found after rescan' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to restore workstream', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  if (url.pathname === '/lessons/refine' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      let sessionIds = Array.isArray(body?.sessionIds) ? (body!.sessionIds as string[]) : undefined
      const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined
      const generation = await buildSnapshotGeneration()
      if (projectId && !sessionIds) {
        const project = generation.snapshot.workstreams.find((p) => p.id === projectId)
        if (!project) {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Project not found' }))
          return
        }
        sessionIds = project.sessionIds
      }
      const force = Boolean(body?.force)
      const dryRun = Boolean(body?.dryRun)
      const sessionResults = generation.sessionResults
      if (dryRun) {
        const preview = await dryRunRefine({ sessionResults, sessionIds, force })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ dryRun: true, preview }))
        return
      }
      const status = startRefineJob({ sessionResults, sessionIds, force })
      res.writeHead(202, { 'content-type': 'application/json' })
      res.end(JSON.stringify(status))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to start refine job', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const jobMatch = url.pathname.match(/^\/lessons\/refine\/status\/([^/]+)$/)
  if (jobMatch) {
    const job = getJob(decodeURIComponent(jobMatch[1]))
    if (!job) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Job not found' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(job))
    return
  }

  if (url.pathname === '/lessons/refined') {
    const sessionId = url.searchParams.get('sessionId')
    const items = sessionId ? await getRefinedForSession(sessionId) : await getAllRefined()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ items }))
    return
  }

  if (url.pathname === '/search/messages') {
    try {
      const query = url.searchParams.get('q') ?? ''
      const results = await searchMessages(query)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(results))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to search messages', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  if (url.pathname === '/projects') {
    try {
      const snapshot = await buildSnapshot()
      const archivedOnly = url.searchParams.get('archived') === '1'
      const includeArchived = url.searchParams.get('includeArchived') === '1'
      const projects = snapshot.workstreams.filter((project) => {
        if (archivedOnly) return Boolean(project.archivedAt)
        if (includeArchived) return true
        return !project.archivedAt
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ projects }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to list projects', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const suggestTitleMatch = url.pathname.match(/^\/projects\/([^/]+)\/suggest-title$/)
  if (suggestTitleMatch && req.method === 'POST') {
    const projectId = decodeURIComponent(suggestTitleMatch[1])
    try {
      const generation = await buildSnapshotGeneration()
      const snapshot = generation.snapshot
      const project = snapshot.workstreams.find((p) => p.id === projectId)
      if (!project) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Project not found' }))
        return
      }
      const sessionResults = generation.sessionResults
      const openers: SessionOpener[] = []
      for (const id of project.sessionIds) {
        const entry = sessionResults.find((r) => r.session.id === id)
        if (!entry) continue
        const firstUser = entry.messages
          .slice()
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .find((m) => m.role === 'user' && m.text && !m.text.startsWith('<local-command-caveat>'))
        if (firstUser) openers.push({ startedAt: entry.session.startedAt, firstUserText: firstUser.text })
      }
      openers.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      const touchedPaths = snapshot.workLocations.filter(
        (loc) =>
          (loc.evidence === 'touched' || loc.evidence === 'inspected') &&
          loc.sessionIds.some((id) => project.sessionIds.includes(id)),
      )
      const suggestion = await suggestProjectTitle({ project, sessionOpeners: openers, touchedPaths })
      const labelInput = buildWorkstreamLabelInput(project, sessionResults, snapshot.workLocations)
      const savedLabel = await putSuggestedWorkstreamLabel(labelInput, suggestion.name)
      if (!savedLabel) throw new Error('Suggested title was too short')
      await setProjectTitle(projectId, null)
      snapshotCache = null
      recordActivity(`Suggested title: "${savedLabel}"`)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, projectId, ...suggestion, name: savedLabel }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to suggest title', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/)
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1])
    if (req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req)
        const title = typeof body?.title === 'string' ? body.title : null
        await setProjectTitle(projectId, title)
        snapshotCache = null
        recordActivity(title ? `Renamed project: "${title.trim()}"` : `Cleared project title`)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, projectId, title: title?.trim() || null }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to update project title', detail: error instanceof Error ? error.message : String(error) }))
      }
      return
    }
    try {
      const detail = await buildProjectDetail(projectId)
      if (!detail) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Project not found' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(detail))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to build project detail', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/)
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1])
    if (req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req)
        const title = typeof body?.title === 'string' ? body.title : null
        await setSessionTitle(sessionId, title)
        snapshotCache = null
        recordActivity(title ? `Renamed session: "${title.trim()}"` : `Cleared session title`)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sessionId, title: title?.trim() || null }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to update session title', detail: error instanceof Error ? error.message : String(error) }))
      }
      return
    }
    try {
      const detail = await buildSessionDetail(sessionId)
      if (!detail) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session not found' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(detail))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to build session detail', detail: error instanceof Error ? error.message : String(error) }))
    }
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

async function startServer() {
  try {
    const migration = await migrateLegacyClauderatorState({ terminalLogDir, cacheDir, stateDir })
    if (migration.terminalLogFilesCopied || migration.savedEntriesImported) {
      recordActivity(
        `Imported legacy Clauderator state: ${migration.terminalLogFilesCopied} terminal files, ${migration.savedEntriesImported} saved entries`,
      )
    }
  } catch (error) {
    // Migration is a convenience. A malformed legacy file must never prevent
    // the new app from starting normally.
    recordError('legacyMigration', error instanceof Error ? error.message : String(error))
  }

  // Bind explicitly to loopback so the sidecar is never reachable off-host.
  server.listen(port, '127.0.0.1', () => {
  try {
    // Do this only after binding succeeds. A second sidecar that loses the
    // port race must not replace the live sidecar's token file.
    writeAuthTokenFile()
  } catch (error) {
    console.error(`[gogoagent/sidecar] failed to write authentication token: ${error instanceof Error ? error.message : String(error)}`)
    server.close(() => process.exit(1))
    return
  }
  console.log(`[gogoagent/sidecar] listening on http://127.0.0.1:${port}`)
  })
}

void startServer()

let shuttingDown = false
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[gogoagent/sidecar] received ${signal}, shutting down`)
  server.close(() => {
    void unlink(authTokenPath).catch(() => undefined).finally(() => process.exit(0))
  })
  // If keep-alive connections prevent server.close from completing, force
  // exit after a short grace period so we always release the port.
  setTimeout(() => process.exit(0), 1500).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
