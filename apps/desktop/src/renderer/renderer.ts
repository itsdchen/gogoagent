import type {
  AttentionItem,
  ArtifactRecord,
  DebugState,
  ExtractionCandidate,
  LinkedInvestigation,
  Project,
  ProjectDetail,
  RefineJobStatus,
  RefinedLesson,
  RepositoryState,
  SessionDetail,
  SessionMessageRecord,
  SessionRecord,
  TerminalDecisionReceipt,
  WorkstreamDocument,
  WorkstreamChatResponse,
  WorkstreamDocumentSections,
  WorkLocationRecord,
  WorkstreamTextFile,
} from '@gogoagent/shared'
import { renderMarkdownReader } from './markdownReader.js'

type TerminalKind = 'shell' | 'claude' | 'codex' | 'agy'
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
  if (kind === 'agy') return 'lightbulb'
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
const appShell = document.querySelector('.app-shell') as HTMLElement
const sidebarReturnButton = document.querySelector('#sidebar-return-button') as HTMLButtonElement
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
const workstreamViewTabs = document.querySelector('#workstream-view-tabs') as HTMLElement
const workstreamsToggle = document.querySelector('#workstreams-toggle') as HTMLButtonElement
const workstreamsToggleCount = document.querySelector('#workstreams-toggle-count') as HTMLElement
const overviewChatToggle = document.querySelector('#overview-chat-toggle') as HTMLButtonElement
const overviewChatCard = document.querySelector('#overview-chat-card') as HTMLElement
const overviewChatClose = document.querySelector('#overview-chat-close') as HTMLButtonElement
const overviewChatBackdrop = document.querySelector('#overview-chat-backdrop') as HTMLButtonElement
const detailTitle = document.querySelector('#detail-title') as HTMLElement
const detailSubtitle = document.querySelector('#detail-subtitle') as HTMLElement
const detailMeta = document.querySelector('#detail-meta') as HTMLElement
const workstreamStateSummary = document.querySelector('#workstream-state-summary') as HTMLDivElement
const workstreamHandoff = document.querySelector('#workstream-handoff') as HTMLDetailsElement
const documentArticle = document.querySelector('#document-article') as HTMLDivElement
const documentForm = document.querySelector('#document-form') as HTMLFormElement
const documentStatus = document.querySelector('#document-status') as HTMLParagraphElement
const documentDraftButton = document.querySelector('#document-draft-button') as HTMLButtonElement
const documentEditButton = document.querySelector('#document-edit-button') as HTMLButtonElement
const documentSaveButton = document.querySelector('#document-save-button') as HTMLButtonElement
const documentCancelButton = document.querySelector('#document-cancel-button') as HTMLButtonElement
const overviewChatHistory = document.querySelector('#overview-chat-history') as HTMLDivElement
const overviewChatMode = document.querySelector('#overview-chat-mode') as HTMLSelectElement
const overviewChatSection = document.querySelector('#overview-chat-section') as HTMLSelectElement
const overviewChatSectionLabel = document.querySelector('#overview-chat-section-label') as HTMLLabelElement
const overviewChatQuestion = document.querySelector('#overview-chat-question') as HTMLTextAreaElement
const overviewChatSend = document.querySelector('#overview-chat-send') as HTMLButtonElement
const overviewChatStatus = document.querySelector('#overview-chat-status') as HTMLParagraphElement
const investigationParent = document.querySelector('#investigation-parent') as HTMLDivElement
const investigationList = document.querySelector('#investigation-list') as HTMLDivElement
const investigationTitle = document.querySelector('#investigation-new-title') as HTMLInputElement
const investigationQuestion = document.querySelector('#investigation-new-question') as HTMLTextAreaElement
const investigationAdd = document.querySelector('#investigation-add') as HTMLButtonElement
const investigationStatus = document.querySelector('#investigation-status') as HTMLParagraphElement
const investigationStartDialog = document.querySelector('#investigation-start-dialog') as HTMLDialogElement
const investigationStartTitle = document.querySelector('#investigation-start-title') as HTMLElement
const investigationStartSummary = document.querySelector('#investigation-start-summary') as HTMLElement
const investigationStartQuestion = document.querySelector('#investigation-start-question') as HTMLElement
const investigationStartAgent = document.querySelector('#investigation-start-agent') as HTMLElement
const investigationStartDirectory = document.querySelector('#investigation-start-directory') as HTMLElement
const investigationStartWarning = document.querySelector('#investigation-start-warning') as HTMLElement
const investigationStartCancel = document.querySelector('#investigation-start-cancel') as HTMLButtonElement
const investigationStartConfirm = document.querySelector('#investigation-start-confirm') as HTMLButtonElement
const workstreamStateFreshness = document.querySelector('#workstream-state-freshness') as HTMLParagraphElement
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
const terminalContextMenu = document.querySelector('#terminal-context-menu') as HTMLDivElement
const terminalContextOpen = document.querySelector('#terminal-context-open') as HTMLButtonElement
const terminalContextCopy = document.querySelector('#terminal-context-copy') as HTMLButtonElement
const fileReaderDialog = document.querySelector('#file-reader-dialog') as HTMLDialogElement
const fileReaderTitle = document.querySelector('#file-reader-title') as HTMLHeadingElement
const fileReaderClose = document.querySelector('#file-reader-close') as HTMLButtonElement
const fileReaderForm = document.querySelector('#file-reader-form') as HTMLFormElement
const fileReaderPath = document.querySelector('#file-reader-path') as HTMLInputElement
const fileReaderStatus = document.querySelector('#file-reader-status') as HTMLParagraphElement
const fileReaderMeta = document.querySelector('#file-reader-meta') as HTMLSpanElement
const fileReaderContent = document.querySelector('#file-reader-content') as HTMLDivElement
const fileReaderKeep = document.querySelector('#file-reader-keep') as HTMLButtonElement
const readingListCard = document.querySelector('#reading-list-card') as HTMLElement
const readingListToggle = document.querySelector('#reading-list-toggle') as HTMLButtonElement
const readingListCount = document.querySelector('#reading-list-count') as HTMLSpanElement
const readFileByPath = document.querySelector('#read-file-by-path') as HTMLButtonElement
const readingList = document.querySelector('#reading-list') as HTMLDivElement
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
const newAgyButton = document.querySelector('#new-agy-button') as HTMLButtonElement
const terminalCopyContextButton = document.querySelector('#terminal-copy-context-button') as HTMLButtonElement
const terminalPasteContextButton = document.querySelector('#terminal-paste-context-button') as HTMLButtonElement
const terminalCopyLogButton = document.querySelector('#terminal-copy-log-button') as HTMLButtonElement
const terminalCloseButton = document.querySelector('#terminal-close-button') as HTMLButtonElement
const workstreamDigest = document.querySelector('#workstream-digest') as HTMLDivElement
const workstreamChangesTitle = document.querySelector('#workstream-changes-title') as HTMLElement
const workstreamChangesMeta = document.querySelector('#workstream-changes-meta') as HTMLElement
const workstreamChangesList = document.querySelector('#workstream-changes-list') as HTMLDivElement
const workstreamChangesNote = document.querySelector('#workstream-changes-note') as HTMLElement
const workstreamChangesActivity = document.querySelector('#workstream-changes-activity') as HTMLButtonElement
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

const switcherDialog = document.querySelector('#switcher-dialog') as HTMLDialogElement
const switcherTitle = document.querySelector('#switcher-title') as HTMLHeadingElement
const switcherClose = document.querySelector('#switcher-close') as HTMLButtonElement
const switcherQuery = document.querySelector('#switcher-query') as HTMLInputElement
const switcherResults = document.querySelector('#switcher-results') as HTMLDivElement
const switcherHelp = document.querySelector('#switcher-help') as HTMLParagraphElement
const keyboardHelpDialog = document.querySelector('#keyboard-help-dialog') as HTMLDialogElement
const keyboardHelpClose = document.querySelector('#keyboard-help-close') as HTMLButtonElement
const keyboardHelpOpen = document.querySelector('#keyboard-help-open') as HTMLButtonElement

const settingsToggle = document.querySelector('#settings-toggle') as HTMLButtonElement
const settingsDialog = document.querySelector('#settings-dialog') as HTMLDialogElement
const appearanceInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="appearance"]')]
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
let currentWorkstreamView: 'overview' | 'activity' | 'terminal' = 'overview'
let refinePollTimer: number | null = null
let labelPollTimer: number | null = null
let labelJobInFlight = false
let showArchivedWorkstreams = false
let activeTranscript: TranscriptView | null = null
const projectDetailCache = new Map<string, CacheEntry<ProjectDetail>>()
const sessionDetailCache = new Map<string, CacheEntry<SessionDetail>>()
const contextPreviewLoadedIds = new Set<string>()
const contextPreviewFailedIds = new Set<string>()
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
let currentWorkstreamDocument: WorkstreamDocument | null = null
let pendingWorkstreamDocument: WorkstreamDocument | null = null
let documentEditing = false
let documentBusyWorkstreamId: string | null = null
let changeVisit: { workstreamId: string; ready: boolean; previousViewedAt?: string } | null = null
let changeSessionDetails: SessionDetail[] = []
let changeSessionCount = 0
let changeSessionLoad: 'loading' | 'loaded' | 'error' = 'loading'
type OverviewChatTurn = { role: 'user' | 'assistant'; text: string; response?: WorkstreamChatResponse }
const overviewChatByWorkstream = new Map<string, OverviewChatTurn[]>()
let overviewChatBusy = false
let investigations: LinkedInvestigation[] = []
let investigationParentLink: LinkedInvestigation | undefined
let investigationParentName = ''
let investigationBusy = false
let investigationStartPending: { id: string; kind: AgentTerminalKind } | null = null

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
const THEME_STORAGE_KEY = 'gogoagent.theme.v1'
const READING_FILES_STORAGE_KEY = 'gogoagent.readingFiles.v1'

type Appearance = 'dark' | 'light' | 'system'
const systemLightTheme = window.matchMedia('(prefers-color-scheme: light)')
function readAppearance(): Appearance {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'system' ? stored : 'dark'
}
let appearance: Appearance = readAppearance()
function applyAppearance() {
  document.documentElement.dataset.theme = appearance === 'light' || (appearance === 'system' && systemLightTheme.matches) ? 'light' : 'dark'
}
function setAppearance(next: Appearance) {
  appearance = next
  localStorage.setItem(THEME_STORAGE_KEY, next)
  applyAppearance()
  renderSettingsControls()
}
applyAppearance()
systemLightTheme.addEventListener('change', () => { if (appearance === 'system') applyAppearance() })

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
const readingFilesByWorkstream = readReadingFiles()
let readerWorkstreamId: string | null = null
let readerTerminalId: string | null = null
let readerFile: WorkstreamTextFile | null = null
let readingListOpen = false
let readerRequestVersion = 0
let contextTerminalId: string | null = null
let contextSelection = ''
let cachedRightClickSelection = ''
let cachedRightClickTerminalId: string | null = null
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
  logRestoreStarted: boolean
  logRestored: boolean
  awaitingRedraw?: boolean
  needsInputSuppressed?: boolean
  pendingData: Array<{ data: string; logBytes?: number }>
  pendingDataChars: number
  pendingWrites: string[]
  writeFrame: number | null
  scrollAfterWrite?: boolean
  scrollGeneration: number
}

type SwitcherTarget =
  | { kind: 'view'; title: string; detail: string; view: 'overview' | 'activity' | 'terminal' }
  | { kind: 'terminal'; title: string; detail: string; id: string }
  | { kind: 'workstream'; title: string; detail: string; id: string }

let switcherItems: SwitcherTarget[] = []
let switcherIndex = 0
let switcherScope: 'workstreams' | 'current' = 'workstreams'
let switcherReturnFocus: HTMLElement | null = null
let switcherSelecting = false

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
  sessionId?: string
}

interface WorkstreamChangeItem {
  label: string
  value: string
  when?: string
  tone: 'attention' | 'check' | 'knowledge' | 'activity' | 'muted'
  action: 'terminal' | 'session' | 'article' | 'handoff' | 'activity'
  id?: string
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

function readReadingFiles(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(READING_FILES_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([id, paths]) => [
      id,
      Array.isArray(paths) ? paths.filter((item): item is string => typeof item === 'string').slice(0, 30) : [],
    ]))
  } catch { return {} }
}

