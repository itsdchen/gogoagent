import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const STATE_DIR =
  process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const STORE_FILE = path.join(STATE_DIR, 'title-overrides.json')
const LEGACY_STORE_FILE = path.join(
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent'),
  'title-overrides.json',
)

interface StoreFile {
  version: string
  sessions: Record<string, string>
  projects: Record<string, string>
}

let memory: StoreFile | null = null
let persistQueue = Promise.resolve()

async function load(): Promise<StoreFile> {
  if (memory) return memory
  let migratedFromCache = false
  try {
    let text: string
    try {
      text = await readFile(STORE_FILE, 'utf8')
    } catch {
      text = await readFile(LEGACY_STORE_FILE, 'utf8')
      migratedFromCache = true
    }
    const parsed = JSON.parse(text) as Partial<StoreFile>
    memory = {
      version: parsed.version ?? '1',
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
    }
    if (migratedFromCache) await persist().catch(() => undefined)
    return memory
  } catch {
    memory = { version: '1', sessions: {}, projects: {} }
    return memory
  }
}

async function persist() {
  if (!memory) return
  const payload = JSON.stringify(memory, null, 2)
  const operation = persistQueue.then(async () => {
    await mkdir(STATE_DIR, { recursive: true, mode: 0o700 })
    const tmp = `${STORE_FILE}.${process.pid}.tmp`
    await writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(tmp, STORE_FILE)
  })
  persistQueue = operation.catch(() => undefined)
  await operation
}

export async function getAllOverrides(): Promise<{
  sessions: Record<string, string>
  projects: Record<string, string>
}> {
  const store = await load()
  return { sessions: { ...store.sessions }, projects: { ...store.projects } }
}

export async function setSessionTitle(sessionId: string, title: string | null): Promise<void> {
  const store = await load()
  if (title && title.trim()) {
    store.sessions[sessionId] = title.trim()
  } else {
    delete store.sessions[sessionId]
  }
  await persist()
}

export async function setProjectTitle(projectId: string, title: string | null): Promise<void> {
  const store = await load()
  if (title && title.trim()) {
    store.projects[projectId] = title.trim()
  } else {
    delete store.projects[projectId]
  }
  await persist()
}
