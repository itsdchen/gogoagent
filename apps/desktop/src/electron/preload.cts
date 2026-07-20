import { contextBridge } from 'electron'
import { readFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { DebugState, HealthResponse, MessageSearchResponse, SessionDetail, SidecarSnapshot } from '@gogoagent/shared'

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

type TerminalDataPayload = { id: string; data: string; logBytes?: number; lastActivityAt?: string; needsInput?: boolean; needsInputChanged?: boolean }
type TerminalExitPayload = { id: string; record: TerminalSessionRecord }
type TerminalClosedPayload = { id: string }

const port = Number(process.env.GOGOAGENT_PORT ?? 43111)
const baseUrl = `http://127.0.0.1:${port}`
const authTokenPath = process.env.GOGOAGENT_AUTH_TOKEN_FILE
  ?? path.join(os.homedir(), '.gogoagent', `sidecar-${port}.token`)
const authToken = readFileSync(authTokenPath, 'utf8').trim()
if (!authToken) throw new Error(`gogoagent sidecar authentication token is empty: ${authTokenPath}`)
let terminalEventsConnected = false
const terminalCreatedCallbacks = new Set<(record: TerminalSessionRecord) => void>()
const terminalDataCallbacks = new Set<(payload: TerminalDataPayload) => void>()
const terminalExitCallbacks = new Set<(payload: TerminalExitPayload) => void>()
const terminalClosedCallbacks = new Set<(payload: TerminalClosedPayload) => void>()

interface SidecarRequestInit {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
}

async function requestJson<T>(path: string, init: SidecarRequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`Invalid sidecar path: ${path}`)
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${authToken}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json() as { error?: string; detail?: string }
      detail = payload.detail ?? payload.error ?? ''
    } catch {
      detail = ''
    }
    throw new Error(detail ? `${path} -> ${response.status}: ${detail}` : `${path} -> ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function getSnapshot(): Promise<SidecarSnapshot> {
  return requestJson<SidecarSnapshot>('/snapshot')
}

async function getProjectDetail(projectId: string): Promise<import('@gogoagent/shared').ProjectDetail> {
  return requestJson<import('@gogoagent/shared').ProjectDetail>(`/projects/${encodeURIComponent(projectId)}`)
}

async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  return requestJson<SessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`)
}

async function searchMessages(query: string): Promise<MessageSearchResponse> {
  return requestJson<MessageSearchResponse>(`/search/messages?q=${encodeURIComponent(query)}`)
}

async function getHealth() {
  return requestJson<HealthResponse>('/health')
}

async function getDebugState(): Promise<DebugState> {
  return requestJson<DebugState>('/debug/state')
}

async function rescan(): Promise<DebugState> {
  return requestJson<DebugState>('/debug/rescan', { method: 'POST' })
}

function terminalPath(id: string, suffix: string) {
  return `/terminals/${encodeURIComponent(id)}/${suffix}`
}

function dispatchTerminalEvent<T>(data: string, callbacks: Set<(payload: T) => void>) {
  const payload = JSON.parse(data) as T
  for (const callback of callbacks) callback(payload)
}

function ensureTerminalEvents() {
  if (terminalEventsConnected) return
  terminalEventsConnected = true

  const request = httpGet(`${baseUrl}/terminals/events?token=${encodeURIComponent(authToken)}`, (response) => {
    if (response.statusCode !== 200) {
      terminalEventsConnected = false
      response.resume()
      return
    }

    response.setEncoding('utf8')
    let buffer = ''
    let eventName = ''
    let dataLines: string[] = []

    const dispatch = () => {
      const data = dataLines.join('\n')
      if (!data) return
      if (eventName === 'created') dispatchTerminalEvent(data, terminalCreatedCallbacks)
      if (eventName === 'data') dispatchTerminalEvent(data, terminalDataCallbacks)
      if (eventName === 'exit') dispatchTerminalEvent(data, terminalExitCallbacks)
      if (eventName === 'closed') dispatchTerminalEvent(data, terminalClosedCallbacks)
    }

    response.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (!line) {
          dispatch()
          eventName = ''
          dataLines = []
        } else if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
        }
      }
    })
    response.once('end', () => {
      terminalEventsConnected = false
    })
    response.once('error', () => {
      terminalEventsConnected = false
    })
  })

  request.once('error', () => {
    terminalEventsConnected = false
  })
}

