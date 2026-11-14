import type {
  AttentionItem,
  ArtifactRecord,
  DebugState,
  ExtractionCandidate,
  Project,
  ProjectDetail,
  RefineJobStatus,
  RefinedLesson,
  RepositoryState,
  SessionDetail,
  SessionMessageRecord,
  SessionRecord,
  TerminalDecisionReceipt,
  WorkLocationRecord,
} from '@gogoagent/shared'

type TerminalKind = 'shell' | 'claude' | 'codex'
type AgentTerminalKind = Exclude<TerminalKind, 'shell'>
type TerminalSessionRecord = Awaited<ReturnType<typeof window.gogoagent.terminals.list>>[number]
type MobileGatewayStatus = Awaited<ReturnType<typeof window.gogoagent.mobile.getStatus>>
type SessionOrder = 'oldest-first' | 'newest-first'

interface DirectoryCompletionState {
  completions: string[]
  index: number
  kind: 'matches' | 'recent'
}

type IconName =
  | 'archive'
  | 'archive-restore'
  | 'arrow-down'
  | 'arrow-up'
  | 'book-open'
  | 'bot'
  | 'bug'
  | 'chevron-down'
  | 'chevron-right'
  | 'check'
  | 'clipboard-paste'
  | 'code-2'
  | 'copy'
  | 'folder'
  | 'folder-input'
  | 'lightbulb'
  | 'maximize-2'
  | 'pin'
  | 'pencil'
  | 'plus'
  | 'refresh-cw'
  | 'scroll-text'
  | 'settings'
  | 'smartphone'
  | 'square'
  | 'terminal'
  | 'x'

const ICON_PATHS: Record<IconName, string> = {
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path>',
  'archive-restore': '<rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h2"></path><path d="M20 8v11a2 2 0 0 1-2 2h-2"></path><path d="m9 15 3-3 3 3"></path><path d="M12 12v9"></path>',
  'arrow-down': '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>',
  'arrow-up': '<path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path>',
  'book-open': '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H3z"></path><path d="M21 18a1 1 0 0 0 1-1V5a2 2 0 0 0-2-2h-5a3 3 0 0 0-3 3v15a3 3 0 0 1 3-3h6z"></path>',
  bot: '<path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path>',
  bug: '<path d="m8 2 1.88 1.88"></path><path d="M14.12 3.88 16 2"></path><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"></path><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"></path><path d="M12 20v-9"></path><path d="M6 13H2"></path><path d="M22 13h-4"></path><path d="m19 7-1.5 1.5"></path><path d="M5 7l1.5 1.5"></path>',
  'chevron-down': '<path d="m6 9 6 6 6-6"></path>',
  'chevron-right': '<path d="m9 18 6-6-6-6"></path>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
  'clipboard-paste': '<path d="M15 2H9a1 1 0 0 0-1 1v2h8V3a1 1 0 0 0-1-1z"></path><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"></path><path d="M16 4h2a2 2 0 0 1 2 2v7"></path><path d="M21 18h-8"></path><path d="m17 14 4 4-4 4"></path>',
  'code-2': '<path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  'folder-input': '<path d="M2 6.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H20a2 2 0 0 1 2 2v2"></path><path d="M2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"></path><path d="M12 10v8"></path><path d="m9 15 3 3 3-3"></path>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5A5 5 0 1 0 7.5 11.5C8.3 12.3 8.8 13 9 14"></path><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M10 18a2 2 0 0 1-1-1.7V14h6v2.3a2 2 0 0 1-1 1.7"></path>',
  'maximize-2': '<path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="M9 21H3v-6"></path><path d="m3 21 7-7"></path>',
  pin: '<path d="M12 17v5"></path><path d="M5 17h14"></path><path d="M15 17V9l4-4V3H5v2l4 4v8"></path>',
  pencil: '<path d="M21.2 6.8 17.2 2.8a2.4 2.4 0 0 0-3.4 0L3 13.6V21h7.4L21.2 10.2a2.4 2.4 0 0 0 0-3.4z"></path><path d="m14 4 6 6"></path>',
  plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 15.7-6L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15.7 6L3 16"></path><path d="M8 16H3v5"></path>',
  'scroll-text': '<path d="M15 12h-5"></path><path d="M15 8h-5"></path><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v1a1 1 0 0 0 1 1h3"></path>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
  square: '<rect width="14" height="14" x="5" y="5" rx="2"></rect>',
  terminal: '<path d="m4 17 6-6-6-6"></path><path d="M12 19h8"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
}

function iconSvg(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`
}

function iconMarkup(name: IconName, className = 'button-icon'): string {
  return `<span class="${className}" aria-hidden="true">${iconSvg(name)}</span>`
}

function terminalKindIcon(kind: TerminalKind): IconName {
  if (kind === 'claude') return 'bot'
  if (kind === 'codex') return 'code-2'
  return 'terminal'
}

function hydrateIconPlaceholders(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
    const name = element.dataset.icon
    if (!name || !(name in ICON_PATHS)) return
    element.innerHTML = iconSvg(name as IconName)
  })
}

// ---------- DOM refs ----------
const appNotice = document.querySelector('#app-notice') as HTMLElement
const refreshButton = document.querySelector('#refresh-button') as HTMLButtonElement
const labelWorkstreamsButton = document.querySelector('#label-workstreams-button') as HTMLButtonElement
const labelWorkstreamsRetryButton = document.querySelector('#label-workstreams-retry-button') as HTMLButtonElement
const labelWorkstreamsStatus = document.querySelector('#label-workstreams-status') as HTMLElement
const attentionSection = document.querySelector('#attention-section') as HTMLElement
const attentionCount = document.querySelector('#attention-count') as HTMLElement
const attentionList = document.querySelector('#attention-list') as HTMLDivElement
const projectsList = document.querySelector('#projects-list') as HTMLDivElement
const projectsSearch = document.querySelector('#projects-search') as HTMLInputElement
const showArchivedButton = document.querySelector('#show-archived-button') as HTMLButtonElement
const globalCwdInput = document.querySelector('#global-cwd-input') as HTMLInputElement
const globalCwdSuggestions = document.querySelector('#global-cwd-suggestions') as HTMLDivElement
const globalBrowseButton = document.querySelector('#global-browse-button') as HTMLButtonElement
const globalUseCurrentButton = document.querySelector('#global-use-current-button') as HTMLButtonElement
const newWorkstreamButton = document.querySelector('#new-workstream-button') as HTMLButtonElement
const globalLaunchKindInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="global-launch-kind"]')]
const globalLaunchStatus = document.querySelector('#global-launch-status') as HTMLElement
const contentRoot = document.querySelector('.content') as HTMLElement
const detailEmpty = document.querySelector('#project-detail-empty') as HTMLDivElement
const detailEmptyText = detailEmpty.querySelector('p') as HTMLParagraphElement
const detailRoot = document.querySelector('#project-detail') as HTMLElement
const detailTitle = document.querySelector('#detail-title') as HTMLElement
const detailSubtitle = document.querySelector('#detail-subtitle') as HTMLElement
const detailMeta = document.querySelector('#detail-meta') as HTMLElement
const workstreamStateSummary = document.querySelector('#workstream-state-summary') as HTMLDivElement
const workstreamStateForm = document.querySelector('#workstream-state-form') as HTMLFormElement
const workstreamStateStatus = document.querySelector('#workstream-state-status') as HTMLElement
const stateEditButton = document.querySelector('#state-edit-button') as HTMLButtonElement
const stateSaveButton = document.querySelector('#state-save-button') as HTMLButtonElement
const stateCancelButton = document.querySelector('#state-cancel-button') as HTMLButtonElement
const stateGoalInput = document.querySelector('#state-goal-input') as HTMLTextAreaElement
const stateCurrentInput = document.querySelector('#state-current-input') as HTMLTextAreaElement
const stateBlockerInput = document.querySelector('#state-blocker-input') as HTMLTextAreaElement
const stateNextInput = document.querySelector('#state-next-input') as HTMLTextAreaElement
const stateVerificationInput = document.querySelector('#state-verification-input') as HTMLTextAreaElement
const terminalCard = document.querySelector('#terminal-card') as HTMLElement
const terminalTabs = document.querySelector('#terminal-tabs') as HTMLDivElement
const terminalEmpty = document.querySelector('#terminal-empty') as HTMLDivElement
const terminalHost = document.querySelector('#terminal-host') as HTMLDivElement
const terminalActions = document.querySelector('#terminal-actions') as HTMLDivElement
const terminalStatus = document.querySelector('#terminal-status') as HTMLElement
const desktopDecisionCard = document.querySelector('#desktop-decision-card') as HTMLElement
const desktopDecisionPrompt = document.querySelector('#desktop-decision-prompt') as HTMLElement
const desktopDecisionContext = document.querySelector('#desktop-decision-context') as HTMLElement
const desktopDecisionChoices = document.querySelector('#desktop-decision-choices') as HTMLElement
const desktopDecisionStatus = document.querySelector('#desktop-decision-status') as HTMLElement
const desktopDecisionReceipt = document.querySelector('#desktop-decision-receipt') as HTMLElement
const desktopReceiptTime = document.querySelector('#desktop-receipt-time') as HTMLElement
const desktopReceiptChoice = document.querySelector('#desktop-receipt-choice') as HTMLElement
const desktopReceiptStatus = document.querySelector('#desktop-receipt-status') as HTMLElement
const desktopReceiptOutputButton = document.querySelector('#desktop-receipt-output') as HTMLButtonElement
const terminalHelp = document.querySelector('#terminal-help') as HTMLElement
const newShellButton = document.querySelector('#new-shell-button') as HTMLButtonElement
const newClaudeButton = document.querySelector('#new-claude-button') as HTMLButtonElement
const newCodexButton = document.querySelector('#new-codex-button') as HTMLButtonElement
const terminalCopyContextButton = document.querySelector('#terminal-copy-context-button') as HTMLButtonElement
const terminalPasteContextButton = document.querySelector('#terminal-paste-context-button') as HTMLButtonElement
const terminalCopyLogButton = document.querySelector('#terminal-copy-log-button') as HTMLButtonElement
const terminalCloseButton = document.querySelector('#terminal-close-button') as HTMLButtonElement
const workstreamDigest = document.querySelector('#workstream-digest') as HTMLDivElement
const detailTimeline = document.querySelector('#detail-timeline') as HTMLDivElement
const timelineToggleAllButton = document.querySelector('#timeline-toggle-all-button') as HTMLButtonElement
const timelineOrderButton = document.querySelector('#timeline-order-button') as HTMLButtonElement
const detailRefined = document.querySelector('#detail-refined') as HTMLDivElement
const detailPaths = document.querySelector('#detail-paths') as HTMLDivElement
const detailSessions = document.querySelector('#detail-sessions') as HTMLDivElement
const refineButton = document.querySelector('#refine-button') as HTMLButtonElement
const renameWorkstreamButton = document.querySelector('#rename-workstream-button') as HTMLButtonElement
const transcriptButton = document.querySelector('#transcript-button') as HTMLButtonElement
const headerCopyContextButton = document.querySelector('#header-copy-context-button') as HTMLButtonElement
const archiveWorkstreamButton = document.querySelector('#archive-workstream-button') as HTMLButtonElement
const refineStatus = document.querySelector('#refine-status') as HTMLElement
const suggestTitleButton = document.querySelector('#suggest-title-button') as HTMLButtonElement
const terminalFocusButton = document.querySelector('#terminal-focus-button') as HTMLButtonElement
const footerStats = document.querySelector('#footer-stats') as HTMLElement
const footerActivity = document.querySelector('#footer-activity') as HTMLElement

const phoneToggle = document.querySelector('#phone-toggle') as HTMLButtonElement
const phoneDialog = document.querySelector('#phone-dialog') as HTMLDialogElement
const phoneOffline = document.querySelector('#phone-offline') as HTMLElement
const phoneOnline = document.querySelector('#phone-online') as HTMLElement
const phoneStartButton = document.querySelector('#phone-start-button') as HTMLButtonElement
const phoneStopButton = document.querySelector('#phone-stop-button') as HTMLButtonElement
const phoneCopyLinkButton = document.querySelector('#phone-copy-link-button') as HTMLButtonElement
const phoneAddressSelect = document.querySelector('#phone-address-select') as HTMLSelectElement
const phoneQrImage = document.querySelector('#phone-qr-image') as HTMLImageElement
const phonePairingCode = document.querySelector('#phone-pairing-code') as HTMLElement
const phoneDeviceCount = document.querySelector('#phone-device-count') as HTMLElement
const phoneStatus = document.querySelector('#phone-status') as HTMLElement

const settingsToggle = document.querySelector('#settings-toggle') as HTMLButtonElement
const settingsDialog = document.querySelector('#settings-dialog') as HTMLDialogElement
const sessionOrderOldestInput = document.querySelector('#session-order-oldest') as HTMLInputElement
const sessionOrderNewestInput = document.querySelector('#session-order-newest') as HTMLInputElement
const contextClaudeToCodexInput = document.querySelector('#context-claude-to-codex') as HTMLInputElement
const contextCodexToClaudeInput = document.querySelector('#context-codex-to-claude') as HTMLInputElement
const automaticWorkstreamNamingInput = document.querySelector('#automatic-workstream-naming') as HTMLInputElement

const debugToggle = document.querySelector('#debug-toggle') as HTMLButtonElement
const debugDialog = document.querySelector('#debug-dialog') as HTMLDialogElement
const debugLastScan = document.querySelector('#debug-last-scan') as HTMLElement
const debugPathsList = document.querySelector('#debug-paths') as HTMLUListElement
const debugStepsList = document.querySelector('#debug-steps') as HTMLUListElement
const debugCountsList = document.querySelector('#debug-counts') as HTMLUListElement
const debugErrorsList = document.querySelector('#debug-errors') as HTMLUListElement
const debugRescanButton = document.querySelector('#debug-rescan-button') as HTMLButtonElement

const transcriptDialog = document.querySelector('#transcript-dialog') as HTMLDialogElement
const transcriptSubtitle = document.querySelector('#transcript-subtitle') as HTMLElement
const transcriptTitle = document.querySelector('#transcript-title') as HTMLElement
const transcriptMeta = document.querySelector('#transcript-meta') as HTMLElement
const transcriptSearch = document.querySelector('#transcript-search') as HTMLInputElement
const transcriptBody = document.querySelector('#transcript-body') as HTMLDivElement
const copyTranscriptButton = document.querySelector('#copy-transcript-button') as HTMLButtonElement

const continuationDialog = document.querySelector('#continuation-dialog') as HTMLDialogElement
const continuationTitle = document.querySelector('#continuation-title') as HTMLElement
const continuationMeta = document.querySelector('#continuation-meta') as HTMLElement
const continuationRepositoryState = document.querySelector('#continuation-repository-state') as HTMLElement
const continuationContextLabel = document.querySelector('#continuation-context-label') as HTMLElement
const continuationContext = document.querySelector('#continuation-context') as HTMLTextAreaElement
const continuationCancelButton = document.querySelector('#continuation-cancel-button') as HTMLButtonElement
const continuationSecondaryButton = document.querySelector('#continuation-secondary-button') as HTMLButtonElement
const continuationPrimaryButton = document.querySelector('#continuation-primary-button') as HTMLButtonElement

const renameInput = document.querySelector('#rename-input') as HTMLInputElement
const renameStatus = document.querySelector('#rename-status') as HTMLElement
const renameSaveButton = document.querySelector('#rename-save-button') as HTMLButtonElement
const renameCancelButton = document.querySelector('#rename-cancel-button') as HTMLButtonElement

// ---------- State ----------
let projects: Project[] = []
let attentionItems: AttentionItem[] = []
let attentionRequestVersion = 0
let selectedProjectId: string | null = null
let currentDetail: ProjectDetail | null = null
let refinePollTimer: number | null = null
let labelPollTimer: number | null = null
let labelJobInFlight = false
let showArchivedWorkstreams = false
let activeTranscript: TranscriptView | null = null
const projectDetailCache = new Map<string, CacheEntry<ProjectDetail>>()
const sessionDetailCache = new Map<string, CacheEntry<SessionDetail>>()
const sessionDetailRequests = new Map<string, Promise<SessionDetail>>()
const terminalViews = new Map<string, TerminalView>()
let activeTerminalId: string | null = null
let decisionRequestKey = ''
let decisionRequestTimer: number | null = null
let decisionActiveTerminalId: string | null = null
let displayedDecisionId: string | null = null
let decisionSending = false
let decisionSubmittedId: string | null = null
let terminalOnlyCwd: string | null = null
let terminalFitFrame: number | null = null
let terminalFitGeneration = 0
let terminalResizeObserver: ResizeObserver | null = null
let timelineRenderVersion = 0
let timelineObserver: IntersectionObserver | null = null
let timelineLoadsInFlight = 0
let timelineLoadQueue: TimelineLoadTask[] = []
let queuedTimelineSessionIds = new Set<string>()
let projectSelectionVersion = 0
let cwdCompletionState: DirectoryCompletionState | null = null
let cwdCompletionTimer: number | null = null
let cwdCompletionRequest = 0
let globalLaunchInFlight = false
let failedLabelProjectIds: string[] = []
let transcriptVisibleMessageLimit = 0
let transcriptSearchTimer: number | null = null
let stateEditing = false

const GLOBAL_CWD_STORAGE_KEY = 'gogoagent.globalCwd'
const GLOBAL_CWD_RECENTS_STORAGE_KEY = 'gogoagent.recentCwds.v1'
const GLOBAL_LAUNCH_KIND_STORAGE_KEY = 'gogoagent.launchKind.v1'
const AUTO_NAME_SEEN_STORAGE_KEY = 'gogoagent.autoNameCompletedWorkstreams.v5'
const AUTO_NAMING_ENABLED_STORAGE_KEY = 'gogoagent.autoNamingEnabled.v1'
const SESSION_ORDER_STORAGE_KEY = 'gogoagent.sessionOrder.v1'
const COLLAPSED_TIMELINE_SESSIONS_STORAGE_KEY = 'gogoagent.collapsedTimelineSessions.v1'
const PINNED_WORKSTREAMS_STORAGE_KEY = 'gogoagent.pinnedWorkstreams.v1'
const TERMINAL_FOCUS_WORKSTREAMS_STORAGE_KEY = 'gogoagent.terminalFocusWorkstreams.v1'
const LAST_VIEWED_TERMINALS_STORAGE_KEY = 'gogoagent.lastViewedTerminals.v1'
const LAST_CONTINUATION_REPOSITORIES_STORAGE_KEY = 'gogoagent.lastContinuationRepositories.v1'
const STATUS_NOTES_STORAGE_KEY = 'gogoagent.workstreamStatusNotes.v1'
const CONTEXT_SHARING_STORAGE_KEY = 'gogoagent.contextSharing.v1'

function migrateSpoolLocalStorage() {
  try {
    const legacyPrefix = 'spool.'
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(legacyPrefix)) continue
      const replacement = `gogoagent.${key.slice(legacyPrefix.length)}`
      if (localStorage.getItem(replacement) === null) {
        localStorage.setItem(replacement, localStorage.getItem(key) ?? '')
      }
    }
  } catch {
    // Storage may be unavailable in restrictive renderer environments.
  }
}

migrateSpoolLocalStorage()

const TERMINAL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const TERMINAL_FONT_SIZE = 13
const TERMINAL_LINE_HEIGHT = 1.25
const TERMINAL_BOTTOM_RESERVE_ROWS = 2
const TERMINAL_BOTTOM_GUTTER_PX = 12
const TERMINAL_SCROLLBAR_GUTTER_PX = 14
const TERMINAL_FIT_MAX_TRIM_PASSES = 4
const TERMINAL_REFIT_DELAYS_MS = [80, 250] as const
const TERMINAL_SCROLL_SETTLE_DELAYS_MS = [0, 60, 160, 320] as const
const TIMELINE_DETAIL_CONCURRENCY = 4
const TIMELINE_LAZY_ROOT_MARGIN_PX = 700
const TRANSCRIPT_SESSION_PAGE_SIZE = 3
const TRANSCRIPT_INITIAL_MESSAGE_LIMIT = 160
const TRANSCRIPT_MESSAGE_PAGE_SIZE = 240
const TRANSCRIPT_SEARCH_DEBOUNCE_MS = 120
const PROJECT_DETAIL_CACHE_MS = 60_000
const SESSION_DETAIL_CACHE_MS = 60_000
const PROJECT_ACTIVITY_UI_THROTTLE_MS = 15_000
const RESUME_TRANSCRIPT_SESSION_LIMIT = 4
const RESUME_TRANSCRIPT_MESSAGE_LIMIT = 28
const RESUME_TRANSCRIPT_MESSAGE_CHARS = 1200
const RESUME_TRANSCRIPT_CHAR_BUDGET = 18_000
const BRIDGE_SESSION_LIMIT = 2
const BRIDGE_CANDIDATE_LIMIT = 12
let sessionOrder: SessionOrder = readSessionOrder()
const collapsedTimelineSessions = readCollapsedTimelineSessions()
const expandedTimelineCards = new Set<string>()
const pinnedWorkstreamIds = readStringSet(PINNED_WORKSTREAMS_STORAGE_KEY)
const terminalFocusWorkstreamIds = readStringSet(TERMINAL_FOCUS_WORKSTREAMS_STORAGE_KEY)
const lastViewedTerminalIdsByWorkstream = readStringRecord(LAST_VIEWED_TERMINALS_STORAGE_KEY)
const lastContinuationRepositories = readStringRecord(LAST_CONTINUATION_REPOSITORIES_STORAGE_KEY)
const statusNotesByWorkstream = readStringRecord(STATUS_NOTES_STORAGE_KEY)
let contextSharingSettings = readContextSharingSettings()
let automaticNamingEnabled = localStorage.getItem(AUTO_NAMING_ENABLED_STORAGE_KEY) === 'true'
const unreadWorkstreamIds = new Set<string>()
const projectActivityRenderedAt = new Map<string, number>()

interface TranscriptSection {
  session: SessionRecord
  artifacts: ArtifactRecord[]
  candidates: ExtractionCandidate[]
  messages: SessionMessageRecord[]
}

interface TranscriptView {
  title: string
  subtitle: string
  meta: string
  sections: TranscriptSection[]
  pendingSessions?: SessionRecord[]
  loadingSessions?: boolean
  loadError?: string
}

interface TimelineLoadTask {
  session: SessionRecord
  index: number
  renderVersion: number
  projectId: string
}

interface TerminalView {
  record: TerminalSessionRecord
  terminal: InstanceType<typeof window.Terminal>
  fitAddon?: FitAddonInstance
  element: HTMLDivElement
  logRestored: boolean
  needsInputSuppressed?: boolean
  pendingData: Array<{ data: string; logBytes?: number }>
  pendingWrites: string[]
  writeFrame: number | null
  scrollAfterWrite?: boolean
  scrollGeneration: number
}

interface CacheEntry<T> {
  value: T
  cachedAt: number
}

interface TimelineMessageGroup {
  role: SessionMessageRecord['role']
  messages: SessionMessageRecord[]
}

interface ContextSharingSettings {
  claudeToCodex: boolean
  codexToClaude: boolean
}

interface WorkstreamDigestItem {
  label: string
  value: string
  detail?: string
  tone?: 'attention' | 'muted'
  terminalId?: string
}

type ContinuationDecision = 'cancel' | 'without-context' | 'with-context' | 'copy'

interface ContinuationReview {
  detail: ProjectDetail
  targetKind: AgentTerminalKind
  resumeSessionId?: string
  resumeSessionTitle?: string
  context?: string
  repository: RepositoryState
}

interface ContinuationResult {
  decision: ContinuationDecision
  context?: string
}

// ---------- Helpers ----------
function readStringSet(storageKey: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function saveStringSet(storageKey: string, values: Set<string>) {
  localStorage.setItem(storageKey, JSON.stringify([...values]))
}

function readStringRecord(storageKey: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map<string, string>()
    return new Map(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return new Map<string, string>()
  }
}

function saveStringRecord(storageKey: string, values: Map<string, string>) {
  localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(values)))
}

function readRecentDirectories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GLOBAL_CWD_RECENTS_STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).slice(0, 8)
      : []
  } catch {
    return []
  }
}

function rememberDirectory(directory: string) {
  const normalized = directory.trim()
  if (!normalized) return
  const recent = [normalized, ...readRecentDirectories().filter((entry) => entry !== normalized)].slice(0, 8)
  localStorage.setItem(GLOBAL_CWD_RECENTS_STORAGE_KEY, JSON.stringify(recent))
}

function selectedGlobalLaunchKind(): TerminalKind {
  const selected = globalLaunchKindInputs.find((input) => input.checked)?.value
  return selected === 'codex' || selected === 'shell' ? selected : 'claude'
}

function setGlobalLaunchKind(kind: TerminalKind) {
  for (const input of globalLaunchKindInputs) input.checked = input.value === kind
  localStorage.setItem(GLOBAL_LAUNCH_KIND_STORAGE_KEY, kind)
  const label = terminalLabel(kind)
  newWorkstreamButton.innerHTML = buttonContent(terminalKindIcon(kind), `Start ${label}`)
  newWorkstreamButton.title = `Start ${label} in this directory.`
}

function readContextSharingSettings(): ContextSharingSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTEXT_SHARING_STORAGE_KEY) ?? '{}') as Partial<ContextSharingSettings>
    return {
      claudeToCodex: parsed.claudeToCodex !== false,
      codexToClaude: parsed.codexToClaude !== false,
    }
  } catch {
    return { claudeToCodex: true, codexToClaude: true }
  }
}

function saveContextSharingSettings() {
  localStorage.setItem(CONTEXT_SHARING_STORAGE_KEY, JSON.stringify(contextSharingSettings))
}

function workstreamStatusNote(workstreamId: string) {
  const project = currentDetail?.project.id === workstreamId
    ? currentDetail.project
    : projects.find((entry) => entry.id === workstreamId)
  return project?.state?.currentState?.trim() ?? statusNotesByWorkstream.get(workstreamId)?.trim() ?? ''
}

function readSessionOrder(): SessionOrder {
  const value = localStorage.getItem(SESSION_ORDER_STORAGE_KEY)
  return value === 'newest-first' ? 'newest-first' : 'oldest-first'
}

function readCollapsedTimelineSessions() {
  return readStringSet(COLLAPSED_TIMELINE_SESSIONS_STORAGE_KEY)
}

function saveCollapsedTimelineSessions() {
  saveStringSet(COLLAPSED_TIMELINE_SESSIONS_STORAGE_KEY, collapsedTimelineSessions)
}

function sortSessionsForDisplay<T extends Pick<SessionRecord, 'startedAt'>>(sessions: T[]) {
  return sessions.slice().sort((a, b) => (
    sessionOrder === 'oldest-first'
      ? a.startedAt.localeCompare(b.startedAt)
      : b.startedAt.localeCompare(a.startedAt)
  ))
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

function buttonContent(icon: IconName, label: string): string {
  return `${iconMarkup(icon)}<span class="button-label">${esc(label)}</span>`
}

function fmtRelative(iso?: string): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const diff = Date.now() - then
  const min = 60 * 1000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < min) return 'just now'
  if (diff < hr) return `${Math.round(diff / min)}m ago`
  if (diff < day) return `${Math.round(diff / hr)}h ago`
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`
  return new Date(then).toISOString().slice(0, 10)
}