function saveReadingFiles() {
  localStorage.setItem(READING_FILES_STORAGE_KEY, JSON.stringify(readingFilesByWorkstream))
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
  return selected === 'codex' || selected === 'agy' || selected === 'shell' ? selected : 'claude'
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

function renderReadingList() {
  const paths = selectedProjectId ? readingFilesByWorkstream[selectedProjectId] ?? [] : []
  readingListCount.textContent = `(${paths.length})`
  readingListToggle.setAttribute('aria-expanded', readingListOpen && Boolean(selectedProjectId) ? 'true' : 'false')
  readingListCard.classList.toggle('hidden', !readingListOpen || !selectedProjectId)
  readingList.innerHTML = paths.length ? paths.map((filePath, index) => {
    const name = filePath.split(/[\\/]/).pop() || filePath
    return `<div class="reading-list-row">
      <button class="secondary-button reading-list-open" type="button" data-reading-index="${index}" title="${esc(filePath)}">${esc(name)}</button>
      <button class="secondary-button reading-list-remove" type="button" data-remove-reading-index="${index}" aria-label="Remove ${esc(name)} from To read">Remove</button>
    </div>`
  }).join('') : '<p class="meta">No saved files yet. Open a file by path or from a terminal selection, then keep it here.</p>'
}

function updateReaderKeepButton() {
  const file = readerFile
  const workstreamId = readerWorkstreamId
  fileReaderKeep.classList.toggle('hidden', !file || !workstreamId)
  if (!file || !workstreamId) return
  const saved = (readingFilesByWorkstream[workstreamId] ?? []).includes(file.path)
  fileReaderKeep.disabled = saved
  fileReaderKeep.textContent = saved ? 'Saved in Overview' : 'Keep in Overview'
}

async function readReaderPath() {
  const version = ++readerRequestVersion
  const workstreamId = readerWorkstreamId
  readerFile = null
  updateReaderKeepButton()
  fileReaderContent.innerHTML = ''
  fileReaderMeta.textContent = ''
  fileReaderStatus.textContent = 'Opening file…'
  if (!workstreamId) {
    fileReaderStatus.textContent = 'Attach this terminal to a workstream to read its files here.'
    return
  }
  try {
    const file = await window.gogoagent.workstreams.readTextFile(workstreamId, fileReaderPath.value, readerTerminalId ?? undefined)
    if (version !== readerRequestVersion || !fileReaderDialog.open) return
    readerFile = file
    fileReaderPath.value = file.path
    fileReaderTitle.textContent = file.path.split(/[\\/]/).pop() || file.path
    fileReaderMeta.textContent = `${fmtBytes(file.size)} · modified ${fmtRelative(file.modifiedAt)}`
    fileReaderContent.innerHTML = file.kind === 'markdown'
      ? renderMarkdownReader(file.content)
      : `<pre class="file-reader-plain">${esc(file.content)}</pre>`
    fileReaderContent.scrollTop = 0
    fileReaderStatus.textContent = ''
    updateReaderKeepButton()
  } catch (error) {
    if (version !== readerRequestVersion || !fileReaderDialog.open) return
    fileReaderTitle.textContent = 'Open a file'
    fileReaderStatus.textContent = (error as Error).message.replace(/^\/workstreams\/[^ ]+\/read-file -> \d+: /, '')
  }
}

function openFileReader(filePath: string, workstreamId: string | null, terminalId: string | null = null) {
  if (!fileReaderDialog.open && document.querySelector('dialog[open]')) return
  readerWorkstreamId = workstreamId
  readerTerminalId = terminalId
  fileReaderTitle.textContent = 'Open a file'
  fileReaderPath.value = filePath
  if (!fileReaderDialog.open) fileReaderDialog.showModal()
  if (filePath.trim()) {
    void readReaderPath()
  } else {
    readerRequestVersion += 1
    readerFile = null
    fileReaderStatus.textContent = ''
    fileReaderMeta.textContent = ''
    fileReaderContent.innerHTML = ''
    updateReaderKeepButton()
    fileReaderPath.focus()
  }
}

function selectedFilePath(selection: string) {
  return selection.trim().split(/\r?\n/, 1)[0]
    .trim()
    .replace(/^[`'"<]+|[`'">]+$/g, '')
    .replace(/:\d+(?::\d+)?$/, '')
    .replace(/[.,;]+$/, '')
}

function hideTerminalContextMenu() {
  terminalContextMenu.classList.add('hidden')
  contextTerminalId = null
  contextSelection = ''
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

async function loadWorkstreamContextPreview(detail: ProjectDetail, selectionVersion: number) {
  const recentSessions = detail.sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)
  const results = await Promise.allSettled(recentSessions.map((session) => getSessionDetail(session.id)))
  if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== detail.project.id) return
  contextPreviewLoadedIds.add(detail.project.id)
  if (results.length && results.every((result) => result.status === 'rejected')) contextPreviewFailedIds.add(detail.project.id)
  else contextPreviewFailedIds.delete(detail.project.id)
  renderWorkstreamDigest(currentDetail)
}

function digestText(text: string, max = 180) {
  return clampText(stripAnsi(text).replace(/\s+/g, ' ').trim(), max)
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
      label: 'Agent update',
      value: digestText(latestMessage.message.text),
      detail: `${latestMessage.session.title || latestMessage.session.id} · ${fmtRelative(latestMessage.message.timestamp)}`,
      sessionId: latestMessage.session.id,
    }
  }

  const latestSession = detail.sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return {
    label: 'Recent session',
    value: latestSession ? latestSession.title || latestSession.id : 'No session activity yet',
    detail: latestSession ? `updated ${fmtRelative(latestSession.updatedAt)}` : undefined,
    tone: latestSession ? undefined : 'muted',
    sessionId: latestSession?.id,
  }
}

function latestRequestDigest(detail: ProjectDetail): WorkstreamDigestItem {
  const latestRequest = loadedSessionDetails(detail)
    .flatMap((sessionDetail) => sessionDetail.messages.map((message) => ({ session: sessionDetail.session, message })))
    .filter(({ message }) => {
      return message.role === 'user' && !isTimelineNoiseMessage(message) && digestText(message.text).length >= 8
    })
    .sort((a, b) => b.message.timestamp.localeCompare(a.message.timestamp))[0]

  if (latestRequest) {
    return {
      label: 'Your request',
      value: digestText(latestRequest.message.text),
      detail: `${latestRequest.session.title || latestRequest.session.id} · ${fmtRelative(latestRequest.message.timestamp)}`,
      sessionId: latestRequest.session.id,
    }
  }

  return {
    label: 'Your request',
    value: contextPreviewFailedIds.has(detail.project.id)
      ? 'Recent transcript could not be loaded.'
      : detail.sessions.length && !contextPreviewLoadedIds.has(detail.project.id)
        ? 'Loading recent transcript…'
        : 'No request text in the loaded recent sessions.',
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
    latestRequestDigest(detail),
  ]

  workstreamDigest.innerHTML = items
    .map((item) => `
      <div
        class="workstream-digest-row${item.tone ? ` ${esc(item.tone)}` : ''}${item.terminalId || item.sessionId ? ' actionable' : ''}"
        ${item.terminalId ? `data-terminal-id="${esc(item.terminalId)}" role="button" tabindex="0" title="Jump to the waiting terminal."` : ''}
        ${item.sessionId ? `data-session-id="${esc(item.sessionId)}" role="button" tabindex="0" title="Open the source transcript."` : ''}
      >
        <span class="workstream-digest-label">${esc(item.label)}</span>
        <span class="workstream-digest-main">${esc(item.value)}</span>
        ${item.detail ? `<span class="workstream-digest-detail">${esc(item.detail)}</span>` : ''}
      </div>
    `)
    .join('')
  renderWorkstreamState(detail)
  renderWorkstreamChanges(detail)
}

function renderWorkstreamChanges(detail: ProjectDetail) {
  const visit = changeVisit?.workstreamId === detail.project.id ? changeVisit : null
  if (!visit?.ready) {
    workstreamChangesTitle.textContent = 'Recent activity'
    workstreamChangesMeta.textContent = 'Checking recorded activity…'
    workstreamChangesList.innerHTML = '<p class="meta">Reading workstream history…</p>'
    workstreamChangesNote.textContent = ''
    return
  }
  const baseline = visit.previousViewedAt
  const baselineMs = baseline ? Date.parse(baseline) : Number.NaN
  const afterVisit = (value?: string) => Boolean(value && Number.isFinite(baselineMs) && Date.parse(value) > baselineMs)
  workstreamChangesTitle.textContent = baseline ? 'Since your last visit' : 'Recent activity'
  workstreamChangesMeta.textContent = baseline
    ? `Last opened ${fmtRelative(baseline)} · ${changeSessionCount} session${changeSessionCount === 1 ? '' : 's'} with activity`
    : 'No previous visit recorded · latest workstream activity'

  const items: WorkstreamChangeItem[] = []
  const waiting = currentWorkstreamTerminals().find(terminalNeedsInput)
  if (waiting) items.push({ label: 'Needs you now', value: `${terminalLabel(waiting.record.kind)} is waiting for input.`, when: waiting.record.lastActivityAt, tone: 'attention', action: 'terminal', id: waiting.record.id })

  const messages = changeSessionDetails.flatMap((sessionDetail) => sessionDetail.messages
    .filter((message) => !baseline || afterVisit(message.timestamp))
    .map((message) => ({ session: sessionDetail.session, message })))
    .filter(({ message }) => isUsefulDigestMessage(message))
    .sort((a, b) => b.message.timestamp.localeCompare(a.message.timestamp))
  const check = messages.find(({ message }) => /\b(?:typecheck|tests?|build|lint|verification)\b/i.test(message.text))
  if (check) items.push({ label: 'Check mentioned', value: digestText(check.message.text, 170), when: check.message.timestamp, tone: 'check', action: 'session', id: check.session.id })

  if (afterVisit(detail.project.state?.updatedAt)) {
    const state = detail.project.state
    const value = state?.blocker?.trim()
      ? `Current blocker: ${digestText(state.blocker, 150)}`
      : state?.currentState?.trim()
        ? digestText(state.currentState, 150)
        : state?.nextAction?.trim()
          ? `Next action: ${digestText(state.nextAction, 150)}`
          : 'Saved workstream notes were updated.'
    items.push({ label: 'Handoff updated', value, when: state?.updatedAt, tone: 'knowledge', action: 'handoff' })
  }
  if (currentWorkstreamDocument?.workstreamId === detail.project.id && afterVisit(currentWorkstreamDocument.updatedAt)) {
    items.push({ label: 'Article updated', value: 'The working document has newer saved content.', when: currentWorkstreamDocument.updatedAt, tone: 'knowledge', action: 'article' })
  }

  const latestUpdate = messages.find(({ message }) => message.id !== check?.message.id)
  if (latestUpdate) items.push({ label: 'Agent update', value: digestText(latestUpdate.message.text, 170), when: latestUpdate.message.timestamp, tone: 'activity', action: 'session', id: latestUpdate.session.id })
  if (!messages.length && changeSessionCount > 0) {
    const latestSession = detail.sessions
      .filter((session) => !baseline || afterVisit(session.updatedAt))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (latestSession) items.push({ label: 'Session activity', value: latestSession.title || latestSession.id, when: latestSession.updatedAt, tone: 'activity', action: 'session', id: latestSession.id })
  }
  const ended = currentWorkstreamTerminals().filter((view) => afterVisit(view.record.endedAt)).at(-1)
  if (ended && items.length < 4) items.push({ label: 'Terminal ended', value: `${terminalLabel(ended.record.kind)} exited.`, when: ended.record.endedAt, tone: 'muted', action: 'terminal', id: ended.record.id })

  workstreamChangesList.innerHTML = items.length
    ? items.slice(0, 4).map((item) => `<button class="workstream-change-row ${item.tone}" type="button" data-change-action="${item.action}" ${item.id ? `data-change-id="${esc(item.id)}"` : ''}>
        <span class="workstream-change-copy"><span class="workstream-change-label">${esc(item.label)}</span><span class="workstream-change-text">${esc(item.value)}</span></span>
        <span class="workstream-change-time">${item.when ? esc(fmtRelative(item.when)) : ''}</span>
      </button>`).join('')
    : `<p class="meta">${changeSessionLoad === 'loading' ? 'Reading recent session excerpts…' : baseline ? 'No recorded changes since your last visit.' : 'No recorded activity yet.'}</p>`
  workstreamChangesNote.textContent = [
    changeSessionLoad === 'loading' && items.length ? 'Checking recent session excerpts…' : '',
    changeSessionLoad === 'error' ? 'Some recent session excerpts could not be loaded.' : '',
    changeSessionLoad !== 'loading' && changeSessionCount > 4 ? `Checked excerpts from up to 4 of ${changeSessionCount} ${baseline ? 'updated' : 'recorded'} sessions. Open Activity for the full history.` : '',
  ].filter(Boolean).join(' ')
}

