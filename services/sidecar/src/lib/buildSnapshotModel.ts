import type {
  ArtifactEvidence,
  ClusterRecord,
  ProjectRecord,
  SessionRecord,
  SidecarSnapshot,
  WorkLocationRecord,
} from '@gogoagent/shared'
import type { TranscriptParseResult } from './parseTranscript.js'
import { buildWorkstreams } from './buildWorkstreams.js'
import { getAllRefined } from './refineCache.js'
import { slugName, stableId } from './utils.js'
import { applyCachedWorkstreamLabels } from './workstreamLabels.js'
import { isIgnoredWorkLocationPath } from './workLocationFilters.js'

const ACTIVE_GAP_LIMIT_MS = 10 * 60 * 1000
const ACTIVE_GAP_CAP_MS = 5 * 60 * 1000
const ACTIVE_BASE_PER_ACTION_MS = 15 * 1000
const ACTIVE_BASE_CAP_MS = 2 * 60 * 1000

function makeWorkspaceCluster(project: ProjectRecord, clusterSessions: SessionRecord[]): ClusterRecord | null {
  if (clusterSessions.length < 2) return null
  const sessionIds = clusterSessions.map((session) => session.id)
  const branchCounts = new Map<string, number>()
  for (const session of clusterSessions) {
    const branch = session.gitBranch
    if (!branch || branch === 'HEAD') continue
    branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + 1)
  }
  const dominantBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return {
    id: stableId('cluster', `${project.id}:workspace:${dominantBranch ?? 'default'}`),
    kind: 'workspace_area',
    label: dominantBranch ? `${project.name} activity (${dominantBranch})` : `${project.name} activity`,
    sessionIds,
    summary: dominantBranch
      ? `Sessions grouped under ${project.rootPath} based on shared working area and branch ${dominantBranch}.`
      : `Sessions grouped under ${project.rootPath} based on shared working area.`,
    branch: dominantBranch,
  }
}

function makeTimeBurstClusters(sessions: SessionRecord[]) {
  const groups = new Map<string, SessionRecord[]>()
  for (const session of sessions) {
    const bucket = session.startedAt.slice(0, 10)
    const group = groups.get(bucket) ?? []
    group.push(session)
    groups.set(bucket, group)
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(
      ([bucket, group]): ClusterRecord => ({
        id: stableId('cluster', `time:${bucket}`),
        kind: 'time_burst',
        label: `Activity burst ${bucket}`,
        sessionIds: group.map((session) => session.id),
        summary: `Sessions clustered by same-day activity on ${bucket}.`,
      }),
    )
}

function artifactOccurrenceCount(artifact: { occurrenceCount?: number; eventTimestamps?: string[] }) {
  return Math.max(1, artifact.occurrenceCount ?? artifact.eventTimestamps?.length ?? 0)
}

function artifactEventTimestamps(artifact: {
  eventTimestamps?: string[]
  firstSeenAt?: string
  lastSeenAt?: string
}) {
  const events = [...(artifact.eventTimestamps ?? [])]
  if (artifact.firstSeenAt) events.push(artifact.firstSeenAt)
  if (artifact.lastSeenAt) events.push(artifact.lastSeenAt)
  return events.filter((timestamp, index, all) => {
    if (all.indexOf(timestamp) !== index) return false
    return Number.isFinite(Date.parse(timestamp))
  })
}

function earliestIso(values: string[]) {
  return values.length ? values.slice().sort((a, b) => a.localeCompare(b))[0] : undefined
}

function latestIso(values: string[]) {
  return values.length ? values.slice().sort((a, b) => b.localeCompare(a))[0] : undefined
}

function estimateActiveMs(timestamps: string[], actionCount: number) {
  const times = [...new Set(timestamps.map((timestamp) => Date.parse(timestamp)).filter(Number.isFinite))]
    .sort((a, b) => a - b)
  let activeMs = actionCount > 0 ? Math.min(actionCount * ACTIVE_BASE_PER_ACTION_MS, ACTIVE_BASE_CAP_MS) : 0

  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1]
    if (gap <= 0 || gap > ACTIVE_GAP_LIMIT_MS) continue
    activeMs += Math.min(gap, ACTIVE_GAP_CAP_MS)
  }

  return Math.round(activeMs)
}

