import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CACHE_DIR =
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const STORE_FILE = path.join(CACHE_DIR, 'auto-titles.json')

export const AUTO_TITLE_PROMPT_VERSION = 'v1'

export interface AutoTitleEntry {
  name: string
  summary?: string
  promptVersion: string
  createdAt: string
}

interface StoreFile {
  version: string
  entries: Record<string, AutoTitleEntry>
}

let memory: StoreFile | null = null

async function load(): Promise<StoreFile> {
  if (memory) return memory
  try {
    const text = await readFile(STORE_FILE, 'utf8')
    const parsed = JSON.parse(text) as Partial<StoreFile>
    memory = {
      version: parsed.version ?? '1',
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    }
    return memory
  } catch {
    memory = { version: '1', entries: {} }
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

export async function getAllAutoTitles(): Promise<Record<string, AutoTitleEntry>> {
  const store = await load()
  return { ...store.entries }
}

export async function getAutoTitle(projectId: string): Promise<AutoTitleEntry | undefined> {
  const store = await load()
  const entry = store.entries[projectId]
  if (!entry) return undefined
  if (entry.promptVersion !== AUTO_TITLE_PROMPT_VERSION) return undefined
  return entry
}

export async function putAutoTitle(projectId: string, name: string, summary?: string): Promise<void> {
  const store = await load()
  store.entries[projectId] = {
    name,
    summary,
    promptVersion: AUTO_TITLE_PROMPT_VERSION,
    createdAt: new Date().toISOString(),
  }
  await persist()
}
