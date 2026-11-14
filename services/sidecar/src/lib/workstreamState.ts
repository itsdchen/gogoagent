import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project, WorkstreamState } from '@gogoagent/shared'

const STATE_DIR =
  process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const STATE_FILE = path.join(STATE_DIR, 'workstream-state.json')
const FIELD_LIMIT = 1200

interface StateFile {
  version: string
  entries: Record<string, WorkstreamState>
}

let memory: StateFile | null = null
let persistQueue = Promise.resolve()

async function load(): Promise<StateFile> {
  if (memory) return memory
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8')) as Partial<StateFile>
    const entries: Record<string, WorkstreamState> = {}
    if (parsed.entries && typeof parsed.entries === 'object') {
      for (const [id, raw] of Object.entries(parsed.entries)) {
        if (!raw || typeof raw !== 'object') continue
        const state = raw as Partial<WorkstreamState>
        entries[id] = {
          workstreamId: id,
          goal: cleanField(state.goal),
          currentState: cleanField(state.currentState),
          blocker: cleanField(state.blocker),
          nextAction: cleanField(state.nextAction),
          lastVerification: cleanField(state.lastVerification),
          updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : undefined,
        }
      }
    }
    memory = {
      version: parsed.version ?? 'v1',
      entries,
    }
  } catch {
    memory = { version: 'v1', entries: {} }
  }
  return memory
}

async function persist() {
  if (!memory) return
  const payload = JSON.stringify(memory, null, 2)
  const operation = persistQueue.then(async () => {
    await mkdir(STATE_DIR, { recursive: true, mode: 0o700 })
    const temporaryPath = `${STATE_FILE}.${process.pid}.tmp`
    await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, STATE_FILE)
  })
  persistQueue = operation.catch(() => undefined)
  await operation
}

function cleanField(value: unknown) {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  return cleaned ? cleaned.slice(0, FIELD_LIMIT) : undefined
}

export async function getAllWorkstreamStates() {
  const store = await load()
  return Object.fromEntries(
    Object.entries(store.entries).map(([id, state]) => [id, { ...state }]),
  )
}

export async function applyWorkstreamStates(workstreams: Project[]) {
  const states = await getAllWorkstreamStates()
  for (const workstream of workstreams) {
    const state = states[workstream.id]
    if (state) workstream.state = state
    else delete workstream.state
  }
}

export async function setWorkstreamState(
  workstreamId: string,
  patch: Partial<Omit<WorkstreamState, 'workstreamId' | 'updatedAt'>>,
) {
  const store = await load()
  const previous = store.entries[workstreamId]
  const field = (key: 'goal' | 'currentState' | 'blocker' | 'nextAction' | 'lastVerification') => (
    Object.prototype.hasOwnProperty.call(patch, key)
      ? cleanField(patch[key])
      : cleanField(previous?.[key])
  )
  const next: WorkstreamState = {
    workstreamId,
    goal: field('goal'),
    currentState: field('currentState'),
    blocker: field('blocker'),
    nextAction: field('nextAction'),
    lastVerification: field('lastVerification'),
    updatedAt: new Date().toISOString(),
  }
  store.entries[workstreamId] = next
  await persist()
  return { ...next }
}
