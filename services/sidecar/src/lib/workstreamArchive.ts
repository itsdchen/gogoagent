import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project } from '@gogoagent/shared'

const CACHE_DIR =
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const CACHE_FILE = path.join(CACHE_DIR, 'workstream-archive.json')

interface ArchiveEntry {
  archivedAt: string
}

interface ArchiveFile {
  version: string
  entries: Record<string, ArchiveEntry>
}

let memory: ArchiveFile | null = null

async function load(): Promise<ArchiveFile> {
  if (memory) return memory
  try {
    const text = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(text) as ArchiveFile
    if (parsed && parsed.entries && typeof parsed.entries === 'object') {
      memory = { version: parsed.version ?? 'v1', entries: parsed.entries }
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
  await mkdir(CACHE_DIR, { recursive: true })
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(memory, null, 2), 'utf8')
  await rename(tmp, CACHE_FILE)
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