async function loadWorkstreamChanges(detail: ProjectDetail, selectionVersion: number) {
  const baseline = changeVisit?.workstreamId === detail.project.id ? changeVisit.previousViewedAt : undefined
  const baselineMs = baseline ? Date.parse(baseline) : Number.NaN
  const candidates = detail.sessions
    .filter((session) => !baseline || (Number.isFinite(baselineMs) && Date.parse(session.updatedAt) > baselineMs))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  changeSessionCount = candidates.length
  changeSessionDetails = []
  changeSessionLoad = 'loading'
  renderWorkstreamChanges(detail)
  const results = await Promise.allSettled(candidates.slice(0, 4).map((session) => getSessionDetail(session.id)))
  if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== detail.project.id) return
  changeSessionDetails = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  changeSessionLoad = results.some((result) => result.status === 'rejected') ? 'error' : 'loaded'
  renderWorkstreamChanges(currentDetail)
}

const documentSections: Array<{ key: keyof WorkstreamDocumentSections; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'currentStatus', label: 'Current status' },
  { key: 'findings', label: 'Findings' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'openQuestions', label: 'Open questions' },
  { key: 'nextSteps', label: 'Next steps' },
]

function renderDocumentText(value: string, sourceSessionIds: string[]) {
  return esc(value).replace(/\[\[workstream:([\w-]+)\]\]/g, (_match, workstreamId: string) =>
    `<button class="document-source-link" type="button" data-workstream-id="${workstreamId}">Read linked investigation</button>`)
    .replace(/\[(\d+)\]/g, (match, number: string) => {
    const sessionId = sourceSessionIds[Number(number) - 1]
    return sessionId
      ? `<button class="document-source-link" type="button" data-session-id="${esc(sessionId)}" title="Open source session ${number}">${match}</button>`
      : match
    })
}

function renderWorkstreamDocument() {
  const detail = currentDetail
  const document = currentWorkstreamDocument
  const busy = documentBusyWorkstreamId === detail?.project.id
  documentDraftButton.disabled = busy || !document || !detail
  documentEditButton.disabled = busy || !document || !detail
  documentSaveButton.disabled = busy
  documentCancelButton.disabled = busy
  documentDraftButton.classList.toggle('hidden', documentEditing)
  documentEditButton.classList.toggle('hidden', documentEditing)
  documentSaveButton.classList.toggle('hidden', !documentEditing)
  documentCancelButton.classList.toggle('hidden', !documentEditing)
  documentArticle.classList.toggle('hidden', documentEditing)
  documentForm.classList.toggle('hidden', !documentEditing)
  if (!detail || !document) {
    documentArticle.innerHTML = '<p class="meta">Loading working document…</p>'
    return
  }
  if (documentEditing) return
  const hasContent = documentSections.some(({ key }) => document.sections[key])
  documentDraftButton.textContent = hasContent ? 'Update from activity' : 'Draft from recent activity'
  if (!hasContent) {
    documentArticle.classList.add('empty-article')
    documentArticle.innerHTML = `<div class="workstream-document-start">
      <p class="eyebrow">Workstream article</p>
      <h2>${esc(detail.project.name)}</h2>
      <p>This article has not been written yet. The catch-up summary above shows recent activity; Agent handoff holds any saved notes for the next agent.</p>
      <p>${detail.sessions.length} recorded session${detail.sessions.length === 1 ? '' : 's'} are available. Draft from recent activity, then review it before saving.</p>
    </div>`
    return
  }
  documentArticle.classList.remove('empty-article')
  const sourceSessions = document.sourceSessionIds
    .map((id) => detail.sessions.find((session) => session.id === id))
  const stale = Boolean(document.evidenceThrough && detail.project.lastUpdatedAt > document.evidenceThrough)
  documentArticle.innerHTML = `
    <nav class="workstream-document-toc" aria-label="Article sections">
      ${documentSections.map(({ key, label }) => `<a href="#document-section-${key}">${esc(label)}</a>`).join('')}
      <a href="#document-section-sources">Sources</a>
    </nav>
    <div class="workstream-document-content">
      <header class="workstream-document-masthead">
        <p class="eyebrow">Workstream article</p>
        <h2>${esc(detail.project.name)}</h2>
      </header>
      <p class="meta">${hasContent
        ? `Saved ${document.updatedAt ? esc(fmtRelative(document.updatedAt)) : 'recently'}${stale ? ' · New activity since this article was drafted' : ''}`
        : 'This article is ready to fill. Use Edit, or draft from recorded activity and review it before saving.'}</p>
      ${documentSections.map(({ key, label }) => `
        <section id="document-section-${key}" class="workstream-document-section">
          <h3>${esc(label)}</h3>
          <p class="${document.sections[key] ? '' : 'empty'}">${document.sections[key] ? renderDocumentText(document.sections[key], document.sourceSessionIds) : 'Not documented yet.'}</p>
          ${key === 'openQuestions' && document.sections[key] ? '<button type="button" class="document-queue-button" data-queue-open-question>Queue a follow-up</button>' : ''}
        </section>
      `).join('')}
      <section id="document-section-sources" class="workstream-document-section">
        <h3>Sources</h3>
        <div class="workstream-document-sources">${sourceSessions.length
          ? sourceSessions.map((session, index) => session
            ? `<button type="button" data-session-id="${esc(session.id)}">[${index + 1}] ${esc(session.title || session.id)}</button>`
            : `<span class="meta">[${index + 1}] Source no longer in this workstream</span>`).join('')
          : '<span class="meta">No source sessions linked. Manual notes can be added with Edit.</span>'}</div>
      </section>
    </div>
  `
}

function renderOverviewChat() {
  const turns = currentDetail ? overviewChatByWorkstream.get(currentDetail.project.id) ?? [] : []
  overviewChatHistory.innerHTML = turns.length
    ? turns.map((turn, index) => `<div class="overview-chat-turn ${turn.role}">
        <p class="overview-chat-role">${turn.role === 'user' ? 'You' : 'Knowledge desk'}</p>
        <p>${turn.role === 'assistant' && turn.response
          ? renderDocumentText(turn.text, turn.response.sourceSessionIds) : esc(turn.text)}</p>
        ${turn.response?.evidenceSessionsTotal !== undefined
          ? `<p class="overview-chat-evidence">Used excerpts from ${turn.response.evidenceSessionsUsed ?? 0} of ${turn.response.evidenceSessionsTotal} recorded sessions.</p>` : ''}
        ${turn.response?.replacement && turn.response.section
          ? `<button type="button" class="secondary-button" data-review-turn="${index}">Review article edit</button>` : ''}
        ${turn.role === 'assistant' && !turn.response?.replacement ? `<button type="button" class="secondary-button" data-queue-turn="${index}">Queue this question</button>` : ''}
      </div>`).join('')
    : '<p class="meta">Ask what is known, where a finding came from, or what still needs investigation.</p>'
  overviewChatSend.disabled = overviewChatBusy || !currentDetail
  overviewChatSend.textContent = overviewChatBusy ? 'Thinking…' : overviewChatMode.value === 'rewrite' ? 'Propose edit' : 'Ask'
  const rewrite = overviewChatMode.value === 'rewrite'
  overviewChatSection.classList.toggle('hidden', !rewrite)
  overviewChatSectionLabel.classList.toggle('hidden', !rewrite)
  overviewChatHistory.scrollTop = overviewChatHistory.scrollHeight
}

function setKnowledgeOpen(open: boolean) {
  detailRoot.classList.toggle('knowledge-open', open)
  overviewChatToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (open) {
    overviewChatCard.setAttribute('role', 'dialog')
    overviewChatCard.setAttribute('aria-modal', 'true')
  } else {
    overviewChatCard.removeAttribute('role')
    overviewChatCard.removeAttribute('aria-modal')
  }
  if (open) overviewChatQuestion.focus()
  else if (document.activeElement === overviewChatClose || document.activeElement === overviewChatBackdrop) overviewChatToggle.focus()
}

function setWorkstreamListOpen(open: boolean) {
  appShell.classList.toggle('sidebar-open', open)
  workstreamsToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (open) projectsSearch.focus()
  else workstreamsToggle.focus()
}

async function sendOverviewChat() {
  if (!currentDetail || overviewChatBusy) return
  const question = overviewChatQuestion.value.trim()
  if (!question) { overviewChatQuestion.focus(); return }
  const workstreamId = currentDetail.project.id
  const mode = overviewChatMode.value === 'rewrite' ? 'rewrite' : 'answer'
  const section = mode === 'rewrite' ? overviewChatSection.value as keyof WorkstreamDocumentSections : undefined
  const turns = overviewChatByWorkstream.get(workstreamId) ?? []
  const history = turns.slice(-6).map(({ role, text }) => ({ role, text }))
  overviewChatBusy = true
  overviewChatStatus.textContent = mode === 'rewrite' ? 'Preparing a proposed edit…' : 'Reading workstream evidence…'
  renderOverviewChat()
  try {
    const response = await window.gogoagent.workstreams.askOverview(workstreamId, { question, mode, section, history })
    turns.push({ role: 'user', text: question }, { role: 'assistant', text: response.answer, response })
    overviewChatByWorkstream.set(workstreamId, turns)
    if (currentDetail?.project.id === workstreamId) {
      overviewChatQuestion.value = ''
      overviewChatStatus.textContent = response.replacement ? 'Edit ready for review.' : ''
    }
  } catch (error) {
    if (currentDetail?.project.id === workstreamId) overviewChatStatus.textContent = `Could not answer: ${(error as Error).message}`
  } finally {
    overviewChatBusy = false
    renderOverviewChat()
  }
}