function compactPath(value: string): string {
  const home = window.gogoagent.system.homeDirectory.replace(/[\\/]+$/, '')
  if (value === home) return '~'
  if (home && (value.startsWith(`${home}/`) || value.startsWith(`${home}\\`))) {
    return `~${value.slice(home.length)}`
  }
  return value.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, '~')
}

function fmtDateRange(firstIso: string, lastIso: string): string {
  const first = firstIso.slice(0, 10)
  const last = lastIso.slice(0, 10)
  return first === last ? first : `${first} → ${last}`
}

function fmtNumber(value: number | undefined): string {
  if (!value) return '0'
  return new Intl.NumberFormat().format(value)
}

function fmtBytes(value: number | undefined): string {
  if (!value) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDuration(ms: number | undefined): string {
  if (!ms || ms < 60_000) return '<1m'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function renderEmpty(target: HTMLElement, text: string) {
  target.innerHTML = `<p class="empty">${esc(text)}</p>`
}

function setAppNotice(message: string) {
  appNotice.textContent = message
  appNotice.classList.toggle('hidden', message.length === 0)
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function recordTerminalInput(view: TerminalView, data: string) {
  const activityAt = new Date().toISOString()
  view.record.lastActivityAt = activityAt
  bumpProjectActivity(view.record.workstreamId, activityAt)
  void window.gogoagent.terminals.write(view.record.id, data)
}

function copyTerminalSelection(view: TerminalView) {
  if (!view.terminal.hasSelection?.()) return false
  const selection = view.terminal.getSelection?.() ?? ''
  if (!selection) return false
  void copyText(selection)
    .then(() => {
      if (terminalViews.get(view.record.id) === view) terminalStatus.textContent = 'Selection copied'
    })
    .catch((error) => {
      if (terminalViews.get(view.record.id) === view) terminalStatus.textContent = `Selection copy failed: ${(error as Error).message}`
    })
  view.terminal.clearSelection?.()
  return true
}

function pasteClipboardIntoTerminal(view: TerminalView) {
  if (!navigator.clipboard?.readText) return false
  void navigator.clipboard.readText()
    .then((text) => {
      if (!text || terminalViews.get(view.record.id) !== view) return
      if (view.terminal.paste) {
        view.terminal.paste(text)
      } else {
        recordTerminalInput(view, text)
      }
    })
    .catch((error) => {
      if (terminalViews.get(view.record.id) === view) terminalStatus.textContent = `Paste failed: ${(error as Error).message}`
    })
  return true
}

function flashButton(button: HTMLButtonElement, label: string) {
  const labelElement = button.querySelector<HTMLElement>('.button-label')
  if (labelElement) {
    const original = labelElement.textContent ?? ''
    labelElement.textContent = label
    window.setTimeout(() => {
      labelElement.textContent = original
    }, 1400)
    return
  }

  const original = button.textContent ?? ''
  button.textContent = label
  window.setTimeout(() => {
    button.textContent = original
  }, 1400)
}

function highlight(text: string, query: string): string {
  const q = query.trim().toLowerCase()
  if (!q) return esc(text)
  const lower = text.toLowerCase()
  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const index = lower.indexOf(q, cursor)
    if (index === -1) {
      html += esc(text.slice(cursor))
      break
    }
    html += esc(text.slice(cursor, index))
    html += `<mark>${esc(text.slice(index, index + q.length))}</mark>`
    cursor = index + q.length
  }
  return html
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, { value, cachedAt: Date.now() })
}

function pruneCache<T>(cache: Map<string, CacheEntry<T>>, ttlMs: number) {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > ttlMs) cache.delete(key)
  }
}

async function getProjectDetail(projectId: string) {
  const detail = await window.gogoagent.projects.get(projectId)
  setCachedValue(projectDetailCache, projectId, detail)
  return detail
}

async function getSessionDetail(sessionId: string) {
  const cached = getCachedValue(sessionDetailCache, sessionId, SESSION_DETAIL_CACHE_MS)
  if (cached) return cached
  const pending = sessionDetailRequests.get(sessionId)
  if (pending) return pending

  const request = window.gogoagent.sessions.get(sessionId)
    .then((detail) => {
      setCachedValue(sessionDetailCache, sessionId, detail)
      return detail
    })
    .finally(() => {
      if (sessionDetailRequests.get(sessionId) === request) sessionDetailRequests.delete(sessionId)
    })
  sessionDetailRequests.set(sessionId, request)
  return request
}

