import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { RefinedLesson } from '@gogoagent/shared'
import { REFINE_PROMPT_VERSION } from './refineLessons.js'

const STATE_DIR =
  process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const STATE_FILE = path.join(STATE_DIR, 'refined-lessons.json')
const LEGACY_CACHE_FILE = path.join(
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent'),
  'refined-lessons.json',
)

// Cache key: hash(candidateId + candidateText + promptVersion). If either the
// source text or the prompt changes, we re-refine.
export function refineCacheKey(candidateId: string, candidateText: string) {
  return createHash('sha1')
    .update(`${REFINE_PROMPT_VERSION}\0${candidateId}\0${candidateText}`)
    .digest('hex')
}

interface CacheFile {
  version: string
  entries: Record<string, RefinedLesson>
}

let memory: CacheFile | null = null
let persistQueue = Promise.resolve()

async function load(): Promise<CacheFile> {
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
    const parsed = JSON.parse(text) as CacheFile
    if (parsed && parsed.entries && typeof parsed.entries === 'object') {
      memory = { version: parsed.version ?? REFINE_PROMPT_VERSION, entries: parsed.entries }
      if (migratedFromCache) await persist().catch(() => undefined)
      return memory
    }
  } catch {
    // fall through to empty
  }
  memory = { version: REFINE_PROMPT_VERSION, entries: {} }
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

export async function getCachedRefined(candidateId: string, candidateText: string) {
  const cache = await load()
  return cache.entries[refineCacheKey(candidateId, candidateText)]
}

export async function putCachedRefined(
  candidateId: string,
  candidateText: string,
  lesson: RefinedLesson,
) {
  const cache = await load()
  cache.entries[refineCacheKey(candidateId, candidateText)] = lesson
  await persist()
}

export async function getAllRefined(): Promise<RefinedLesson[]> {
  const cache = await load()
  return Object.values(cache.entries)
}

export async function getRefinedForSession(sessionId: string): Promise<RefinedLesson[]> {
  const cache = await load()
  return Object.values(cache.entries).filter((entry) => entry.sessionId === sessionId)
}

export function statePaths() {
  return { dir: STATE_DIR, file: STATE_FILE }
}
