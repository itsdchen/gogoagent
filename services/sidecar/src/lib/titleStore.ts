import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CACHE_DIR =
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const STORE_FILE = path.join(CACHE_DIR, 'title-overrides.json')

interface StoreFile {
  version: string
  sessions: Record<string, string>
  projects: Record<string, string>
}

let memory: StoreFile | null = null

async function load(): Promise<StoreFile> {
  if (memory) return memory
  try {
    const text = await readFile(STORE_FILE, 'utf8')
    const parsed = JSON.parse(text) as Partial<StoreFile>
    memory = {
      version: parsed.version ?? '1',
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
    }
    return memory
  } catch {
    memory = { version: '1', sessions: {}, projects: {} }
    return memory
  }
}

async function persist() {
  if (!memory) return
  await mkdir(CACHE_DIR, { recursive: true })
  const tmp = `${STORE_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(memory, null, 2), 'utf8')
  await rename(tmp, STORE_FILE)
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
