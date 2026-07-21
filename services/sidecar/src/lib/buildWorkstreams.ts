import type { Project, SessionRecord, WorkLocationRecord } from '@gogoagent/shared'
import { clampTitle, slugName, stableId } from './utils.js'

// Sessions within this gap belong to the same workstream. Chosen as 24h so
// multi-day work still groups together but a week-long pause does not.
const DEFAULT_GAP_MS = 24 * 60 * 60 * 1000
const FALLBACK_TITLE_MAX = 52

const SMALL_TITLE_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
const ACRONYM_TITLE_WORDS = new Set(['api', 'cli', 'css', 'hl', 'html', 'ipc', 'json', 'llm', 'qfx', 'ui', 'url'])
const GENERIC_BRANCHES = new Set(['head', 'main', 'master', 'develop', 'development', 'dev'])

function branchKey(session: SessionRecord) {
  const b = session.gitBranch
  if (!b || b === 'HEAD') return '__no_branch__'
  return b
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      if (/^[A-Z0-9._-]{2,}$/.test(word)) return word
      const lower = word.toLowerCase()
      if (ACRONYM_TITLE_WORDS.has(lower)) return lower.toUpperCase()
      if (index > 0 && SMALL_TITLE_WORDS.has(lower)) return lower
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
    })
    .join(' ')
}

function humanizeSubject(value: string) {
  const cleaned = value
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length > 1 && /^(?:feature|fix|bugfix|chore|topic|branch)$/i.test(words[0])) words.shift()
  return titleCase(words.slice(-4).join(' '))
}

function contextualStatusName(fallbackRepoRoot: string, branch: string | undefined) {
  const branchSubject = branch && !GENERIC_BRANCHES.has(branch.toLowerCase())
    ? humanizeSubject(branch)
    : ''
  const repoSubject = humanizeSubject(slugName(fallbackRepoRoot))
  const subject = branchSubject || repoSubject
  return clampTitle(subject ? `${subject} Status Review` : 'Status Review', FALLBACK_TITLE_MAX)
}

function trimDanglingWords(value: string) {
  return value
    .replace(/\s+\b(?:a|an|and|at|but|for|if|in|of|on|or|so|the|to|with)\b$/i, '')
    .replace(/\s+\b(?:can|could|should|would|that|this|we|you)\b$/i, '')
    .trim()
}

function isStatusReviewPrompt(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    /^(?:ok|okay )?(?:where are we|where we are|what'?s the status|what is the status|status check|current status|catch me up|bring me up to speed)\b/.test(normalized) ||
    /\b(?:where are we|where we are|status check|current status|catch me up|bring me up to speed)\b/.test(normalized)
  ) {
    return true
  }
  return false
}

