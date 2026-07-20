import { access, stat } from 'node:fs/promises'
import type { ActivityEntry, DebugError, DebugPath, DebugState, DebugStep, DebugStepStatus } from '@gogoagent/shared'

const MAX_ERRORS = 50

// Mutable, in-memory only. Reset on sidecar restart. Intended for the Debug
// panel and ad-hoc inspection while we iterate on discovery — not durable.
const state: DebugState = {
  startedAt: new Date().toISOString(),
  paths: [],
  lastScan: { inProgress: false },
  steps: [],
  counts: {
    projects: 0,
    sessions: 0,
    artifacts: 0,
    workLocations: 0,
    clusters: 0,
    transcriptFiles: 0,
    terminalLogFiles: 0,
  },
  errors: [],
}

export function getState(): DebugState {
  // Return a shallow clone so callers can't mutate the live state via the response.
  return {
    ...state,
    paths: [...state.paths],
    steps: state.steps.map((step) => ({ ...step })),
    counts: { ...state.counts },
    errors: [...state.errors],
    lastScan: { ...state.lastScan },
    lastActivity: state.lastActivity ? { ...state.lastActivity } : undefined,
  }
}

export function recordActivity(label: string) {
  state.lastActivity = { at: new Date().toISOString(), label }
}

export function getLastActivity(): ActivityEntry | undefined {
  return state.lastActivity ? { ...state.lastActivity } : undefined
}

export async function setPaths(paths: Array<{ name: string; path: string }>) {
  const resolved: DebugPath[] = []
  for (const entry of paths) {
    let exists = false
    try {
      await access(entry.path)
      exists = true
    } catch {
      exists = false
    }
    resolved.push({ ...entry, exists })
  }
  state.paths = resolved
}

export function beginScan() {
  state.lastScan = {
    startedAt: new Date().toISOString(),
    inProgress: true,
  }
  state.steps = []
}

export function endScan(ok: boolean, error?: string) {
  const finishedAt = new Date().toISOString()
  const startedAt = state.lastScan.startedAt
  state.lastScan = {
    startedAt,
    finishedAt,
    durationMs: startedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : undefined,
    ok,
    error,
    inProgress: false,
  }
}

export async function runStep<T>(name: string, fn: () => Promise<T>, describe?: (value: T) => { count?: number; detail?: string }): Promise<T> {
  const step: DebugStep = { name, status: 'running' }
  state.steps.push(step)
  const startedAt = Date.now()
  try {
    const value = await fn()
    step.status = 'ok'
    step.durationMs = Date.now() - startedAt
    if (describe) {
      const meta = describe(value)
      if (meta.count !== undefined) step.count = meta.count
      if (meta.detail) step.detail = meta.detail
    }
    return value
  } catch (error) {
    step.status = 'error'
    step.durationMs = Date.now() - startedAt
    step.error = error instanceof Error ? error.message : String(error)
    recordError(name, step.error)
    throw error
  }
}

export function recordError(where: string, message: string, filePath?: string) {
  const entry: DebugError = {
    at: new Date().toISOString(),
    where,
    message,
    path: filePath,
  }
  state.errors.unshift(entry)
  if (state.errors.length > MAX_ERRORS) state.errors.length = MAX_ERRORS
}

export function setCount(key: keyof DebugState['counts'], value: number) {
  state.counts[key] = value
}

export function setStepStatus(name: string, status: DebugStepStatus, patch: Partial<DebugStep> = {}) {
  const existing = state.steps.find((step) => step.name === name)
  if (existing) {
    Object.assign(existing, { status, ...patch })
    return
  }
  state.steps.push({ name, status, ...patch })
}

export async function describeDirEntryCount(filePath: string): Promise<number | undefined> {
  try {
    const info = await stat(filePath)
    if (!info.isDirectory()) return undefined
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(filePath)
    return entries.length
  } catch {
    return undefined
  }
}