function currentWorkstreamTerminals() {
  return [...terminalViews.values()]
    .filter((view) => {
      if (selectedProjectId) return view.record.workstreamId === selectedProjectId
      return !view.record.workstreamId || view.record.id === activeTerminalId
    })
    .sort((a, b) => a.record.startedAt.localeCompare(b.record.startedAt))
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined) {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function bumpProjectActivity(workstreamId: string | undefined, timestamp = new Date().toISOString()) {
  if (!workstreamId || showArchivedWorkstreams) return false

  const project = projects.find((entry) => entry.id === workstreamId)
  if (!project || timestamp.localeCompare(project.lastUpdatedAt) <= 0) return false

  const nowMs = Date.now()
  const previousMs = Date.parse(project.lastUpdatedAt)
  const nextMs = Date.parse(timestamp)
  const lastRenderedMs = projectActivityRenderedAt.get(workstreamId) ?? 0
  const staleEnoughToShow =
    !Number.isFinite(previousMs) ||
    !Number.isFinite(nextMs) ||
    nextMs - previousMs >= 60_000
  const shouldRender =
    staleEnoughToShow ||
    nowMs - lastRenderedMs >= PROJECT_ACTIVITY_UI_THROTTLE_MS

  if (!shouldRender) return false

  projectActivityRenderedAt.set(workstreamId, nowMs)
  const updatedProject = { ...project, lastUpdatedAt: timestamp }
  projects = projects.map((entry) => entry.id === workstreamId ? updatedProject : entry)

  if (currentDetail?.project.id === workstreamId && timestamp.localeCompare(currentDetail.project.lastUpdatedAt) > 0) {
    currentDetail = { ...currentDetail, project: { ...currentDetail.project, lastUpdatedAt: timestamp } }
    setCachedValue(projectDetailCache, workstreamId, currentDetail)
    renderDetailMeta(currentDetail.project)
  }

  // Keep the sidebar stable while output is streaming. Re-sorting and
  // rebuilding every card here can move a click target or drop keyboard focus.
  const card = [...projectsList.querySelectorAll<HTMLElement>('.project-card')]
    .find((entry) => entry.dataset.projectId === workstreamId)
  const activity = card?.querySelector<HTMLElement>('.session-card-meta')
  if (activity) {
    activity.textContent = fmtRelative(timestamp)
    activity.title = timestamp
  }
  return true
}

function projectNeedsInputTerminalIds(project: Project) {
  const ids = new Set(project.needsInputTerminalIds ?? [])
  for (const terminalId of project.activeTerminalIds ?? []) {
    const view = terminalViews.get(terminalId)
    if (!view || view.record.status !== 'running') continue
    if (terminalNeedsInput(view)) ids.add(terminalId)
    else ids.delete(terminalId)
  }
  return [...ids]
}

function projectFirstNeedsInputTerminalId(project: Project | undefined) {
  if (!project) return undefined
  return projectNeedsInputTerminalIds(project)[0]
}

async function jumpToNeedsInputTerminal(projectId: string, terminalId?: string) {
  const project = projects.find((entry) => entry.id === projectId)
  const targetId = terminalId ?? projectFirstNeedsInputTerminalId(project)
  if (selectedProjectId !== projectId) {
    await selectProject(projectId)
  }

  const view = targetId ? terminalViews.get(targetId) : undefined
  if (view) {
    selectTerminal(view.record.id)
    return
  }

  const fallback = currentWorkstreamTerminals().find(terminalNeedsInput)
  if (fallback) {
    selectTerminal(fallback.record.id)
  }
}

function normalizedTerminalText(data: string) {
  return stripAnsi(data)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function updateTerminalNeedsInputSuppression(view: TerminalView, data: string) {
  if (!data) return false

  const text = normalizedTerminalText(data)
  if (!text) return false

  const shouldSuppress = /\bno response requested\b/i.test(text)
    || /\bno need to (?:check in|respond)\b/i.test(text)
    || /\bi'?ll (?:ping|come back|let you know)\b/i.test(text)
    || /\b(?:shells?|commands?|jobs?) still running\b/i.test(text)
    || /\bbackground command\b/i.test(text)
    || /\bwaiting on (?:the )?background\b/i.test(text)
    || /\bwaiting on .* to complete\b/i.test(text)
  const shouldClearSuppression = /\b(?:awaiting|waiting for|needs) (?:user )?input\b/i.test(text)
    || /\binput required\b/i.test(text)
    || /\bapproval required\b/i.test(text)
    || /\bpress (?:enter|y|n)\b/i.test(text)
    || /\benter to select\b/i.test(text)
    || /\bselect (?:one|an option)\b/i.test(text)
    || /\bchoose (?:one|an option|a number)\b/i.test(text)
    || /\bi need from you\b/i.test(text)
    || /\bplease (?:confirm|provide|choose|select|approve)\b/i.test(text)
    || /\bdo you want to\b/i.test(text)

  const next = shouldSuppress ? true : shouldClearSuppression ? false : view.needsInputSuppressed ?? false
  if ((view.needsInputSuppressed ?? false) === next) return false
  view.needsInputSuppressed = next
  return true
}

function terminalNeedsInput(view: TerminalView) {
  return view.record.status === 'running' && Boolean(view.record.needsInput) && !view.needsInputSuppressed
}

function loadedSessionDetails(detail: ProjectDetail) {
  return detail.sessions
    .map((session) => getCachedValue(sessionDetailCache, session.id, SESSION_DETAIL_CACHE_MS))
    .filter((sessionDetail): sessionDetail is SessionDetail => Boolean(sessionDetail))
}

function digestText(text: string, max = 180) {
  return clampText(stripAnsi(text).replace(/\s+/g, ' ').trim(), max)
}

function digestRoleLabel(role: SessionMessageRecord['role']) {
  if (role === 'assistant') return 'Agent'
  return role
}

function isUsefulDigestMessage(message: SessionMessageRecord) {
  if (message.role !== 'assistant') return false
  if (isTimelineNoiseMessage(message)) return false
  const text = digestText(message.text, 600)
  if (text.length < 8) return false
  if (/^\[(?:earlier|older) terminal (?:output|log) omitted/i.test(text)) return false
  if (/<local-command-/i.test(text)) return false
  if (/^\[request interrupted by user\]/i.test(text)) return false
  if (/^\[terminal log is empty\]/i.test(text)) return false
  if (/^(ran \d+ shell command|baked for|cogitated for)\b/i.test(text)) return false
  if (/^gogoagent terminal log title\b/i.test(text)) return false
  return true
}

function digestTerminalState(): WorkstreamDigestItem {
  const terminals = currentWorkstreamTerminals()
  if (!terminals.length) {
    return {
      label: 'Terminal',
      value: 'No live terminal',
      tone: 'muted',
    }
  }

  const running = terminals.filter((view) => view.record.status === 'running')
  const needingInput = terminals.filter(terminalNeedsInput)
  const detail = terminals
    .slice(-3)
    .map((view) => {
      const state = terminalNeedsInput(view) ? 'needs input' : view.record.status
      const activeAt = view.record.lastActivityAt ?? view.record.endedAt ?? view.record.startedAt
      return `${terminalLabel(view.record.kind)} ${state} · ${fmtRelative(activeAt)}`
    })
    .join(' · ')

  if (needingInput.length) {
    return {
      label: 'Terminal',
      value: `${needingInput.length} needs input`,
      detail,
      tone: 'attention',
      terminalId: needingInput[0]?.record.id,
    }
  }

  return {
    label: 'Terminal',
    value: running.length
      ? `${running.length} running`
      : `${terminals.length} terminal${terminals.length === 1 ? '' : 's'} attached`,
    detail,
  }
}

function latestDigestAction(detail: ProjectDetail): WorkstreamDigestItem {
  const latestMessage = loadedSessionDetails(detail)
    .flatMap((sessionDetail) => sessionDetail.messages.map((message) => ({ session: sessionDetail.session, message })))
    .filter(({ message }) => isUsefulDigestMessage(message))
    .sort((a, b) => b.message.timestamp.localeCompare(a.message.timestamp))[0]

  if (latestMessage) {
    return {
      label: 'Latest',
      value: `${digestRoleLabel(latestMessage.message.role)}: ${digestText(latestMessage.message.text)}`,
      detail: `${latestMessage.session.title || latestMessage.session.id} · ${fmtRelative(latestMessage.message.timestamp)}`,
    }
  }

  const latestSession = detail.sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return {
    label: 'Latest',
    value: latestSession ? latestSession.title || latestSession.id : 'No session activity yet',
    detail: latestSession ? `updated ${fmtRelative(latestSession.updatedAt)}` : undefined,
    tone: latestSession ? undefined : 'muted',
  }
}

function openLoopDigest(detail: ProjectDetail): WorkstreamDigestItem {
  const latestTodo = loadedSessionDetails(detail)
    .slice()
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt))
    .flatMap((sessionDetail) => (
      sessionDetail.candidates
        .filter((candidate) => candidate.kind === 'todo')
        .map((candidate) => ({ session: sessionDetail.session, candidate }))
    ))[0]

  if (latestTodo) {
    return {
      label: 'Open loop',
      value: digestText(latestTodo.candidate.text),
      detail: latestTodo.session.title || latestTodo.session.id,
    }
  }

  const loopMessage = loadedSessionDetails(detail)
    .flatMap((sessionDetail) => sessionDetail.messages.map((message) => ({ session: sessionDetail.session, message })))
    .filter(({ message }) => {
      if (!isUsefulDigestMessage(message)) return false
      const text = digestText(message.text, 600)
      if (/\bno need to (?:check in|respond)\b/i.test(text)) return false
      return /\b(?:blocked|waiting|still running|remaining|todo|next|follow up|once .* finish|need to|needs to)\b/i.test(text)
    })
    .sort((a, b) => b.message.timestamp.localeCompare(a.message.timestamp))[0]

  if (loopMessage) {
    return {
      label: 'Open loop',
      value: digestText(loopMessage.message.text),
      detail: `${loopMessage.session.title || loopMessage.session.id} · ${fmtRelative(loopMessage.message.timestamp)}`,
    }
  }

  return {
    label: 'Open loop',
    value: 'No explicit open loop detected',
    tone: 'muted',
  }
}

function renderWorkstreamDigest(detail: ProjectDetail) {
  const statusNote = workstreamStatusNote(detail.project.id)
  const items: WorkstreamDigestItem[] = [
    statusNote
      ? { label: 'Status', value: statusNote }
      : {
          label: 'Status',
          value: `${detail.project.sessionCount} session${detail.project.sessionCount === 1 ? '' : 's'} · active ${fmtRelative(detail.project.lastUpdatedAt)}`,
          detail: compactPath(detail.project.repoRoot),
          tone: 'muted',
        },
    digestTerminalState(),
    latestDigestAction(detail),
    openLoopDigest(detail),
  ]

  workstreamDigest.innerHTML = items
    .map((item) => `
      <div
        class="workstream-digest-row${item.tone ? ` ${esc(item.tone)}` : ''}${item.terminalId ? ' actionable' : ''}"
        ${item.terminalId ? `data-terminal-id="${esc(item.terminalId)}" role="button" tabindex="0" title="Jump to the waiting terminal."` : ''}
      >
        <span class="workstream-digest-label">${esc(item.label)}</span>
        <span class="workstream-digest-main">${esc(item.value)}</span>
        ${item.detail ? `<span class="workstream-digest-detail">${esc(item.detail)}</span>` : ''}
      </div>
    `)
    .join('')
  renderWorkstreamState(detail)
}

type WorkstreamStateField = 'goal' | 'currentState' | 'blocker' | 'nextAction' | 'lastVerification'

function latestVerification(detail: ProjectDetail) {
  const match = loadedSessionDetails(detail)
    .flatMap((sessionDetail) => sessionDetail.messages)
    .filter((message) => message.role === 'assistant' || message.role === 'terminal')
    .filter((message) => /\b(?:typecheck|tests?|build|lint|verification|git diff --check)\b/i.test(message.text))
    .filter((message) => /\b(?:pass(?:ed|es)?|succeed(?:ed|s)?|complete(?:d)?|clean|green|ok)\b/i.test(message.text))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  return match ? digestText(match.text, 220) : ''
}

function derivedWorkstreamState(detail: ProjectDetail): Record<WorkstreamStateField, string> {
  const latest = latestDigestAction(detail)
  const openLoop = openLoopDigest(detail)
  const waiting = currentWorkstreamTerminals().find(terminalNeedsInput)
  const running = currentWorkstreamTerminals().filter((view) => view.record.status === 'running')
  return {
    goal: detail.project.name,
    currentState: workstreamStatusNote(detail.project.id) || latest.value,
    blocker: waiting
      ? `${terminalLabel(waiting.record.kind)} is waiting for your input.`
      : '',
    nextAction: waiting
      ? `Review and answer the waiting ${terminalLabel(waiting.record.kind)} prompt.`
      : openLoop.tone !== 'muted' && openLoop.value !== latest.value
      ? openLoop.value
      : running.length
        ? `Check the active ${terminalLabel(running[0].record.kind)} terminal.`
        : 'Continue from the latest recorded session.',
    lastVerification: latestVerification(detail),
  }
}

function effectiveWorkstreamState(detail: ProjectDetail) {
  const derived = derivedWorkstreamState(detail)
  const stored = detail.project.state
  const legacyCurrentState = statusNotesByWorkstream.get(detail.project.id)?.trim()
  const value = (field: WorkstreamStateField) => {
    const saved = stored?.[field]?.trim()
    if (saved) return { value: saved, derived: false }
    if (field === 'currentState' && legacyCurrentState) return { value: legacyCurrentState, derived: true }
    return { value: derived[field], derived: true }
  }
  return {
    goal: value('goal'),
    currentState: value('currentState'),
    blocker: value('blocker'),
    nextAction: value('nextAction'),
    lastVerification: value('lastVerification'),
  }
}

function activeWorkstreamSummary() {
  const terminals = currentWorkstreamTerminals()
  const waiting = terminals.filter(terminalNeedsInput)
  const running = terminals.filter((view) => view.record.status === 'running')
  if (waiting.length) return `${terminalLabel(waiting[0].record.kind)} · waiting for you`
  if (running.length) return running.map((view) => terminalLabel(view.record.kind)).join(', ') + ' · running'
  return terminals.length ? 'No agent running · terminal history available' : 'No agent terminal attached'
}

function renderWorkstreamState(detail: ProjectDetail) {
  if (stateEditing) return
  const state = effectiveWorkstreamState(detail)
  const rows = [
    ['Goal', state.goal],
    ['Current', state.currentState],
    ['Blocker', state.blocker.value ? state.blocker : { value: 'No blocker recorded.', derived: true }],
    ['Next', state.nextAction],
    ['Last verified', state.lastVerification.value ? state.lastVerification : { value: 'No verification recorded.', derived: true }],
  ] as const
  workstreamStateSummary.innerHTML = [
    ...rows.map(([label, entry]) => `
      <div class="workstream-state-row">
        <span class="workstream-state-label">${esc(label)}</span>
        <span class="workstream-state-value${entry.derived ? ' derived' : ''}" title="${entry.derived ? 'Derived from current workstream activity until you save it.' : 'Saved workstream state.'}">${esc(entry.value)}</span>
      </div>
    `),
    `<div class="workstream-state-row"><span class="workstream-state-label">Active</span><span class="workstream-state-value">${esc(activeWorkstreamSummary())}</span></div>`,
  ].join('')
}

function setStateEditing(editing: boolean) {
  stateEditing = editing
  workstreamStateSummary.classList.toggle('hidden', editing)
  workstreamStateForm.classList.toggle('hidden', !editing)
  stateEditButton.classList.toggle('hidden', editing)
  stateSaveButton.classList.toggle('hidden', !editing)
  stateCancelButton.classList.toggle('hidden', !editing)
}

function editWorkstreamState() {
  if (!currentDetail) return
  const state = effectiveWorkstreamState(currentDetail)
  stateGoalInput.value = state.goal.value
  stateCurrentInput.value = state.currentState.value
  stateBlockerInput.value = currentDetail.project.state?.blocker ?? ''
  stateNextInput.value = state.nextAction.value
  stateVerificationInput.value = currentDetail.project.state?.lastVerification ?? state.lastVerification.value
  workstreamStateStatus.textContent = ''
  setStateEditing(true)
  stateGoalInput.focus()
}

function cancelWorkstreamStateEdit() {
  setStateEditing(false)
  workstreamStateStatus.textContent = ''
  if (currentDetail) renderWorkstreamState(currentDetail)
}

async function saveWorkstreamState() {
  if (!currentDetail) return
  const projectId = currentDetail.project.id
  stateSaveButton.disabled = true
  stateCancelButton.disabled = true
  workstreamStateStatus.textContent = 'Saving shared workstream state...'
  try {
    const response = await window.gogoagent.workstreams.updateState(projectId, {
      goal: stateGoalInput.value,
      currentState: stateCurrentInput.value,
      blocker: stateBlockerInput.value,
      nextAction: stateNextInput.value,
      lastVerification: stateVerificationInput.value,
    })
    projects = projects.map((project) => project.id === projectId ? response.project : project)
    currentDetail = { ...currentDetail, project: response.project }
    setCachedValue(projectDetailCache, projectId, currentDetail)
    if (statusNotesByWorkstream.delete(projectId)) {
      saveStringRecord(STATUS_NOTES_STORAGE_KEY, statusNotesByWorkstream)
    }
    setStateEditing(false)
    renderProjectsList()
    renderWorkstreamDigest(currentDetail)
    scheduleDecisionCard()
    workstreamStateStatus.textContent = `Saved${response.project.state?.updatedAt ? ` · ${fmtRelative(response.project.state.updatedAt)}` : ''}`
    void loadAttention()
  } catch (error) {
    workstreamStateStatus.textContent = `Save failed: ${(error as Error).message}`
  } finally {
    stateSaveButton.disabled = false
    stateCancelButton.disabled = false
  }
}

function terminalLabel(kind: TerminalKind) {
  if (kind === 'claude') return 'Claude'
  if (kind === 'codex') return 'Codex'
  return 'Shell'
}

function sessionAgentKind(session: SessionRecord): AgentTerminalKind | null {
  if (session.agentKind === 'claude' || session.agentKind === 'codex') return session.agentKind
  const title = session.title.toLowerCase()
  const transcriptPath = session.transcriptPath.toLowerCase()

  if (title.startsWith('claude terminal')) return 'claude'
  if (title.startsWith('codex terminal')) return 'codex'
  if (transcriptPath.includes('/.claude/') || transcriptPath.includes('\\.claude\\')) return 'claude'

  return null
}

function sessionContextKind(session: SessionRecord): AgentTerminalKind | 'shell' | 'unknown' {
  const agent = sessionAgentKind(session)
  if (agent) return agent
  if (session.title.toLowerCase().startsWith('shell terminal')) return 'shell'
  return 'unknown'
}

function sessionAllowedForBridgeTarget(session: SessionRecord, targetKind: AgentTerminalKind) {
  const source = sessionContextKind(session)
  if (targetKind === 'codex') return source === 'claude' && contextSharingSettings.claudeToCodex
  if (targetKind === 'claude') return source === 'codex' && contextSharingSettings.codexToClaude
  return false
}

function sessionsForBridgeTarget(detail: ProjectDetail, targetKind: AgentTerminalKind) {
  return detail.sessions.filter((session) => sessionAllowedForBridgeTarget(session, targetKind))
}

function hasAllowedCrossAgentContext(detail: ProjectDetail, targetKind: AgentTerminalKind) {
  return sessionsForBridgeTarget(detail, targetKind).length > 0
}

function isNativeClaudeSession(session: SessionRecord) {
  const transcriptPath = session.transcriptPath.toLowerCase()
  return !session.id.startsWith('terminal-')
    && (transcriptPath.includes('/.claude/projects/') || transcriptPath.includes('\\.claude\\projects\\'))
}

function latestClaudeResumeSessionId(detail: ProjectDetail | null) {
  if (!detail) return undefined
  return detail.sessions
    .filter(isNativeClaudeSession)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id
}

function latestCodexResumeSession(detail: ProjectDetail | null) {
  if (!detail) return undefined
  return detail.sessions
    .filter(isNativeCodexSession)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function isNativeCodexSession(session: SessionRecord) {
  return session.agentKind === 'codex' && !session.id.startsWith('terminal-')
}

function primaryWorkstreamAgent(detail: ProjectDetail): AgentTerminalKind | null {
  const sessions = [...detail.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const session of sessions) {
    const agent = sessionAgentKind(session)
    if (agent) return agent
  }
  return null
}

function setButtonLabel(button: HTMLButtonElement, label: string) {
  const labelElement = button.querySelector<HTMLElement>('.button-label')
  if (labelElement) {
    labelElement.textContent = label
    return
  }
  button.textContent = label
}

function runningWorkstreamAgentTerminal(kind: AgentTerminalKind) {
  return currentWorkstreamTerminals().find((view) => (
    view.record.kind === kind && view.record.status === 'running'
  ))
}

function renderWorkstreamLaunchLabels(detail: ProjectDetail | null) {
  if (!detail) {
    setButtonLabel(newClaudeButton, 'Claude')
    setButtonLabel(newCodexButton, 'Codex')
    newClaudeButton.classList.remove('active-toggle')
    newCodexButton.classList.remove('active-toggle')
    newClaudeButton.setAttribute('aria-pressed', 'false')
    newCodexButton.setAttribute('aria-pressed', 'false')
    newClaudeButton.title = 'Start Claude Code from this directory.'
    newCodexButton.title = 'Start Codex from this directory.'
    return
  }

  const primaryAgent = primaryWorkstreamAgent(detail)
  const runningClaude = runningWorkstreamAgentTerminal('claude')
  const runningCodex = runningWorkstreamAgentTerminal('codex')
  const claudeResumeSessionId = latestClaudeResumeSessionId(detail)
  const codexResumeSession = latestCodexResumeSession(detail)
  const claudeVerb = runningClaude ? 'Show' : claudeResumeSessionId ? 'Resume' : 'Start'
  const codexVerb = runningCodex ? 'Show' : codexResumeSession ? 'Resume' : primaryAgent === 'codex' ? 'Continue' : 'Start'

  setButtonLabel(newClaudeButton, `${claudeVerb} Claude`)
  setButtonLabel(newCodexButton, `${codexVerb} Codex`)
  newClaudeButton.classList.toggle('active-toggle', Boolean(runningClaude))
  newCodexButton.classList.toggle('active-toggle', Boolean(runningCodex))
  newClaudeButton.setAttribute('aria-pressed', runningClaude ? 'true' : 'false')
  newCodexButton.setAttribute('aria-pressed', runningCodex ? 'true' : 'false')
  const claudeCodexBridge = hasAllowedCrossAgentContext(detail, 'claude')
    ? ' A compact Codex memory bridge will be pasted for review.'
    : ''
  newClaudeButton.title = runningClaude
    ? 'Show the running Claude terminal attached to this workstream.'
    : claudeResumeSessionId
    ? 'Resume the latest Claude Code conversation with native claude --resume and attach the terminal here.'
    : 'Start Claude Code from this workstream repo. Use Paste context for a manual handoff if needed.'
  if (!runningClaude) newClaudeButton.title += claudeCodexBridge
  newCodexButton.title = runningCodex
    ? 'Show the running Codex terminal attached to this workstream.'
    : codexResumeSession
    ? 'Resume the latest Codex conversation with native codex resume and attach the terminal here.'
    : primaryAgent === 'codex'
    ? 'Start Codex and paste workstream resume context for review.'
    : hasAllowedCrossAgentContext(detail, 'codex')
      ? 'Start Codex from this workstream repo and paste a compact Claude memory bridge for review.'
      : 'Start Codex from this workstream repo.'
}

function updateGlobalLaunchControls() {
  globalCwdInput.disabled = globalLaunchInFlight
  globalBrowseButton.disabled = globalLaunchInFlight || window.gogoagent.system.remote
  globalUseCurrentButton.disabled = globalLaunchInFlight || !currentDetail
  newWorkstreamButton.disabled = globalLaunchInFlight
  for (const input of globalLaunchKindInputs) input.disabled = globalLaunchInFlight
}

function renderLabelControls() {
  labelWorkstreamsButton.disabled = labelJobInFlight
  labelWorkstreamsRetryButton.disabled = labelJobInFlight
  labelWorkstreamsRetryButton.classList.toggle('hidden', failedLabelProjectIds.length === 0)
}

function pathBasename(value: string) {
  const normalized = value.replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? value
}

function writeTerminalData(view: TerminalView, data: string, logBytes?: number) {
  if (logBytes !== undefined) view.record.logBytes = logBytes
  if (!data) return false
  const needsInputSuppressionChanged = updateTerminalNeedsInputSuppression(view, data)
  if (view.logRestored) {
    queueTerminalWrite(view, data, { scroll: true })
    return needsInputSuppressionChanged
  }
  view.pendingData.push({ data, logBytes })
  return needsInputSuppressionChanged
}

function createTerminalFitAddon(terminal: InstanceType<typeof window.Terminal>) {
  const FitAddon = window.FitAddon?.FitAddon
  if (!FitAddon || !terminal.loadAddon) return undefined
  const addon = new FitAddon()
  terminal.loadAddon(addon)
  return addon
}

function queueTerminalWrite(view: TerminalView, data: string, options: { scroll?: boolean } = {}) {
  if (!data) return
  view.pendingWrites.push(data)
  view.scrollAfterWrite = view.scrollAfterWrite || options.scroll
  if (view.writeFrame !== null) return
  view.writeFrame = window.requestAnimationFrame(() => {
    view.writeFrame = null
    if (terminalViews.get(view.record.id) !== view) return
    const chunk = view.pendingWrites.join('')
    view.pendingWrites = []
    if (!chunk) return
    view.terminal.write(chunk)
    if (view.scrollAfterWrite) {
      view.scrollAfterWrite = false
      scrollTerminalToBottom(view)
    }
  })
}

function scrollTerminalViewportToBottom(view: TerminalView) {
  view.terminal.scrollToBottom?.()
  const viewport = view.element.querySelector<HTMLElement>('.xterm-viewport')
  if (viewport) viewport.scrollTop = viewport.scrollHeight
}

function scrollTerminalToBottom(view: TerminalView, options: { settle?: boolean } = {}) {
  const generation = ++view.scrollGeneration
  const delays = options.settle ? TERMINAL_SCROLL_SETTLE_DELAYS_MS : [0]
  for (const delay of delays) {
    const scroll = () => window.requestAnimationFrame(() => {
      if (terminalViews.get(view.record.id) !== view) return
      if (view.scrollGeneration !== generation) return
      scrollTerminalViewportToBottom(view)
    })
    if (delay > 0) window.setTimeout(scroll, delay)
    else scroll()
  }
  return generation
}

function focusTerminalWithoutPageScroll(view: TerminalView) {
  const input = view.element.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
  if (input) {
    input.focus({ preventScroll: true })
    return
  }
  const previousScrollTop = contentRoot.scrollTop
  view.terminal.focus()
  contentRoot.scrollTop = previousScrollTop
}

function revealTerminalBottom(view: TerminalView) {
  const scrollTarget = terminalActions.classList.contains('hidden') ? view.element : terminalActions
  const targetRect = scrollTarget.getBoundingClientRect()
  const contentRect = contentRoot.getBoundingClientRect()
  const overflow = targetRect.bottom - contentRect.bottom + TERMINAL_BOTTOM_GUTTER_PX
  if (overflow > 0) contentRoot.scrollTop += overflow
}

function settleTerminalAtBottom(
  view: TerminalView | undefined,
  options: { reveal?: boolean; focus?: boolean } = {},
) {
  if (!view) return
  const generation = scrollTerminalToBottom(view, { settle: true })
  const isCurrent = () =>
    terminalViews.get(view.record.id) === view &&
    view.scrollGeneration === generation &&
    view.record.id === activeTerminalId &&
    !view.element.classList.contains('hidden')
  window.requestAnimationFrame(() => {
    if (!isCurrent()) return
    if (options.focus) focusTerminalWithoutPageScroll(view)
    if (options.reveal) revealTerminalBottom(view)
  })
  if (options.reveal) {
    window.setTimeout(() => {
      if (!isCurrent()) return
      revealTerminalBottom(view)
    }, TERMINAL_SCROLL_SETTLE_DELAYS_MS[TERMINAL_SCROLL_SETTLE_DELAYS_MS.length - 1])
  }
}

function measureTerminalCell(view?: TerminalView) {
  const renderedRow = view?.element.querySelector<HTMLElement>('.xterm-rows > div')
  const renderedRowRect = renderedRow?.getBoundingClientRect()
  const probe = document.createElement('span')
  probe.textContent = '0123456789'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.whiteSpace = 'pre'
  probe.style.fontFamily = TERMINAL_FONT_FAMILY
  probe.style.fontSize = `${TERMINAL_FONT_SIZE}px`
  probe.style.lineHeight = String(TERMINAL_LINE_HEIGHT)
  terminalCard.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return {
    width: rect.width > 0 ? rect.width / 10 : 8,
    height: renderedRowRect && renderedRowRect.height > 0
      ? renderedRowRect.height
      : rect.height > 0 ? rect.height : TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT,
  }
}

function preferredTerminalSize(view?: TerminalView) {
  const pane = view?.element
    ?? (activeTerminalId ? terminalViews.get(activeTerminalId)?.element : terminalHost.querySelector<HTMLElement>('.terminal-pane'))
  const paneStyle = pane ? getComputedStyle(pane) : null
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
  const fallbackPanePadding = 0.55 * rootFontSize
  const paddingX = paneStyle
    ? parseFloat(paneStyle.paddingLeft || '0') + parseFloat(paneStyle.paddingRight || '0')
    : fallbackPanePadding * 2
  const paddingY = paneStyle
    ? parseFloat(paneStyle.paddingTop || '0') + parseFloat(paneStyle.paddingBottom || '0')
    : fallbackPanePadding * 2

  const hostRect = terminalHost.getBoundingClientRect()
  let width = pane && pane.clientWidth > 0 ? pane.clientWidth - paddingX : hostRect.width - paddingX
  let height = pane && pane.clientHeight > 0 ? pane.clientHeight - paddingY : hostRect.height - paddingY

  if (width < 120) {
    const cardStyle = getComputedStyle(terminalCard)
    width = terminalCard.clientWidth
      - parseFloat(cardStyle.paddingLeft || '0')
      - parseFloat(cardStyle.paddingRight || '0')
  }
  if (width < 120) {
    const contentStyle = getComputedStyle(contentRoot)
    width = contentRoot.clientWidth
      - parseFloat(contentStyle.paddingLeft || '0')
      - parseFloat(contentStyle.paddingRight || '0')
  }
  if (width < 120) width = Math.max(480, window.innerWidth - 460)
  if (height < 120) height = 520

  const cell = measureTerminalCell(view)
  const availableWidth = Math.max(0, width - TERMINAL_SCROLLBAR_GUTTER_PX)
  const availableRows = Math.floor(Math.max(0, height - TERMINAL_BOTTOM_GUTTER_PX) / cell.height)

  return {
    cols: Math.max(40, Math.floor(availableWidth / cell.width)),
    rows: Math.max(12, availableRows - TERMINAL_BOTTOM_RESERVE_ROWS),
  }
}

function terminalScreenOverflowRows(view: TerminalView) {
  const xterm = view.element.querySelector<HTMLElement>('.xterm')
  const screen = view.element.querySelector<HTMLElement>('.xterm-screen')
  if (!xterm || !screen) return 0
  const visibleHeight = xterm.clientHeight
  const screenHeight = screen.getBoundingClientRect().height
  if (visibleHeight <= 0 || screenHeight <= 0) return 0
  const overflowPx = screenHeight + TERMINAL_BOTTOM_GUTTER_PX - visibleHeight
  if (overflowPx <= 1) return 0
  return Math.ceil(overflowPx / Math.max(1, measureTerminalCell(view).height))
}

function resizeTerminalToFit(view: TerminalView, cols: number, initialRows: number) {
  let rows = initialRows
  for (let pass = 0; pass < TERMINAL_FIT_MAX_TRIM_PASSES; pass += 1) {
    view.terminal.resize(cols, rows)
    const overflowRows = terminalScreenOverflowRows(view)
    if (overflowRows <= 0) return { cols, rows }
    const nextRows = Math.max(12, rows - overflowRows - 1)
    if (nextRows === rows) return { cols, rows }
    rows = nextRows
  }
  return { cols, rows }
}

function fitTerminalWithAddon(view: TerminalView) {
  if (!view.fitAddon) return undefined
  try {
    view.fitAddon.fit()
    return resizeTerminalToFit(view, view.terminal.cols, view.terminal.rows)
  } catch {
    return undefined
  }
}

function fitTerminalView(view: TerminalView | undefined) {
  if (!view) return
  if (view.element.classList.contains('hidden') || terminalHost.classList.contains('hidden')) return
  let fitted = fitTerminalWithAddon(view)
  if (!fitted) {
    const fallback = preferredTerminalSize(view)
    fitted = resizeTerminalToFit(view, fallback.cols, fallback.rows)
  }
  scrollTerminalToBottom(view)
  if (view.record.status === 'running') {
    void window.gogoagent.terminals.resize(view.record.id, fitted.cols, fitted.rows)
  }
}

function scheduleTerminalFit(view?: TerminalView) {
  const generation = ++terminalFitGeneration
  if (terminalFitFrame !== null) window.cancelAnimationFrame(terminalFitFrame)
  terminalFitFrame = window.requestAnimationFrame(() => {
    if (generation !== terminalFitGeneration) return
    terminalFitFrame = null
    const target = view ?? (activeTerminalId ? terminalViews.get(activeTerminalId) : undefined)
    fitTerminalView(target)
    if (target) {
      for (const delay of TERMINAL_REFIT_DELAYS_MS) {
        window.setTimeout(() => {
          if (generation !== terminalFitGeneration) return
          if (terminalViews.get(target.record.id) !== target || target.record.id !== activeTerminalId) return
          fitTerminalView(target)
        }, delay)
      }
    }
  })
}

async function restoreTerminalLog(view: TerminalView) {
  let replayBytes = 0
  try {
    const replay = await window.gogoagent.terminals.readLog(view.record.id)
    if (terminalViews.get(view.record.id) !== view) return
    replayBytes = replay.bytes
    view.record.logBytes = replay.bytes
    if (replay.logPath) view.record.logPath = replay.logPath
    if (replay.truncated) {
      view.terminal.write('\x1b[90m[older terminal log omitted from replay]\x1b[0m\r\n')
    }
    if (replay.data) {
      view.terminal.write(replay.data)
      if (updateTerminalNeedsInputSuppression(view, replay.data)) renderProjectsList()
    } else {
      view.terminal.write(`\x1b[90mgogoagent terminal · ${view.record.cwd}\x1b[0m\r\n`)
    }
  } catch (error) {
    if (terminalViews.get(view.record.id) !== view) return
    view.record.logError = (error as Error).message
    view.terminal.write(`\x1b[90mgogoagent terminal · ${view.record.cwd}\x1b[0m\r\n`)
    view.terminal.write(`\x1b[90m[terminal log replay failed: ${(error as Error).message}]\x1b[0m\r\n`)
  } finally {
    if (terminalViews.get(view.record.id) !== view) return
    view.logRestored = true
    const pending = view.pendingData.splice(0)
    for (const entry of pending) {
      if (entry.logBytes === undefined || entry.logBytes > replayBytes) {
        view.terminal.write(entry.data)
      }
    }
    scrollTerminalToBottom(view, { settle: true })
    renderTerminalTabs()
  }
}

function ensureTerminalView(record: TerminalSessionRecord) {
  const existing = terminalViews.get(record.id)
  if (existing) {
    existing.record = record
    renderTerminalTabs()
    return existing
  }

  const terminal = new window.Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: TERMINAL_FONT_SIZE,
    lineHeight: TERMINAL_LINE_HEIGHT,
    scrollback: 5000,
    theme: {
      background: '#090d18',
      foreground: '#dbe7fb',
      cursor: '#77a1ff',
      selectionBackground: '#2d406f',
      scrollbarSliderBackground: 'rgba(152,166,195,0.62)',
      scrollbarSliderHoverBackground: 'rgba(201,209,222,0.78)',
      scrollbarSliderActiveBackground: 'rgba(201,209,222,0.92)',
    },
  })
  const element = document.createElement('div')
  element.className = 'terminal-pane hidden'
  element.dataset.terminalId = record.id
  terminalHost.appendChild(element)
  const fitAddon = createTerminalFitAddon(terminal)
  terminal.open(element)
  terminal.onData((data) => {
    const view = terminalViews.get(record.id)
    if (view) recordTerminalInput(view, data)
  })
  terminal.attachCustomKeyEventHandler?.((event) => {
    if (event.type !== 'keydown') return true
    const key = event.key.toLowerCase()
    const modifier = event.ctrlKey || event.metaKey
    const view = terminalViews.get(record.id)
    if (!modifier || !view) return true
    if (key === 'c' && copyTerminalSelection(view)) return false
    if (key === 'v' && pasteClipboardIntoTerminal(view)) return false
    return true
  })

  const view: TerminalView = {
    record,
    terminal,
    fitAddon,
    element,
    logRestored: false,
    pendingData: [],
    pendingWrites: [],
    writeFrame: null,
    scrollGeneration: 0,
  }
  terminalViews.set(record.id, view)
  void restoreTerminalLog(view)
  renderTerminalTabs()
  return view
}

function selectTerminal(id: string | null) {
  activeTerminalId = id
  const view = id ? terminalViews.get(id) : undefined
  const workstreamId = view?.record.workstreamId
  if (workstreamId && lastViewedTerminalIdsByWorkstream.get(workstreamId) !== view.record.id) {
    lastViewedTerminalIdsByWorkstream.set(workstreamId, view.record.id)
    saveStringRecord(LAST_VIEWED_TERMINALS_STORAGE_KEY, lastViewedTerminalIdsByWorkstream)
  }
  if (workstreamId && workstreamId === selectedProjectId) {
    void window.gogoagent.projects.markViewed(workstreamId, id ?? undefined).catch(() => undefined)
  }
  for (const view of terminalViews.values()) {
    view.element.classList.toggle('hidden', view.record.id !== id)
  }
  renderTerminalTabs()
  if (id) {
    settleTerminalAtBottom(view, { reveal: true, focus: true })
  }
}

function renderTerminalTabs(options: { fit?: boolean } = {}) {
  const terminals = currentWorkstreamTerminals()
  terminalEmpty.classList.toggle('hidden', terminals.length > 0)
  terminalActions.classList.toggle('hidden', terminals.length === 0)
  terminalHost.classList.toggle('hidden', terminals.length === 0)

  if (!terminals.length) {
    terminalTabs.innerHTML = ''
    activeTerminalId = null
    renderTerminalStatus()
    if (currentDetail) renderWorkstreamDigest(currentDetail)
    renderWorkstreamLaunchLabels(currentDetail)
    return
  }

  const rememberedTerminalId = selectedProjectId
    ? lastViewedTerminalIdsByWorkstream.get(selectedProjectId)
    : undefined
  const rememberedTerminal = rememberedTerminalId
    ? terminals.find((view) => view.record.id === rememberedTerminalId)
    : undefined
  if (rememberedTerminal) {
    activeTerminalId = rememberedTerminal.record.id
  } else if (!activeTerminalId || !terminals.some((view) => view.record.id === activeTerminalId)) {
    activeTerminalId = terminals.find(terminalNeedsInput)?.record.id ?? terminals[terminals.length - 1].record.id
  }

  terminalTabs.innerHTML = terminals
    .map((view) => {
      const selected = view.record.id === activeTerminalId ? ' selected' : ''
      const status = view.record.status === 'running'
        ? terminalNeedsInput(view) ? 'needs input' : 'running'
        : `exited${view.record.exitCode !== undefined ? ` ${view.record.exitCode}` : ''}`
      return `
        <button class="terminal-tab${selected}" type="button" data-terminal-id="${esc(view.record.id)}" title="Show ${esc(view.record.title)}. Status: ${esc(status)}.">
          <span class="terminal-tab-title">${iconMarkup(terminalKindIcon(view.record.kind), 'inline-icon')}${esc(view.record.title)}</span>
          <small>${esc(terminalLabel(view.record.kind))} · ${esc(status)}</small>
        </button>
      `
    })
    .join('')

  terminalTabs.querySelectorAll<HTMLButtonElement>('.terminal-tab').forEach((button) => {
    button.addEventListener('click', () => {
      selectTerminal(button.dataset.terminalId ?? null)
    })
  })

  for (const view of terminalViews.values()) {
    view.element.classList.toggle('hidden', view.record.id !== activeTerminalId)
  }
  if (activeTerminalId && options.fit !== false) {
    const view = terminalViews.get(activeTerminalId)
    scheduleTerminalFit(view)
    settleTerminalAtBottom(view)
  }
  renderTerminalStatus()
  if (currentDetail) renderWorkstreamDigest(currentDetail)
  renderWorkstreamLaunchLabels(currentDetail)
}

