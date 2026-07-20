import { clampTitle, slugName } from './utils.js'

// Greetings and conversational openers that carry no topical info.
const GREETING_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|yo|hiya|morning|afternoon)[\s,.!:-]*/i,
  /^(ok|okay|so|well|alright|right|cool|great)[\s,.:-]*/i,
  /^(thanks|thank you|pls|please)[\s,.:-]*/i,
]

// Intent prefixes that are purely grammatical scaffolding before the real verb.
// Each strips up to an optional "to"/"that" afterward.
const INTENT_PREFIXES: RegExp[] = [
  /^(i (?:want|need|would like|'d like|'m trying|am trying)|let'?s|can you|could you|would you|please|help me|can we)\s+(?:to\s+|that\s+)?/i,
  /^i('?m| am)\s+(?:going\s+to\s+|trying\s+to\s+)?/i,
]

export function cleanFirstMessage(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim()
  // Drop leading XML-ish system tags that Claude Code sometimes prepends.
  t = t.replace(/^(?:<[^>]+>[\s\S]*?<\/[^>]+>\s*)+/g, '').trim()
  t = t.replace(/^(?:<[^>]+\/?>\s*)+/g, '').trim()

  // Iteratively peel greetings + intent openers (they often stack).
  for (let i = 0; i < 5; i++) {
    const before = t
    for (const re of GREETING_PATTERNS) t = t.replace(re, '').trim()
    for (const re of INTENT_PREFIXES) t = t.replace(re, '').trim()
    if (t === before) break
  }

  // Trim to first sentence.
  const sentence = t.split(/(?<=[.!?])\s+/)[0] ?? t
  return sentence.trim()
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface SessionTitleContext {
  repoRoot?: string
  branch?: string
  startedAt?: string
}

export function inferSessionTitle(
  firstUserText: string | undefined,
  ctx: SessionTitleContext,
): string {
  const cleaned = firstUserText ? cleanFirstMessage(firstUserText) : ''
  if (cleaned.length >= 8) return clampTitle(capitalize(cleaned), 88)
  return fallbackTitle(ctx)
}

function fallbackTitle(ctx: SessionTitleContext): string {
  const repo = ctx.repoRoot ? slugName(ctx.repoRoot) : ''
  const date = (ctx.startedAt ?? '').slice(0, 10)
  const parts: string[] = []
  if (repo) parts.push(repo)
  if (ctx.branch) parts.push(`@ ${ctx.branch}`)
  if (date) parts.push(`· ${date}`)
  return parts.join(' ') || 'Session'
}

export function inferWorkstreamTitle(
  repoRoot: string,
  branch: string | undefined,
  firstStartedAt: string,
): string {
  const repo = slugName(repoRoot)
  if (branch) return `${repo} @ ${branch}`
  const date = firstStartedAt.slice(0, 10)
  return date ? `${repo} · ${date}` : repo
}
