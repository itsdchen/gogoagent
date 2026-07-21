import { createHash } from 'node:crypto'

export function compactHomePath(value: string, home: string) {
  const normalizedHome = home.replace(/[\\/]+$/, '')
  if (!normalizedHome) return value
  if (value === normalizedHome) return '~'
  if (value.startsWith(`${normalizedHome}/`) || value.startsWith(`${normalizedHome}\\`)) {
    return `~${value.slice(normalizedHome.length)}`
  }
  return value
}

export function stableId(prefix: string, value: string) {
  const hash = createHash('sha1').update(value).digest('hex').slice(0, 12)
  return `${prefix}-${hash}`
}

export function slugName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Unknown'
  const parts = trimmed.split('/').filter(Boolean)
  return parts.at(-1) ?? trimmed
}

export function clampTitle(value: string, max = 88) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function roleForLine(lineType: string | undefined): 'user' | 'assistant' | 'system' {
  if (lineType === 'user' || lineType === 'assistant') return lineType
  return 'system'
}

export function sentenceParts(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}