function renderDesktopDecisionReceipt(receipt: TerminalDecisionReceipt | null, waiting: boolean) {
  desktopDecisionReceipt.classList.toggle('hidden', !receipt || waiting)
  if (!receipt || waiting) return
  desktopReceiptTime.textContent = fmtRelative(receipt.sentAt)
  desktopReceiptChoice.textContent = `${receipt.choiceLabel} · sent key ${receipt.choiceValue}`
  desktopReceiptStatus.textContent = receipt.outputAt
    ? 'New terminal output is available. Review whether the agent accepted the choice.'
    : receipt.terminalStatus === 'exited'
      ? 'The session ended without further output.'
      : 'Sent to terminal. Waiting for new output; acceptance is not confirmed.'
}

desktopReceiptOutputButton.addEventListener('click', () => {
  settleTerminalAtBottom(activeTerminalId ? terminalViews.get(activeTerminalId) : undefined, { reveal: true, focus: true })
})

function scheduleDecisionCard() {
  const view = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
  if (decisionActiveTerminalId !== activeTerminalId) {
    decisionActiveTerminalId = activeTerminalId
    decisionRequestKey = ''
    displayedDecisionId = null
    decisionSubmittedId = null
    desktopDecisionStatus.textContent = ''
    desktopDecisionChoices.replaceChildren()
    if (decisionRequestTimer !== null) {
      window.clearTimeout(decisionRequestTimer)
      decisionRequestTimer = null
    }
  }
  if (!view || view.record.kind === 'shell') {
    desktopDecisionCard.classList.add('hidden')
    desktopDecisionReceipt.classList.add('hidden')
    decisionRequestKey = ''
    if (decisionRequestTimer !== null) {
      window.clearTimeout(decisionRequestTimer)
      decisionRequestTimer = null
    }
    return
  }
  const waiting = terminalNeedsInput(view)
  desktopDecisionCard.classList.toggle('hidden', !waiting)
  const matchingDetail = currentDetail?.project.id === view.record.workstreamId ? currentDetail : null
  const saved = matchingDetail?.project.state
  desktopDecisionContext.textContent = [
    `Goal: ${saved?.goal?.trim() || matchingDetail?.project.name || 'No goal saved.'}`,
    `Saved next step: ${saved?.nextAction?.trim() || 'Not recorded.'}`,
  ].join(' · ')
  if (waiting && !decisionRequestKey) desktopDecisionPrompt.textContent = 'Loading the current prompt…'
  const key = `${view.record.id}:${view.record.logBytes}:${view.record.needsInput}:${view.record.status}`
  if (key === decisionRequestKey || decisionRequestTimer !== null) return
  decisionRequestTimer = window.setTimeout(() => {
    decisionRequestTimer = null
    decisionRequestKey = key
    void window.gogoagent.terminals.getDecision(view.record.id).then(({ waiting: sidecarWaiting, prompt, receipt }) => {
      if (activeTerminalId !== view.record.id) return
      desktopDecisionCard.classList.toggle('hidden', !sidecarWaiting || !terminalNeedsInput(view))
      renderDesktopDecisionReceipt(receipt, sidecarWaiting && terminalNeedsInput(view))
      if (!sidecarWaiting || !terminalNeedsInput(view) || !prompt) {
        desktopDecisionPrompt.textContent = 'Review the latest terminal output for the exact request.'
        desktopDecisionChoices.replaceChildren()
        return
      }
      if (displayedDecisionId !== prompt.id) {
        displayedDecisionId = prompt.id
        desktopDecisionStatus.textContent = ''
      }
      desktopDecisionPrompt.textContent = prompt.excerpt || 'Review the latest terminal output for the exact request.'
      desktopDecisionChoices.replaceChildren()
      if (decisionSubmittedId !== prompt.id) decisionSubmittedId = null
      for (const choice of prompt.choices) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = choice.label
        button.disabled = decisionSending || decisionSubmittedId === prompt.id
        button.addEventListener('click', async () => {
          if (decisionSending || decisionSubmittedId === prompt.id) return
          decisionSending = true
          desktopDecisionStatus.textContent = 'Sending choice…'
          desktopDecisionChoices.querySelectorAll<HTMLButtonElement>('button').forEach((entry) => { entry.disabled = true })
          try {
            const response = await window.gogoagent.terminals.respondChoice(view.record.id, choice.value, prompt.id)
            decisionSubmittedId = prompt.id
            desktopDecisionCard.classList.add('hidden')
            renderDesktopDecisionReceipt(response.receipt, false)
            desktopDecisionStatus.textContent = 'Choice sent to terminal.'
            decisionRequestKey = ''
          } catch (error) {
            desktopDecisionStatus.textContent = error instanceof Error ? error.message : String(error)
            decisionRequestKey = ''
          } finally {
            decisionSending = false
            scheduleDecisionCard()
          }
        })
        desktopDecisionChoices.append(button)
      }
    }).catch((error) => {
      if (activeTerminalId !== view.record.id) return
      desktopDecisionPrompt.textContent = 'Prompt unavailable. Review the terminal output below.'
      desktopDecisionStatus.textContent = error instanceof Error ? error.message : String(error)
      decisionRequestKey = ''
    })
  }, 120)
}

function renderTerminalStatus() {
  scheduleDecisionCard()
  const view = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
  if (!view) {
    terminalStatus.textContent = 'No terminal selected.'
    terminalCopyContextButton.disabled = !currentDetail
    terminalPasteContextButton.disabled = true
    terminalCopyLogButton.disabled = true
    terminalCloseButton.disabled = true
    terminalCloseButton.classList.remove('danger-button')
    terminalCloseButton.innerHTML = buttonContent('x', 'Close')
    return
  }

  const pasteHint = view.record.kind === 'shell'
    ? ' · paste context is only enabled for Claude/Codex tabs'
    : ''
  const logHint = view.record.logError
    ? ` · log error: ${view.record.logError}`
    : view.record.logPath
      ? ` · log ${fmtBytes(view.record.logBytes)}`
      : ''
  terminalStatus.textContent = `${view.record.status} · ${compactPath(view.record.cwd)}${logHint}${pasteHint}`
  terminalCopyContextButton.disabled = !currentDetail
  terminalPasteContextButton.disabled = !currentDetail || view.record.status !== 'running' || view.record.kind === 'shell'
  terminalCopyLogButton.disabled = !view.record.logPath || view.record.logBytes === 0
  const isRunning = view.record.status === 'running'
  terminalCloseButton.disabled = false
  terminalCloseButton.classList.toggle('danger-button', isRunning)
  terminalCloseButton.innerHTML = buttonContent(isRunning ? 'square' : 'x', isRunning ? 'End' : 'Close')
  terminalCloseButton.title = isRunning
    ? view.record.kind === 'shell'
      ? 'Terminate this shell process and close the terminal tab.'
      : `Terminate the running ${terminalLabel(view.record.kind)} process and close the terminal tab.`
    : view.record.userInteracted
      ? 'Close this terminal tab after saving its log metadata.'
      : 'Close this draft terminal tab. It will not be indexed unless it had user input.'
}

async function openTerminalWorkstream(record: TerminalSessionRecord) {
  const view = ensureTerminalView(record)
  if (!record.workstreamId) {
    showDraftWorkstream(view)
    selectTerminal(record.id)
    return
  }

  await loadAllProjects()
  if (projects.some((project) => project.id === record.workstreamId)) {
    await selectProject(record.workstreamId)
  } else {
    showDraftWorkstream(view)
  }
  selectTerminal(record.id)
}

async function activateOrCreateAgentTerminal(kind: AgentTerminalKind) {
  const running = currentDetail ? runningWorkstreamAgentTerminal(kind) : undefined
  if (running) {
    selectTerminal(running.record.id)
    return
  }
  await createTerminal(kind)
}

function continuationRepositoryMessage(review: ContinuationReview) {
  const { repository, detail } = review
  if (!repository.isRepository) {
    return { warning: true, text: repository.summary }
  }
  const warnings: string[] = []
  if (detail.project.branch && repository.branch && detail.project.branch !== repository.branch) {
    warnings.push(`workstream branch is ${detail.project.branch}, but the repo is on ${repository.branch}`)
  }
  if (repository.changedFileCount > 0) {
    warnings.push(`${repository.changedFileCount} uncommitted file${repository.changedFileCount === 1 ? '' : 's'}`)
  }
  const previousFingerprint = lastContinuationRepositories.get(detail.project.id)
  if (previousFingerprint && repository.fingerprint && previousFingerprint !== repository.fingerprint) {
    warnings.push('repo state changed since gogoagent last prepared a continuation on this device')
  }
  return {
    warning: warnings.length > 0,
    text: warnings.length ? `${repository.summary}. Check before continuing: ${warnings.join('; ')}.` : `Repository ready: ${repository.summary}.`,
  }
}

function rememberContinuationRepository(detail: ProjectDetail, repository: RepositoryState) {
  if (!repository.fingerprint) return
  lastContinuationRepositories.set(detail.project.id, repository.fingerprint)
  saveStringRecord(LAST_CONTINUATION_REPOSITORIES_STORAGE_KEY, lastContinuationRepositories)
}

function reviewContinuation(
  review: ContinuationReview,
  mode: 'launch' | 'paste' = 'launch',
): Promise<ContinuationResult> {
  const label = terminalLabel(review.targetKind)
  const verb = review.resumeSessionId ? 'Resume' : 'Start'
  const repositoryMessage = continuationRepositoryMessage(review)
  continuationTitle.textContent = mode === 'paste' ? `Review context for ${label}` : `${verb} ${label}`
  continuationMeta.textContent = [
    review.detail.project.name,
    compactPath(review.detail.project.repoRoot),
    review.resumeSessionTitle,
  ].filter(Boolean).join(' · ')
  continuationRepositoryState.textContent = repositoryMessage.text
  continuationRepositoryState.classList.toggle('warning', repositoryMessage.warning)
  continuationContext.value = review.context ?? ''
  continuationContextLabel.classList.toggle('hidden', !review.context)
  continuationSecondaryButton.classList.toggle('hidden', !review.context)
  continuationSecondaryButton.textContent = mode === 'paste' ? 'Copy instead' : `${verb} without context`
  continuationPrimaryButton.textContent = mode === 'paste'
    ? `Paste into ${label}`
    : review.context ? `${verb} ${label} and paste context` : `${verb} ${label}`

  return new Promise((resolve) => {
    let settled = false
    const finish = (decision: ContinuationDecision) => {
      if (settled) return
      settled = true
      continuationCancelButton.onclick = null
      continuationSecondaryButton.onclick = null
      continuationPrimaryButton.onclick = null
      continuationDialog.removeEventListener('close', closed)
      if (continuationDialog.open) continuationDialog.close()
      resolve({ decision, context: continuationContext.value.trim() || undefined })
    }
    const closed = () => finish('cancel')
    continuationCancelButton.onclick = () => finish('cancel')
    continuationSecondaryButton.onclick = () => finish(mode === 'paste' ? 'copy' : 'without-context')
    continuationPrimaryButton.onclick = () => finish('with-context')
    continuationDialog.addEventListener('close', closed)
    continuationDialog.showModal()
    window.setTimeout(() => (review.context ? continuationContext : continuationPrimaryButton).focus(), 0)
  })
}

async function prepareContinuation(
  detail: ProjectDetail,
  targetKind: AgentTerminalKind,
  resumeSessionId: string | undefined,
  contextKind: 'resume' | 'bridge' | null,
  resumeSessionTitle?: string,
) {
  const [repository, context] = await Promise.all([
    window.gogoagent.files.inspectRepository(detail.project.repoRoot),
    contextKind === 'bridge'
      ? buildBridgeContext(detail, targetKind)
      : contextKind === 'resume'
        ? buildResumeContext(detail)
        : Promise.resolve(undefined),
  ])
  return { detail, targetKind, resumeSessionId, resumeSessionTitle, context, repository } satisfies ContinuationReview
}

async function createTerminal(kind: TerminalKind, selectedCodexSessionId?: string) {
  const label = terminalLabel(kind)
  if (selectedCodexSessionId && !currentDetail) return null
  if (!currentDetail) {
    const activeView = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
    const cwd = activeView?.record.cwd ?? terminalOnlyCwd ?? globalCwdInput.value.trim()
    try {
      terminalStatus.textContent = `Starting ${label}...`
      const size = preferredTerminalSize()
      const record = await window.gogoagent.terminals.create({
        kind,
        cwd: cwd || undefined,
        title: `${label} · ${cwd ? pathBasename(cwd) : 'Home'}`,
        cols: size.cols,
        rows: size.rows,
      })
      await openTerminalWorkstream(record)
      globalLaunchStatus.textContent = `Started ${label} in ${record.cwd}.`
      return record
    } catch (error) {
      terminalStatus.textContent = `Launch failed: ${(error as Error).message}`
      globalLaunchStatus.textContent = `Launch failed: ${(error as Error).message}`
      return null
    }
  }

  try {
    const detailAtLaunch = currentDetail
    const codexResumeSession = kind === 'codex'
      ? selectedCodexSessionId
        ? detailAtLaunch.sessions.find((session) => session.id === selectedCodexSessionId && isNativeCodexSession(session))
        : latestCodexResumeSession(detailAtLaunch)
      : undefined
    if (selectedCodexSessionId && !codexResumeSession) {
      terminalStatus.textContent = 'That Codex session is no longer in this workstream. Refresh and try again.'
      return null
    }
    const resumeSessionId = kind === 'claude'
      ? latestClaudeResumeSessionId(detailAtLaunch)
      : codexResumeSession?.id
    const primaryAgent = primaryWorkstreamAgent(detailAtLaunch)
    const newerClaudeSession = codexResumeSession && detailAtLaunch.sessions.some((session) => (
      sessionAgentKind(session) === 'claude' && session.updatedAt > codexResumeSession.updatedAt
    ))
    const launchContextKind: 'resume' | 'bridge' | null =
      kind === 'codex' && !resumeSessionId && primaryAgent === 'codex'
        ? 'resume'
        : (kind === 'claude' || (kind === 'codex' && (!resumeSessionId || newerClaudeSession)))
          && hasAllowedCrossAgentContext(detailAtLaunch, kind)
          ? 'bridge'
          : null
    let reviewedContext: string | undefined
    let repository: RepositoryState | undefined
    if (kind === 'claude' || kind === 'codex') {
      terminalStatus.textContent = 'Preparing continuation review...'
      const review = await prepareContinuation(
        detailAtLaunch, kind, resumeSessionId, launchContextKind, codexResumeSession?.title,
      )
      repository = review.repository
      const result = await reviewContinuation(review)
      if (result.decision === 'cancel') {
        terminalStatus.textContent = 'Continuation canceled.'
        return null
      }
      if (result.decision === 'with-context') reviewedContext = result.context
    }
    terminalStatus.textContent = `${resumeSessionId ? 'Resuming' : 'Starting'} ${label}...`
    const size = preferredTerminalSize()
    const record = await window.gogoagent.terminals.create({
      kind,
      cwd: codexResumeSession?.cwd ?? detailAtLaunch.project.repoRoot,
      workstreamId: detailAtLaunch.project.id,
      gitBranch: detailAtLaunch.project.branch,
      resumeSessionId,
      title: `${label} · ${detailAtLaunch.project.name}`,
      cols: size.cols,
      rows: size.rows,
    })
    ensureTerminalView(record)
    selectTerminal(record.id)
    if (repository) rememberContinuationRepository(detailAtLaunch, repository)
    if (reviewedContext) {
      terminalStatus.textContent = launchContextKind === 'resume'
        ? 'Preparing Codex resume context...'
        : `Preparing ${label} memory bridge...`
      window.setTimeout(() => {
        void pasteResumeContextIntoTerminal(record.id, detailAtLaunch, {
          contextKind: launchContextKind ?? undefined,
          flash: false,
          targetKind: kind === 'claude' || kind === 'codex' ? kind : undefined,
          preparedContext: reviewedContext,
        })
          .then((pasted) => {
            if (pasted) {
              terminalStatus.textContent = launchContextKind === 'resume'
                ? 'Codex resume context pasted. Review and send when ready.'
                : `${label} memory bridge pasted. Review and send when ready.`
            }
          })
          .catch((error) => {
            terminalStatus.textContent = `${label} context paste failed: ${(error as Error).message}`
          })
      }, 800)
    }
    return record
  } catch (error) {
    terminalStatus.textContent = `Launch failed: ${(error as Error).message}`
    return null
  }
}

function showDraftWorkstream(view?: TerminalView) {
  projectSelectionVersion++
  const cwd = view?.record.cwd ?? globalCwdInput.value.trim()
  if (view) terminalOnlyCwd = view.record.cwd
  else terminalOnlyCwd = null
  selectedProjectId = null
  currentDetail = null
  activeTerminalId = view?.record.id ?? null
  setRenameEditing(false)
  renameStatus.textContent = ''
  renderProjectsList()
  detailEmpty.classList.add('hidden')
  detailRoot.classList.remove('hidden')
  detailRoot.classList.add('terminal-only')
  detailRoot.classList.remove('terminal-focus')
  detailSubtitle.textContent = 'Draft workstream'
  detailTitle.textContent = view?.record.title ?? (cwd ? pathBasename(cwd) || cwd : 'New workstream')
  detailMeta.textContent = view
    ? `${compactPath(view.record.cwd)} · not saved yet`
    : `${cwd ? compactPath(cwd) : 'Default directory'} · not saved yet`
  detailMeta.title = view?.record.cwd ?? cwd
  terminalHelp.textContent = 'Choose Claude, Codex, or Shell to begin.'
  renderWorkstreamLaunchLabels(null)
  renderTerminalFocusButton(null)
  refineStatus.textContent = ''
  renderTerminalTabs()
  if (view) scheduleTerminalFit(view)
  updateTimelineControls()
  updateGlobalLaunchControls()
}

function clearDirectorySuggestions() {
  cwdCompletionRequest += 1
  if (cwdCompletionTimer !== null) {
    window.clearTimeout(cwdCompletionTimer)
    cwdCompletionTimer = null
  }
  cwdCompletionState = null
  globalCwdSuggestions.innerHTML = ''
  globalCwdSuggestions.classList.add('hidden')
  globalCwdInput.setAttribute('aria-expanded', 'false')
  globalCwdInput.removeAttribute('aria-activedescendant')
}

function renderDirectorySuggestions() {
  const state = cwdCompletionState
  if (!state?.completions.length) {
    clearDirectorySuggestions()
    return
  }

  const heading = state.kind === 'recent' ? 'Recent directories' : 'Matching directories'
  globalCwdSuggestions.innerHTML = [
    `<div class="directory-suggestion-heading" role="presentation">${heading}</div>`,
    ...state.completions.map((completion, index) => `
      <button
        id="global-cwd-suggestion-${index}"
        class="directory-suggestion${index === state.index ? ' active' : ''}"
        type="button"
        role="option"
        aria-selected="${index === state.index ? 'true' : 'false'}"
        data-directory-index="${index}"
        title="${esc(completion)}"
      >${esc(compactPath(completion))}</button>
    `),
  ].join('')
  globalCwdSuggestions.classList.remove('hidden')
  globalCwdInput.setAttribute('aria-expanded', 'true')
  if (state.index >= 0) {
    globalCwdInput.setAttribute('aria-activedescendant', `global-cwd-suggestion-${state.index}`)
  } else {
    globalCwdInput.removeAttribute('aria-activedescendant')
  }

  globalCwdSuggestions.querySelectorAll<HTMLButtonElement>('.directory-suggestion').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.preventDefault())
    button.addEventListener('click', () => acceptDirectorySuggestion(Number(button.dataset.directoryIndex)))
  })
}

function showRecentDirectorySuggestions() {
  const completions = readRecentDirectories()
  if (!completions.length) {
    clearDirectorySuggestions()
    return
  }
  cwdCompletionState = {
    completions,
    index: -1,
    kind: 'recent',
  }
  renderDirectorySuggestions()
}

async function refreshDirectorySuggestions() {
  const source = globalCwdInput.value
  if (!source.trim()) {
    showRecentDirectorySuggestions()
    return
  }

  const requestId = ++cwdCompletionRequest
  try {
    const response = await window.gogoagent.files.completeDirectory(source)
    if (requestId !== cwdCompletionRequest || globalCwdInput.value !== source) return
    const completions = [...new Set(response.completions)].filter(Boolean).slice(0, 12)
    if (!completions.length) {
      clearDirectorySuggestions()
      return
    }
    cwdCompletionState = { completions, index: -1, kind: 'matches' }
    renderDirectorySuggestions()
  } catch {
    if (requestId === cwdCompletionRequest) clearDirectorySuggestions()
  }
}

function scheduleDirectorySuggestions() {
  if (cwdCompletionTimer !== null) window.clearTimeout(cwdCompletionTimer)
  cwdCompletionTimer = window.setTimeout(() => {
    cwdCompletionTimer = null
    void refreshDirectorySuggestions()
  }, 140)
}

function moveDirectorySuggestion(delta: number) {
  const state = cwdCompletionState
  if (!state?.completions.length) return false
  state.index = state.index < 0
    ? delta > 0 ? 0 : state.completions.length - 1
    : (state.index + delta + state.completions.length) % state.completions.length
  renderDirectorySuggestions()
  globalCwdSuggestions.querySelector<HTMLElement>(`#global-cwd-suggestion-${state.index}`)?.scrollIntoView({ block: 'nearest' })
  return true
}

function acceptDirectorySuggestion(index = cwdCompletionState?.index ?? -1) {
  const state = cwdCompletionState
  if (!state?.completions.length) return false
  const selectedIndex = index >= 0 ? index : 0
  const completion = state.completions[selectedIndex]
  if (!completion) return false
  globalCwdInput.value = completion
  globalCwdInput.setAttribute('aria-invalid', 'false')
  clearDirectorySuggestions()
  globalLaunchStatus.textContent = 'Directory selected. Choose a tool, then start.'
  return true
}

function useCurrentProjectForGlobalLaunch() {
  if (!currentDetail) return
  globalCwdInput.value = currentDetail.project.repoRoot
  localStorage.setItem(GLOBAL_CWD_STORAGE_KEY, currentDetail.project.repoRoot)
  globalCwdInput.setAttribute('aria-invalid', 'false')
  clearDirectorySuggestions()
  globalLaunchStatus.textContent = 'Using the selected workstream repo. Choose a tool, then start.'
}

async function browseForGlobalDirectory() {
  try {
    let defaultPath: string | undefined
    const input = globalCwdInput.value.trim()
    if (input) {
      const inspected = await window.gogoagent.files.inspectDirectory(input)
      if (inspected.exists && inspected.isDirectory) defaultPath = inspected.path
    }
    defaultPath ??= currentDetail?.project.repoRoot

    const selected = await window.gogoagent.files.selectDirectory(defaultPath)
    if (!selected) return
    globalCwdInput.value = selected
    globalCwdInput.setAttribute('aria-invalid', 'false')
    localStorage.setItem(GLOBAL_CWD_STORAGE_KEY, selected)
    clearDirectorySuggestions()
    globalLaunchStatus.textContent = 'Directory selected. Choose a tool, then start.'
  } catch (error) {
    globalLaunchStatus.textContent = `Could not open folder picker: ${(error as Error).message}`
  }
}

async function startGlobalWorkstream() {
  if (globalLaunchInFlight) return
  const kind = selectedGlobalLaunchKind()
  const label = terminalLabel(kind)
  globalLaunchInFlight = true
  updateGlobalLaunchControls()
  clearDirectorySuggestions()
  globalCwdInput.setAttribute('aria-invalid', 'false')
  globalLaunchStatus.textContent = 'Checking directory...'

  try {
    const inspected = await window.gogoagent.files.inspectDirectory(globalCwdInput.value)
    if (inspected.error) {
      globalCwdInput.setAttribute('aria-invalid', 'true')
      globalLaunchStatus.textContent = `Cannot use directory: ${inspected.error}`
      globalCwdInput.focus()
      return
    }
    if (!inspected.exists) {
      globalCwdInput.setAttribute('aria-invalid', 'true')
      globalLaunchStatus.textContent = `Directory not found: ${inspected.path}`
      globalCwdInput.focus()
      return
    }
    if (!inspected.isDirectory) {
      globalCwdInput.setAttribute('aria-invalid', 'true')
      globalLaunchStatus.textContent = `Not a directory: ${inspected.path}`
      globalCwdInput.focus()
      return
    }
    globalCwdInput.value = inspected.path
    localStorage.setItem(GLOBAL_CWD_STORAGE_KEY, inspected.path)
    globalLaunchStatus.textContent = `Starting ${label} in ${inspected.path}...`
    showDraftWorkstream()
    const record = await createTerminal(kind)
    if (record) rememberDirectory(record.cwd)
  } catch (error) {
    globalCwdInput.setAttribute('aria-invalid', 'true')
    globalLaunchStatus.textContent = `Could not start ${label}: ${(error as Error).message}`
  } finally {
    globalLaunchInFlight = false
    updateGlobalLaunchControls()
    if (globalCwdInput.getAttribute('aria-invalid') === 'true') globalCwdInput.focus()
  }
}