function fallbackIntentName(rawTitle: string, fallbackRepoRoot: string, branch: string | undefined) {
  if (isStatusReviewPrompt(rawTitle)) return contextualStatusName(fallbackRepoRoot, branch)

  const title = rawTitle
    .replace(/\s+/g, ' ')
    .replace(/^[`"']+|[`"']+$/g, '')
    .replace(/^(?:claude|codex|shell) terminal:\s*(?:(?:claude|codex|shell)\s*[·:]\s*)?/i, '')
    .replace(/^(?:please\s+)?(?:hey|hi|hello|ok|okay)[,\s]+/i, '')
    .replace(/^(?:can|could|would)\s+you\s+/i, '')
    .replace(/^(?:take\s+a\s+)?look\s+at\s+(?:the\s+)?(.+)$/i, '$1 Review')
    .replace(/^check\s+(?:out\s+)?(?:the\s+)?(.+)$/i, '$1 Review')
    .replace(/^review\s+(?:the\s+)?(.+)$/i, '$1 Review')
    .replace(/^help\s+(?:me\s+)?(?:with\s+)?(?:the\s+)?/i, '')
    .replace(/\b(?:please|thanks|thank you)\b[.!?]*$/i, '')
    .trim()
  const firstClause = title.split(/[.!?]\s+/)[0] ?? title
  const cleaned = trimDanglingWords(firstClause.replace(/[.!?]+$/g, ''))
  if (cleaned.length < 3) return ''
  return clampTitle(titleCase(cleaned), FALLBACK_TITLE_MAX)
}

function workstreamName(sessions: SessionRecord[], fallbackRepoRoot: string, branch: string | undefined) {
  for (const s of sessions) {
    const title = s.title?.trim()
    if (title && title !== s.id) {
      const intentName = fallbackIntentName(title, fallbackRepoRoot, branch)
      if (intentName) return intentName
    }
  }
  const date = sessions[0]?.startedAt?.slice(0, 10) ?? ''
  const repo = slugName(fallbackRepoRoot)
  if (branch) return `${repo} @ ${branch} · ${date}`
  return `${repo} · ${date}`
}

interface WorkstreamStatsIndex {
  refinedKeptCountBySession: Map<string, number>
  touchedPathsBySession: Map<string, Set<string>>
}

function buildWorkstreamStatsIndex(
  workLocations: WorkLocationRecord[],
  refinedKeptCountBySession: Map<string, number>,
): WorkstreamStatsIndex {
  const touchedPathsBySession = new Map<string, Set<string>>()
  for (const location of workLocations) {
    if (location.evidence !== 'touched' && location.evidence !== 'inspected') continue
    for (const sessionId of location.sessionIds) {
      const paths = touchedPathsBySession.get(sessionId) ?? new Set<string>()
      paths.add(location.path)
      touchedPathsBySession.set(sessionId, paths)
    }
  }
  return { refinedKeptCountBySession, touchedPathsBySession }
}

function workstreamStats(sessionIds: string[], statsIndex: WorkstreamStatsIndex) {
  const keptLessonCount = sessionIds.reduce(
    (sum, id) => sum + (statsIndex.refinedKeptCountBySession.get(id) ?? 0),
    0,
  )
  const touchedPaths = new Set<string>()
  for (const sessionId of sessionIds) {
    for (const touchedPath of statsIndex.touchedPathsBySession.get(sessionId) ?? []) {
      touchedPaths.add(touchedPath)
    }
  }
  const touchedPathCount = touchedPaths.size
  return { keptLessonCount, touchedPathCount }
}

function applyWorkstreamStats(
  workstream: Project,
  statsIndex: WorkstreamStatsIndex,
) {
  const stats = workstreamStats(workstream.sessionIds, statsIndex)
  workstream.sessionCount = workstream.sessionIds.length
  workstream.keptLessonCount = stats.keptLessonCount
  workstream.touchedPathCount = stats.touchedPathCount
}

function makeWorkstream(
  id: string,
  run: SessionRecord[],
  repoRoot: string,
  branch: string | undefined,
  statsIndex: WorkstreamStatsIndex,
): Project {
  const first = run[0]
  const last = run.reduce(
    (acc, s) => (s.updatedAt.localeCompare(acc.updatedAt) > 0 ? s : acc),
    run[0],
  )
  const sessionIds = run.map((s) => s.id)
  const stats = workstreamStats(sessionIds, statsIndex)

  return {
    id,
    name: workstreamName(run, repoRoot, branch),
    nameSource: 'fallback',
    repoRoot,
    repoId: first.projectId,
    branch,
    sessionIds,
    firstStartedAt: first.startedAt,
    lastUpdatedAt: last.updatedAt,
    sessionCount: run.length,
    ...stats,
  }
}

function attachSessionToWorkstream(
  workstream: Project,
  session: SessionRecord,
  statsIndex: WorkstreamStatsIndex,
) {
  if (!workstream.sessionIds.includes(session.id)) workstream.sessionIds.push(session.id)
  if (session.startedAt.localeCompare(workstream.firstStartedAt) < 0) workstream.firstStartedAt = session.startedAt
  if (session.updatedAt.localeCompare(workstream.lastUpdatedAt) > 0) workstream.lastUpdatedAt = session.updatedAt
  applyWorkstreamStats(workstream, statsIndex)
}

export function buildWorkstreams(
  sessions: SessionRecord[],
  workLocations: WorkLocationRecord[],
  refinedKeptCountBySession: Map<string, number>,
  gapMs = DEFAULT_GAP_MS,
): Project[] {
  const statsIndex = buildWorkstreamStatsIndex(workLocations, refinedKeptCountBySession)
  const hardAttachedSessions = sessions.filter((session) => session.workstreamId)
  const bucketableSessions = sessions.filter((session) => !session.workstreamId)

  // Group by (repoId, branch), then split each group into runs separated by
  // gaps > threshold. Each run is one workstream.
  const buckets = new Map<string, SessionRecord[]>()
  for (const session of bucketableSessions) {
    const key = `${session.projectId}::${branchKey(session)}`
    const bucket = buckets.get(key) ?? []
    bucket.push(session)
    buckets.set(key, bucket)
  }

  const workstreams: Project[] = []
  for (const [bucketKey, bucketSessions] of buckets) {
    bucketSessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

    let run: SessionRecord[] = []
    const flush = () => {
      if (run.length === 0) return
      const first = run[0]
      const repoRoot = first.cwd // cwd is close enough; repoRoot proper requires the artifact lookup
      const branch = first.gitBranch && first.gitBranch !== 'HEAD' ? first.gitBranch : undefined
      workstreams.push(makeWorkstream(
        stableId('workstream', `${bucketKey}:${first.startedAt}`),
        run,
        repoRoot,
        branch,
        statsIndex,
      ))
      run = []
    }

    for (const session of bucketSessions) {
      if (run.length === 0) {
        run.push(session)
        continue
      }
      const prev = run[run.length - 1]
      const prevEnd = Date.parse(prev.updatedAt)
      const thisStart = Date.parse(session.startedAt)
      if (!Number.isNaN(prevEnd) && !Number.isNaN(thisStart) && thisStart - prevEnd > gapMs) {
        flush()
      }
      run.push(session)
    }
    flush()
  }

  const workstreamById = new Map(workstreams.map((workstream) => [workstream.id, workstream]))
  for (const session of hardAttachedSessions) {
    const attachedId = session.workstreamId
    if (!attachedId) continue

    const existing = workstreamById.get(attachedId)
    if (existing) {
      attachSessionToWorkstream(existing, session, statsIndex)
      continue
    }

    const branch = session.gitBranch && session.gitBranch !== 'HEAD' ? session.gitBranch : undefined
    const fallback = makeWorkstream(
      attachedId,
      [session],
      session.cwd,
      branch,
      statsIndex,
    )
    workstreams.push(fallback)
    workstreamById.set(fallback.id, fallback)
  }

  // Most-recent-first.
  workstreams.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))
  return workstreams
}