function locationImportance(location: WorkLocationRecord) {
  const writeCount = location.writeCount ?? 0
  const readCount = location.readCount ?? 0
  const mentionCount = location.mentionCount ?? 0
  const activeMinutes = (location.activeMs ?? 0) / 60_000
  return Math.round(
    writeCount * 8 +
    readCount * 2 +
    mentionCount * 0.25 +
    activeMinutes +
    location.sessionIds.length * 1.5,
  )
}

export async function buildSnapshotModel(sessionResults: TranscriptParseResult[]): Promise<SidecarSnapshot> {
  const sessions = sessionResults.map((result) => result.session).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const artifacts = sessionResults.flatMap((result) => result.artifacts)

  const projectMap = new Map<string, ProjectRecord>()
  for (const result of sessionResults) {
    const session = result.session
    const inferredRoot =
      artifacts.find((artifact) => artifact.sessionId === session.id && artifact.label === 'Inferred project root')
        ?.path ?? session.cwd
    const current = projectMap.get(session.projectId)
    const decisions = result.candidates.filter((candidate) => candidate.kind === 'decision').length
    const rules = result.candidates.filter((candidate) => candidate.kind === 'rule').length
    const todos = result.candidates.filter((candidate) => candidate.kind === 'todo').length
    const lessons = result.candidates.filter((candidate) => candidate.kind === 'lesson').length
    if (!current) {
      projectMap.set(session.projectId, {
        id: session.projectId,
        name: slugName(inferredRoot),
        rootPath: inferredRoot,
        sessionCount: 1,
        lastActivityAt: session.updatedAt,
        decisionCount: decisions,
        ruleCount: rules,
        todoCount: todos,
        lessonCount: lessons,
      })
      continue
    }
    current.sessionCount += 1
    current.decisionCount = (current.decisionCount ?? 0) + decisions
    current.ruleCount = (current.ruleCount ?? 0) + rules
    current.todoCount = (current.todoCount ?? 0) + todos
    current.lessonCount = (current.lessonCount ?? 0) + lessons
    if ((current.lastActivityAt ?? '') < session.updatedAt) current.lastActivityAt = session.updatedAt
  }

  const projects = [...projectMap.values()].sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

  const projectClusters: ClusterRecord[] = projects
    .map((project): ClusterRecord => {
      const clusterSessions = sessions.filter((session) => session.projectId === project.id)
      const branchCounts = new Map<string, number>()
      for (const session of clusterSessions) {
        const branch = session.gitBranch
        if (!branch || branch === 'HEAD') continue
        branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + 1)
      }
      const dominantBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      return {
        id: stableId('cluster', `${project.id}:project`),
        kind: 'project',
        label: dominantBranch ? `${project.name} (${dominantBranch})` : project.name,
        sessionIds: clusterSessions.map((session) => session.id),
        summary: dominantBranch
          ? `Sessions grouped under project root ${project.rootPath}, mostly on branch ${dominantBranch}.`
          : `Sessions grouped under project root ${project.rootPath}.`,
        branch: dominantBranch,
      }
    })
    .filter((cluster) => cluster.sessionIds.length > 0)

  const workspaceClusters = projects
    .map((project) => makeWorkspaceCluster(project, sessions.filter((session) => session.projectId === project.id)))
    .filter((cluster): cluster is ClusterRecord => cluster !== null)

  const timeBurstClusters = makeTimeBurstClusters(sessions)
  const clusters = [...projectClusters, ...workspaceClusters, ...timeBurstClusters]

  for (const cluster of clusters) {
    const related = clusters
      .filter((candidate) => candidate.id !== cluster.id)
      .filter((candidate) => {
        const sharedSessions = candidate.sessionIds.filter((id) => cluster.sessionIds.includes(id)).length
        const sharedBranch = cluster.branch && candidate.branch && cluster.branch === candidate.branch
        const sharedProjectPrefix = cluster.label.split(' ')[0] === candidate.label.split(' ')[0]
        return sharedSessions > 0 || Boolean(sharedBranch) || sharedProjectPrefix
      })
      .slice(0, 4)
      .map((candidate) => candidate.id)
    if (related.length) cluster.relatedClusterIds = related
  }

  const workLocationMap = new Map<string, WorkLocationRecord>()
  const workLocationEvents = new Map<string, string[]>()
  const evidenceRank: Record<ArtifactEvidence, number> = {
    mentioned: 1,
    inspected: 2,
    touched: 3,
    workspace_root: 4,
  }

  for (const artifact of artifacts) {
    if (!artifact.path) continue
    if (isIgnoredWorkLocationPath(artifact.path)) continue
    const session = sessions.find((entry) => entry.id === artifact.sessionId)
    if (!session) continue
    const clusterIds = clusters.filter((cluster) => cluster.sessionIds.includes(session.id)).map((cluster) => cluster.id)
    const key = artifact.path
    const count = artifactOccurrenceCount(artifact)
    const timestamps = artifactEventTimestamps(artifact)
    const artifactFirst = earliestIso(timestamps) ?? session.startedAt
    const artifactLast = latestIso(timestamps) ?? session.updatedAt
    if (timestamps.length) {
      const currentEvents = workLocationEvents.get(key) ?? []
      currentEvents.push(...timestamps)
      workLocationEvents.set(key, currentEvents)
    }
    const current = workLocationMap.get(key)
    const evidence = artifact.evidence ?? 'mentioned'
    const readCount = evidence === 'inspected' ? count : 0
    const writeCount = evidence === 'touched' ? count : 0
    const mentionCount = evidence === 'mentioned' ? count : 0

    if (!current) {
      workLocationMap.set(key, {
        id: stableId('workloc', key),
        path: artifact.path,
        evidence,
        sessionIds: [session.id],
        projectIds: [session.projectId],
        clusterIds,
        firstActivityAt: artifactFirst,
        lastActivityAt: artifactLast,
        count,
        readCount,
        writeCount,
        mentionCount,
      })
      continue
    }

    current.count += count
    current.readCount = (current.readCount ?? 0) + readCount
    current.writeCount = (current.writeCount ?? 0) + writeCount
    current.mentionCount = (current.mentionCount ?? 0) + mentionCount
    if (!current.sessionIds.includes(session.id)) current.sessionIds.push(session.id)
    if (!current.projectIds.includes(session.projectId)) current.projectIds.push(session.projectId)
    for (const clusterId of clusterIds) {
      if (!current.clusterIds.includes(clusterId)) current.clusterIds.push(clusterId)
    }
    if (!current.firstActivityAt || current.firstActivityAt > artifactFirst) current.firstActivityAt = artifactFirst
    if (!current.lastActivityAt || current.lastActivityAt < artifactLast) current.lastActivityAt = artifactLast
    if (evidenceRank[evidence] > evidenceRank[current.evidence]) {
      current.evidence = evidence
    }
  }

  for (const [key, location] of workLocationMap) {
    location.activeMs = estimateActiveMs(workLocationEvents.get(key) ?? [], (location.readCount ?? 0) + (location.writeCount ?? 0))
    location.importance = locationImportance(location)
  }

  const workLocations = [...workLocationMap.values()].sort((a, b) => {
    const byImportance = (b.importance ?? 0) - (a.importance ?? 0)
    if (byImportance !== 0) return byImportance
    return b.count - a.count
  })

  const refined = await getAllRefined()
  const keptBySession = new Map<string, number>()
  for (const lesson of refined) {
    if (!lesson.keep) continue
    keptBySession.set(lesson.sessionId, (keptBySession.get(lesson.sessionId) ?? 0) + 1)
  }
  const workstreams = buildWorkstreams(sessions, workLocations, keptBySession)
  await applyCachedWorkstreamLabels(workstreams, sessionResults, workLocations)

  return { projects, sessions, artifacts, workLocations, clusters, workstreams }
}