async function closeActiveTerminal() {
  if (!activeTerminalId) return
  const view = terminalViews.get(activeTerminalId)
  terminalStatus.textContent = view?.record.status === 'running'
    ? `Ending ${terminalLabel(view.record.kind)}...`
    : 'Closing terminal...'
  await window.gogoagent.terminals.close(activeTerminalId)
}

async function copyActiveTerminalLog() {
  if (!activeTerminalId) return
  try {
    const replay = await window.gogoagent.terminals.readLog(activeTerminalId)
    const body = stripAnsi(replay.data)
    const text = [
      replay.truncated ? `[Earlier terminal output omitted; copied tail of ${fmtBytes(replay.bytes)} terminal log.]` : undefined,
      body || '[Terminal log is empty.]',
    ].filter((line): line is string => line !== undefined).join('\n')
    await copyText(text)
    flashButton(terminalCopyLogButton, 'Copied')
  } catch (error) {
    terminalStatus.textContent = `Log copy failed: ${(error as Error).message}`
    flashButton(terminalCopyLogButton, 'Failed')
  }
}

function terminalPastePayload(text: string) {
  return `\x1b[200~${text}\x1b[201~`
}

async function pasteResumeContextIntoTerminal(
  terminalId: string,
  detail: ProjectDetail,
  options: { contextKind?: 'resume' | 'bridge'; flash?: boolean; targetKind?: AgentTerminalKind; preparedContext?: string } = {},
) {
  const view = terminalViews.get(terminalId)
  if (!view || view.record.status !== 'running' || view.record.kind === 'shell') return
  const terminalKind = view.record.kind === 'claude' || view.record.kind === 'codex' ? view.record.kind : undefined
  const targetKind = options.targetKind ?? terminalKind
  if (!targetKind) return
  const text = options.preparedContext ?? (options.contextKind === 'bridge'
    ? await buildBridgeContext(detail, targetKind)
    : await buildResumeContext(detail))
  await window.gogoagent.terminals.write(terminalId, terminalPastePayload(text))
  if (activeTerminalId === terminalId && !view.element.classList.contains('hidden')) {
    focusTerminalWithoutPageScroll(view)
  }
  if (options.flash ?? true) flashButton(terminalPasteContextButton, 'Pasted')
  return true
}

async function pasteResumeContextIntoActiveTerminal() {
  if (!currentDetail || !activeTerminalId) return
  const view = terminalViews.get(activeTerminalId)
  const targetKind = view?.record.kind === 'claude' || view?.record.kind === 'codex' ? view.record.kind : undefined
  if (!targetKind) return
  const review = await prepareContinuation(currentDetail, targetKind, undefined, 'resume')
  const result = await reviewContinuation(review, 'paste')
  if (result.decision === 'copy' && result.context) {
    rememberContinuationRepository(currentDetail, review.repository)
    await copyText(result.context)
    flashButton(terminalPasteContextButton, 'Copied')
    return
  }
  if (result.decision !== 'with-context' || !result.context) return
  rememberContinuationRepository(currentDetail, review.repository)
  await pasteResumeContextIntoTerminal(activeTerminalId, currentDetail, {
    targetKind,
    preparedContext: result.context,
  })
}

async function loadExistingTerminals() {
  const records = await window.gogoagent.terminals.list()
  for (const record of records) ensureTerminalView(record)
  renderTerminalTabs()
}

function setupTerminalEvents() {
  window.gogoagent.terminals.onCreated((record) => {
    ensureTerminalView(record)
    if (record.workstreamId === selectedProjectId) selectTerminal(record.id)
    void refreshProjectsIfChanged()
    void loadAttention()
  })
  window.gogoagent.terminals.onData(({ id, data, logBytes, lastActivityAt, needsInput, needsInputChanged }) => {
    const view = terminalViews.get(id)
    if (!view) return
    if (lastActivityAt) view.record.lastActivityAt = lastActivityAt
    bumpProjectActivity(view.record.workstreamId, lastActivityAt)
    if (data) markWorkstreamUnread(view.record.workstreamId)
    if (needsInput !== undefined) {
      view.record.needsInput = needsInput
      // The sidecar sees a rolling output window and is authoritative. Clear
      // any renderer-only suppression when it recognizes an interactive prompt.
      if (needsInput) view.needsInputSuppressed = false
    }
    const needsInputSuppressionChanged = writeTerminalData(view, data, logBytes)
    renderTerminalStatus()
    if (needsInputChanged || needsInputSuppressionChanged) {
      if (terminalNeedsInput(view) && view.record.id === activeTerminalId) {
        settleTerminalAtBottom(view)
      }
      projects = sortProjectsByActivity(projects)
      renderTerminalTabs({ fit: false })
      renderProjectsList()
      void refreshProjectsIfChanged()
      void loadAttention()
    }
  })
  window.gogoagent.terminals.onExit(({ id, record }) => {
    const view = terminalViews.get(id)
    if (!view) return
    view.record = record
    writeTerminalData(view, `\r\n\x1b[90m[process exited with code ${record.exitCode ?? 'unknown'}]\x1b[0m\r\n`, record.logBytes)
    renderTerminalTabs()
    void loadAttention()
    if (record.workstreamId === selectedProjectId) {
      window.setTimeout(() => void loadAllProjects(), 1500)
    } else {
      window.setTimeout(() => void refreshProjectsIfChanged(), 1500)
    }
  })
  window.gogoagent.terminals.onClosed(({ id }) => {
    const view = terminalViews.get(id)
    if (!view) return
    const workstreamId = view.record.workstreamId
    if (view.writeFrame !== null) window.cancelAnimationFrame(view.writeFrame)
    view.element.remove()
    terminalViews.delete(id)
    if (workstreamId && lastViewedTerminalIdsByWorkstream.get(workstreamId) === id) {
      lastViewedTerminalIdsByWorkstream.delete(workstreamId)
      saveStringRecord(LAST_VIEWED_TERMINALS_STORAGE_KEY, lastViewedTerminalIdsByWorkstream)
    }
    if (activeTerminalId === id) activeTerminalId = null
    renderTerminalTabs()
    void loadAllProjects()
  })
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

let lastActivityRenderedAt: string | null = null
let lastProjectListFingerprint: string | null = null
let lastWorkstreamViewRevision: number | null = null

async function checkHealth() {
  try {
    const health = await window.gogoagent.getHealth()
    setAppNotice('')
    if (typeof health.workstreamViewRevision === 'number') {
      if (lastWorkstreamViewRevision !== null && health.workstreamViewRevision !== lastWorkstreamViewRevision) {
        void refreshProjectsIfChanged()
      }
      lastWorkstreamViewRevision = health.workstreamViewRevision
    }
    if (health.lastActivity) {
      footerActivity.textContent = `${health.lastActivity.label} · ${fmtRelative(health.lastActivity.at)}`
      if (lastActivityRenderedAt !== health.lastActivity.at) {
        lastActivityRenderedAt = health.lastActivity.at
        if (/title|Renamed|Scanned|terminal/i.test(health.lastActivity.label)) {
          void refreshProjectsIfChanged()
        }
      }
    } else {
      footerActivity.textContent = ''
    }
    return true
  } catch (error) {
    setAppNotice(`Sidecar unreachable: ${(error as Error).message}`)
    footerActivity.textContent = ''
    return false
  }
}

async function refreshProjectsIfChanged() {
  try {
    const listedProjects = await window.gogoagent.projects.list({ archived: showArchivedWorkstreams })
    const fingerprint = listedProjects
      .map((p) => `${p.id}:${p.name}:${p.sessionCount}:${p.lastUpdatedAt}:${p.draft ? 'draft' : ''}:${p.activeTerminalIds?.join(',') ?? ''}:${p.needsInputTerminalIds?.join(',') ?? ''}:${p.archivedAt ?? ''}:${p.view?.viewedAt ?? ''}:${p.view?.terminalId ?? ''}:${p.newSinceLastView ? 'new' : ''}`)
      .join('|')
    if (fingerprint === lastProjectListFingerprint) return
    lastProjectListFingerprint = fingerprint
    for (const project of listedProjects) {
      if (project.view && !project.newSinceLastView) unreadWorkstreamIds.delete(project.id)
    }
    projects = sortProjectsByActivity(listedProjects)
    renderProjectsList()
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      const project = projects.find((p) => p.id === selectedProjectId)
      if (project) {
        if (currentDetail) {
          currentDetail = { ...currentDetail, project }
          setCachedValue(projectDetailCache, selectedProjectId, currentDetail)
        }
        detailTitle.textContent = project.name
      }
    } else if (selectedProjectId) {
      showEmptyDetail(showArchivedWorkstreams ? 'Select an archived workstream.' : 'Select a workstream.')
    }
  } catch {
    // Silent — footer already shows sidecar state.
  }
}

async function waitForSidecar(attempts = 40, delayMs = 250) {
  let lastError = 'not ready'
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await window.gogoagent.getHealth()
      setAppNotice('')
      return true
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(delayMs)
    }
  }
  setAppNotice(`Sidecar unreachable: ${lastError}`)
  return false
}

// ---------- Projects list ----------
function projectBelongsInCurrentList(project: Project) {
  return showArchivedWorkstreams ? Boolean(project.archivedAt) : !project.archivedAt
}

function pinnedWorkstreamRank(projectId: string) {
  let rank = 0
  for (const pinnedId of pinnedWorkstreamIds) {
    if (pinnedId === projectId) return rank
    rank += 1
  }
  return Number.POSITIVE_INFINITY
}

function projectAttentionRank(project: Project) {
  if (projectNeedsInputTerminalIds(project).length > 0) return 0
  if ((project.activeTerminalIds?.length ?? 0) > 0) return 1
  return 2
}

function sortProjectsByActivity(items: Project[]) {
  return items.slice().sort((a, b) => {
    const aPinned = pinnedWorkstreamIds.has(a.id)
    const bPinned = pinnedWorkstreamIds.has(b.id)
    if (aPinned || bPinned) {
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      return pinnedWorkstreamRank(a.id) - pinnedWorkstreamRank(b.id)
    }
    const attentionDelta = projectAttentionRank(a) - projectAttentionRank(b)
    if (attentionDelta !== 0) return attentionDelta
    return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
  })
}

function archivedViewEmptyMessage() {
  return showArchivedWorkstreams
    ? 'No archived workstreams.'
    : 'No workstreams yet. In the sidebar, enter a working directory and choose +, or work with Claude Code and Reload.'
}

function togglePinnedWorkstream(projectId: string) {
  if (pinnedWorkstreamIds.has(projectId)) {
    pinnedWorkstreamIds.delete(projectId)
  } else {
    pinnedWorkstreamIds.add(projectId)
  }
  saveStringSet(PINNED_WORKSTREAMS_STORAGE_KEY, pinnedWorkstreamIds)
  projects = sortProjectsByActivity(projects)
  renderProjectsList()
}

function markWorkstreamUnread(workstreamId: string | undefined) {
  if (!workstreamId || workstreamId === selectedProjectId) return
  if (unreadWorkstreamIds.has(workstreamId)) return
  unreadWorkstreamIds.add(workstreamId)
  renderProjectsList()
}

function clearWorkstreamUnread(workstreamId: string) {
  if (!unreadWorkstreamIds.delete(workstreamId)) return
  renderProjectsList()
}

function renderArchivedToggle() {
  showArchivedButton.innerHTML = buttonContent(showArchivedWorkstreams ? 'archive-restore' : 'archive', showArchivedWorkstreams ? 'Active' : 'Archived')
  showArchivedButton.title = showArchivedWorkstreams ? 'Show active workstreams.' : 'Show archived workstreams.'
  showArchivedButton.setAttribute('aria-pressed', showArchivedWorkstreams ? 'true' : 'false')
}

function filterProjects(): Project[] {
  const q = projectsSearch.value.trim().toLowerCase()
  if (!q) return projects
  return projects.filter((p) => {
    const state = p.state
    const haystack = `${p.name} ${p.repoRoot} ${p.branch ?? ''} ${workstreamStatusNote(p.id)} ${state?.goal ?? ''} ${state?.blocker ?? ''} ${state?.nextAction ?? ''}`.toLowerCase()
    return haystack.includes(q)
  })
}

async function openAttentionItem(item: AttentionItem) {
  if (selectedProjectId !== item.workstreamId) await selectProject(item.workstreamId)
  if (item.terminalId && terminalViews.has(item.terminalId)) {
    selectTerminal(item.terminalId)
    return
  }
  if (item.kind === 'blocked') {
    if (terminalFocusWorkstreamIds.delete(item.workstreamId)) {
      saveStringSet(TERMINAL_FOCUS_WORKSTREAMS_STORAGE_KEY, terminalFocusWorkstreamIds)
      applyTerminalFocus(currentDetail?.project ?? null)
    }
    document.querySelector<HTMLElement>('.workstream-state-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function renderAttention() {
  const visible = showArchivedWorkstreams ? [] : attentionItems.filter((item) => {
    if (item.kind !== 'needs_input' || !item.terminalId) return true
    const view = terminalViews.get(item.terminalId)
    return view ? terminalNeedsInput(view) : true
  })
  attentionSection.classList.toggle('hidden', visible.length === 0)
  attentionCount.textContent = String(visible.length)
  if (!visible.length) {
    attentionList.innerHTML = ''
    return
  }
  attentionList.innerHTML = visible.map((item) => `
    <button class="attention-item ${esc(item.priority)}" type="button" data-attention-id="${esc(item.id)}" title="Open ${esc(item.title)}: ${esc(item.reason)}">
      <span class="attention-item-dot" aria-hidden="true"></span>
      <span class="attention-item-copy">
        <span class="attention-item-title">${esc(item.title)}</span>
        <span class="attention-item-reason">${esc(item.kind === 'needs_input' && item.question ? `Agent asks: ${item.question}` : item.reason)}</span>
      </span>
      <span class="attention-item-time">${esc(fmtRelative(item.since))}</span>
    </button>
  `).join('')
  attentionList.querySelectorAll<HTMLButtonElement>('.attention-item').forEach((button) => {
    button.addEventListener('click', () => {
      const item = attentionItems.find((entry) => entry.id === button.dataset.attentionId)
      if (item) void openAttentionItem(item)
    })
  })
}

async function loadAttention() {
  const requestVersion = ++attentionRequestVersion
  try {
    const items = await window.gogoagent.getAttention()
    if (requestVersion !== attentionRequestVersion) return
    attentionItems = items
    renderAttention()
  } catch {
    if (requestVersion !== attentionRequestVersion) return
    attentionItems = []
    renderAttention()
  }
}

function renderProjectsList() {
  renderArchivedToggle()
  const filtered = filterProjects()
  const modeLabel = showArchivedWorkstreams ? 'archived' : 'active'
  footerStats.textContent = `${projects.length} ${modeLabel} workstreams · ${projects.reduce((acc, p) => acc + p.sessionCount, 0)} sessions`

  if (!filtered.length) {
    renderEmpty(projectsList, projects.length === 0 ? archivedViewEmptyMessage() : 'No matches.')
    return
  }

  projectsList.innerHTML = filtered
    .map((project) => {
      const selected = project.id === selectedProjectId ? ' selected' : ''
      const pinned = pinnedWorkstreamIds.has(project.id)
      const unread = unreadWorkstreamIds.has(project.id) || (project.newSinceLastView && project.id !== selectedProjectId)
      const statusNote = workstreamStatusNote(project.id)
      const branch = project.branch ? `<span class="badge subtle">${esc(project.branch)}</span>` : ''
      const nameOrigin = project.nameSource === 'generated'
        ? '<span class="badge name-origin-badge generated" title="Generated by local Codex; edit the name to make it manual.">Generated</span>'
        : project.nameSource === 'manual'
          ? '<span class="badge name-origin-badge" title="Saved manually; automatic naming will not overwrite it.">Manual</span>'
          : ''
      const liveCount = project.activeTerminalIds?.length ?? 0
      const needsInputIds = projectNeedsInputTerminalIds(project)
      const needsInputCount = needsInputIds.length
      const liveTitle = `${liveCount} live terminal${liveCount === 1 ? '' : 's'} attached.${needsInputCount > 0 ? ` ${needsInputCount} waiting for user input.` : ''}`
      const liveIndicator = liveCount > 0
        ? `
          <span class="project-live-indicator${needsInputCount > 0 ? ' needs-input' : ''}" title="${esc(liveTitle)}" aria-label="${esc(liveTitle)}">
            <span class="project-live-dot" aria-hidden="true"></span>
            ${needsInputCount > 0 ? `<button class="project-input-indicator" type="button" data-input-project-id="${esc(project.id)}" data-input-terminal-id="${esc(needsInputIds[0] ?? '')}" title="Jump to waiting terminal." aria-label="Jump to waiting terminal">&gt;</button>` : ''}
          </span>
        `
        : ''
      const pinTitle = pinned ? 'Unpin workstream.' : 'Pin workstream.'
      const lastActive = fmtRelative(project.lastUpdatedAt)
      const pathLabel = compactPath(project.repoRoot)
      return `
        <div class="project-card${selected}${project.archivedAt ? ' archived' : ''}${pinned ? ' pinned' : ''}${unread ? ' unread' : ''}" data-project-id="${esc(project.id)}" role="button" tabindex="0" title="Open ${esc(project.name)}. Last active ${esc(lastActive)}. ${esc(project.repoRoot)}.">
          <span class="project-card-title-row">
            <span class="project-title-with-origin">
              <span class="session-card-title">${esc(project.name)}</span>
              ${nameOrigin}
              ${unread ? '<span class="badge subtle">New</span>' : ''}
            </span>
            <span class="project-card-controls">
              <button class="project-pin-button icon-button secondary-button${pinned ? ' pinned' : ''}" type="button" data-pin-project-id="${esc(project.id)}" title="${esc(pinTitle)}" aria-label="${esc(pinTitle)}" aria-pressed="${pinned ? 'true' : 'false'}">
                ${iconMarkup('pin')}
              </button>
              ${liveIndicator}
            </span>
          </span>
          <span class="project-card-meta-row">
            <span class="session-card-path" title="${esc(project.repoRoot)}">${esc(pathLabel)}</span>
            <span class="session-card-meta" title="${esc(project.lastUpdatedAt)}">${esc(lastActive)}</span>
          </span>
          ${statusNote ? `<span class="project-status-note" title="${esc(statusNote)}">${esc(statusNote)}</span>` : ''}
          ${branch ? `<span class="chip-row">${branch}</span>` : ''}
        </div>
      `
    })
    .join('')

  projectsList.querySelectorAll<HTMLButtonElement>('.project-pin-button').forEach((button) => {
    button.addEventListener('keydown', (event) => {
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const id = button.dataset.pinProjectId
      if (!id) return
      togglePinnedWorkstream(id)
    })
  })

  projectsList.querySelectorAll<HTMLButtonElement>('.project-input-indicator').forEach((button) => {
    button.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      const projectId = button.dataset.inputProjectId
      if (!projectId) return
      void jumpToNeedsInputTerminal(projectId, button.dataset.inputTerminalId || undefined)
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const projectId = button.dataset.inputProjectId
      if (!projectId) return
      void jumpToNeedsInputTerminal(projectId, button.dataset.inputTerminalId || undefined)
    })
  })

  projectsList.querySelectorAll<HTMLElement>('.project-card').forEach((card) => {
    const open = () => {
      const id = card.dataset.projectId
      if (!id) return
      selectProject(id)
    }
    card.addEventListener('click', open)
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      open()
    })
  })
}

function syncProjectFromDetail(project: Project) {
  const existing = projects.find((entry) => entry.id === project.id)
  if (!projectBelongsInCurrentList(project)) {
    if (existing) {
      projects = projects.filter((entry) => entry.id !== project.id)
      renderProjectsList()
    }
    return
  }
  if (!existing) {
    projects = sortProjectsByActivity([...projects, project])
    renderProjectsList()
    return
  }
  if (
    existing.name === project.name &&
    existing.nameSource === project.nameSource &&
    existing.repoRoot === project.repoRoot &&
    existing.branch === project.branch &&
    existing.sessionCount === project.sessionCount &&
    existing.keptLessonCount === project.keptLessonCount &&
    existing.touchedPathCount === project.touchedPathCount &&
    existing.firstStartedAt === project.firstStartedAt &&
    existing.lastUpdatedAt === project.lastUpdatedAt &&
    existing.draft === project.draft &&
    JSON.stringify(existing.state ?? null) === JSON.stringify(project.state ?? null) &&
    sameStringArray(existing.activeTerminalIds, project.activeTerminalIds) &&
    sameStringArray(existing.needsInputTerminalIds, project.needsInputTerminalIds) &&
    existing.archivedAt === project.archivedAt
  ) {
    return
  }
  projects = sortProjectsByActivity(projects.map((entry) => (entry.id === project.id ? project : entry)))
  renderProjectsList()
}

function showEmptyDetail(message = 'Select a workstream.') {
  selectedProjectId = null
  currentDetail = null
  setStateEditing(false)
  workstreamStateStatus.textContent = ''
  setRenameEditing(false)
  renameStatus.textContent = ''
  detailRoot.classList.add('hidden')
  detailRoot.classList.remove('terminal-only')
  detailRoot.classList.remove('terminal-focus')
  detailEmpty.classList.remove('hidden')
  detailEmptyText.textContent = message
  detailMeta.title = ''
  workstreamDigest.innerHTML = ''
  renderTerminalFocusButton(null)
  renderProjectsList()
  updateTimelineControls()
  updateGlobalLaunchControls()
}

// ---------- Project detail ----------
async function selectProject(projectId: string) {
  const selectionVersion = ++projectSelectionVersion
  const switchedWorkstreams = selectedProjectId !== projectId
  if (switchedWorkstreams && selectedProjectId) {
    void window.gogoagent.projects.markViewed(selectedProjectId, activeTerminalId ?? undefined).catch(() => undefined)
  }
  const cachedDetail = getCachedValue(projectDetailCache, projectId, PROJECT_DETAIL_CACHE_MS)
  selectedProjectId = projectId
  setStateEditing(false)
  workstreamStateStatus.textContent = ''
  clearWorkstreamUnread(projectId)
  setRenameEditing(false)
  renameStatus.textContent = ''
  renderProjectsList() // re-render to update .selected
  detailEmpty.classList.add('hidden')
  detailEmptyText.textContent = 'Select a workstream.'
  detailRoot.classList.remove('hidden')
  detailRoot.classList.remove('terminal-only')
  detailRoot.classList.remove('terminal-focus')
  if (switchedWorkstreams) contentRoot.scrollTop = 0

  if (cachedDetail) {
    currentDetail = cachedDetail
    renderDetail(cachedDetail)
  } else {
    currentDetail = null
    detailTitle.textContent = 'Loading…'
    detailMeta.textContent = ''
    detailMeta.title = ''
    detailSubtitle.textContent = 'Workstream'
    renderWorkstreamLaunchLabels(null)
    renderTerminalFocusButton(null)
    renderEmpty(workstreamDigest, 'Loading…')
    renderEmpty(detailTimeline, 'Loading timeline…')
    renderEmpty(detailRefined, 'Loading…')
    renderEmpty(detailPaths, 'Loading…')
    renderEmpty(detailSessions, 'Loading…')
  }

  refineStatus.textContent = ''
  updateTimelineControls()
  updateGlobalLaunchControls()

  try {
    const freshDetail = await getProjectDetail(projectId)
    if (selectionVersion !== projectSelectionVersion || selectedProjectId !== projectId) return
    currentDetail = freshDetail
    if (freshDetail.project.view?.terminalId) {
      lastViewedTerminalIdsByWorkstream.set(projectId, freshDetail.project.view.terminalId)
    }
    syncProjectFromDetail(currentDetail.project)
    renderDetail(currentDetail)
    updateGlobalLaunchControls()
    if (!freshDetail.project.archivedAt) {
      void window.gogoagent.projects.markViewed(projectId, activeTerminalId ?? undefined)
        .then(({ view }) => {
          if (selectedProjectId !== projectId) return
          freshDetail.project.view = view
          freshDetail.project.newSinceLastView = false
          syncProjectFromDetail(freshDetail.project)
        })
        .catch(() => undefined)
    }
  } catch (error) {
    if (selectionVersion !== projectSelectionVersion || selectedProjectId !== projectId) return
    detailTitle.textContent = 'Error'
    detailMeta.textContent = (error as Error).message
    detailMeta.title = ''
  }
}

