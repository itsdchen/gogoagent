export {}

type TerminalKind = 'shell' | 'claude' | 'codex'

interface TerminalSessionRecord {
  id: string
  kind: TerminalKind
  title: string
  cwd: string
  workstreamId?: string
  gitBranch?: string
  resumeSessionId?: string
  command: string
  status: 'running' | 'exited'
  userInteracted?: boolean
  needsInput?: boolean
  exitCode?: number
  startedAt: string
  lastActivityAt?: string
  endedAt?: string
  logPath?: string
  logBytes: number
  logError?: string
}

interface TerminalLogReplay {
  data: string
  bytes: number
  truncated: boolean
  logPath?: string
}

declare global {
  interface FitAddonInstance {
    activate: (terminal: unknown) => void
    fit: () => void
    proposeDimensions: () => { cols: number; rows: number } | undefined
    dispose: () => void
  }

  interface Window {
    Terminal: new (options?: Record<string, unknown>) => {
      open: (element: HTMLElement) => void
      write: (data: string) => void
      paste?: (data: string) => void
      onData: (callback: (data: string) => void) => { dispose: () => void }
      attachCustomKeyEventHandler?: (handler: (event: KeyboardEvent) => boolean) => void
      focus: () => void
      resize: (cols: number, rows: number) => void
      scrollToBottom?: () => void
      hasSelection?: () => boolean
      getSelection?: () => string
      clearSelection?: () => void
      clear: () => void
      cols: number
      rows: number
      loadAddon?: (addon: FitAddonInstance) => void
    }
    FitAddon?: {
      FitAddon: new () => FitAddonInstance
    }
    gogoagent: {
      getHealth: () => Promise<import('@gogoagent/shared').HealthResponse>
      getSnapshot: () => Promise<import('@gogoagent/shared').SidecarSnapshot>
      searchMessages: (
        query: string,
      ) => Promise<import('@gogoagent/shared').MessageSearchResponse>
      projects: {
        list: (options?: { archived?: boolean }) => Promise<import('@gogoagent/shared').Project[]>
        get: (projectId: string) => Promise<import('@gogoagent/shared').ProjectDetail>
        suggestTitle: (projectId: string) => Promise<{ name: string; summary: string }>
      }
      sessions: {
        get: (sessionId: string) => Promise<import('@gogoagent/shared').SessionDetail>
      }
      files: {
        completeDirectory: (input: string) => Promise<{ input: string; completions: string[]; error?: string }>
        inspectDirectory: (input: string) => Promise<{ input: string; path: string; exists: boolean; isDirectory: boolean; error?: string }>
        selectDirectory: (defaultPath?: string) => Promise<string | null>
      }
      debug: {
        getState: () => Promise<import('@gogoagent/shared').DebugState>
        rescan: () => Promise<import('@gogoagent/shared').DebugState>
      }
      workstreams: {
        rename: (id: string, name: string) => Promise<{ project: import('@gogoagent/shared').Project }>
        archive: (id: string) => Promise<{ project: import('@gogoagent/shared').Project }>
        restore: (id: string) => Promise<{ project: import('@gogoagent/shared').Project }>
        label: (input: { projectIds?: string[]; force?: boolean }) => Promise<import('@gogoagent/shared').RefineJobStatus>
        getLabelStatus: (jobId: string) => Promise<import('@gogoagent/shared').RefineJobStatus>
      }
      lessons: {
        refine: (input: { projectId?: string; sessionIds?: string[]; force?: boolean; dryRun?: boolean }) => Promise<import('@gogoagent/shared').RefineJobStatus>
        getRefineStatus: (jobId: string) => Promise<import('@gogoagent/shared').RefineJobStatus>
      }
      terminals: {
        create: (input: {
          kind?: TerminalKind
          cwd?: string
          title?: string
          workstreamId?: string
          gitBranch?: string
          resumeSessionId?: string
          cols?: number
          rows?: number
        }) => Promise<TerminalSessionRecord>
        list: () => Promise<TerminalSessionRecord[]>
        readLog: (id: string, maxBytes?: number) => Promise<TerminalLogReplay>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        close: (id: string) => Promise<void>
        onCreated: (callback: (record: TerminalSessionRecord) => void) => () => void
        onData: (callback: (payload: { id: string; data: string; logBytes?: number; lastActivityAt?: string; needsInput?: boolean; needsInputChanged?: boolean }) => void) => () => void
        onExit: (callback: (payload: { id: string; record: TerminalSessionRecord }) => void) => () => void
        onClosed: (callback: (payload: { id: string }) => void) => () => void
      }
    }
  }
}
