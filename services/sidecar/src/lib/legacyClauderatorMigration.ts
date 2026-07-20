import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CACHE_FILES = [
  { name: 'auto-titles.json', sections: ['entries'] },
  { name: 'workstream-labels.json', sections: ['entries'] },
  { name: 'title-overrides.json', sections: ['sessions', 'projects'] },
  { name: 'workstream-archive.json', sections: ['entries'] },
  { name: 'refined-lessons.json', sections: ['entries'] },
] as const

type JsonObject = Record<string, unknown>

export interface LegacyMigrationResult {
  terminalLogFilesCopied: number
  cacheEntriesImported: number
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function copyMissingFiles(sourceDir: string, targetDir: string): Promise<number> {
  let copied = 0
  let entries
  try {
    entries = await readdir(sourceDir, { withFileTypes: true })
  } catch {
    return copied
  }

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copied += await copyMissingFiles(sourcePath, targetPath)
      continue
    }
    if (!entry.isFile() || await fileExists(targetPath)) continue
    await mkdir(path.dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
    copied += 1
  }
  return copied
}

async function readJsonObject(filePath: string): Promise<JsonObject | undefined> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : undefined
  } catch {
    return undefined
  }
}

async function writeJsonAtomically(filePath: string, value: JsonObject) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  await rename(temporaryPath, filePath)
}

async function mergeCacheFile(
  sourcePath: string,
  targetPath: string,
  sections: readonly string[],
): Promise<number> {
  const legacy = await readJsonObject(sourcePath)
  if (!legacy) return 0
  const current = await readJsonObject(targetPath) ?? {}
  const merged: JsonObject = { ...legacy, ...current, version: current.version ?? legacy.version ?? '1' }
  let imported = 0

  for (const section of sections) {
    const legacyEntries = legacy[section]
    const currentEntries = current[section]
    const legacyRecord = legacyEntries && typeof legacyEntries === 'object' && !Array.isArray(legacyEntries)
      ? legacyEntries as JsonObject
      : {}
    const currentRecord = currentEntries && typeof currentEntries === 'object' && !Array.isArray(currentEntries)
      ? currentEntries as JsonObject
      : {}
    imported += Object.keys(legacyRecord).filter((key) => !(key in currentRecord)).length
    merged[section] = { ...legacyRecord, ...currentRecord }
  }

  if (imported > 0 || !(await fileExists(targetPath))) await writeJsonAtomically(targetPath, merged)
  return imported
}

/**
 * Imports non-secret local state from the predecessor app exactly once.
 * Existing gogoagent files always win, so this can never overwrite newer work.
 */
export async function migrateLegacyClauderatorState(args: {
  terminalLogDir: string
  cacheDir: string
}): Promise<LegacyMigrationResult> {
  const homeDir = os.homedir()
  const markerPath = path.join(homeDir, '.gogoagent', 'migrations', 'clauderator-v1.json')
  if (await fileExists(markerPath)) return { terminalLogFilesCopied: 0, cacheEntriesImported: 0 }

  const legacyTerminalLogDir = path.join(homeDir, '.clauderator', 'terminal-logs')
  const legacyCacheDir = path.join(homeDir, '.cache', 'clauderator')
  const terminalLogFilesCopied = await copyMissingFiles(legacyTerminalLogDir, args.terminalLogDir)

  let cacheEntriesImported = 0
  for (const cacheFile of CACHE_FILES) {
    cacheEntriesImported += await mergeCacheFile(
      path.join(legacyCacheDir, cacheFile.name),
      path.join(args.cacheDir, cacheFile.name),
      cacheFile.sections,
    )
  }

  if (terminalLogFilesCopied > 0 || cacheEntriesImported > 0) {
    await writeJsonAtomically(markerPath, {
      version: '1',
      importedAt: new Date().toISOString(),
      terminalLogFilesCopied,
      cacheEntriesImported,
    })
  }
  return { terminalLogFilesCopied, cacheEntriesImported }
}