contextBridge.exposeInMainWorld('gogoagent', {
  getHealth,
  getSnapshot,
  searchMessages,
  projects: {
    list: async (options: { archived?: boolean } = {}) => {
      const response = await requestJson<{ projects: import('@gogoagent/shared').Project[] }>(options.archived ? '/projects?archived=1' : '/projects')
      return response.projects
    },
    get: getProjectDetail,
    suggestTitle: (projectId: string) =>
      requestJson<{ name: string; summary: string }>(`/projects/${encodeURIComponent(projectId)}/suggest-title`, { method: 'POST' }),
  },
  sessions: {
    get: getSessionDetail,
  },
  files: {
    completeDirectory: (input: string) =>
      requestJson<{ input: string; completions: string[]; error?: string }>(`/fs/complete-directory?input=${encodeURIComponent(input)}`),
  },
  debug: {
    getState: getDebugState,
    rescan,
  },
  workstreams: {
    rename: (id: string, name: string) =>
      requestJson<{ project: import('@gogoagent/shared').Project }>(`/workstreams/${encodeURIComponent(id)}/name`, { method: 'POST', body: { name } }),
    archive: (id: string) =>
      requestJson<{ project: import('@gogoagent/shared').Project }>(`/workstreams/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
    restore: (id: string) =>
      requestJson<{ project: import('@gogoagent/shared').Project }>(`/workstreams/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
    label: (input: { projectIds?: string[]; force?: boolean }) =>
      requestJson<import('@gogoagent/shared').RefineJobStatus>('/workstreams/label', { method: 'POST', body: input }),
    getLabelStatus: (jobId: string) =>
      requestJson<import('@gogoagent/shared').RefineJobStatus>(`/workstreams/label/status/${encodeURIComponent(jobId)}`),
  },
  lessons: {
    refine: (input: { projectId?: string; sessionIds?: string[]; force?: boolean; dryRun?: boolean }) =>
      requestJson<import('@gogoagent/shared').RefineJobStatus>('/lessons/refine', { method: 'POST', body: input }),
    getRefineStatus: (jobId: string) =>
      requestJson<import('@gogoagent/shared').RefineJobStatus>(`/lessons/refine/status/${encodeURIComponent(jobId)}`),
  },
  terminals: {
    create: (input: { kind?: TerminalKind; cwd?: string; title?: string; workstreamId?: string; gitBranch?: string; resumeSessionId?: string; cols?: number; rows?: number }) =>
      requestJson<TerminalSessionRecord>('/terminals', { method: 'POST', body: input }),
    list: async () => {
      const response = await requestJson<{ terminals: TerminalSessionRecord[] }>('/terminals')
      return response.terminals
    },
    readLog: (id: string, maxBytes?: number) =>
      requestJson<TerminalLogReplay>(`${terminalPath(id, 'log')}${maxBytes === undefined ? '' : `?maxBytes=${encodeURIComponent(String(maxBytes))}`}`),
    write: (id: string, data: string) =>
      requestJson<void>(terminalPath(id, 'write'), { method: 'POST', body: { data } }),
    resize: (id: string, cols: number, rows: number) =>
      requestJson<void>(terminalPath(id, 'resize'), { method: 'POST', body: { cols, rows } }),
    kill: (id: string) =>
      requestJson<void>(terminalPath(id, 'kill'), { method: 'POST' }),
    close: (id: string) =>
      requestJson<void>(terminalPath(id, 'close'), { method: 'POST' }),
    onCreated: (callback: (record: TerminalSessionRecord) => void) => {
      ensureTerminalEvents()
      terminalCreatedCallbacks.add(callback)
      return () => {
        terminalCreatedCallbacks.delete(callback)
      }
    },
    onData: (callback: (payload: TerminalDataPayload) => void) => {
      ensureTerminalEvents()
      terminalDataCallbacks.add(callback)
      return () => {
        terminalDataCallbacks.delete(callback)
      }
    },
    onExit: (callback: (payload: TerminalExitPayload) => void) => {
      ensureTerminalEvents()
      terminalExitCallbacks.add(callback)
      return () => {
        terminalExitCallbacks.delete(callback)
      }
    },
    onClosed: (callback: (payload: TerminalClosedPayload) => void) => {
      ensureTerminalEvents()
      terminalClosedCallbacks.add(callback)
      return () => {
        terminalClosedCallbacks.delete(callback)
      }
    },
  },
})
