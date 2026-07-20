import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { HistoryEntry, ParseTranscriptDeps, SessionMeta, TranscriptParseResult } from './parseTranscript.js'
import { parseTranscript } from './parseTranscript.js'
import { safeJsonParse, stableId } from './utils.js'

export function projectIdForRoot(rootPath: string) {
  return stableId('project', rootPath)
}

export async function readJsonlLines<T>(filePath: string) {
  const text = await readFile(filePath, 'utf8')
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse<T>(line))
    .filter((value): value is T => value !== null)
}

export async function walkFiles(dirPath: string, predicate: (entryPath: string) => boolean) {
  const results: string[] = []

  async function walk(currentPath: string) {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
      } else if (predicate(entryPath)) {
        results.push(entryPath)
      }
    }
  }

  await walk(dirPath)
  return results.sort()
}

export async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function findGitRoot(startPath: string) {
  let current = path.resolve(startPath)

  while (true) {
    if (await exists(path.join(current, '.git'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

export async function resolveProjectRoot(cwd: string) {
  const gitRoot = await findGitRoot(cwd)
  if (gitRoot) return gitRoot

  const normalized = cwd.replace(/\/$/, '') || '/'
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 3) return `/${parts.slice(0, 3).join('/')}`
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export async function loadHistoryIndex(historyPath: string) {
  const bySessionId = new Map<string, HistoryEntry[]>()
  try {
    const entries = await readJsonlLines<HistoryEntry>(historyPath)
    for (const entry of entries) {
      if (!entry.sessionId) continue
      const group = bySessionId.get(entry.sessionId) ?? []
      group.push(entry)
      bySessionId.set(entry.sessionId, group)
    }
  } catch {
    // ignore missing history
  }
  return bySessionId
}

export async function loadSessionMeta(sessionsDir: string) {
  const bySessionId = new Map<string, SessionMeta>()
  try {
    const files = await walkFiles(sessionsDir, (entryPath) => entryPath.endsWith('.json'))
    for (const filePath of files) {
      const parsed = safeJsonParse<SessionMeta>(await readFile(filePath, 'utf8'))
      if (parsed?.sessionId) bySessionId.set(parsed.sessionId, parsed)
    }
  } catch {
    // ignore missing sessions dir
  }
  return bySessionId
}

export async function loadTodoCounts(todosDir: string) {
  const counts = new Map<string, number>()
  try {
    const files = await walkFiles(todosDir, (entryPath) => entryPath.endsWith('.json'))
    for (const filePath of files) {
      const base = path.basename(filePath)
      const sessionId = base.match(/^([0-9a-f-]+)-agent-/)?.[1]
      if (!sessionId) continue
      const parsed = safeJsonParse<unknown[]>(await readFile(filePath, 'utf8'))
      counts.set(sessionId, Array.isArray(parsed) ? parsed.length : 0)
    }
  } catch {
    // ignore missing todos dir
  }
  return counts
}

export async function loadTranscripts(projectsDir: string, historyPath: string, sessionsDir: string, todosDir: string) {
  const [historyIndex, sessionMeta, todoCounts] = await Promise.all([
    loadHistoryIndex(historyPath),
    loadSessionMeta(sessionsDir),
    loadTodoCounts(todosDir),
  ])

  const transcriptFiles = await walkFiles(projectsDir, (entryPath) => entryPath.endsWith('.jsonl'))
  const deps: ParseTranscriptDeps = {
    readJsonlLines,
    resolveProjectRoot,
    projectIdForRoot,
  }

  const sessionResults = await Promise.all(
    transcriptFiles.map((filePath) => parseTranscript(filePath, historyIndex, sessionMeta, todoCounts, deps)),
  )

  return sessionResults.filter((result): result is TranscriptParseResult => result !== null)
}