function renderDetailMeta(project: Project) {
  detailMeta.textContent = [
    compactPath(project.repoRoot),
    project.branch,
    `active ${fmtRelative(project.lastUpdatedAt)}`,
    project.archivedAt ? `archived ${fmtRelative(project.archivedAt)}` : undefined,
  ].filter((part): part is string => Boolean(part)).join(' · ')
  detailMeta.title = project.repoRoot
}

function renderTerminalFocusButton(project: Project | null) {
  const focused = project ? terminalFocusWorkstreamIds.has(project.id) : false
  terminalFocusButton.disabled = !project
  terminalFocusButton.classList.toggle('active-toggle', focused)
  terminalFocusButton.setAttribute('aria-pressed', focused ? 'true' : 'false')
  terminalFocusButton.title = focused ? 'Show timeline and details.' : 'Focus terminal.'
  terminalFocusButton.setAttribute('aria-label', focused ? 'Show timeline and details' : 'Focus terminal')
}

function applyTerminalFocus(project: Project | null) {
  const focused = project ? terminalFocusWorkstreamIds.has(project.id) : false
  detailRoot.classList.toggle('terminal-focus', focused)
  renderTerminalFocusButton(project)
  if (focused) {
    const view = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
    scheduleTerminalFit(view)
  }
}

function toggleTerminalFocus() {
  const project = currentDetail?.project
  if (!project) return
  if (terminalFocusWorkstreamIds.has(project.id)) {
    terminalFocusWorkstreamIds.delete(project.id)
  } else {
    terminalFocusWorkstreamIds.add(project.id)
  }
  saveStringSet(TERMINAL_FOCUS_WORKSTREAMS_STORAGE_KEY, terminalFocusWorkstreamIds)
  applyTerminalFocus(project)
}

function renderDetail(detail: ProjectDetail) {
  const { project } = detail
  setRenameEditing(false)
  renameStatus.textContent = ''
  detailRoot.classList.remove('terminal-only')
  terminalHelp.textContent = ''
  renderWorkstreamLaunchLabels(detail)
  detailTitle.textContent = project.name
  const nameOrigin = project.nameSource === 'generated'
    ? 'Generated name'
    : project.nameSource === 'manual'
      ? 'Manual name'
      : undefined
  detailSubtitle.textContent = [
    project.archivedAt ? 'Archived workstream' : project.draft ? 'Draft workstream' : 'Workstream',
    nameOrigin,
    project.newSinceLastView ? 'Updated since you last looked' : undefined,
  ].filter(Boolean).join(' · ')
  renderDetailMeta(project)
  applyTerminalFocus(project)
  archiveWorkstreamButton.innerHTML = iconMarkup(project.archivedAt ? 'archive-restore' : 'archive')
  archiveWorkstreamButton.title = project.archivedAt
    ? 'Restore this workstream to the active list.'
    : 'Archive this workstream and hide it from the default list.'
  archiveWorkstreamButton.setAttribute('aria-label', project.archivedAt ? 'Restore workstream' : 'Archive workstream')
  archiveWorkstreamButton.classList.toggle('danger-button', !project.archivedAt)

  renderTerminalTabs()
  renderWorkstreamDigest(detail)
  updateTimelineControls()
  void renderTimeline(detail)
  renderRefinedLessons(detail.refinedLessons)
  renderTouchedPaths(detail.touchedPaths)
  renderSessions(detail.sessions)
}

function updateTimelineControls() {
  const sessions = currentDetail?.sessions ?? []
  const hasSessions = sessions.length > 0
  renderTimelineOrderButton(hasSessions)
  timelineToggleAllButton.disabled = !hasSessions
  if (!hasSessions) {
    timelineToggleAllButton.innerHTML = buttonContent('chevron-right', 'Collapse')
    timelineToggleAllButton.title = 'Collapse timeline chats.'
    return
  }

  const allCollapsed = sessions.every((session) => collapsedTimelineSessions.has(session.id))
  timelineToggleAllButton.innerHTML = buttonContent(allCollapsed ? 'chevron-down' : 'chevron-right', allCollapsed ? 'Expand' : 'Collapse')
  timelineToggleAllButton.title = allCollapsed ? 'Expand timeline chats.' : 'Collapse timeline chats.'
}

function renderTimelineOrderButton(enabled = (currentDetail?.sessions.length ?? 0) > 0) {
  const oldestFirst = sessionOrder === 'oldest-first'
  const currentLabel = oldestFirst ? 'Oldest first' : 'Newest first'
  const nextLabel = oldestFirst ? 'newest first' : 'oldest first'
  timelineOrderButton.disabled = !enabled
  timelineOrderButton.innerHTML = iconMarkup(oldestFirst ? 'arrow-down' : 'arrow-up')
  timelineOrderButton.title = `${currentLabel}. Click to show ${nextLabel}.`
  timelineOrderButton.setAttribute('aria-label', `Timeline order: ${currentLabel}. Click to show ${nextLabel}.`)
}

function clampText(text: string, max = 260) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}…`
}

function renderCandidatePills(candidates: ExtractionCandidate[]) {
  if (!candidates.length) return ''
  return `
    <div class="timeline-pills">
      ${candidates
        .slice(0, 5)
        .map((candidate) => `<span class="badge">${esc(candidate.kind)}</span>`)
        .join('')}
    </div>
  `
}

function renderSessionEvidence(artifacts: ArtifactRecord[]) {
  const evidence = artifacts
    .filter((artifact) => artifact.kind === 'command' || artifact.kind === 'tool_call')
    .slice(0, 6)
  if (!evidence.length) return ''
  return `
    <div class="timeline-evidence">
      ${evidence
        .map(
          (artifact) =>
            `<span class="evidence-chip evidence-${esc(artifact.evidence ?? 'mentioned')}">${esc(clampText(artifact.detail ?? artifact.label, 84))}</span>`,
        )
        .join('')}
    </div>
  `
}

function groupTimelineMessages(messages: SessionMessageRecord[]): TimelineMessageGroup[] {
  const groups: TimelineMessageGroup[] = []
  for (const message of messages) {
    const previous = groups[groups.length - 1]
    if (previous?.role === message.role) {
      previous.messages.push(message)
    } else {
      groups.push({ role: message.role, messages: [message] })
    }
  }
  return groups
}

function timelineMessageGroupId(sessionId: string, group: TimelineMessageGroup) {
  const ids = group.messages.map((message) => message.id).sort().join('|')
  return `${sessionId}:${group.role}:${ids}`
}

function timelineGroupTitle(group: TimelineMessageGroup) {
  if (group.role === 'user') return group.messages.length > 1 ? `You · ${group.messages.length} messages` : 'You'
  if (group.role === 'assistant') return group.messages.length > 1 ? `Claude response · ${group.messages.length} parts` : 'Claude response'
  if (group.role === 'terminal') return group.messages.length > 1 ? `Terminal · ${group.messages.length} entries` : 'Terminal'
  return 'System'
}

function timelineGroupTimestamp(group: TimelineMessageGroup) {
  const timestamps = group.messages.map((message) => message.timestamp).sort()
  if (timestamps.length <= 1 || timestamps[0] === timestamps[timestamps.length - 1]) return timestamps[0] ?? ''
  return `${timestamps[0]} - ${timestamps[timestamps.length - 1]}`
}

function timelineGroupExcerpt(group: TimelineMessageGroup) {
  const maxLength = group.role === 'user' ? 240 : group.role === 'terminal' ? 200 : 220
  return clampText(group.messages.map((message) => message.text).join(' '), maxLength)
}

function timelineGroupIsExpandable(group: TimelineMessageGroup, excerpt: string) {
  const normalized = group.messages.map((message) => message.text).join(' ').replace(/\s+/g, ' ').trim()
  return group.messages.length > 1 || normalized !== excerpt
}

function renderTimelineGroupFull(group: TimelineMessageGroup) {
  if (group.messages.length === 1) {
    return `<p>${esc(group.messages[0]?.text.trim() || '—')}</p>`
  }

  return `
    <div class="timeline-message-parts">
      ${group.messages
        .map((message) => `
          <div class="timeline-message-part">
            <span class="timeline-message-part-marker" aria-hidden="true">&gt;</span>
            <p>${esc(message.text.trim() || '—')}</p>
          </div>
        `)
        .join('')}
    </div>
  `
}

function renderTimelineCardToggle(cardId: string, expanded: boolean) {
  return `
    <button
      class="icon-button secondary-button timeline-card-toggle"
      type="button"
      data-card-id="${esc(cardId)}"
      aria-expanded="${expanded ? 'true' : 'false'}"
      title="${expanded ? 'Show less.' : 'Show full text.'}"
      aria-label="${expanded ? 'Show less' : 'Show full text'}"
    >
      ${iconMarkup(expanded ? 'chevron-down' : 'chevron-right')}
    </button>
  `
}

function renderTimelineMessageGroup(
  sessionId: string,
  group: TimelineMessageGroup,
  candidates: ExtractionCandidate[],
) {
  const role = group.role
  const cardId = timelineMessageGroupId(sessionId, group)
  const expanded = expandedTimelineCards.has(cardId)
  const title = timelineGroupTitle(group)
  const excerpt = timelineGroupExcerpt(group)
  const expandable = timelineGroupIsExpandable(group, excerpt)
  return `
    <article class="timeline-event timeline-message timeline-message-group timeline-${esc(role)}${expanded ? ' expanded' : ''}" data-card-id="${esc(cardId)}">
      <div class="timeline-dot"></div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <span class="role-chip role-${esc(role)}">${esc(title)}</span>
          <div class="timeline-card-header-actions">
            <span class="meta">${esc(timelineGroupTimestamp(group))}</span>
            ${expandable ? renderTimelineCardToggle(cardId, expanded) : ''}
          </div>
        </div>
        <div class="timeline-message-excerpt">
          <p>${esc(excerpt || '—')}</p>
        </div>
        ${
          expandable
            ? `<div class="timeline-message-full">${renderTimelineGroupFull(group)}</div>`
            : ''
        }
        ${renderCandidatePills(candidates)}
      </div>
    </article>
  `
}

function isTimelineNoiseMessage(message: SessionMessageRecord) {
  const text = message.text.replace(/\s+/g, ' ').trim()
  if (!text) return true
  if (text === '[Request interrupted by user]') return true
  if (/^\[(?:earlier|older) terminal (?:output|log) omitted/i.test(text)) return true
  if (/^\[terminal log is empty\]/i.test(text)) return true
  if (/^<local-command-(?:caveat|stdout|stderr)>/i.test(text)) return true
  if (/^<command-name>.*<\/command-name>/i.test(text)) return true
  if (/^gogoagent terminal log title\b/i.test(text)) return true
  if (message.role === 'assistant' && /^login expired\s*[·.]\s*please run \/login\.?$/i.test(text)) return true
  return false
}

function orderedTimelineMessages(messages: SessionMessageRecord[]) {
  const timelineMessages = messages.filter((message) => (
    message.role === 'user' || message.role === 'assistant' || message.role === 'terminal'
  )).filter((message) => !isTimelineNoiseMessage(message))

  const alreadyChronological = timelineMessages.every((message, index) => (
    index === 0 || timelineMessages[index - 1].timestamp <= message.timestamp
  ))
  if (!alreadyChronological) {
    timelineMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  return sessionOrder === 'oldest-first' ? timelineMessages : timelineMessages.reverse()
}

function renderSessionResumeButton(session: SessionRecord) {
  if (!isNativeCodexSession(session)) return ''
  return `<button class="small-button timeline-resume-button" type="button" data-session-id="${esc(session.id)}" title="Resume this Codex conversation.">${buttonContent('bot', 'Resume Codex')}</button>`
}

function renderTimelineSession(detail: SessionDetail, index: number) {
  const collapsed = collapsedTimelineSessions.has(detail.session.id)
  const messages = orderedTimelineMessages(detail.messages)
  const messageGroups = groupTimelineMessages(messages)
  const visibleGroups = messageGroups.slice(0, 28)
  const candidatesByMessage = new Map<string, ExtractionCandidate[]>()
  for (const candidate of detail.candidates) {
    if (!candidate.sourceMessageId) continue
    const group = candidatesByMessage.get(candidate.sourceMessageId) ?? []
    group.push(candidate)
    candidatesByMessage.set(candidate.sourceMessageId, group)
  }
  const sessionCandidates = detail.candidates.filter((candidate) => candidate.kind !== 'summary')
  const overflow = messageGroups.slice(visibleGroups.length).reduce((sum, group) => sum + group.messages.length, 0)

  return `
    <section class="timeline-session${collapsed ? ' collapsed' : ''}" data-session-id="${esc(detail.session.id)}">
      <article class="timeline-event timeline-boundary">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <div>
              <p class="eyebrow">Session ${index + 1}</p>
              <h3>${esc(detail.session.title || detail.session.id)}</h3>
            </div>
            <div class="button-row timeline-session-actions">
              ${renderSessionResumeButton(detail.session)}
              <button
                class="small-button timeline-toggle-button"
                type="button"
                data-session-id="${esc(detail.session.id)}"
                aria-expanded="${collapsed ? 'false' : 'true'}"
                title="${collapsed ? 'Show this chat in the timeline.' : 'Hide this chat in the timeline.'}"
              >${buttonContent(collapsed ? 'chevron-right' : 'chevron-down', collapsed ? 'Show' : 'Hide')}</button>
              <button class="small-button timeline-session-button" type="button" data-session-id="${esc(detail.session.id)}" title="Open the full transcript for this session.">${buttonContent('book-open', 'Transcript')}</button>
            </div>
          </div>
          <p class="meta">${fmtDateRange(detail.session.startedAt, detail.session.updatedAt)} · ${detail.session.messageCount} msgs · ${detail.session.toolCallCount} tools · ${fmtNumber(detail.session.tokenCount)} tokens</p>
          <p class="meta mono" title="${esc(detail.session.cwd)}">${esc(compactPath(detail.session.cwd))}</p>
          ${renderCandidatePills(sessionCandidates)}
          ${renderSessionEvidence(detail.artifacts)}
        </div>
      </article>
      ${
        collapsed
          ? `
            <article class="timeline-event timeline-collapsed">
              <div class="timeline-dot"></div>
              <div class="timeline-card">
                <p class="meta">${messages.length} message${messages.length === 1 ? '' : 's'} hidden.</p>
              </div>
            </article>
          `
          : `
            ${visibleGroups
              .map((group) => renderTimelineMessageGroup(
                detail.session.id,
                group,
                group.messages.flatMap((message) => candidatesByMessage.get(message.id) ?? []),
              ))
              .join('')}
            ${
              overflow > 0
                ? `
                  <article class="timeline-event timeline-overflow">
                    <div class="timeline-dot"></div>
                    <div class="timeline-card">
                      <p class="meta">${overflow} more message${overflow === 1 ? '' : 's'} in this session. Open the transcript for the full record.</p>
                    </div>
                  </article>
                `
                : ''
            }
          `
      }
    </section>
  `
}

function renderTimelineSessionPlaceholder(session: SessionRecord, index: number) {
  const collapsed = collapsedTimelineSessions.has(session.id)
  return `
    <section class="timeline-session${collapsed ? ' collapsed' : ' timeline-loading'}" data-session-id="${esc(session.id)}">
      <article class="timeline-event timeline-boundary">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <div>
              <p class="eyebrow">Session ${index + 1}</p>
              <h3>${esc(session.title || session.id)}</h3>
            </div>
            <div class="button-row timeline-session-actions">
              ${renderSessionResumeButton(session)}
              <button
                class="small-button timeline-toggle-button"
                type="button"
                data-session-id="${esc(session.id)}"
                aria-expanded="${collapsed ? 'false' : 'true'}"
                title="${collapsed ? 'Show this chat in the timeline.' : 'Hide this chat in the timeline.'}"
              >${buttonContent(collapsed ? 'chevron-right' : 'chevron-down', collapsed ? 'Show' : 'Hide')}</button>
              <button class="small-button timeline-session-button" type="button" data-session-id="${esc(session.id)}" title="Open the full transcript for this session.">${buttonContent('book-open', 'Transcript')}</button>
            </div>
          </div>
          <p class="meta">${fmtDateRange(session.startedAt, session.updatedAt)} · ${collapsed ? `${session.messageCount} messages hidden; expand to load.` : 'loading when visible...'}</p>
          <p class="meta mono" title="${esc(session.cwd)}">${esc(compactPath(session.cwd))}</p>
        </div>
      </article>
    </section>
  `
}

function renderTimelineSessionError(session: SessionRecord, index: number, error: unknown) {
  return `
    <section class="timeline-session timeline-loading" data-session-id="${esc(session.id)}">
      <article class="timeline-event timeline-boundary">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <div>
              <p class="eyebrow">Session ${index + 1}</p>
              <h3>${esc(session.title || session.id)}</h3>
            </div>
            <div class="button-row timeline-session-actions">${renderSessionResumeButton(session)}</div>
          </div>
          <p class="meta">Timeline failed to load: ${esc((error as Error).message)}</p>
          <p class="meta mono" title="${esc(session.cwd)}">${esc(compactPath(session.cwd))}</p>
        </div>
      </article>
    </section>
  `
}

function replaceTimelineSession(sessionId: string, html: string) {
  const existing = detailTimeline.querySelector<HTMLElement>(`.timeline-session[data-session-id="${CSS.escape(sessionId)}"]`)
  if (existing) existing.outerHTML = html
}

function setTimelineCardExpanded(card: HTMLElement, expanded: boolean) {
  const cardId = card.dataset.cardId
  if (!cardId) return
  if (expanded) expandedTimelineCards.add(cardId)
  else expandedTimelineCards.delete(cardId)

  card.classList.toggle('expanded', expanded)
  const button = card.querySelector<HTMLButtonElement>('.timeline-card-toggle')
  if (!button) return
  button.innerHTML = iconMarkup(expanded ? 'chevron-down' : 'chevron-right')
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  button.title = expanded ? 'Show less.' : 'Show full text.'
  button.setAttribute('aria-label', expanded ? 'Show less' : 'Show full text')
}

function handleTimelineClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('.timeline-session-button, .timeline-toggle-button, .timeline-card-toggle, .timeline-resume-button')
  if (!button || !detailTimeline.contains(button)) return

  if (button.classList.contains('timeline-card-toggle')) {
    const card = button.closest<HTMLElement>('.timeline-message-group')
    if (!card) return
    setTimelineCardExpanded(card, !card.classList.contains('expanded'))
    return
  }

  const sessionId = button.dataset.sessionId
  if (!sessionId) return
  if (button.classList.contains('timeline-resume-button')) {
    void createTerminal('codex', sessionId)
  } else if (button.classList.contains('timeline-session-button')) {
    void openSessionTranscript(sessionId)
  } else {
    toggleTimelineSession(sessionId)
  }
}

function timelineTaskKey(task: TimelineLoadTask) {
  return `${task.renderVersion}:${task.session.id}`
}

async function loadTimelineTask(task: TimelineLoadTask) {
  if (
    timelineRenderVersion !== task.renderVersion ||
    currentDetail?.project.id !== task.projectId ||
    collapsedTimelineSessions.has(task.session.id)
  ) return

  try {
    const sessionDetail = await getSessionDetail(task.session.id)
    if (timelineRenderVersion !== task.renderVersion || currentDetail?.project.id !== task.projectId) return
    replaceTimelineSession(task.session.id, renderTimelineSession(sessionDetail, task.index))
    if (currentDetail) renderWorkstreamDigest(currentDetail)
  } catch (error) {
    if (timelineRenderVersion !== task.renderVersion || currentDetail?.project.id !== task.projectId) return
    replaceTimelineSession(task.session.id, renderTimelineSessionError(task.session, task.index, error))
    if (currentDetail) renderWorkstreamDigest(currentDetail)
  }
}

function pumpTimelineLoadQueue() {
  while (timelineLoadsInFlight < TIMELINE_DETAIL_CONCURRENCY && timelineLoadQueue.length > 0) {
    const task = timelineLoadQueue.shift()
    if (!task) return
    if (timelineRenderVersion !== task.renderVersion || currentDetail?.project.id !== task.projectId) {
      queuedTimelineSessionIds.delete(timelineTaskKey(task))
      continue
    }
    timelineLoadsInFlight += 1
    void loadTimelineTask(task).finally(() => {
      timelineLoadsInFlight -= 1
      queuedTimelineSessionIds.delete(timelineTaskKey(task))
      pumpTimelineLoadQueue()
    })
  }
}

function queueTimelineTask(task: TimelineLoadTask) {
  const key = timelineTaskKey(task)
  if (queuedTimelineSessionIds.has(key)) return
  queuedTimelineSessionIds.add(key)
  timelineLoadQueue.push(task)
  pumpTimelineLoadQueue()
}

function renderTimeline(detail: ProjectDetail) {
  const renderVersion = ++timelineRenderVersion
  const projectId = detail.project.id
  const sessions = sortSessionsForDisplay(detail.sessions)
  timelineObserver?.disconnect()
  timelineObserver = null
  timelineLoadQueue = []
  queuedTimelineSessionIds = new Set()
  if (!sessions.length) {
    renderEmpty(detailTimeline, 'No session timeline available.')
    return
  }

  detailTimeline.innerHTML = sessions
    .map((session, index) => renderTimelineSessionPlaceholder(session, index))
    .join('')

  const taskBySessionId = new Map(sessions.map((session, index) => [
    session.id,
    { session, index, renderVersion, projectId } satisfies TimelineLoadTask,
  ]))
  const loadableElements = [...detailTimeline.querySelectorAll<HTMLElement>('.timeline-session.timeline-loading')]

  if (!('IntersectionObserver' in window)) {
    for (const element of loadableElements) {
      const task = element.dataset.sessionId ? taskBySessionId.get(element.dataset.sessionId) : undefined
      if (task) queueTimelineTask(task)
    }
    return
  }

  timelineObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const element = entry.target as HTMLElement
      observer.unobserve(element)
      const task = element.dataset.sessionId ? taskBySessionId.get(element.dataset.sessionId) : undefined
      if (task) queueTimelineTask(task)
    }
  }, {
    root: contentRoot,
    rootMargin: `${TIMELINE_LAZY_ROOT_MARGIN_PX}px 0px`,
  })
  for (const element of loadableElements) timelineObserver.observe(element)
}

function renderRefinedLessons(lessons: RefinedLesson[]) {
  if (!lessons.length) {
    renderEmpty(detailRefined, 'No refined lessons yet. Click "Extract lessons" to run an LLM pass.')
    return
  }
  detailRefined.innerHTML = lessons
    .map((lesson) => {
      const scopeChip = `<span class="badge subtle">${esc(lesson.scope)}</span>`
      return `
        <div class="compact-item">
          <h3>${esc(lesson.rule)}</h3>
          <p class="meta">${esc(lesson.why)}</p>
          <span class="chip-row">${scopeChip}</span>
        </div>
      `
    })
    .join('')
}

function renderTouchedPaths(paths: WorkLocationRecord[]) {
  if (!paths.length) {
    renderEmpty(detailPaths, 'No meaningful work areas yet.')
    return
  }
  const visible = paths.slice(0, 12)
  const hiddenCount = paths.length - visible.length
  detailPaths.innerHTML = [
    ...visible.map(
      (loc) => {
        const writeCount = loc.writeCount ?? 0
        const readCount = loc.readCount ?? 0
        const pieces = [
          writeCount > 0 ? `${fmtNumber(writeCount)} write${writeCount === 1 ? '' : 's'}` : '',
          readCount > 0 ? `${fmtNumber(readCount)} read${readCount === 1 ? '' : 's'}` : '',
          (loc.activeMs ?? 0) > 0 ? `${fmtDuration(loc.activeMs)} active` : '',
          `${fmtRelative(loc.lastActivityAt)}`,
        ].filter(Boolean)
        return `
        <div class="compact-item">
          <h3 title="${esc(loc.path)}">${esc(compactPath(loc.path))}</h3>
          <p class="meta">
            <span class="evidence-chip evidence-${esc(loc.evidence)}">${esc(loc.evidence)}</span>
            · ${pieces.map(esc).join(' · ')}
          </p>
        </div>
      `
      },
    ),
    hiddenCount > 0
      ? `<p class="meta compact-note">${hiddenCount} lower-ranked work area${hiddenCount === 1 ? '' : 's'} hidden.</p>`
      : '',
  ].join('')
}

function renderSessions(sessions: SessionRecord[]) {
  if (!sessions.length) {
    renderEmpty(detailSessions, 'No sessions.')
    return
  }
  detailSessions.innerHTML = sessions
    .slice()
    .sort((a, b) => (
      sessionOrder === 'oldest-first'
        ? a.startedAt.localeCompare(b.startedAt)
        : b.startedAt.localeCompare(a.startedAt)
    ))
    .map((s) => {
      const lessonBadge = (s.lessonCount ?? 0) > 0 ? ` · ${s.lessonCount} lesson${s.lessonCount === 1 ? '' : 's'}` : ''
      return `
        <div class="compact-item">
          <div class="item-heading-row">
            <h3>${esc(s.title || s.id)}</h3>
            <button class="small-button session-transcript-button" type="button" data-session-id="${esc(s.id)}" title="Open the full transcript for this session.">${buttonContent('book-open', 'Transcript')}</button>
          </div>
          <p class="meta">${fmtRelative(s.updatedAt)} · ${s.messageCount} msgs · ${s.toolCallCount} tools · ${fmtNumber(s.tokenCount)} tokens${lessonBadge}</p>
          <p class="meta mono" title="${esc(s.transcriptPath)}">${esc(compactPath(s.transcriptPath))}</p>
        </div>
      `
    })
    .join('')

  detailSessions.querySelectorAll<HTMLButtonElement>('.session-transcript-button').forEach((button) => {
    button.addEventListener('click', () => {
      const sessionId = button.dataset.sessionId
      if (!sessionId) return
      void openSessionTranscript(sessionId)
    })
  })
}

function rerenderTimelineAndSessions() {
  if (!currentDetail) return
  void renderTimeline(currentDetail)
  renderSessions(currentDetail.sessions)
}

function toggleTimelineSession(sessionId: string) {
  if (collapsedTimelineSessions.has(sessionId)) {
    collapsedTimelineSessions.delete(sessionId)
  } else {
    collapsedTimelineSessions.add(sessionId)
  }
  saveCollapsedTimelineSessions()
  rerenderTimelineAndSessions()
  updateTimelineControls()
}

function toggleAllTimelineSessions() {
  if (!currentDetail) return
  const allCollapsed = currentDetail.sessions.every((session) => collapsedTimelineSessions.has(session.id))
  if (allCollapsed) {
    for (const session of currentDetail.sessions) collapsedTimelineSessions.delete(session.id)
  } else {
    for (const session of currentDetail.sessions) collapsedTimelineSessions.add(session.id)
  }
  saveCollapsedTimelineSessions()
  rerenderTimelineAndSessions()
  updateTimelineControls()
}

function renderSettingsControls() {
  sessionOrderOldestInput.checked = sessionOrder === 'oldest-first'
  sessionOrderNewestInput.checked = sessionOrder === 'newest-first'
  contextClaudeToCodexInput.checked = contextSharingSettings.claudeToCodex
  contextCodexToClaudeInput.checked = contextSharingSettings.codexToClaude
  automaticWorkstreamNamingInput.checked = automaticNamingEnabled
  renderTimelineOrderButton()
}

function setSessionOrder(order: SessionOrder) {
  if (sessionOrder === order) return
  sessionOrder = order
  localStorage.setItem(SESSION_ORDER_STORAGE_KEY, order)
  renderSettingsControls()
  rerenderTimelineAndSessions()
}

function setContextSharing(patch: Partial<ContextSharingSettings>) {
  contextSharingSettings = { ...contextSharingSettings, ...patch }
  saveContextSharingSettings()
  renderSettingsControls()
}

function setAutomaticNamingEnabled(enabled: boolean) {
  automaticNamingEnabled = enabled
  localStorage.setItem(AUTO_NAMING_ENABLED_STORAGE_KEY, String(enabled))
  renderSettingsControls()
  if (enabled) {
    labelWorkstreamsStatus.textContent = 'Automatic naming enabled. Checking new workstreams...'
    autoNameNewWorkstreams()
  } else if (!labelJobInFlight) {
    labelWorkstreamsStatus.textContent = 'Automatic naming is off. Use Improve names whenever you want it.'
  }
}

function normalizeResumeMessageText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clampResumeBlock(text: string, maxChars: number) {
  const normalized = normalizeResumeMessageText(text)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

function isUsefulResumeMessage(message: SessionMessageRecord) {
  const text = normalizeResumeMessageText(message.text)
  if (!text) return false
  if (message.role === 'system') return false
  if (text === '[Request interrupted by user]') return false
  if (text.startsWith('<local-command-caveat>')) return false
  if (text.startsWith('<local-command-stdout>')) return false
  if (text.includes('<command-name>') || text.includes('<command-message>')) return false
  return true
}

async function buildResumeTranscriptContext(detail: ProjectDetail) {
  const recentSessions = detail.sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-RESUME_TRANSCRIPT_SESSION_LIMIT)

  if (!recentSessions.length) return ['- No prior transcript messages available.']

  const details = await Promise.all(
    recentSessions.map(async (session) => {
      try {
        return await getSessionDetail(session.id)
      } catch {
        return null
      }
    }),
  )

  const messages = details
    .filter((entry): entry is SessionDetail => entry !== null)
    .flatMap((entry) =>
      entry.messages
        .filter(isUsefulResumeMessage)
        .map((message) => ({ session: entry.session, message })),
    )
    .sort((a, b) => a.message.timestamp.localeCompare(b.message.timestamp))
    .slice(-RESUME_TRANSCRIPT_MESSAGE_LIMIT)

  if (!messages.length) return ['- No useful transcript messages available.']

  const lines: string[] = []
  let remainingChars = RESUME_TRANSCRIPT_CHAR_BUDGET
  for (const { session, message } of messages) {
    if (remainingChars <= 0) break

    const header = `[${message.timestamp}] ${message.role.toUpperCase()} · ${clampText(session.title || session.id, 80)}`
    const body = clampResumeBlock(message.text, Math.min(RESUME_TRANSCRIPT_MESSAGE_CHARS, remainingChars))
    if (!body) continue
    lines.push(header, body, '')
    remainingChars -= header.length + body.length + 2
  }

  return lines.length ? lines : ['- Transcript messages were too large to include.']
}

function bridgeSourceLabel(targetKind: AgentTerminalKind) {
  return targetKind === 'codex' ? 'Claude Code' : 'Codex'
}

function bridgeTargetLabel(targetKind: AgentTerminalKind) {
  return targetKind === 'codex' ? 'Codex' : 'Claude Code'
}

async function buildBridgeContext(detail: ProjectDetail, targetKind: AgentTerminalKind) {
  const state = effectiveWorkstreamState(detail)
  const sourceLabel = bridgeSourceLabel(targetKind)
  const targetLabel = bridgeTargetLabel(targetKind)
  const recentSessions = sessionsForBridgeTarget(detail, targetKind)
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-BRIDGE_SESSION_LIMIT)

  const sessionDetails = (await Promise.all(
    recentSessions.map(async (session) => {
      try {
        return await getSessionDetail(session.id)
      } catch {
        return null
      }
    }),
  )).filter((entry): entry is SessionDetail => entry !== null)

  const extractedNotes = sessionDetails
    .flatMap((sessionDetail) => (
      sessionDetail.candidates
        .filter((candidate) => candidate.kind !== 'summary')
        .map((candidate) => `- ${candidate.kind}: ${clampResumeBlock(candidate.text, 320)}`)
    ))
    .slice(-BRIDGE_CANDIDATE_LIMIT)

  const lessons = detail.refinedLessons
    .slice(0, 8)
    .map((lesson) => `- ${lesson.rule}\n  Why: ${lesson.why}`)

  return [
    `Cross-agent memory bridge for ${targetLabel}.`,
    '',
    `Workstream: ${detail.project.name}`,
    `Repo: ${detail.project.repoRoot}`,
    detail.project.branch ? `Branch: ${detail.project.branch}` : undefined,
    state.goal.value ? `Goal: ${state.goal.value}` : undefined,
    state.currentState.value ? `Current state: ${state.currentState.value}` : undefined,
    state.blocker.value ? `Blocker or question: ${state.blocker.value}` : undefined,
    state.nextAction.value ? `Next action: ${state.nextAction.value}` : undefined,
    state.lastVerification.value ? `Last verification: ${state.lastVerification.value}` : undefined,
    '',
    `Source context: recent ${sourceLabel} work only.`,
    'Boundary: this is memory-level handoff context, not a deep transcript resume.',
    '',
    `${sourceLabel} sessions included:`,
    ...(recentSessions.length
      ? recentSessions.map((session) => `- ${session.title || session.id} (${fmtRelative(session.updatedAt)})`)
      : [`- No ${sourceLabel} sessions included by current memory-sharing settings.`]),
    '',
    'Shared lessons/corrections:',
    ...(lessons.length ? lessons : ['- No refined lessons yet.']),
    '',
    'Extracted notes from source agent:',
    ...(extractedNotes.length ? extractedNotes : ['- No extracted notes available yet.']),
    '',
    'Instructions:',
    '- Treat this as compact background guidance from another agent.',
    '- Do not assume it is complete; inspect the current repo state before changing files.',
    '- If this conflicts with the current terminal or repo state, trust the current state.',
  ].filter((line): line is string => line !== undefined).join('\n')
}

async function buildResumeContext(detail: ProjectDetail) {
  const sessions = detail.sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const recentSessions = sessions.slice(-4)
  const state = effectiveWorkstreamState(detail)
  const topPaths = detail.touchedPaths
    .slice(0, 12)
    .map((loc) => {
      const activity = [
        (loc.writeCount ?? 0) > 0 ? `${loc.writeCount} writes` : undefined,
        (loc.readCount ?? 0) > 0 ? `${loc.readCount} reads` : undefined,
        (loc.activeMs ?? 0) > 0 ? `${fmtDuration(loc.activeMs)} active` : undefined,
      ].filter((entry): entry is string => Boolean(entry))
      return `- ${loc.path} (${loc.evidence}${activity.length ? `, ${activity.join(', ')}` : ''})`
    })
  const lessons = detail.refinedLessons
    .slice(0, 12)
    .map((lesson) => `- ${lesson.rule}\n  Why: ${lesson.why}`)
  const transcriptContext = await buildResumeTranscriptContext(detail)
  const noIncludedSessionsText = '- No prior sessions in this workstream.'

  return [
    'Continue this workstream using the context below.',
    '',
    `Workstream: ${detail.project.name}`,
    `Repo: ${detail.project.repoRoot}`,
    detail.project.branch ? `Branch: ${detail.project.branch}` : undefined,
    state.goal.value ? `Goal: ${state.goal.value}` : undefined,
    state.currentState.value ? `Current state: ${state.currentState.value}` : undefined,
    state.blocker.value ? `Blocker or question: ${state.blocker.value}` : undefined,
    state.nextAction.value ? `Next action: ${state.nextAction.value}` : undefined,
    state.lastVerification.value ? `Last verification: ${state.lastVerification.value}` : undefined,
    `Time range: ${fmtDateRange(detail.project.firstStartedAt, detail.project.lastUpdatedAt)}`,
    `Sessions already recorded: ${detail.project.sessionCount}`,
    '',
    'gogoagent resume policy:',
    '- Claude launches with native `claude --resume` when a prior Claude session id is available.',
    '- Codex launches with native `codex resume` when a prior Codex session id is available.',
    '- When no native session is available, gogoagent can paste this context for review.',
    '- Shell terminals receive no automatic context.',
    '- Cross-agent memory bridge packets are separate from this deep workstream resume context.',
    '',
    'Recent sessions:',
    ...(recentSessions.length
      ? recentSessions.map((session) => `- ${session.title || session.id} (${session.updatedAt})`)
      : [noIncludedSessionsText]),
    '',
    'Important work areas from previous work:',
    ...(topPaths.length ? topPaths : ['- No meaningful work areas detected yet.']),
    '',
    'Reusable lessons/corrections:',
    ...(lessons.length ? lessons : ['- No refined lessons yet. Use the timeline and transcript evidence if needed.']),
    '',
    'Recent transcript excerpts:',
    ...transcriptContext,
    '',
    'Instructions:',
    '- Treat the above as prior context, not a fresh task by itself.',
    '- Before making changes, inspect the current repo state.',
    '- Prefer the repo conventions and commands already visible in this workstream.',
    '- If the context is stale or ambiguous, ask a narrow clarification before doing broad edits.',
  ].filter((line): line is string => line !== undefined).join('\n')
}

function setRenameEditing(editing: boolean) {
  detailTitle.classList.toggle('hidden', editing)
  renameInput.classList.toggle('hidden', !editing)
  renameWorkstreamButton.classList.toggle('hidden', editing)
  archiveWorkstreamButton.classList.toggle('hidden', editing)
  suggestTitleButton.classList.toggle('hidden', editing)
  renameSaveButton.classList.toggle('hidden', !editing)
  renameCancelButton.classList.toggle('hidden', !editing)
}

function startInlineRename() {
  if (!currentDetail) return
  renameInput.value = currentDetail.project.name
  renameStatus.textContent = ''
  renameSaveButton.disabled = false
  renameCancelButton.disabled = false
  setRenameEditing(true)
  window.setTimeout(() => {
    renameInput.focus()
    renameInput.select()
  }, 0)
}

function cancelInlineRename() {
  renameStatus.textContent = ''
  renameSaveButton.disabled = false
  renameCancelButton.disabled = false
  setRenameEditing(false)
}

async function saveWorkstreamName() {
  if (!currentDetail) return

  const projectId = currentDetail.project.id
  const name = renameInput.value.trim()
  if (name.length < 3) {
    renameStatus.textContent = 'Use at least 3 characters.'
    return
  }

  if (name === currentDetail.project.name) {
    cancelInlineRename()
    return
  }

  renameSaveButton.disabled = true
  renameCancelButton.disabled = true
  renameStatus.textContent = 'Saving name...'
  try {
    const response = await window.gogoagent.workstreams.rename(projectId, name)
    projects = projects.map((project) => project.id === projectId ? response.project : project)
    currentDetail = { ...currentDetail, project: response.project }
    setCachedValue(projectDetailCache, projectId, currentDetail)
    renderProjectsList()
    renderDetail(currentDetail)
    setRenameEditing(false)
    renameStatus.textContent = ''
  } catch (error) {
    renameStatus.textContent = `Rename failed: ${(error as Error).message}`
  } finally {
    renameSaveButton.disabled = false
    renameCancelButton.disabled = false
  }
}

async function toggleWorkstreamArchive() {
  if (!currentDetail) return

  const project = currentDetail.project
  const archived = Boolean(project.archivedAt)
  archiveWorkstreamButton.disabled = true
  renameStatus.textContent = archived ? 'Restoring workstream...' : 'Archiving workstream...'

  try {
    const response = archived
      ? await window.gogoagent.workstreams.restore(project.id)
      : await window.gogoagent.workstreams.archive(project.id)

    if (archived) {
      selectedProjectId = null
      currentDetail = null
      showArchivedWorkstreams = false
      projects = []
      await loadAllProjects()
      await selectProject(response.project.id)
      return
    }

    currentDetail = { ...currentDetail, project: response.project }
    projectDetailCache.delete(response.project.id)
    syncProjectFromDetail(response.project)
    showEmptyDetail('Workstream archived.')
  } catch (error) {
    renameStatus.textContent = `${archived ? 'Restore' : 'Archive'} failed: ${(error as Error).message}`
  } finally {
    archiveWorkstreamButton.disabled = false
  }
}

async function copyResumeContext(button: HTMLButtonElement) {
  if (!currentDetail) return
  await copyText(await buildResumeContext(currentDetail))
  flashButton(button, 'Copied')
}

function transcriptPlainText(view: TranscriptView) {
  const lines = [`# ${view.title}`, '', `${view.subtitle}`, view.meta, '']
  for (const section of view.sections) {
    lines.push(`## ${section.session.title || section.session.id}`)
    lines.push(`Session: ${section.session.id}`)
    lines.push(`Started: ${section.session.startedAt}`)
    lines.push(`Updated: ${section.session.updatedAt}`)
    lines.push('')
    for (const message of section.messages) {
      lines.push(`[${message.timestamp}] ${message.role.toUpperCase()}`)
      lines.push(message.text)
      lines.push('')
    }
  }
  return lines.join('\n')
}

