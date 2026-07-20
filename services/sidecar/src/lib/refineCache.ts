import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { RefinedLesson } from '@gogoagent/shared'
import { REFINE_PROMPT_VERSION } from './refineLessons.js'

const CACHE_DIR =
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const CACHE_FILE = path.join(CACHE_DIR, 'refined-lessons.json')

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

async function load(): Promise<CacheFile> {
  if (memory) return memory
  try {
    const text = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(text) as CacheFile
    if (parsed && parsed.entries && typeof parsed.entries === 'object') {
      memory = { version: parsed.version ?? REFINE_PROMPT_VERSION, entries: parsed.entries }
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
  await mkdir(CACHE_DIR, { recursive: true })
  const tmp = `${CACHE_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(memory, null, 2), 'utf8')
  await rename(tmp, CACHE_FILE)
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

export function cachePaths() {
  return { dir: CACHE_DIR, file: CACHE_FILE }
}
