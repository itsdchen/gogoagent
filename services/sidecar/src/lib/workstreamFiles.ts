import { readFile, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { WorkstreamTextFile } from '@gogoagent/shared'

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

export async function readWorkstreamTextFile(input: {
  selectedPath: string
  workstreamRoot: string
  terminalCwd?: string
  agyBrainRoot?: string
}): Promise<WorkstreamTextFile> {
  const selected = input.selectedPath.trim()
  if (!selected || selected.length > 4096 || selected.includes('\0')) throw new Error('Choose a file path to read.')
  const expanded = selected === '~' ? os.homedir()
    : selected.startsWith('~/') ? path.join(os.homedir(), selected.slice(2))
      : selected
  const candidate = path.resolve(input.terminalCwd ?? input.workstreamRoot, expanded)
  const roots = [input.workstreamRoot, input.agyBrainRoot].filter((root): root is string => Boolean(root))
  const allowedRoots = await Promise.all(roots.map(async (root) => realpath(root).catch(() => null)))
  const resolved = await realpath(candidate).catch(() => { throw new Error('File not found. Check the path.') })
  if (!allowedRoots.some((root) => root && within(root, resolved))) {
    throw new Error('This file is outside the workstream and its agent documents.')
  }
  const info = await stat(resolved)
  if (!info.isFile()) throw new Error('The selected path is not a file.')
  if (info.size > MAX_TEXT_FILE_BYTES) throw new Error('This text file is too large to read here (2 MB limit).')
  const bytes = await readFile(resolved)
  if (bytes.includes(0)) throw new Error('This file appears to be binary.')
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('This file is not UTF-8 text.')
  }
  return {
    path: resolved,
    content,
    kind: /\.(?:md|markdown|mdown)$/i.test(resolved) ? 'markdown' : 'text',
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
  }
}