function renderTranscriptDialog() {
  if (!activeTranscript) return
  const query = transcriptSearch.value.trim()
  const lowerQuery = query.toLowerCase()
  transcriptSubtitle.textContent = activeTranscript.subtitle
  transcriptTitle.textContent = activeTranscript.title
  const pendingSessionCount = activeTranscript.pendingSessions?.length ?? 0
  const loadedSessionCount = activeTranscript.sections.length
  transcriptMeta.textContent = [
    activeTranscript.meta,
    pendingSessionCount > 0 ? `${loadedSessionCount} loaded` : undefined,
  ].filter((value): value is string => Boolean(value)).join(' · ')

  let remainingMessages = transcriptVisibleMessageLimit
  let matchedMessageCount = 0
  let renderedMessageCount = 0
  const sectionHtml: string[] = []
  for (const section of activeTranscript.sections) {
      const matchingMessages = query
        ? section.messages.filter((message) => message.text.toLowerCase().includes(lowerQuery))
        : section.messages
      matchedMessageCount += matchingMessages.length
      const messages = matchingMessages.slice(0, Math.max(0, remainingMessages))
      remainingMessages -= messages.length
      renderedMessageCount += messages.length
      if (!messages.length) continue
      const commandArtifacts = section.artifacts
        .filter((artifact) => artifact.kind === 'command' || artifact.kind === 'tool_call')
        .slice(0, 8)
      const candidateChips = section.candidates
        .filter((candidate) => candidate.kind !== 'summary')
        .slice(0, 6)

      sectionHtml.push(`
        <section class="transcript-session">
          <header class="transcript-session-header">
            <div>
              <h3>${esc(section.session.title || section.session.id)}</h3>
              <p class="meta">${fmtDateRange(section.session.startedAt, section.session.updatedAt)} · ${section.session.messageCount} msgs · ${section.session.toolCallCount} tools · ${fmtNumber(section.session.tokenCount)} tokens</p>
            </div>
            <span class="badge subtle">${esc(section.session.gitBranch ?? 'no branch')}</span>
          </header>
          ${
            commandArtifacts.length
              ? `<div class="transcript-evidence">${commandArtifacts.map((artifact) => `<span class="evidence-chip evidence-${esc(artifact.evidence ?? 'mentioned')}">${esc(artifact.detail ?? artifact.label)}</span>`).join('')}</div>`
              : ''
          }
          ${
            candidateChips.length
              ? `<div class="transcript-candidates">${candidateChips.map((candidate) => `<span class="badge">${esc(candidate.kind)}</span>`).join('')}</div>`
              : ''
          }
          <div class="transcript-messages">
            ${messages.map((message) => `
              <article class="transcript-message">
                <div class="transcript-message-meta">
                  <span class="role-chip role-${esc(message.role)}">${esc(message.role)}</span>
                  <span>${esc(message.timestamp)}</span>
                </div>
                <pre>${highlight(message.text, query)}</pre>
              </article>
            `).join('')}
          </div>
        </section>
      `)
  }

  const controls = [
    renderedMessageCount < matchedMessageCount
      ? `<button class="secondary-button transcript-load-more-messages" type="button">Show ${Math.min(TRANSCRIPT_MESSAGE_PAGE_SIZE, matchedMessageCount - renderedMessageCount)} more messages</button>`
      : '',
    pendingSessionCount > 0
      ? `<button class="secondary-button transcript-load-more-sessions" type="button"${activeTranscript.loadingSessions ? ' disabled' : ''}>${activeTranscript.loadingSessions ? 'Loading sessions...' : `Load ${Math.min(TRANSCRIPT_SESSION_PAGE_SIZE, pendingSessionCount)} more sessions`}</button>`
      : '',
  ].filter(Boolean).join('')
  const empty = activeTranscript.loadingSessions
    ? '<p class="empty">Loading transcript sessions...</p>'
    : query
      ? '<p class="empty">No messages in the loaded sessions match this search.</p>'
      : '<p class="empty">No transcript messages loaded.</p>'
  const error = activeTranscript.loadError
    ? `<p class="meta transcript-load-error">${esc(activeTranscript.loadError)}</p>`
    : ''
  transcriptBody.innerHTML = [
    sectionHtml.join('') || empty,
    error,
    controls ? `<div class="transcript-pagination"><span class="meta">Showing ${renderedMessageCount} of ${matchedMessageCount} matching loaded messages.</span><div class="button-row">${controls}</div></div>` : '',
  ].join('')
}

function resetTranscriptPagination() {
  transcriptVisibleMessageLimit = TRANSCRIPT_INITIAL_MESSAGE_LIMIT
}

async function loadMoreTranscriptSessions(count = TRANSCRIPT_SESSION_PAGE_SIZE) {
  const view = activeTranscript
  if (!view || view.loadingSessions || !view.pendingSessions?.length) return
  const batch = view.pendingSessions.slice(0, count)
  view.loadingSessions = true
  view.loadError = undefined
  renderTranscriptDialog()

  const settled = await Promise.allSettled(batch.map((session) => getSessionDetail(session.id)))
  if (activeTranscript !== view) return

  const details = settled
    .filter((result): result is PromiseFulfilledResult<SessionDetail> => result.status === 'fulfilled')
    .map((result) => result.value)
  view.sections.push(...details.map((detail) => ({
    session: detail.session,
    artifacts: detail.artifacts,
    candidates: detail.candidates,
    messages: detail.messages,
  })))
  view.sections.sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt))
  view.pendingSessions = view.pendingSessions.slice(batch.length)
  const failureCount = settled.length - details.length
  if (failureCount > 0) view.loadError = `${failureCount} transcript session${failureCount === 1 ? '' : 's'} failed to load.`
  view.loadingSessions = false
  renderTranscriptDialog()
}

async function loadAllTranscriptSessionsForSearch() {
  const view = activeTranscript
  if (!view) return
  while (
    activeTranscript === view &&
    transcriptSearch.value.trim() &&
    (view?.loadingSessions || (view?.pendingSessions?.length ?? 0) > 0)
  ) {
    if (view.loadingSessions) {
      await delay(40)
      continue
    }
    await loadMoreTranscriptSessions(view.pendingSessions?.length ?? 0)
  }
  if (activeTranscript === view) renderTranscriptDialog()
}

async function openSessionTranscript(sessionId: string) {
  resetTranscriptPagination()
  transcriptSearch.value = ''
  activeTranscript = null
  transcriptBody.innerHTML = '<p class="empty">Loading transcript…</p>'
  transcriptDialog.showModal()
  try {
    const detail = await getSessionDetail(sessionId)
    activeTranscript = {
      title: detail.session.title || detail.session.id,
      subtitle: 'Session transcript',
      meta: `${detail.session.cwd} · ${detail.session.messageCount} messages · ${detail.session.toolCallCount} tools`,
      sections: [{
        session: detail.session,
        artifacts: detail.artifacts,
        candidates: detail.candidates,
        messages: detail.messages,
      }],
    }
    renderTranscriptDialog()
  } catch (error) {
    transcriptTitle.textContent = 'Transcript failed to load'
    transcriptMeta.textContent = (error as Error).message
    transcriptBody.innerHTML = ''
  }
}