function reviewOverviewEdit(index: number) {
  if (!currentDetail || !currentWorkstreamDocument) return
  const response = overviewChatByWorkstream.get(currentDetail.project.id)?.[index]?.response
  if (!response?.section || !response.replacement) return
  showDocumentEditor({
    ...currentWorkstreamDocument,
    sections: { ...currentWorkstreamDocument.sections, [response.section]: response.replacement },
    sourceSessionIds: response.sourceSessionIds,
    evidenceThrough: response.evidenceThrough,
  }, { section: response.section, original: currentWorkstreamDocument.sections[response.section] })
  setKnowledgeOpen(false)
  documentStatus.textContent = 'Review the proposed change before saving.'
  documentForm.querySelector<HTMLTextAreaElement>(`#document-section-input-${response.section}`)?.focus()
  documentForm.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function renderInvestigations() {
  investigationParent.classList.toggle('hidden', !investigationParentLink)
  investigationParent.innerHTML = investigationParentLink
    ? `Part of <button type="button" data-parent-id="${esc(investigationParentLink.parentWorkstreamId)}">${esc(investigationParentName || 'parent workstream')}</button>. Original question: ${esc(investigationParentLink.question)}
       <div class="button-row"><button type="button" class="secondary-button" data-propose-parent>Propose parent article update</button></div>` : ''
  investigationList.innerHTML = investigations.length
    ? investigations.map((item) => `<div class="investigation-row" data-investigation-id="${esc(item.id)}">
        <div><h4>${esc(item.title)}</h4><p>${esc(item.question)}</p></div>
        <div class="button-row">${item.childWorkstreamId
          ? `<button type="button" class="secondary-button" data-open-child="${esc(item.childWorkstreamId)}">Open workstream</button>`
          : `<select aria-label="Agent for ${esc(item.title)}"><option value="claude">Claude</option><option value="codex">Codex</option><option value="agy">AGY</option></select><button type="button" class="secondary-button" data-start-id="${esc(item.id)}" ${investigationBusy ? 'disabled' : ''}>Start</button><button type="button" class="secondary-button" data-remove-id="${esc(item.id)}" ${investigationBusy ? 'disabled' : ''}>Remove</button>`}
        </div>
      </div>`).join('')
    : '<p class="meta">No follow-up investigations queued.</p>'
  investigationAdd.disabled = investigationBusy || !currentDetail
}

function prefillInvestigation(question: string) {
  const cleaned = question.replace(/\[\d+\]/g, '').trim().slice(0, 2000)
  if (!cleaned) return
  investigationTitle.value = cleaned.split(/[\n.?!]/)[0].trim().slice(0, 80) || 'Follow-up investigation'
  investigationQuestion.value = cleaned
  setKnowledgeOpen(false)
  document.querySelector('.investigation-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  investigationTitle.focus()
}

async function loadInvestigations(workstreamId: string, selectionVersion: number) {
  try {
    const links = await window.gogoagent.workstreams.listInvestigations(workstreamId)
    if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== workstreamId) return
    investigations = links.items
    investigationParentLink = links.parent
    investigationParentName = links.parentName ?? ''
    renderInvestigations()
  } catch (error) {
    if (selectionVersion === projectSelectionVersion && currentDetail?.project.id === workstreamId) {
      investigationStatus.textContent = `Could not load investigations: ${(error as Error).message}`
    }
  }
}

async function addInvestigation() {
  if (!currentDetail || investigationBusy) return
  const title = investigationTitle.value.trim()
  const question = investigationQuestion.value.trim()
  if (!title || !question) { investigationStatus.textContent = 'Add a title and a question.'; return }
  const workstreamId = currentDetail.project.id
  investigationBusy = true
  investigationStatus.textContent = 'Adding investigation…'
  renderInvestigations()
  try {
    const { item } = await window.gogoagent.workstreams.addInvestigation(workstreamId, { title, question })
    if (currentDetail?.project.id === workstreamId) {
      investigations.push(item)
      investigationTitle.value = ''
      investigationQuestion.value = ''
      investigationStatus.textContent = 'Added to this workstream.'
    }
  } catch (error) {
    if (currentDetail?.project.id === workstreamId) investigationStatus.textContent = `Could not add investigation: ${(error as Error).message}`
  } finally { investigationBusy = false; if (currentDetail?.project.id === workstreamId) renderInvestigations() }
}

async function startInvestigation(id: string, kind: AgentTerminalKind) {
  if (!currentDetail || investigationBusy) return
  const workstreamId = currentDetail.project.id
  investigationBusy = true
  investigationStatus.textContent = 'Starting linked workstream…'
  renderInvestigations()
  try {
    const { item, terminal } = await window.gogoagent.workstreams.startInvestigation(workstreamId, id, kind)
    if (currentDetail?.project.id === workstreamId) investigations = investigations.map((entry) => entry.id === id ? item : entry)
    const view = ensureTerminalView(terminal)
    await loadAllProjects()
    if (selectedProjectId === workstreamId && !appShell.classList.contains('sidebar-open')
      && item.childWorkstreamId && projects.some((project) => project.id === item.childWorkstreamId)) {
      await selectProject(item.childWorkstreamId)
      selectTerminal(terminal.id)
    } else if (selectedProjectId === workstreamId && !appShell.classList.contains('sidebar-open')) {
      showDraftWorkstream(view)
      selectTerminal(terminal.id)
    }
    if (activeTerminalId === terminal.id) terminalStatus.textContent = 'Starting agent. The question will be pasted for review.'
    window.setTimeout(() => {
      void window.gogoagent.terminals.write(terminal.id, terminalPastePayload(item.question))
        .then(async () => {
          const stillViewingTerminal = activeTerminalId === terminal.id
          await loadAllProjects()
          if (stillViewingTerminal && activeTerminalId === terminal.id && !selectedProjectId
            && item.childWorkstreamId && projects.some((project) => project.id === item.childWorkstreamId)) {
            await selectProject(item.childWorkstreamId)
            selectTerminal(terminal.id)
          }
          if (activeTerminalId === terminal.id) terminalStatus.textContent = 'Investigation question pasted. Review and send when ready.'
        })
        .catch((error) => { if (activeTerminalId === terminal.id) terminalStatus.textContent = `Question paste failed: ${(error as Error).message}` })
    }, 900)
  } catch (error) {
    if (currentDetail?.project.id === workstreamId) investigationStatus.textContent = `Could not start investigation: ${(error as Error).message}`
  } finally { investigationBusy = false; if (currentDetail?.project.id === workstreamId) renderInvestigations() }
}

function reviewInvestigationStart(id: string, kind: AgentTerminalKind) {
  const item = investigations.find((entry) => entry.id === id && !entry.childWorkstreamId)
  if (!item || !currentDetail) return
  investigationStartPending = { id, kind }
  investigationStartTitle.textContent = item.title
  investigationStartSummary.textContent = 'This creates a linked workstream in the same working directory as the parent.'
  investigationStartQuestion.textContent = item.question
  investigationStartAgent.textContent = terminalLabel(kind)
  investigationStartDirectory.textContent = currentDetail.project.repoRoot
  investigationStartWarning.textContent = currentWorkstreamTerminals().some((view) => view.record.status === 'running')
    ? 'An agent is already running in this workstream. Both agents will share the same working directory.' : ''
  investigationStartDialog.showModal()
  investigationStartConfirm.focus()
}

async function removeInvestigation(id: string) {
  if (!currentDetail || investigationBusy) return
  const workstreamId = currentDetail.project.id
  investigationBusy = true
  renderInvestigations()
  try {
    await window.gogoagent.workstreams.removeInvestigation(workstreamId, id)
    if (currentDetail?.project.id === workstreamId) {
      investigations = investigations.filter((item) => item.id !== id)
      investigationStatus.textContent = 'Removed from queue.'
    }
  } catch (error) {
    if (currentDetail?.project.id === workstreamId) investigationStatus.textContent = `Could not remove investigation: ${(error as Error).message}`
  } finally { investigationBusy = false; if (currentDetail?.project.id === workstreamId) renderInvestigations() }
}

async function proposeParentArticleUpdate() {
  if (!currentDetail || !investigationParentLink) return
  const childId = currentDetail.project.id
  const parentId = investigationParentLink.parentWorkstreamId
  const title = investigationParentLink.title
  investigationStatus.textContent = 'Preparing parent article proposal…'
  try {
    const [childDocument, parentDocument] = await Promise.all([
      window.gogoagent.workstreams.getDocument(childId),
      window.gogoagent.workstreams.getDocument(parentId),
    ])
    const finding = childDocument.sections.findings.trim() || childDocument.sections.currentStatus.trim()
    if (!finding) {
      investigationStatus.textContent = 'Document the child investigation findings first, then propose an update.'
      return
    }
    const sourceText = finding.replace(/\[\d+\]/g, '').trim()
    const addition = `From linked investigation “${title}” [[workstream:${childId}]]:\n${sourceText}`
    await selectProject(parentId)
    currentWorkstreamDocument = parentDocument
    const previous = parentDocument.sections.findings.trim()
    showDocumentEditor({
      ...parentDocument,
      sections: { ...parentDocument.sections, findings: previous ? `${previous}\n\n${addition}` : addition },
    }, { section: 'findings', original: parentDocument.sections.findings })
    documentStatus.textContent = 'Review the linked investigation finding before saving it to the parent article.'
    setWorkstreamView('overview')
    documentForm.querySelector<HTMLTextAreaElement>('#document-section-input-findings')?.focus()
  } catch (error) {
    if (currentDetail?.project.id === childId) investigationStatus.textContent = `Could not prepare update: ${(error as Error).message}`
  }
}

function showDocumentEditor(document: WorkstreamDocument, review?: { section: keyof WorkstreamDocumentSections; original: string }) {
  pendingWorkstreamDocument = document
  documentEditing = true
  const fields = review ? documentSections.filter(({ key }) => key === review.section) : documentSections
  documentForm.innerHTML = review
    ? `<div class="document-review-grid">
        <div class="document-review-before"><p class="label">Current ${esc(fields[0].label)}</p><p>${review.original ? esc(review.original) : 'This section is empty.'}</p></div>
        <div class="document-review-after"><p class="label">Proposed ${esc(fields[0].label)}</p><label>Review and edit<textarea id="document-section-input-${review.section}" maxlength="12000"></textarea></label></div>
      </div><p class="meta">Only this section changes when you save.</p>`
    : fields.map(({ key, label }) => `
      <label>${esc(label)}<textarea id="document-section-input-${key}" maxlength="12000"></textarea></label>
    `).join('')
  for (const { key } of fields) {
    const field = documentForm.querySelector<HTMLTextAreaElement>(`#document-section-input-${key}`)
    if (field) field.value = document.sections[key]
  }
  renderWorkstreamDocument()
  documentForm.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}

async function loadWorkstreamDocument(workstreamId: string, selectionVersion: number) {
  try {
    const document = await window.gogoagent.workstreams.getDocument(workstreamId)
    if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== workstreamId) return
    currentWorkstreamDocument = document
    documentStatus.textContent = ''
    renderWorkstreamDocument()
    if (currentDetail) renderWorkstreamChanges(currentDetail)
  } catch (error) {
    if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== workstreamId) return
    documentStatus.textContent = `Could not load working document: ${(error as Error).message}`
    documentArticle.innerHTML = ''
  }
}

async function draftWorkstreamDocument() {
  if (!currentDetail || !currentWorkstreamDocument || documentBusyWorkstreamId === currentDetail.project.id) return
  const workstreamId = currentDetail.project.id
  const selectionVersion = projectSelectionVersion
  documentBusyWorkstreamId = workstreamId
  documentStatus.textContent = 'Drafting article from recent workstream activity…'
  renderWorkstreamDocument()
  try {
    const draft = await window.gogoagent.workstreams.draftDocument(workstreamId)
    if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== workstreamId) return
    documentStatus.textContent = 'Draft ready. Review every section before saving.'
    showDocumentEditor(draft)
  } catch (error) {
    if (selectionVersion === projectSelectionVersion && currentDetail?.project.id === workstreamId) {
      documentStatus.textContent = `Draft failed: ${(error as Error).message}`
    }
  } finally {
    if (documentBusyWorkstreamId === workstreamId) documentBusyWorkstreamId = null
    if (selectionVersion === projectSelectionVersion && currentDetail?.project.id === workstreamId) renderWorkstreamDocument()
  }
}

