import path from 'node:path'

const VENV_SEGMENTS = new Set(['.venv', '.venvs', '.virtualenvs', 'venv'])

function normalizedPathParts(rawPath: string) {
  const normalized = path.normalize(rawPath).replace(/\/+$/, '')
  return {
    normalized,
    parts: normalized.split(path.sep).filter(Boolean),
  }
}

export function isIgnoredWorkLocationPath(rawPath: string) {
  const { normalized, parts } = normalizedPathParts(rawPath)

  if (normalized === '/dev/null') return true
  if (parts.includes('.git')) return true
  if (parts.includes('site-packages')) return true
  if (parts.some((segment) => VENV_SEGMENTS.has(segment))) return true

  return false
}
