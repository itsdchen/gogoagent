export type SessionStatus = 'discovered' | 'active' | 'archived' | 'needs_review'

export type ArtifactKind = 'cwd' | 'directory' | 'file' | 'tool_call' | 'command' | 'todo' | 'terminal_log'
export type ArtifactEvidence = 'workspace_root' | 'touched' | 'inspected' | 'mentioned'

export type ClusterKind = 'project' | 'workspace_area' | 'task_theme' | 'time_burst'
export type ExtractionKind = 'summary' | 'decision' | 'rule' | 'todo' | 'lesson'

export interface ProjectRecord {
  id: string
  name: string
  rootPath: string
  sessionCount: number
  lastActivityAt?: string
  decisionCount?: number
  ruleCount?: number
  todoCount?: number
  lessonCount?: number
}

export interface SessionRecord {
  id: string
  projectId: string
  workstreamId?: string
  title: string
  cwd: string
  transcriptPath: string
  status: SessionStatus
  startedAt: string
  updatedAt: string
  messageCount: number
  toolCallCount: number
  tokenCount?: number
  lessonCount?: number
  gitBranch?: string
}

export interface ArtifactRecord {
  id: string
  sessionId: string
  kind: ArtifactKind
  label: string
  path?: string
  detail?: string
  evidence?: ArtifactEvidence
  occurrenceCount?: number
  firstSeenAt?: string
  lastSeenAt?: string
  eventTimestamps?: string[]
}

export interface WorkLocationRecord {
  id: string
  path: string
  evidence: ArtifactEvidence
  sessionIds: string[]
  projectIds: string[]
  clusterIds: string[]
  firstActivityAt?: string
  lastActivityAt?: string
  count: number
  readCount?: number
  writeCount?: number
  mentionCount?: number
  activeMs?: number
  importance?: number
}

export interface ClusterRecord {
  id: string
  kind: ClusterKind
  label: string
  sessionIds: string[]
  summary: string
  branch?: string
  relatedClusterIds?: string[]
}

export interface SessionMessageRecord {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'terminal'
  timestamp: string
  text: string
}

export interface ExtractionCandidate {
  id: string
  sessionId: string
  kind: ExtractionKind
  text: string
  sourceMessageId?: string
}

export interface SessionDetail {
  session: SessionRecord
  artifacts: ArtifactRecord[]
  messages: SessionMessageRecord[]
  relatedClusters: ClusterRecord[]
  candidates: ExtractionCandidate[]
}

export interface MessageSearchResult {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'terminal'
  timestamp: string
  snippet: string
}

export interface MessageSearchResponse {
  query: string
  results: MessageSearchResult[]
}

export type LessonScope = 'project' | 'global' | 'one_off'

export interface RefinedLesson {
  id: string
  sessionId: string
  sourceCandidateId: string
  sourceMessageId?: string
  rule: string
  why: string
  scope: LessonScope
  keep: boolean
  promptVersion: string
  createdAt: string
}

export type RefineJobState = 'pending' | 'running' | 'done' | 'error'

export interface RefineJobStatus {
  jobId: string
  state: RefineJobState
  total: number
  processed: number
  skipped: number
  generated?: number
  errors: { sessionId: string; message: string }[]
  startedAt: string
  finishedAt?: string
}

// A Project is the user-facing unit of work: N Claude sessions on the same
// repo + branch whose time windows are within the gap threshold. Sessions are
// just Claude Code's accidental restart boundary, not meaningful on their own.
export interface Project {
  id: string
  name: string
  nameSource?: 'fallback' | 'generated' | 'manual'
  repoRoot: string
  repoId: string
  branch?: string
  sessionIds: string[]
  firstStartedAt: string
  lastUpdatedAt: string
  sessionCount: number
  keptLessonCount: number
  touchedPathCount: number
  draft?: boolean
  activeTerminalIds?: string[]
  needsInputTerminalIds?: string[]
  archivedAt?: string
}

export interface ProjectDetail {
  project: Project
  sessions: SessionRecord[]
  refinedLessons: RefinedLesson[]
  touchedPaths: WorkLocationRecord[]
}

export interface SidecarSnapshot {
  projects: ProjectRecord[]
  sessions: SessionRecord[]
  artifacts: ArtifactRecord[]
  workLocations: WorkLocationRecord[]
  clusters: ClusterRecord[]
  workstreams: Project[]
}

export type DebugStepStatus = 'idle' | 'running' | 'ok' | 'error'

export interface DebugStep {
  name: string
  status: DebugStepStatus
  count?: number
  durationMs?: number
  error?: string
  detail?: string
}

export interface DebugPath {
  name: string
  path: string
  exists: boolean
  entryCount?: number
}

export interface DebugError {
  at: string
  where: string
  message: string
  path?: string
}

export interface ActivityEntry {
  at: string
  label: string
}

export interface DebugState {
  startedAt: string
  paths: DebugPath[]
  lastScan: {
    startedAt?: string
    finishedAt?: string
    durationMs?: number
    ok?: boolean
    error?: string
    inProgress: boolean
  }
  steps: DebugStep[]
  counts: {
    projects: number
    sessions: number
    artifacts: number
    workLocations: number
    clusters: number
    transcriptFiles: number
    terminalLogFiles: number
  }
  errors: DebugError[]
  lastActivity?: ActivityEntry
}

export interface HealthResponse {
  ok: boolean
  service: string
  lastActivity?: ActivityEntry
}
