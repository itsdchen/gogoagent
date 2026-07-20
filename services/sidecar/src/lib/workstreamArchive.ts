import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project } from '@gogoagent/shared'

const STATE_DIR =
  process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const STATE_FILE = path.join(STATE_DIR, 'workstream-archive.json')
const LEGACY_CACHE_FILE = path.join(
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent'),
  'workstream-archive.json',
)

interface ArchiveEntry {
  archivedAt: string
}

interface ArchiveFile {
  version: string
  entries: Record<string, ArchiveEntry>
}

let memory: ArchiveFile | null = null
let persistQueue = Promise.resolve()

async function load(): Promise<ArchiveFile> {
  if (memory) return memory
  let migratedFromCache = false
  try {
    let text: string
    try {
      text = await readFile(STATE_FILE, 'utf8')
    } catch {
      text = await readFile(LEGACY_CACHE_FILE, 'utf8')
      migratedFromCache = true
    }
    const parsed = JSON.parse(text) as ArchiveFile
    if (parsed && parsed.entries && typeof parsed.entries === 'object') {
      memory = { version: parsed.version ?? 'v1', entries: parsed.entries }
      if (migratedFromCache) await persist().catch(() => undefined)
      return memory
    }
  } catch {
    // Fall through to empty cache.
  }
  memory = { version: 'v1', entries: {} }
  return memory
}

async function persist() {
  if (!memory) return
  const payload = JSON.stringify(memory, null, 2)
  const operation = persistQueue.then(async () => {
    await mkdir(STATE_DIR, { recursive: true, mode: 0o700 })
    const tmp = `${STATE_FILE}.${process.pid}.tmp`
    await writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(tmp, STATE_FILE)
  })
  persistQueue = operation.catch(() => undefined)
  await operation
}

export async function applyArchivedWorkstreamState(workstreams: Project[]) {
  const cache = await load()
  for (const workstream of workstreams) {
    const entry = cache.entries[workstream.id]
    if (entry) workstream.archivedAt = entry.archivedAt
    else delete workstream.archivedAt
  }
}

export async function archiveWorkstream(workstreamId: string) {
  const cache = await load()
  const archivedAt = cache.entries[workstreamId]?.archivedAt ?? new Date().toISOString()
  cache.entries[workstreamId] = { archivedAt }
  await persist()
  return archivedAt
}

export async function restoreWorkstream(workstreamId: string) {
  const cache = await load()
  delete cache.entries[workstreamId]
  await persist()
}