async function openWorkstreamTranscript() {
  if (!currentDetail) return
  resetTranscriptPagination()
  transcriptSearch.value = ''
  transcriptDialog.showModal()
  const sessions = currentDetail.sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  activeTranscript = {
    title: currentDetail.project.name,
    subtitle: 'Workstream transcript',
    meta: `${currentDetail.project.repoRoot} · ${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${fmtDateRange(currentDetail.project.firstStartedAt, currentDetail.project.lastUpdatedAt)}`,
    sections: [],
    pendingSessions: sessions,
  }
  renderTranscriptDialog()
  await loadMoreTranscriptSessions()
}

async function copyTranscript() {
  if (!activeTranscript) return
  await copyText(transcriptPlainText(activeTranscript))
  flashButton(copyTranscriptButton, 'Copied')
}

// ---------- Refine ----------
async function runRefine() {
  if (!selectedProjectId) return
  refineButton.disabled = true
  refineStatus.textContent = 'Generating takeaways…'
  try {
    const job = await window.gogoagent.lessons.refine({ projectId: selectedProjectId })
    pollRefineJob(job.jobId)
  } catch (error) {
    refineStatus.textContent = `Failed to start: ${(error as Error).message}`
    refineButton.disabled = false
  }
}

async function runSuggestTitle() {
  if (!selectedProjectId) return
  suggestTitleButton.disabled = true
  renameStatus.textContent = 'Suggesting title...'
  try {
    const result = await window.gogoagent.projects.suggestTitle(selectedProjectId)
    detailTitle.textContent = result.name
    await loadAllProjects()
    renameStatus.textContent = result.summary ? `Suggested: ${result.summary}` : 'Title updated.'
  } catch (error) {
    renameStatus.textContent = `Title suggestion failed: ${(error as Error).message}`
  } finally {
    suggestTitleButton.disabled = false
  }
}

function pollRefineJob(jobId: string) {
  if (refinePollTimer !== null) window.clearTimeout(refinePollTimer)
  const tick = async () => {
    try {
      const job = await window.gogoagent.lessons.getRefineStatus(jobId)
      refineStatus.textContent = `Takeaways ${job.state}: ${job.processed}/${job.total} processed, ${job.skipped} skipped${job.errors.length ? `, ${job.errors.length} errors` : ''}`
      if (job.state === 'done' || job.state === 'error') {
        refineButton.disabled = false
        // Reload detail to pick up new refined lessons.
        if (selectedProjectId) {
          try {
            currentDetail = await getProjectDetail(selectedProjectId)
            syncProjectFromDetail(currentDetail.project)
            renderRefinedLessons(currentDetail.refinedLessons)
          } catch {
            // Leave previous detail in place.
          }
        }
        return
      }
      refinePollTimer = window.setTimeout(tick, 1500)
    } catch (error) {
      refineStatus.textContent = `Polling failed: ${(error as Error).message}`
      refineButton.disabled = false
    }
  }
  refinePollTimer = window.setTimeout(tick, 500)
}

// ---------- Workstream Labels ----------
function describeLabelJob(job: RefineJobStatus) {
  const errors = job.errors.length ? `, ${job.errors.length} errors` : ''
  const skipped = job.skipped ? `, ${job.skipped} cached` : ''
  const generated = job.generated ?? 0
  if (job.state === 'done' && job.skipped === job.total) return `Labels already current (${job.total}); refreshed list.`
  if (job.state === 'done') return `Applied ${generated} new label${generated === 1 ? '' : 's'}${skipped}; refreshed list${errors}.`
  if (job.state === 'error') return `Labeling ended with errors: ${generated} applied, ${job.processed}/${job.total} checked${skipped}${errors}.`
  return `Labeling names: ${job.processed}/${job.total}${skipped}${errors}.`
}

function readAutoNameSeenWorkstreams() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTO_NAME_SEEN_STORAGE_KEY) ?? '[]') as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeAutoNameSeenWorkstreams(ids: Set<string>) {
  localStorage.setItem(AUTO_NAME_SEEN_STORAGE_KEY, JSON.stringify([...ids]))
}

function autoNameNewWorkstreams() {
  if (!automaticNamingEnabled) return
  if (showArchivedWorkstreams) return
  if (labelJobInFlight || projects.length === 0) return

  const seen = readAutoNameSeenWorkstreams()
  const labelableProjects = projects.filter((project) => !project.draft && project.sessionCount > 0)
  const failed = new Set(failedLabelProjectIds)
  const newProjectIds = labelableProjects
    .map((project) => project.id)
    .filter((id) => !seen.has(id) && !failed.has(id))
  if (newProjectIds.length === 0) return

  void labelWorkstreamNames({ projectIds: newProjectIds, automatic: true })
}

async function labelWorkstreamNames(options: { projectIds?: string[]; automatic?: boolean } = {}) {
  if (labelJobInFlight) {
    if (!options.automatic) labelWorkstreamsStatus.textContent = 'Labeling already running.'
    return
  }

  const targetProjectIds = options.projectIds ?? filterProjects()
    .filter((project) => !project.draft && project.sessionCount > 0)
    .map((project) => project.id)
  if (!targetProjectIds.length) {
    if (!options.automatic) labelWorkstreamsStatus.textContent = 'No workstreams with history to name.'
    return
  }

  labelJobInFlight = true
  renderLabelControls()
  labelWorkstreamsStatus.textContent = options.automatic
    ? `Naming ${targetProjectIds.length} new workstream${targetProjectIds.length === 1 ? '' : 's'}...`
    : `Improving ${targetProjectIds.length} workstream name${targetProjectIds.length === 1 ? '' : 's'} with local Codex...`
  try {
    const job = await window.gogoagent.workstreams.label({ projectIds: targetProjectIds })
    pollLabelJob(job.jobId, { automatic: options.automatic, targetProjectIds })
  } catch (error) {
    const message = (error as Error).message
    labelWorkstreamsStatus.textContent = message.includes('/workstreams/label -> 404')
      ? 'Labeling route is missing from the running sidecar. Restart gogoagent so the sidecar picks up the latest code.'
      : `Labeling failed to start: ${message}`
    failedLabelProjectIds = [...targetProjectIds]
    labelJobInFlight = false
    renderLabelControls()
  }
}

function pollLabelJob(jobId: string, options: { automatic?: boolean; targetProjectIds: string[] }) {
  if (labelPollTimer !== null) window.clearTimeout(labelPollTimer)
  const tick = async () => {
    try {
      const job = await window.gogoagent.workstreams.getLabelStatus(jobId)
      const statusText = describeLabelJob(job)
      labelWorkstreamsStatus.textContent = statusText
      if (job.state === 'done' || job.state === 'error') {
        const targetSet = new Set(options.targetProjectIds)
        const reportedFailures = new Set(
          job.errors.map((error) => error.sessionId).filter((id) => targetSet.has(id)),
        )
        const wholeJobFailed = job.state === 'error' && (
          job.errors.some((error) => error.sessionId === '*') || reportedFailures.size === 0
        )
        const completedIds = wholeJobFailed
          ? []
          : options.targetProjectIds.filter((id) => !reportedFailures.has(id))
        const seen = readAutoNameSeenWorkstreams()
        for (const projectId of completedIds) seen.add(projectId)
        writeAutoNameSeenWorkstreams(seen)
        failedLabelProjectIds = wholeJobFailed
          ? [...options.targetProjectIds]
          : options.targetProjectIds.filter((id) => reportedFailures.has(id))
        labelJobInFlight = false
        labelPollTimer = null
        renderLabelControls()
        await window.gogoagent.debug.rescan()
        await loadAllProjects()
        labelWorkstreamsStatus.textContent = statusText
        if (options.automatic && job.state === 'done' && job.errors.length === 0) {
          window.setTimeout(() => {
            if (labelWorkstreamsStatus.textContent === statusText) labelWorkstreamsStatus.textContent = ''
          }, 4500)
        }
        return
      }
      labelPollTimer = window.setTimeout(tick, 1500)
    } catch (error) {
      labelWorkstreamsStatus.textContent = `Label polling failed: ${(error as Error).message}`
      failedLabelProjectIds = [...options.targetProjectIds]
      labelJobInFlight = false
      labelPollTimer = null
      renderLabelControls()
    }
  }
  labelPollTimer = window.setTimeout(tick, 500)
}

// ---------- Debug dialog ----------
async function loadDebugState() {
  try {
    const state = await window.gogoagent.debug.getState()
    debugLastScan.textContent = state.lastScan.inProgress
      ? 'Scan in progress…'
      : state.lastScan.finishedAt
        ? `Last scan: ${fmtRelative(state.lastScan.finishedAt)} · ${state.lastScan.ok ? 'ok' : 'error'}${state.lastScan.durationMs ? ` · ${state.lastScan.durationMs}ms` : ''}`
        : 'No scan yet.'

    debugPathsList.innerHTML = state.paths
      .map(
        (p) =>
          `<li><span class="debug-pill ${p.exists ? 'ok' : 'error'}">${p.exists ? 'exists' : 'missing'}</span> <code>${esc(p.path)}</code>${p.entryCount !== undefined ? ` <span class="meta">· ${p.entryCount} entries</span>` : ''}</li>`,
      )
      .join('')

    debugStepsList.innerHTML = state.steps
      .map(
        (step) =>
          `<li><span class="debug-pill ${step.status}">${step.status}</span> ${esc(step.name)}${step.count !== undefined ? ` · ${step.count}` : ''}${step.durationMs ? ` · ${step.durationMs}ms` : ''}${step.error ? ` <span class="meta">· ${esc(step.error)}</span>` : ''}</li>`,
      )
      .join('')

    debugCountsList.innerHTML = Object.entries(state.counts)
      .map(([key, value]) => `<li><code>${esc(key)}</code>: ${value}</li>`)
      .join('')

    debugErrorsList.innerHTML = state.errors.length
      ? state.errors.map((e) => `<li><span class="debug-pill error">error</span> ${esc(e.where)} · ${esc(e.message)}</li>`).join('')
      : '<li class="meta">None.</li>'
  } catch (error) {
    debugLastScan.textContent = `Failed to load debug: ${(error as Error).message}`
  }
}

async function rescan() {
  debugLastScan.textContent = 'Rescanning…'
  try {
    await window.gogoagent.debug.rescan()
    await loadDebugState()
    await loadAllProjects()
  } catch (error) {
    debugLastScan.textContent = `Rescan failed: ${(error as Error).message}`
  }
}

// ---------- Phone access ----------
let currentMobileStatus: MobileGatewayStatus = { running: false, connections: [] }
let selectedPhoneUrl = ''
let phoneStatusTimer: number | null = null

function setPhoneStatus(message: string, error = false) {
  phoneStatus.textContent = message
  phoneStatus.classList.toggle('error', error)
}

function selectedPhoneConnection() {
  return currentMobileStatus.connections.find((connection) => connection.url === selectedPhoneUrl)
    ?? currentMobileStatus.connections[0]
}

function renderMobileStatus(status: MobileGatewayStatus) {
  currentMobileStatus = status
  phoneOffline.classList.toggle('hidden', status.running)
  phoneOnline.classList.toggle('hidden', !status.running)
  phoneToggle.setAttribute('aria-pressed', String(status.running))
  phoneToggle.querySelector('.button-label')!.textContent = status.running ? 'Phone access on' : 'Connect phone'

  if (!status.running) {
    phoneQrImage.removeAttribute('src')
    phonePairingCode.textContent = '—'
    phoneDeviceCount.textContent = ''
    if (status.error) setPhoneStatus(status.error, true)
    return
  }

  const previousSelection = selectedPhoneUrl
  phoneAddressSelect.replaceChildren()
  for (const connection of status.connections) {
    const option = document.createElement('option')
    option.value = connection.url
    option.textContent = connection.label
    phoneAddressSelect.append(option)
  }
  selectedPhoneUrl = status.connections.some((connection) => connection.url === previousSelection)
    ? previousSelection
    : status.connections[0]?.url ?? ''
  phoneAddressSelect.value = selectedPhoneUrl

  const connection = selectedPhoneConnection()
  if (connection) phoneQrImage.src = connection.qrDataUrl
  else phoneQrImage.removeAttribute('src')
  const code = status.pairingCode ?? ''
  phonePairingCode.textContent = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code || '—'
  const pairedDevices = status.pairedDevices ?? 0
  phoneDeviceCount.textContent = pairedDevices
    ? `${pairedDevices} paired phone${pairedDevices === 1 ? '' : 's'}`
    : 'No phone has paired yet.'
}

async function refreshMobileStatus(showError = false) {
  try {
    renderMobileStatus(await window.gogoagent.mobile.getStatus())
  } catch (error) {
    if (showError) setPhoneStatus(`Could not check phone access: ${(error as Error).message}`, true)
  }
}

function startPhoneStatusPolling() {
  if (phoneStatusTimer !== null) window.clearInterval(phoneStatusTimer)
  phoneStatusTimer = window.setInterval(() => {
    if (phoneDialog.open) void refreshMobileStatus()
  }, 1500)
}

phoneToggle.addEventListener('click', () => {
  setPhoneStatus('')
  void refreshMobileStatus(true)
  phoneDialog.showModal()
  startPhoneStatusPolling()
})
phoneDialog.addEventListener('close', () => {
  if (phoneStatusTimer !== null) window.clearInterval(phoneStatusTimer)
  phoneStatusTimer = null
})
phoneStartButton.addEventListener('click', async () => {
  phoneStartButton.disabled = true
  setPhoneStatus('Starting private phone access…')
  try {
    renderMobileStatus(await window.gogoagent.mobile.start())
    setPhoneStatus('Ready. Scan the QR code with your phone camera.')
  } catch (error) {
    setPhoneStatus(`Could not start phone access: ${(error as Error).message}`, true)
  } finally {
    phoneStartButton.disabled = false
  }
})
phoneStopButton.addEventListener('click', async () => {
  phoneStopButton.disabled = true
  setPhoneStatus('Stopping phone access…')
  try {
    renderMobileStatus(await window.gogoagent.mobile.stop())
    setPhoneStatus('Phone access stopped. Existing pairings are no longer valid.')
  } catch (error) {
    setPhoneStatus(`Could not stop phone access: ${(error as Error).message}`, true)
  } finally {
    phoneStopButton.disabled = false
  }
})
phoneAddressSelect.addEventListener('change', () => {
  selectedPhoneUrl = phoneAddressSelect.value
  const connection = selectedPhoneConnection()
  if (connection) phoneQrImage.src = connection.qrDataUrl
})
phoneCopyLinkButton.addEventListener('click', async () => {
  const connection = selectedPhoneConnection()
  if (!connection) return
  try {
    await copyText(connection.pairingUrl)
    setPhoneStatus('Pairing link copied. Treat it like the pairing code until it is used or expires.')
  } catch (error) {
    setPhoneStatus(`Could not copy pairing link: ${(error as Error).message}`, true)
  }
})

// ---------- Boot ----------
hydrateIconPlaceholders()
renderSettingsControls()
renderLabelControls()
void refreshMobileStatus()

async function toggleArchivedWorkstreams() {
  showArchivedWorkstreams = !showArchivedWorkstreams
  projects = []
  projectsSearch.value = ''
  showEmptyDetail(showArchivedWorkstreams ? 'Select an archived workstream.' : 'Select a workstream.')
  await loadAllProjects()
}

async function loadAllProjects() {
  try {
    pruneCache(projectDetailCache, PROJECT_DETAIL_CACHE_MS)
    pruneCache(sessionDetailCache, SESSION_DETAIL_CACHE_MS)
    const listedProjects = await window.gogoagent.projects.list({ archived: showArchivedWorkstreams })
    setAppNotice('')
    projects = sortProjectsByActivity(listedProjects)
    renderProjectsList()
    // Re-select current project if it still exists, so UI stays put across refreshes.
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      await selectProject(selectedProjectId)
    } else if (selectedProjectId) {
      showEmptyDetail(projects.length === 0
        ? archivedViewEmptyMessage()
        : showArchivedWorkstreams ? 'Select an archived workstream.' : 'Select a workstream.')
    } else {
      detailEmptyText.textContent = projects.length === 0
        ? archivedViewEmptyMessage()
        : showArchivedWorkstreams ? 'Select an archived workstream.' : 'Select a workstream.'
    }
    void loadAttention()
    autoNameNewWorkstreams()
  } catch (error) {
    const message = `Failed to load workstreams: ${(error as Error).message}`
    setAppNotice(message)
    renderEmpty(projectsList, message)
  }
}

refreshButton.addEventListener('click', () => {
  void checkHealth()
  void loadAllProjects()
})
projectsSearch.addEventListener('input', renderProjectsList)
showArchivedButton.addEventListener('click', () => void toggleArchivedWorkstreams())
timelineToggleAllButton.addEventListener('click', () => toggleAllTimelineSessions())
detailTimeline.addEventListener('click', handleTimelineClick)
globalCwdInput.value = localStorage.getItem(GLOBAL_CWD_STORAGE_KEY) ?? ''
const storedLaunchKind = localStorage.getItem(GLOBAL_LAUNCH_KIND_STORAGE_KEY)
setGlobalLaunchKind(storedLaunchKind === 'codex' || storedLaunchKind === 'shell' ? storedLaunchKind : 'claude')
globalCwdInput.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (moveDirectorySuggestion(event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault()
    return
  }
  if (event.key === 'Tab' && cwdCompletionState?.completions.length) {
    event.preventDefault()
    acceptDirectorySuggestion()
    return
  }
  if (event.key === 'Escape') {
    clearDirectorySuggestions()
    return
  }
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    if ((cwdCompletionState?.index ?? -1) >= 0) acceptDirectorySuggestion()
    else void startGlobalWorkstream()
  }
})
globalCwdInput.addEventListener('input', () => {
  globalCwdInput.setAttribute('aria-invalid', 'false')
  globalLaunchStatus.textContent = ''
  clearDirectorySuggestions()
  scheduleDirectorySuggestions()
})
globalCwdInput.addEventListener('focus', () => {
  if (readRecentDirectories().length > 0) showRecentDirectorySuggestions()
  else scheduleDirectorySuggestions()
})
globalCwdInput.addEventListener('blur', () => window.setTimeout(clearDirectorySuggestions, 120))
if (window.gogoagent.system.remote) {
  globalBrowseButton.title = 'Type a remote directory; suggestions come from the remote machine.'
  globalBrowseButton.setAttribute('aria-label', globalBrowseButton.title)
  globalCwdInput.title = 'Directory on the remote machine. Type to see matching folders.'
}
globalBrowseButton.addEventListener('click', () => void browseForGlobalDirectory())
globalUseCurrentButton.addEventListener('click', () => useCurrentProjectForGlobalLaunch())
for (const input of globalLaunchKindInputs) {
  input.addEventListener('change', () => {
    if (input.checked) setGlobalLaunchKind(input.value as TerminalKind)
  })
}
newWorkstreamButton.addEventListener('click', () => void startGlobalWorkstream())
labelWorkstreamsButton.addEventListener('click', () => void labelWorkstreamNames())
labelWorkstreamsRetryButton.addEventListener('click', () => {
  const projectIds = [...failedLabelProjectIds]
  failedLabelProjectIds = []
  renderLabelControls()
  void labelWorkstreamNames({ projectIds })
})
refineButton.addEventListener('click', () => void runRefine())
newShellButton.addEventListener('click', () => void createTerminal('shell'))
newClaudeButton.addEventListener('click', () => void activateOrCreateAgentTerminal('claude'))
newCodexButton.addEventListener('click', () => void activateOrCreateAgentTerminal('codex'))
terminalCloseButton.addEventListener('click', () => void closeActiveTerminal())
terminalHost.addEventListener('pointerdown', () => {
  const view = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
  if (view) focusTerminalWithoutPageScroll(view)
})
workstreamDigest.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !currentDetail) return
  const row = target.closest<HTMLElement>('.workstream-digest-row[data-terminal-id]')
  if (!row || !workstreamDigest.contains(row)) return
  void jumpToNeedsInputTerminal(currentDetail.project.id, row.dataset.terminalId)
})
workstreamDigest.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target
  if (!(target instanceof Element) || !currentDetail) return
  const row = target.closest<HTMLElement>('.workstream-digest-row[data-terminal-id]')
  if (!row || !workstreamDigest.contains(row)) return
  event.preventDefault()
  void jumpToNeedsInputTerminal(currentDetail.project.id, row.dataset.terminalId)
})
terminalCopyContextButton.addEventListener('click', () => void copyResumeContext(terminalCopyContextButton))
headerCopyContextButton.addEventListener('click', () => void copyResumeContext(headerCopyContextButton))
terminalPasteContextButton.addEventListener('click', () => void pasteResumeContextIntoActiveTerminal())
terminalCopyLogButton.addEventListener('click', () => void copyActiveTerminalLog())
renameWorkstreamButton.addEventListener('click', () => startInlineRename())
renameSaveButton.addEventListener('click', () => void saveWorkstreamName())
renameCancelButton.addEventListener('click', () => cancelInlineRename())
archiveWorkstreamButton.addEventListener('click', () => void toggleWorkstreamArchive())
terminalFocusButton.addEventListener('click', () => toggleTerminalFocus())
stateEditButton.addEventListener('click', editWorkstreamState)
stateSaveButton.addEventListener('click', () => void saveWorkstreamState())
stateCancelButton.addEventListener('click', cancelWorkstreamStateEdit)
renameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    void saveWorkstreamName()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelInlineRename()
  }
})
transcriptButton.addEventListener('click', () => void openWorkstreamTranscript())
transcriptSearch.addEventListener('input', () => {
  resetTranscriptPagination()
  if (transcriptSearchTimer !== null) window.clearTimeout(transcriptSearchTimer)
  transcriptSearchTimer = window.setTimeout(() => {
    transcriptSearchTimer = null
    if (transcriptSearch.value.trim() && (activeTranscript?.pendingSessions?.length ?? 0) > 0) {
      void loadAllTranscriptSessionsForSearch()
      return
    }
    renderTranscriptDialog()
  }, TRANSCRIPT_SEARCH_DEBOUNCE_MS)
})
transcriptBody.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.transcript-load-more-messages')) {
    transcriptVisibleMessageLimit += TRANSCRIPT_MESSAGE_PAGE_SIZE
    renderTranscriptDialog()
    return
  }
  if (target.closest('.transcript-load-more-sessions')) {
    void loadMoreTranscriptSessions()
  }
})
copyTranscriptButton.addEventListener('click', () => void copyTranscript())
suggestTitleButton.addEventListener('click', () => void runSuggestTitle())
settingsToggle.addEventListener('click', () => {
  renderSettingsControls()
  settingsDialog.showModal()
})
sessionOrderOldestInput.addEventListener('change', () => {
  if (sessionOrderOldestInput.checked) setSessionOrder('oldest-first')
})
sessionOrderNewestInput.addEventListener('change', () => {
  if (sessionOrderNewestInput.checked) setSessionOrder('newest-first')
})
contextClaudeToCodexInput.addEventListener('change', () => {
  setContextSharing({ claudeToCodex: contextClaudeToCodexInput.checked })
})
contextCodexToClaudeInput.addEventListener('change', () => {
  setContextSharing({ codexToClaude: contextCodexToClaudeInput.checked })
})
automaticWorkstreamNamingInput.addEventListener('change', () => {
  setAutomaticNamingEnabled(automaticWorkstreamNamingInput.checked)
})
timelineOrderButton.addEventListener('click', () => {
  setSessionOrder(sessionOrder === 'oldest-first' ? 'newest-first' : 'oldest-first')
})
debugToggle.addEventListener('click', () => {
  void loadDebugState()
  debugDialog.showModal()
})
debugRescanButton.addEventListener('click', () => void rescan())
window.addEventListener('resize', () => scheduleTerminalFit())
if ('ResizeObserver' in window) {
  terminalResizeObserver = new ResizeObserver(() => scheduleTerminalFit())
  terminalResizeObserver.observe(terminalCard)
  terminalResizeObserver.observe(terminalHost)
}

setupTerminalEvents()
void loadExistingTerminals()
updateGlobalLaunchControls()

async function boot() {
  if (await waitForSidecar()) {
    void checkHealth()
    await loadAllProjects()
  } else {
    renderEmpty(projectsList, 'Sidecar is not reachable yet. Click Reload after it starts.')
  }
}

void boot()
window.setInterval(() => void checkHealth(), 3000)