async function saveWorkstreamDocument() {
  if (!currentDetail || !currentWorkstreamDocument || !pendingWorkstreamDocument || documentBusyWorkstreamId === currentDetail.project.id) return
  const pending = pendingWorkstreamDocument
  const workstreamId = currentDetail.project.id
  const selectionVersion = projectSelectionVersion
  const sections = Object.fromEntries(documentSections.map(({ key }) => [
    key, documentForm.querySelector<HTMLTextAreaElement>(`#document-section-input-${key}`)?.value ?? pending.sections[key],
  ])) as unknown as WorkstreamDocumentSections
  documentBusyWorkstreamId = workstreamId
  documentStatus.textContent = 'Saving working document…'
  renderWorkstreamDocument()
  try {
    const saved = await window.gogoagent.workstreams.saveDocument(workstreamId, {
      ...pending,
      revision: currentWorkstreamDocument.revision,
      sections,
    })
    if (selectionVersion !== projectSelectionVersion || currentDetail?.project.id !== workstreamId) return
    currentWorkstreamDocument = saved
    pendingWorkstreamDocument = null
    documentEditing = false
    documentStatus.textContent = 'Working document saved.'
    if (currentDetail) renderWorkstreamChanges(currentDetail)
  } catch (error) {
    if (selectionVersion === projectSelectionVersion && currentDetail?.project.id === workstreamId) {
      documentStatus.textContent = `Save failed: ${(error as Error).message}`
    }
  } finally {
    if (documentBusyWorkstreamId === workstreamId) documentBusyWorkstreamId = null
    if (selectionVersion === projectSelectionVersion && currentDetail?.project.id === workstreamId) renderWorkstreamDocument()
  }
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
  const waiting = currentWorkstreamTerminals().find(terminalNeedsInput)
  return {
    goal: detail.project.name,
    currentState: workstreamStatusNote(detail.project.id) || latest.value,
    blocker: waiting
      ? `${terminalLabel(waiting.record.kind)} is waiting for your input.`
      : '',
    nextAction: waiting
      ? `Review and answer the waiting ${terminalLabel(waiting.record.kind)} prompt.`
      : '',
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

function renderWorkstreamState(detail: ProjectDetail) {
  if (stateEditing) return
  const saved = detail.project.state
  const rows = [
    ['Goal', saved?.goal],
    ['Current status', saved?.currentState],
    ['Blocker or question', saved?.blocker],
    ['Next action', saved?.nextAction],
    ['Last verification', saved?.lastVerification],
  ].filter((row): row is [string, string] => Boolean(row[1]?.trim()))
  const hasSavedHandoff = rows.length > 0
  const newActivityAfterSave = saved?.updatedAt
    ? Date.parse(detail.project.lastUpdatedAt) > Date.parse(saved.updatedAt) + 60_000
    : false
  workstreamStateFreshness.textContent = hasSavedHandoff
    ? `Saved ${saved?.updatedAt ? fmtRelative(saved.updatedAt) : 'previously'}${newActivityAfterSave ? ' · New activity since these notes were saved' : ''}`
    : ''
  workstreamStateFreshness.classList.toggle('hidden', !hasSavedHandoff)
  workstreamStateFreshness.classList.toggle('stale', newActivityAfterSave)
  workstreamStateSummary.innerHTML = rows.length
    ? rows.map(([label, value]) => `
      <div class="workstream-state-row">
        <span class="workstream-state-label">${esc(label)}</span>
        <span class="workstream-state-value">${esc(value)}</span>
      </div>
    `).join('')
    : '<p class="meta">No saved handoff yet. Add notes if the next agent needs context beyond the working document.</p>'
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
  workstreamHandoff.open = true
  stateGoalInput.value = currentDetail.project.state?.goal ?? ''
  stateCurrentInput.value = currentDetail.project.state?.currentState ?? ''
  stateBlockerInput.value = currentDetail.project.state?.blocker ?? ''
  stateNextInput.value = currentDetail.project.state?.nextAction ?? ''
  stateVerificationInput.value = currentDetail.project.state?.lastVerification ?? ''
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
  if (kind === 'agy') return 'Antigravity'
  return 'Shell'
}

function sessionAgentKind(session: SessionRecord): AgentTerminalKind | null {
  if (session.agentKind === 'claude' || session.agentKind === 'codex' || session.agentKind === 'agy') return session.agentKind
  const title = session.title.toLowerCase()
  const transcriptPath = session.transcriptPath.toLowerCase()

  if (title.startsWith('claude terminal')) return 'claude'
  if (title.startsWith('codex terminal')) return 'codex'
  if (title.startsWith('antigravity terminal')) return 'agy'
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

function latestClaudeResumeSession(detail: ProjectDetail | null) {
  if (!detail) return undefined
  return detail.sessions
    .filter(isNativeClaudeSession)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function latestCodexResumeSession(detail: ProjectDetail | null) {
  if (!detail) return undefined
  return detail.sessions
    .filter(isNativeCodexSession)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function latestAgyResumeSession(detail: ProjectDetail | null) {
  if (!detail) return undefined
  return detail.sessions
    .filter(isNativeAgySession)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function isNativeCodexSession(session: SessionRecord) {
  return session.agentKind === 'codex' && !session.id.startsWith('terminal-')
}

function isNativeAgySession(session: SessionRecord) {
  return session.agentKind === 'agy' && !session.id.startsWith('terminal-')
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
    setButtonLabel(newAgyButton, 'AGY')
    newClaudeButton.classList.remove('active-toggle')
    newCodexButton.classList.remove('active-toggle')
    newAgyButton.classList.remove('active-toggle')
    newClaudeButton.classList.remove('quick-continue')
    newCodexButton.classList.remove('quick-continue')
    newAgyButton.classList.remove('quick-continue')
    newClaudeButton.setAttribute('aria-pressed', 'false')
    newCodexButton.setAttribute('aria-pressed', 'false')
    newAgyButton.setAttribute('aria-pressed', 'false')
    newClaudeButton.title = 'Start Claude Code from this directory.'
    newCodexButton.title = 'Start Codex from this directory.'
    newAgyButton.title = 'Start Antigravity CLI from this directory.'
    return
  }

  const primaryAgent = primaryWorkstreamAgent(detail)
  const runningClaude = runningWorkstreamAgentTerminal('claude')
  const runningCodex = runningWorkstreamAgentTerminal('codex')
  const runningAgy = runningWorkstreamAgentTerminal('agy')
  const claudeResumeSession = latestClaudeResumeSession(detail)
  const codexResumeSession = latestCodexResumeSession(detail)
  const agyResumeSession = latestAgyResumeSession(detail)
  const quickRunning = [runningClaude, runningCodex, runningAgy]
    .filter((view): view is TerminalView => Boolean(view))
    .sort((a, b) => Number(terminalNeedsInput(b)) - Number(terminalNeedsInput(a))
      || (b.record.lastActivityAt ?? '').localeCompare(a.record.lastActivityAt ?? ''))[0]
  const quickResume = [
    { kind: 'claude', session: claudeResumeSession },
    { kind: 'codex', session: codexResumeSession },
    { kind: 'agy', session: agyResumeSession },
  ].filter((entry) => entry.session)
    .sort((a, b) => b.session!.updatedAt.localeCompare(a.session!.updatedAt))[0]
  const quickKind = quickRunning?.record.kind ?? quickResume?.kind
  const claudeVerb = runningClaude ? 'Show' : claudeResumeSession ? 'Resume' : detail.sessions.length ? 'Continue in' : 'Start'
  const codexVerb = runningCodex ? 'Show' : codexResumeSession ? 'Resume' : primaryAgent === 'codex' ? 'Continue' : 'Start'

  setButtonLabel(newClaudeButton, `${claudeVerb} Claude`)
  setButtonLabel(newCodexButton, `${codexVerb} Codex`)
  setButtonLabel(newAgyButton, runningAgy ? 'Show Antigravity' : agyResumeSession ? 'Resume Antigravity' : 'Start AGY')
  newClaudeButton.classList.toggle('quick-continue', quickKind === 'claude')
  newCodexButton.classList.toggle('quick-continue', quickKind === 'codex')
  newAgyButton.classList.toggle('quick-continue', quickKind === 'agy')
  newClaudeButton.classList.toggle('active-toggle', Boolean(runningClaude))
  newCodexButton.classList.toggle('active-toggle', Boolean(runningCodex))
  newAgyButton.classList.toggle('active-toggle', Boolean(runningAgy))
  newClaudeButton.setAttribute('aria-pressed', runningClaude ? 'true' : 'false')
  newCodexButton.setAttribute('aria-pressed', runningCodex ? 'true' : 'false')
  newAgyButton.setAttribute('aria-pressed', runningAgy ? 'true' : 'false')
  const claudeCodexBridge = hasAllowedCrossAgentContext(detail, 'claude')
    ? ' A compact Codex memory bridge will be pasted for review.'
    : ''
  newClaudeButton.title = runningClaude
    ? 'Show the running Claude terminal attached to this workstream.'
    : claudeResumeSession
    ? 'Resume the latest Claude Code conversation with native claude --resume and attach the terminal here.'
    : 'No native Claude conversation is available to resume. Start Claude Code in this workstream and review the prepared context when available.'
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
  newAgyButton.title = runningAgy
    ? 'Show the running Antigravity CLI terminal attached to this workstream.'
    : agyResumeSession
      ? 'Resume the latest discovered Antigravity CLI conversation with agy --conversation.'
      : 'Start Antigravity CLI from this workstream repo. App conversations can be imported from its /resume picker.'
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
  if (view.awaitingRedraw) {
    view.awaitingRedraw = false
    if (view.record.id === activeTerminalId) renderTerminalStatus()
  }
  const needsInputSuppressionChanged = updateTerminalNeedsInputSuppression(view, data)
  if (view.logRestored) {
    queueTerminalWrite(view, data, { scroll: true })
    return needsInputSuppressionChanged
  }
  // Keep a bounded tail before replay: the sidecar log may still be flushing
  // its newest output when the renderer asks to read it.
  view.pendingData.push({ data, logBytes })
  view.pendingDataChars += data.length
  while ((view.pendingDataChars > 1024 * 1024 || view.pendingData.length > 512) && view.pendingData.length > 1) {
    view.pendingDataChars -= view.pendingData.shift()!.data.length
  }
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

function terminalScreenOverflowCols(view: TerminalView) {
  const xterm = view.element.querySelector<HTMLElement>('.xterm')
  const screen = view.element.querySelector<HTMLElement>('.xterm-screen')
  if (!xterm || !screen) return 0
  const visibleWidth = xterm.clientWidth - TERMINAL_SCROLLBAR_GUTTER_PX
  const screenWidth = screen.getBoundingClientRect().width
  if (visibleWidth <= 0 || screenWidth <= 0) return 0
  const overflowPx = screenWidth - visibleWidth
  if (overflowPx <= 1) return 0
  const cellWidth = screenWidth / Math.max(1, view.terminal.cols)
  return Math.ceil(overflowPx / Math.max(1, cellWidth))
}

function resizeTerminalToFit(view: TerminalView, cols: number, initialRows: number) {
  let rows = initialRows
  let fittedCols = cols
  for (let pass = 0; pass < TERMINAL_FIT_MAX_TRIM_PASSES; pass += 1) {
    view.terminal.resize(fittedCols, rows)
    const overflowCols = terminalScreenOverflowCols(view)
    const overflowRows = terminalScreenOverflowRows(view)
    if (overflowCols <= 0 && overflowRows <= 0) return { cols: fittedCols, rows }
    const nextCols = Math.max(40, fittedCols - overflowCols)
    const nextRows = overflowRows > 0 ? Math.max(12, rows - overflowRows - 1) : rows
    if (nextCols === fittedCols && nextRows === rows) return { cols: fittedCols, rows }
    fittedCols = nextCols
    rows = nextRows
  }
  return { cols: fittedCols, rows }
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
  if (!view.element.getClientRects().length || view.element.clientWidth < 120 || view.element.clientHeight < 120) return
  let fitted = fitTerminalWithAddon(view)
  if (!fitted) {
    const fallback = preferredTerminalSize(view)
    fitted = resizeTerminalToFit(view, fallback.cols, fallback.rows)
  }
  scrollTerminalToBottom(view)
  if (!view.logRestoreStarted && view.record.kind === 'agy' && view.record.status === 'running') {
    // AGY repeatedly redraws in place. Replaying its old cursor movements at
    // a different window size can overwrite or clip text. Let the live PTY
    // redraw the current screen after resize instead.
    view.logRestoreStarted = true
    view.logRestored = true
    view.awaitingRedraw = true
    view.pendingData = []
    view.pendingDataChars = 0
    renderTerminalStatus()
  }
  if (view.record.status === 'running') {
    void window.gogoagent.terminals.resize(view.record.id, fitted.cols, fitted.rows)
  }
  // Cursor-addressed agents such as AGY must be replayed at the visible size.
  // xterm cannot reliably reflow a full-screen transcript written at 80x24
  // while its pane was hidden.
  if (!view.logRestoreStarted) {
    view.logRestoreStarted = true
    void restoreTerminalLog(view)
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
    view.pendingDataChars = 0
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
    logRestoreStarted: false,
    logRestored: false,
    pendingData: [],
    pendingDataChars: 0,
    pendingWrites: [],
    writeFrame: null,
    scrollGeneration: 0,
  }
  terminalViews.set(record.id, view)
  renderTerminalTabs()
  return view
}

function selectTerminal(id: string | null) {
  if (id && currentDetail) setWorkstreamView('terminal')
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

  const pasteHint = view.record.kind === 'shell' || view.record.kind === 'agy'
    ? ' · paste context is only enabled for Claude/Codex tabs'
    : ''
  const logHint = view.record.logError
    ? ` · log error: ${view.record.logError}`
    : view.record.logPath
      ? ` · log ${fmtBytes(view.record.logBytes)}`
      : ''
  const redrawHint = view.awaitingRedraw ? ' · waiting for Antigravity to redraw' : ''
  terminalStatus.textContent = `${view.record.status} · ${compactPath(view.record.cwd)}${logHint}${redrawHint}${pasteHint}`
  terminalCopyContextButton.disabled = !currentDetail
  terminalPasteContextButton.disabled = !currentDetail || view.record.status !== 'running' || (view.record.kind !== 'claude' && view.record.kind !== 'codex')
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

async function createTerminal(kind: TerminalKind, selectedNativeSessionId?: string) {
  const label = terminalLabel(kind)
  if (selectedNativeSessionId && !currentDetail) return null
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
    const claudeResumeSession = kind === 'claude'
      ? selectedNativeSessionId
        ? detailAtLaunch.sessions.find((session) => session.id === selectedNativeSessionId && isNativeClaudeSession(session))
        : latestClaudeResumeSession(detailAtLaunch)
      : undefined
    const codexResumeSession = kind === 'codex'
      ? selectedNativeSessionId
        ? detailAtLaunch.sessions.find((session) => session.id === selectedNativeSessionId && isNativeCodexSession(session))
        : latestCodexResumeSession(detailAtLaunch)
      : undefined
    const agyResumeSession = kind === 'agy'
      ? selectedNativeSessionId
        ? detailAtLaunch.sessions.find((session) => session.id === selectedNativeSessionId && isNativeAgySession(session))
        : latestAgyResumeSession(detailAtLaunch)
      : undefined
    if (selectedNativeSessionId && !claudeResumeSession && !codexResumeSession && !agyResumeSession) {
      terminalStatus.textContent = 'That session is no longer in this workstream. Refresh and try again.'
      return null
    }
    const resumeSessionId = claudeResumeSession?.id ?? codexResumeSession?.id ?? agyResumeSession?.id
    const alreadyRunning = resumeSessionId
      ? [...terminalViews.values()].find((view) => (
        view.record.kind === kind && view.record.resumeSessionId === resumeSessionId && view.record.status === 'running'
      ))
      : undefined
    if (alreadyRunning) {
      await openTerminalWorkstream(alreadyRunning.record)
      return alreadyRunning.record
    }
    const primaryAgent = primaryWorkstreamAgent(detailAtLaunch)
    const newerClaudeSession = codexResumeSession && detailAtLaunch.sessions.some((session) => (
      sessionAgentKind(session) === 'claude' && session.updatedAt > codexResumeSession.updatedAt
    ))
    const launchContextKind: 'resume' | 'bridge' | null =
      ((kind === 'codex' && primaryAgent === 'codex') || (kind === 'claude' && primaryAgent === 'claude')) && !resumeSessionId
        ? 'resume'
        : (kind === 'claude' || (kind === 'codex' && (!resumeSessionId || newerClaudeSession)))
          && hasAllowedCrossAgentContext(detailAtLaunch, kind)
          ? 'bridge'
          : null
    let reviewedContext: string | undefined
    let repository: RepositoryState | undefined
    if (kind !== 'shell') {
      terminalStatus.textContent = 'Preparing continuation review...'
      const review = await prepareContinuation(
        detailAtLaunch, kind, resumeSessionId, launchContextKind, claudeResumeSession?.title ?? codexResumeSession?.title ?? agyResumeSession?.title,
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
      cwd: claudeResumeSession?.cwd ?? codexResumeSession?.cwd ?? agyResumeSession?.cwd ?? detailAtLaunch.project.repoRoot,
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
        ? `Preparing ${label} resume context...`
        : `Preparing ${label} memory bridge...`
      window.setTimeout(() => {
        void pasteResumeContextIntoTerminal(record.id, detailAtLaunch, {
          contextKind: launchContextKind ?? undefined,
          flash: false,
          targetKind: kind === 'shell' ? undefined : kind,
          preparedContext: reviewedContext,
        })
          .then((pasted) => {
            if (pasted) {
              terminalStatus.textContent = launchContextKind === 'resume'
                ? `${label} resume context pasted. Review and send when ready.`
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
  appShell.classList.add('detail-selected')
  appShell.classList.remove('sidebar-open')
  setKnowledgeOpen(false)
  const cwd = view?.record.cwd ?? globalCwdInput.value.trim()
  if (view) terminalOnlyCwd = view.record.cwd
  else terminalOnlyCwd = null
  selectedProjectId = null
  currentDetail = null
  readingListOpen = false
  renderReadingList()
  activeTerminalId = view?.record.id ?? null
  setRenameEditing(false)
  renameStatus.textContent = ''
  renderProjectsList()
  detailEmpty.classList.add('hidden')
  detailRoot.classList.remove('hidden')
  detailRoot.classList.add('terminal-only')
  detailRoot.dataset.view = 'terminal'
  detailRoot.classList.remove('terminal-focus')
  detailSubtitle.textContent = 'Draft workstream'
  detailTitle.textContent = view?.record.title ?? (cwd ? pathBasename(cwd) || cwd : 'New workstream')
  detailMeta.textContent = view
    ? `${compactPath(view.record.cwd)} · not saved yet`
    : `${cwd ? compactPath(cwd) : 'Default directory'} · not saved yet`
  detailMeta.title = view?.record.cwd ?? cwd
  terminalHelp.textContent = 'Choose Claude, Codex, AGY, or Shell to begin.'
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
  projects = sortProjectsByActivity(projects)
  renderProjectsList()
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
  const activeAgents = [...terminalViews.values()].filter((view) =>
    view.record.workstreamId === project.id && view.record.kind !== 'shell' && view.record.status === 'running')
  if (activeAgents.some(terminalNeedsInput)) return 0
  if (activeAgents.length > 0) return 1
  if (projectNeedsInputTerminalIds(project).length > 0) return 2
  if ((project.activeTerminalIds?.length ?? 0) > 0) return 3
  return 4
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

function movePinnedWorkstream(projectId: string, direction: -1 | 1, focus: 'card' | 'button' | 'none' = 'button', candidates?: string[]) {
  const visiblePinned = candidates ?? projects.filter((project) => pinnedWorkstreamIds.has(project.id)).map((project) => project.id)
  const index = visiblePinned.indexOf(projectId)
  const neighborId = visiblePinned[index + direction]
  if (index < 0 || !neighborId) return
  const order = [...pinnedWorkstreamIds]
  const a = order.indexOf(projectId)
  const b = order.indexOf(neighborId)
  ;[order[a], order[b]] = [order[b], order[a]]
  pinnedWorkstreamIds.clear()
  order.forEach((id) => pinnedWorkstreamIds.add(id))
  saveStringSet(PINNED_WORKSTREAMS_STORAGE_KEY, pinnedWorkstreamIds)
  projects = sortProjectsByActivity(projects)
  renderProjectsList()
  const card = [...projectsList.querySelectorAll<HTMLElement>('.project-card')]
    .find((item) => item.dataset.projectId === projectId)
  if (focus === 'card') card?.focus()
  else if (focus === 'button') card?.querySelector<HTMLButtonElement>(`button[data-move-direction="${direction}"]`)?.focus()
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
    setWorkstreamView('overview')
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
  workstreamsToggleCount.textContent = visible.length ? `${visible.length} need you` : ''
  workstreamsToggleCount.classList.toggle('hidden', visible.length === 0)
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

  const visiblePinnedIds = projects.filter((project) => pinnedWorkstreamIds.has(project.id)).map((project) => project.id)
  const showOrderControls = !projectsSearch.value.trim()

  projectsList.innerHTML = filtered
    .map((project) => {
      const selected = project.id === selectedProjectId ? ' selected' : ''
      const pinned = pinnedWorkstreamIds.has(project.id)
      const pinnedIndex = visiblePinnedIds.indexOf(project.id)
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
              ${pinned && showOrderControls && visiblePinnedIds.length > 1 ? `
                <button class="project-move-button icon-button secondary-button" type="button" data-move-project-id="${esc(project.id)}" data-move-direction="-1" title="Move pinned workstream up (Alt+↑ when focused)." aria-label="Move ${esc(project.name)} up" ${pinnedIndex === 0 ? 'disabled' : ''}>${iconMarkup('arrow-up')}</button>
                <button class="project-move-button icon-button secondary-button" type="button" data-move-project-id="${esc(project.id)}" data-move-direction="1" title="Move pinned workstream down (Alt+↓ when focused)." aria-label="Move ${esc(project.name)} down" ${pinnedIndex === visiblePinnedIds.length - 1 ? 'disabled' : ''}>${iconMarkup('arrow-down')}</button>
              ` : ''}
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

  projectsList.querySelectorAll<HTMLButtonElement>('.project-move-button').forEach((button) => {
    button.addEventListener('keydown', (event) => event.stopPropagation())
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const id = button.dataset.moveProjectId
      const direction = Number(button.dataset.moveDirection)
      if (id && (direction === -1 || direction === 1)) movePinnedWorkstream(id, direction)
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
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const id = card.dataset.projectId
        if (id && pinnedWorkstreamIds.has(id) && showOrderControls) movePinnedWorkstream(id, event.key === 'ArrowUp' ? -1 : 1, 'card')
        return
      }
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
  appShell.classList.remove('detail-selected', 'sidebar-open')
  setKnowledgeOpen(false)
  selectedProjectId = null
  currentDetail = null
  readingListOpen = false
  renderReadingList()
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
  appShell.classList.add('detail-selected')
  appShell.classList.remove('sidebar-open')
  workstreamsToggle.setAttribute('aria-expanded', 'false')
  setKnowledgeOpen(false)
  const switchedWorkstreams = selectedProjectId !== projectId
  if (switchedWorkstreams) {
    readingListOpen = false
    workstreamHandoff.open = false
    changeVisit = { workstreamId: projectId, ready: false }
    changeSessionDetails = []
    changeSessionCount = 0
    changeSessionLoad = 'loading'
    currentWorkstreamView = 'overview'
    detailRoot.dataset.view = 'overview'
    currentWorkstreamDocument = null
    pendingWorkstreamDocument = null
    documentEditing = false
    documentStatus.textContent = ''
    overviewChatQuestion.value = ''
    overviewChatStatus.textContent = ''
    overviewChatHistory.innerHTML = '<p class="meta">Loading workstream knowledge…</p>'
    investigations = []
    investigationParentLink = undefined
    investigationStatus.textContent = ''
    investigationList.innerHTML = '<p class="meta">Loading linked investigations…</p>'
    investigationParent.classList.add('hidden')
  }
  if (switchedWorkstreams && selectedProjectId) {
    void window.gogoagent.projects.markViewed(selectedProjectId, activeTerminalId ?? undefined).catch(() => undefined)
  }
  const cachedDetail = getCachedValue(projectDetailCache, projectId, PROJECT_DETAIL_CACHE_MS)
  selectedProjectId = projectId
  renderReadingList()
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
    renderOverviewChat()
    renderInvestigations()
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
    if (changeVisit?.workstreamId === projectId && !changeVisit.ready) {
      changeVisit.previousViewedAt = freshDetail.project.view?.viewedAt
      changeVisit.ready = true
    }
    const changeBaselineMs = changeVisit?.previousViewedAt ? Date.parse(changeVisit.previousViewedAt) : Number.NaN
    changeSessionCount = freshDetail.sessions.filter((session) => !changeVisit?.previousViewedAt
      || (Number.isFinite(changeBaselineMs) && Date.parse(session.updatedAt) > changeBaselineMs)).length
    changeSessionLoad = 'loading'
    if (freshDetail.project.view?.terminalId) {
      lastViewedTerminalIdsByWorkstream.set(projectId, freshDetail.project.view.terminalId)
    }
    syncProjectFromDetail(currentDetail.project)
    renderDetail(currentDetail)
    renderOverviewChat()
    void loadWorkstreamDocument(projectId, selectionVersion)
    void loadWorkstreamChanges(currentDetail, selectionVersion)
    void loadInvestigations(projectId, selectionVersion)
    void loadWorkstreamContextPreview(currentDetail, selectionVersion)
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

function setWorkstreamView(view: 'overview' | 'activity' | 'terminal') {
  if (view !== 'overview') setKnowledgeOpen(false)
  currentWorkstreamView = view
  detailRoot.dataset.view = view
  workstreamViewTabs.querySelectorAll<HTMLButtonElement>('.workstream-view-tab').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.view === view ? 'true' : 'false')
  })
  applyTerminalFocus(currentDetail?.project ?? null)
  if (view === 'terminal') {
    const terminal = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
    scheduleTerminalFit(terminal)
  }
  contentRoot.scrollTop = 0
}

function switcherTargets(query: string): SwitcherTarget[] {
  const workstream = currentDetail?.project
  const views: SwitcherTarget[] = switcherScope === 'current' && workstream
    ? (['overview', 'activity', 'terminal'] as const).map((view) => ({
        kind: 'view',
        title: view[0].toUpperCase() + view.slice(1),
        detail: workstream.name,
        view,
      }))
    : []
  const terminals: SwitcherTarget[] = (switcherScope === 'current' ? currentWorkstreamTerminals() : [])
    .sort((a, b) => {
      const priority = (view: TerminalView) => terminalNeedsInput(view) ? 2 : view.record.status === 'running' ? 1 : 0
      return priority(b) - priority(a)
        || (b.record.lastActivityAt ?? b.record.startedAt).localeCompare(a.record.lastActivityAt ?? a.record.startedAt)
    })
    .map((view) => {
      const record = view.record
      const owner = projects.find((project) => project.id === record.workstreamId)?.name ?? compactPath(record.cwd)
      const status = terminalNeedsInput(view) ? 'Needs input' : record.status === 'running' ? 'Running' : 'Ended'
      return { kind: 'terminal', title: record.title, detail: `${owner} · ${terminalLabel(record.kind)} · ${status}`, id: record.id }
    })
  const activeAgentIds = new Set([...terminalViews.values()]
    .filter((view) => view.record.kind !== 'shell' && view.record.status === 'running')
    .map((view) => view.record.id))
  const currentTargets: SwitcherTarget[] = []
  if (views[0]) currentTargets.push(views[0])
  currentTargets.push(...terminals.filter((target) => target.kind === 'terminal' && activeAgentIds.has(target.id)))
  currentTargets.push(...views.slice(1))
  currentTargets.push(...terminals.filter((target) => target.kind === 'terminal' && !activeAgentIds.has(target.id)))
  const workstreams: SwitcherTarget[] = (switcherScope === 'workstreams' ? projects : [])
    .map((project) => {
      const attention = projectAttentionRank(project)
      const status = attention === 0 ? 'Agent needs input · '
        : attention === 1 ? 'Agent running · '
          : attention === 2 ? 'Terminal needs input · '
            : attention === 3 ? 'Terminal running · ' : ''
      return {
        kind: 'workstream',
        title: project.name,
        detail: `${pinnedWorkstreamIds.has(project.id) ? 'Pinned · ' : ''}${status}${compactPath(project.repoRoot)}${project.archivedAt ? ' · Archived' : ''}`,
        id: project.id,
      }
    })
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches = (target: SwitcherTarget) => terms.every((term) =>
    `${target.kind} ${target.title} ${target.detail}`.toLocaleLowerCase().includes(term))
  const targets = switcherScope === 'workstreams' ? workstreams : currentTargets
  if (terms.length) return targets.filter(matches).slice(0, 40)
  return switcherScope === 'workstreams' ? targets.slice(0, 20) : targets
}

function renderSwitcher() {
  switcherItems = switcherTargets(switcherQuery.value.trim())
  switcherIndex = Math.min(switcherIndex, Math.max(0, switcherItems.length - 1))
  if (!switcherItems.length) {
    renderEmpty(switcherResults, switcherScope === 'workstreams' ? 'No matching workstreams.' : 'No matching views or terminals.')
    return
  }
  switcherResults.innerHTML = switcherItems.map((target, index) => `
    <button class="switcher-row${index === switcherIndex ? ' active' : ''}" type="button" data-switcher-index="${index}" ${index === switcherIndex ? 'aria-current="true"' : ''}>
      <span class="switcher-kind">${esc(target.kind)}</span>
      <span class="switcher-copy"><span class="switcher-name">${esc(target.title)}</span><span class="switcher-detail">${esc(target.detail)}</span></span>
    </button>
  `).join('')
}

function openSwitcher(scope: 'workstreams' | 'current') {
  if (!switcherDialog.open && document.querySelector('dialog[open]')) return
  if (!switcherDialog.open) switcherReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  switcherScope = scope === 'current' && !currentDetail && !currentWorkstreamTerminals().length ? 'workstreams' : scope
  switcherDialog.dataset.scope = switcherScope
  switcherTitle.textContent = switcherScope === 'workstreams' ? 'Switch workstream' : `Switch within ${currentDetail?.project.name ?? 'this workstream'}`
  switcherQuery.placeholder = switcherScope === 'workstreams' ? 'Find a workstream…' : 'Find a view or terminal…'
  switcherHelp.textContent = switcherScope === 'workstreams'
    ? '↑↓ choose · Enter open · Alt+P pin · Alt+↑↓ order pinned · Esc close'
    : '↑↓ choose · Enter open · Esc close · Ctrl/Cmd+Shift+P for workstreams'
  switcherQuery.value = ''
  switcherIndex = 0
  renderSwitcher()
  if (switcherScope === 'current' && currentWorkstreamView === 'overview') {
    const activeAgent = switcherItems.findIndex((item) => {
      if (item.kind !== 'terminal') return false
      const view = terminalViews.get(item.id)
      return view?.record.kind !== 'shell' && view?.record.status === 'running'
    })
    if (activeAgent >= 0) {
      switcherIndex = activeAgent
      renderSwitcher()
    }
  }
  if (!switcherDialog.open) switcherDialog.showModal()
  switcherQuery.focus()
}

function openKeyboardHelp() {
  if (keyboardHelpDialog.open || document.querySelector('dialog[open]')) return
  keyboardHelpDialog.showModal()
}

async function chooseSwitcherTarget(index: number) {
  const target = switcherItems[index]
  if (!target) return
  switcherSelecting = true
  switcherDialog.close()
  try {
    if (target.kind === 'terminal') {
      const view = terminalViews.get(target.id)
      if (view) await openTerminalWorkstream(view.record)
    } else if (target.kind === 'workstream') {
      if (selectedProjectId === target.id) setWorkstreamView('overview')
      else await selectProject(target.id)
      workstreamViewTabs.querySelector<HTMLButtonElement>('[data-view="overview"]')?.focus()
    } else if (target.view === 'terminal' && activeTerminalId && terminalViews.has(activeTerminalId)) {
      selectTerminal(activeTerminalId)
    } else {
      setWorkstreamView(target.view)
      workstreamViewTabs.querySelector<HTMLButtonElement>(`[data-view="${target.view}"]`)?.focus()
    }
  } catch (error) {
    setAppNotice(`Could not switch: ${(error as Error).message}`)
  }
}

function applyTerminalFocus(project: Project | null) {
  const focused = project && currentWorkstreamView === 'terminal' ? terminalFocusWorkstreamIds.has(project.id) : false
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
  setWorkstreamView('terminal')
  applyTerminalFocus(project)
}

function renderDetail(detail: ProjectDetail) {
  const { project } = detail
  setRenameEditing(false)
  renameStatus.textContent = ''
  detailRoot.classList.remove('terminal-only')
  detailRoot.dataset.view = currentWorkstreamView
  workstreamViewTabs.querySelectorAll<HTMLButtonElement>('.workstream-view-tab').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.view === currentWorkstreamView ? 'true' : 'false')
  })
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
  renderWorkstreamDocument()
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
  if (isNativeClaudeSession(session)) {
    return `<button class="small-button timeline-resume-button" type="button" data-session-id="${esc(session.id)}" data-agent-kind="claude" title="Resume this Claude Code conversation.">${buttonContent('bot', 'Resume Claude')}</button>`
  }
  if (isNativeCodexSession(session)) {
    return `<button class="small-button timeline-resume-button" type="button" data-session-id="${esc(session.id)}" data-agent-kind="codex" title="Resume this Codex conversation.">${buttonContent('code-2', 'Resume Codex')}</button>`
  }
  if (isNativeAgySession(session)) {
    return `<button class="small-button timeline-resume-button" type="button" data-session-id="${esc(session.id)}" data-agent-kind="agy" title="Resume this Antigravity CLI conversation.">${buttonContent('lightbulb', 'Resume AGY')}</button>`
  }
  return ''
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
              ${detail.session.metadataOnly ? '' : `<button class="small-button timeline-session-button" type="button" data-session-id="${esc(detail.session.id)}" title="Open the full transcript for this session.">${buttonContent('book-open', 'Transcript')}</button>`}
            </div>
          </div>
          <p class="meta">${detail.session.metadataOnly ? `${fmtDateRange(detail.session.startedAt, detail.session.updatedAt)} · CLI conversation metadata; message history stays in Antigravity` : `${fmtDateRange(detail.session.startedAt, detail.session.updatedAt)} · ${detail.session.messageCount} msgs · ${detail.session.toolCallCount} tools · ${fmtNumber(detail.session.tokenCount)} tokens`}</p>
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
                <p class="meta">${detail.session.metadataOnly ? 'Conversation metadata only; message history stays in Antigravity.' : `${messages.length} message${messages.length === 1 ? '' : 's'} hidden.`}</p>
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
              ${session.metadataOnly ? '' : `<button class="small-button timeline-session-button" type="button" data-session-id="${esc(session.id)}" title="Open the full transcript for this session.">${buttonContent('book-open', 'Transcript')}</button>`}
            </div>
          </div>
          <p class="meta">${fmtDateRange(session.startedAt, session.updatedAt)} · ${session.metadataOnly ? 'CLI conversation metadata; message history stays in Antigravity' : collapsed ? `${session.messageCount} messages hidden; expand to load.` : 'loading when visible...'}</p>
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
    const kind = button.dataset.agentKind
    if (kind === 'claude' || kind === 'codex' || kind === 'agy') void createTerminal(kind, sessionId)
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
  for (const input of appearanceInputs) input.checked = input.value === appearance
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
    if (section.session.metadataOnly) lines.push('Antigravity CLI metadata only; message history is available in Antigravity.')
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
      if (section.session.metadataOnly) {
        if (!query || section.session.title.toLowerCase().includes(lowerQuery)) {
          sectionHtml.push(`<section class="transcript-session"><header class="transcript-session-header"><h3>${esc(section.session.title || section.session.id)}</h3></header><p class="meta">Antigravity CLI metadata only. Open the conversation in Antigravity to read its message history.</p></section>`)
        }
        continue
      }
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
setGlobalLaunchKind(storedLaunchKind === 'codex' || storedLaunchKind === 'agy' || storedLaunchKind === 'shell' ? storedLaunchKind : 'claude')
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
newAgyButton.addEventListener('click', () => void activateOrCreateAgentTerminal('agy'))
documentDraftButton.addEventListener('click', () => void draftWorkstreamDocument())
documentEditButton.addEventListener('click', () => {
  if (currentWorkstreamDocument) {
    documentStatus.textContent = ''
    showDocumentEditor(currentWorkstreamDocument)
  }
})
documentSaveButton.addEventListener('click', () => void saveWorkstreamDocument())
documentCancelButton.addEventListener('click', () => {
  pendingWorkstreamDocument = null
  documentEditing = false
  documentStatus.textContent = ''
  renderWorkstreamDocument()
})
documentArticle.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const source = target.closest<HTMLButtonElement>('button[data-session-id]')
  if (source?.dataset.sessionId) void openSessionTranscript(source.dataset.sessionId)
  const linked = target.closest<HTMLButtonElement>('button[data-workstream-id]')
  if (linked?.dataset.workstreamId) void selectProject(linked.dataset.workstreamId)
  if (target.closest('button[data-queue-open-question]')) prefillInvestigation(currentWorkstreamDocument?.sections.openQuestions ?? '')
})
overviewChatMode.addEventListener('change', renderOverviewChat)
workstreamsToggle.addEventListener('click', () => setWorkstreamListOpen(!appShell.classList.contains('sidebar-open')))
sidebarReturnButton.addEventListener('click', () => setWorkstreamListOpen(false))
overviewChatToggle.addEventListener('click', () => setKnowledgeOpen(!detailRoot.classList.contains('knowledge-open')))
overviewChatClose.addEventListener('click', () => setKnowledgeOpen(false))
overviewChatBackdrop.addEventListener('click', () => setKnowledgeOpen(false))
window.matchMedia('(max-width: 1320px)').addEventListener('change', (event) => {
  if (!event.matches) {
    setKnowledgeOpen(false)
    appShell.classList.remove('sidebar-open')
    workstreamsToggle.setAttribute('aria-expanded', 'false')
  }
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && detailRoot.classList.contains('knowledge-open')) setKnowledgeOpen(false)
  if (event.key === 'Tab' && detailRoot.classList.contains('knowledge-open')) {
    const focusables = [...overviewChatCard.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled])')]
      .filter((element) => element.getClientRects().length > 0)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (first && last && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }
})
overviewChatSend.addEventListener('click', () => void sendOverviewChat())
overviewChatQuestion.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void sendOverviewChat()
  }
})
overviewChatHistory.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const source = target.closest<HTMLButtonElement>('button[data-session-id]')
  if (source?.dataset.sessionId) { setKnowledgeOpen(false); void openSessionTranscript(source.dataset.sessionId) }
  const review = target.closest<HTMLButtonElement>('button[data-review-turn]')
  if (review?.dataset.reviewTurn) reviewOverviewEdit(Number(review.dataset.reviewTurn))
  const queue = target.closest<HTMLButtonElement>('button[data-queue-turn]')
  if (queue?.dataset.queueTurn) {
    const index = Number(queue.dataset.queueTurn)
    const question = currentDetail ? overviewChatByWorkstream.get(currentDetail.project.id)?.[index - 1]?.text : ''
    if (question) prefillInvestigation(question)
  }
})
investigationAdd.addEventListener('click', () => void addInvestigation())
investigationList.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const child = target.closest<HTMLButtonElement>('button[data-open-child]')
  if (child?.dataset.openChild) { void selectProject(child.dataset.openChild); return }
  const remove = target.closest<HTMLButtonElement>('button[data-remove-id]')
  if (remove?.dataset.removeId) { void removeInvestigation(remove.dataset.removeId); return }
  const start = target.closest<HTMLButtonElement>('button[data-start-id]')
  if (!start?.dataset.startId) return
  const kind = start.closest('.investigation-row')?.querySelector<HTMLSelectElement>('select')?.value
  if (kind === 'claude' || kind === 'codex' || kind === 'agy') reviewInvestigationStart(start.dataset.startId, kind)
})
investigationStartCancel.addEventListener('click', () => investigationStartDialog.close())
investigationStartDialog.addEventListener('close', () => { investigationStartPending = null })
investigationStartConfirm.addEventListener('click', () => {
  const pending = investigationStartPending
  investigationStartDialog.close()
  if (pending) void startInvestigation(pending.id, pending.kind)
})
investigationParent.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('button[data-parent-id]')
  if (button?.dataset.parentId) void selectProject(button.dataset.parentId)
  if (target.closest('button[data-propose-parent]')) void proposeParentArticleUpdate()
})
workstreamViewTabs.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('.workstream-view-tab')
  const view = button?.dataset.view
  if (view === 'overview' || view === 'activity' || view === 'terminal') setWorkstreamView(view)
})
workstreamChangesActivity.addEventListener('click', () => setWorkstreamView('activity'))
workstreamChangesList.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !currentDetail) return
  const row = target.closest<HTMLButtonElement>('button[data-change-action]')
  const action = row?.dataset.changeAction
  if (action === 'terminal' && row?.dataset.changeId) void jumpToNeedsInputTerminal(currentDetail.project.id, row.dataset.changeId)
  else if (action === 'session' && row?.dataset.changeId) void openSessionTranscript(row.dataset.changeId)
  else if (action === 'article') document.querySelector('.workstream-document-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  else if (action === 'handoff') { workstreamHandoff.open = true; workstreamHandoff.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  else if (action === 'activity') setWorkstreamView('activity')
})
terminalCloseButton.addEventListener('click', () => void closeActiveTerminal())
terminalHost.addEventListener('pointerdown', (event) => {
  if (event.button !== 2) return
  const pane = event.target instanceof Element ? event.target.closest<HTMLElement>('.terminal-pane') : null
  const view = pane?.dataset.terminalId ? terminalViews.get(pane.dataset.terminalId) : undefined
  cachedRightClickTerminalId = view?.record.id ?? null
  cachedRightClickSelection = view?.terminal.getSelection?.() ?? ''
}, true)
terminalHost.addEventListener('contextmenu', (event) => {
  const pane = event.target instanceof Element ? event.target.closest<HTMLElement>('.terminal-pane') : null
  const view = pane?.dataset.terminalId ? terminalViews.get(pane.dataset.terminalId) : undefined
  if (!view) return
  const selection = view.terminal.getSelection?.() || (cachedRightClickTerminalId === view.record.id ? cachedRightClickSelection : '')
  if (!selection.trim()) return
  event.preventDefault()
  contextTerminalId = view.record.id
  contextSelection = selection
  terminalContextMenu.classList.remove('hidden')
  const bounds = terminalContextMenu.getBoundingClientRect()
  terminalContextMenu.style.left = `${Math.max(8, Math.min(event.clientX || 30, window.innerWidth - bounds.width - 8))}px`
  terminalContextMenu.style.top = `${Math.max(8, Math.min(event.clientY || 30, window.innerHeight - bounds.height - 8))}px`
  terminalContextOpen.focus()
})
terminalHost.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  const view = activeTerminalId ? terminalViews.get(activeTerminalId) : undefined
  if (view) focusTerminalWithoutPageScroll(view)
})
terminalContextOpen.addEventListener('click', () => {
  const view = contextTerminalId ? terminalViews.get(contextTerminalId) : undefined
  const filePath = selectedFilePath(contextSelection)
  hideTerminalContextMenu()
  if (view && filePath) openFileReader(filePath, view.record.workstreamId ?? null, view.record.id)
})
terminalContextCopy.addEventListener('click', () => {
  const selection = contextSelection
  hideTerminalContextMenu()
  if (selection) void copyText(selection)
})
document.addEventListener('pointerdown', (event) => {
  if (!terminalContextMenu.contains(event.target as Node)) hideTerminalContextMenu()
}, true)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideTerminalContextMenu()
})
fileReaderClose.addEventListener('click', () => fileReaderDialog.close())
fileReaderForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void readReaderPath()
})
fileReaderDialog.addEventListener('close', () => {
  readerRequestVersion += 1
  const view = readerTerminalId ? terminalViews.get(readerTerminalId) : undefined
  if (view) focusTerminalWithoutPageScroll(view)
  readerTerminalId = null
})
readingListToggle.addEventListener('click', () => {
  readingListOpen = !readingListOpen
  renderReadingList()
})
readFileByPath.addEventListener('click', () => openFileReader('', selectedProjectId))
fileReaderKeep.addEventListener('click', () => {
  if (!readerFile || !readerWorkstreamId) return
  const paths = readingFilesByWorkstream[readerWorkstreamId] ?? []
  if (paths.includes(readerFile.path)) return
  readingFilesByWorkstream[readerWorkstreamId] = [readerFile.path, ...paths].slice(0, 30)
  saveReadingFiles()
  renderReadingList()
  updateReaderKeepButton()
})
readingList.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !selectedProjectId) return
  const open = target.closest<HTMLButtonElement>('button[data-reading-index]')
  const remove = target.closest<HTMLButtonElement>('button[data-remove-reading-index]')
  const paths = readingFilesByWorkstream[selectedProjectId] ?? []
  if (open?.dataset.readingIndex) {
    const filePath = paths[Number(open.dataset.readingIndex)]
    if (filePath) openFileReader(filePath, selectedProjectId)
  } else if (remove?.dataset.removeReadingIndex) {
    paths.splice(Number(remove.dataset.removeReadingIndex), 1)
    readingFilesByWorkstream[selectedProjectId] = paths
    saveReadingFiles()
    renderReadingList()
  }
})
workstreamDigest.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !currentDetail) return
  const row = target.closest<HTMLElement>('.workstream-digest-row.actionable')
  if (!row || !workstreamDigest.contains(row)) return
  if (row.dataset.terminalId) void jumpToNeedsInputTerminal(currentDetail.project.id, row.dataset.terminalId)
  else if (row.dataset.sessionId) void openSessionTranscript(row.dataset.sessionId)
})
workstreamDigest.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target
  if (!(target instanceof Element) || !currentDetail) return
  const row = target.closest<HTMLElement>('.workstream-digest-row.actionable')
  if (!row || !workstreamDigest.contains(row)) return
  event.preventDefault()
  if (row.dataset.terminalId) void jumpToNeedsInputTerminal(currentDetail.project.id, row.dataset.terminalId)
  else if (row.dataset.sessionId) void openSessionTranscript(row.dataset.sessionId)
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
switcherClose.addEventListener('click', () => switcherDialog.close())
keyboardHelpClose.addEventListener('click', () => keyboardHelpDialog.close())
keyboardHelpOpen.addEventListener('click', () => {
  settingsDialog.close()
  openKeyboardHelp()
})
switcherDialog.addEventListener('close', () => {
  if (!switcherSelecting) switcherReturnFocus?.focus()
  switcherSelecting = false
  switcherReturnFocus = null
})
switcherQuery.addEventListener('input', () => {
  switcherIndex = 0
  renderSwitcher()
})
switcherQuery.addEventListener('keydown', (event) => {
  if (switcherScope === 'workstreams' && event.altKey && !event.ctrlKey && !event.metaKey) {
    const target = switcherItems[switcherIndex]
    if (target?.kind !== 'workstream') return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePinnedWorkstream(target.id)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const visiblePinned = switcherItems
        .filter((item): item is Extract<SwitcherTarget, { kind: 'workstream' }> => item.kind === 'workstream')
        .filter((item) => pinnedWorkstreamIds.has(item.id))
        .map((item) => item.id)
      movePinnedWorkstream(target.id, event.key === 'ArrowUp' ? -1 : 1, 'none', visiblePinned)
    } else {
      return
    }
    renderSwitcher()
    const selectedIndex = switcherItems.findIndex((item) => item.kind === 'workstream' && item.id === target.id)
    if (selectedIndex >= 0) {
      switcherIndex = selectedIndex
      renderSwitcher()
      switcherResults.querySelector<HTMLElement>('.switcher-row.active')?.scrollIntoView({ block: 'nearest' })
    }
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!switcherItems.length) return
    switcherIndex = (switcherIndex + (event.key === 'ArrowDown' ? 1 : -1) + switcherItems.length) % switcherItems.length
    renderSwitcher()
    switcherResults.querySelector<HTMLElement>('.switcher-row.active')?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void chooseSwitcherTarget(switcherIndex)
  }
})
switcherResults.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const row = target.closest<HTMLButtonElement>('button[data-switcher-index]')
  if (row?.dataset.switcherIndex) void chooseSwitcherTarget(Number(row.dataset.switcherIndex))
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'F1' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (!keyboardHelpDialog.open && document.querySelector('dialog[open]')) return
    event.preventDefault()
    event.stopPropagation()
    if (keyboardHelpDialog.open) keyboardHelpDialog.close()
    else openKeyboardHelp()
    return
  }
  const key = event.key.toLowerCase()
  if (!event.altKey && event.shiftKey && (event.ctrlKey || event.metaKey) && (key === 'p' || key === 'l')) {
    if (!switcherDialog.open && document.querySelector('dialog[open]')) return
    event.preventDefault()
    event.stopPropagation()
    const scope = key === 'p' ? 'workstreams' : 'current'
    if (switcherDialog.open && switcherScope === scope) switcherDialog.close()
    else openSwitcher(scope)
  }
}, true)
settingsToggle.addEventListener('click', () => {
  renderSettingsControls()
  settingsDialog.showModal()
})
for (const input of appearanceInputs) input.addEventListener('change', () => {
  if (input.checked && (input.value === 'dark' || input.value === 'light' || input.value === 'system')) setAppearance(input.value)
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
