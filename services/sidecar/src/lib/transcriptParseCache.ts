import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { TranscriptParseResult } from './parseTranscript.js'
import { safeJsonParse } from './utils.js'

const CACHE_VERSION = 3
const CACHE_PATH = path.join(os.homedir(), '.gogoagent', 'cache', 'transcripts-v3.json')

interface CacheEntry {
  path: string
  size: number
  mtimeMs: number
  contextKey: string
  result: TranscriptParseResult
}

interface CacheFile {
  version: number
  entries: CacheEntry[]
}

let loadPromise: Promise<void> | null = null
let dirty = false
let entries = new Map<string, CacheEntry>()

async function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const parsed = safeJsonParse<CacheFile>(await readFile(CACHE_PATH, 'utf8'))
        if (!parsed || parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) return
        entries = new Map(parsed.entries.map((entry) => [entry.path, entry]))
      } catch {
        entries = new Map()
      }
    })()
  }
  await loadPromise
}

export interface TranscriptFileStamp {
  path: string
  size: number
  mtimeMs: number
  contextKey: string
}

export async function stampTranscript(filePath: string, contextKey: string): Promise<TranscriptFileStamp> {
  const info = await stat(filePath)
  return { path: filePath, size: info.size, mtimeMs: info.mtimeMs, contextKey }
}

export async function getCachedTranscript(stamp: TranscriptFileStamp) {
  await ensureLoaded()
  const entry = entries.get(stamp.path)
  if (!entry) return null
  if (entry.size !== stamp.size || entry.mtimeMs !== stamp.mtimeMs || entry.contextKey !== stamp.contextKey) return null
  return entry.result
}

export async function putCachedTranscript(stamp: TranscriptFileStamp, result: TranscriptParseResult) {
  await ensureLoaded()
  entries.set(stamp.path, { ...stamp, result })
  dirty = true
}

export async function pruneTranscriptCache(validPaths: Set<string>) {
  await ensureLoaded()
  for (const key of entries.keys()) {
    if (!validPaths.has(key)) {
      entries.delete(key)
      dirty = true
    }
  }
}

export async function flushTranscriptCache() {
  await ensureLoaded()
  if (!dirty) return
  await mkdir(path.dirname(CACHE_PATH), { recursive: true })
  const payload: CacheFile = {
    version: CACHE_VERSION,
    entries: [...entries.values()],
  }
  const tmpPath = `${CACHE_PATH}.${process.pid}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(payload)}\n`)
  await rename(tmpPath, CACHE_PATH)
  dirty = false
}
