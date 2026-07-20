import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project, SessionMessageRecord, WorkLocationRecord } from '@gogoagent/shared'
import type { TranscriptParseResult } from './parseTranscript.js'
import { type CodexRunner, defaultCodexRunner } from './refineLessons.js'
import { clampTitle } from './utils.js'

export const WORKSTREAM_LABEL_PROMPT_VERSION = 'v4'

const CACHE_DIR =
  process.env.GOGOAGENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'gogoagent')
const CACHE_FILE = path.join(CACHE_DIR, 'workstream-labels.json')
const SMALL_TITLE_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
const ACRONYM_TITLE_WORDS = new Set(['api', 'cli', 'css', 'hl', 'html', 'ipc', 'json', 'llm', 'qfx', 'ui', 'url'])
const GENERIC_BRANCHES = new Set(['head', 'main', 'master', 'develop', 'development', 'dev'])

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workstreamId: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['workstreamId', 'name'],
      },
    },
  },
  required: ['labels'],
}

interface CacheEntry {
  key: string
  name: string
  source?: 'auto' | 'manual'
  updatedAt: string
  version: string
}

interface CacheFile {
  version: string
  entries: Record<string, CacheEntry>
}

export interface WorkstreamLabelInput {
  workstreamId: string
  fallbackName: string
  repoRoot: string
  branch?: string
  firstStartedAt: string
  lastUpdatedAt: string
  sessions: Array<{
    title: string
    startedAt: string
    updatedAt: string
    messages: Array<{ role: string; text: string }>
  }>
  paths: string[]
}

let memory: CacheFile | null = null

function clip(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      if (/^[A-Z0-9._-]{2,}$/.test(word)) return word
      const lower = word.toLowerCase()
      if (ACRONYM_TITLE_WORDS.has(lower)) return lower.toUpperCase()
      if (index > 0 && SMALL_TITLE_WORDS.has(lower)) return lower
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
    })
    .join(' ')
}

function humanizeSubject(value: string) {
  const cleaned = value
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length > 1 && /^(?:feature|fix|bugfix|chore|topic|branch)$/i.test(words[0])) words.shift()
  return titleCase(words.slice(-4).join(' '))
}

function isStatusReviewText(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    /^(?:ok|okay )?(?:where are we|where we are|what'?s the status|what is the status|status check|current status|catch me up|bring me up to speed)\b/.test(normalized) ||
    /\b(?:where are we|where we are|status check|current status|catch me up|bring me up to speed)\b/.test(normalized) ||
    /^(?:current\s+)?status(?:\s+review)?$/.test(normalized)
  ) {
    return true
  }
  return false
}

function contextualStatusName(input: WorkstreamLabelInput) {
  const branchSubject = input.branch && !GENERIC_BRANCHES.has(input.branch.toLowerCase())
    ? humanizeSubject(input.branch)
    : ''
  const pathSubject = input.paths
    .map((entry) => entry.replace(/^(?:touched|inspected|mentioned|workspace_root):\s*/i, ''))
    .map((entry) => humanizeSubject(path.basename(entry)))
    .find(Boolean) ?? ''
  const repoSubject = humanizeSubject(path.basename(input.repoRoot))
  const subject = branchSubject || pathSubject || repoSubject
  return clampTitle(subject ? `${subject} Status Review` : 'Status Review', 52)
}

function cleanLabel(value: string) {
  const withoutQuotes = value.trim().replace(/^["']+|["']+$/g, '')
  const compact = withoutQuotes
    .replace(/\s+/g, ' ')
    .replace(/^(?:please\s+)?(?:hey|hi|hello|ok|okay)[,\s]+/i, '')
    .replace(/^(?:can|could|would)\s+you\s+/i, '')
    .replace(/^(?:look at|take a look at|check out|review|help with)\s+/i, '')
    .replace(/\b(?:please|thanks|thank you)\b[.!?]*$/i, '')
    .trim()
  if (compact.length < 3) return ''
  return clampTitle(titleCase(compact), 52)
}

function finalizeLabel(input: WorkstreamLabelInput, value: string) {
  if (isStatusReviewText(value)) return contextualStatusName(input)
  const label = cleanLabel(value)
  if (!label) return ''
  if (isStatusReviewText(label)) return contextualStatusName(input)
  return label
}

async function load(): Promise<CacheFile> {
  if (memory) return memory
  try {
    const text = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(text) as CacheFile
    if (parsed && parsed.entries && typeof parsed.entries === 'object') {
      memory = { version: parsed.version ?? WORKSTREAM_LABEL_PROMPT_VERSION, entries: parsed.entries }
      return memory
    }
  } catch {
    // Fall through to empty cache.
  }
  memory = { version: WORKSTREAM_LABEL_PROMPT_VERSION, entries: {} }
  return memory
}

async function persist() {
  if (!memory) return
  await mkdir(CACHE_DIR, { recursive: true })
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(memory, null, 2), 'utf8')
  await rename(tmp, CACHE_FILE)
}

function sessionMessagesForLabel(messages: SessionMessageRecord[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'terminal')
    .slice(0, 5)
    .map((message) => ({
      role: message.role,
      text: clip(message.text, message.role === 'terminal' ? 260 : 360),
    }))
}

export function buildWorkstreamLabelInput(
  workstream: Project,
  sessionResults: TranscriptParseResult[],
  workLocations: WorkLocationRecord[],
): WorkstreamLabelInput {
  const sessionById = new Map(sessionResults.map((result) => [result.session.id, result]))
  const sessionSet = new Set(workstream.sessionIds)
  const sessions = workstream.sessionIds
    .map((sessionId) => sessionById.get(sessionId))
    .filter((result): result is TranscriptParseResult => result !== undefined)
    .slice(0, 8)
    .map((result) => ({
      title: clip(result.session.title || result.session.id, 120),
      startedAt: result.session.startedAt,
      updatedAt: result.session.updatedAt,
      messages: sessionMessagesForLabel(result.messages),
    }))

  const paths = workLocations
    .filter((loc) =>
      (loc.evidence === 'touched' || loc.evidence === 'inspected') &&
      loc.sessionIds.some((sessionId) => sessionSet.has(sessionId)),
    )
    .slice(0, 14)
    .map((loc) => `${loc.evidence}: ${clip(loc.path, 160)}`)

  return {
    workstreamId: workstream.id,
    fallbackName: workstream.name,
    repoRoot: workstream.repoRoot,
    branch: workstream.branch,
    firstStartedAt: workstream.firstStartedAt,
    lastUpdatedAt: workstream.lastUpdatedAt,
    sessions,
    paths,
  }
}

export function workstreamLabelCacheKey(input: WorkstreamLabelInput) {
  const { fallbackName: _fallbackName, ...stableInput } = input
  return createHash('sha1')
    .update(`${WORKSTREAM_LABEL_PROMPT_VERSION}\0${JSON.stringify(stableInput)}`)
    .digest('hex')
}

export async function getCachedWorkstreamLabel(input: WorkstreamLabelInput) {
  const cache = await load()
  const entry = cache.entries[input.workstreamId]
  if (entry?.source === 'manual') return entry.name
  if (!entry || entry.version !== WORKSTREAM_LABEL_PROMPT_VERSION) return null
  if (entry.key !== workstreamLabelCacheKey(input)) return null
  return entry.name
}

export async function getManualWorkstreamLabel(workstreamId: string) {
  const cache = await load()
  const entry = cache.entries[workstreamId]
  return entry?.source === 'manual' ? entry.name : null
}

export async function putCachedWorkstreamLabel(input: WorkstreamLabelInput, name: string) {
  const label = cleanLabel(name)
  if (!label) return
  const cache = await load()
  if (cache.entries[input.workstreamId]?.source === 'manual') return
  cache.entries[input.workstreamId] = {
    key: workstreamLabelCacheKey(input),
    name: label,
    source: 'auto',
    updatedAt: new Date().toISOString(),
    version: WORKSTREAM_LABEL_PROMPT_VERSION,
  }
  await persist()
}

export async function putManualWorkstreamLabel(workstreamId: string, name: string) {
  const label = cleanLabel(name)
  if (!label) return null
  const cache = await load()
  cache.entries[workstreamId] = {
    key: 'manual',
    name: label,
    source: 'manual',
    updatedAt: new Date().toISOString(),
    version: WORKSTREAM_LABEL_PROMPT_VERSION,
  }
  await persist()
  return label
}

export async function applyCachedWorkstreamLabels(
  workstreams: Project[],
  sessionResults: TranscriptParseResult[],
  workLocations: WorkLocationRecord[],
) {
  for (const workstream of workstreams) {
    const input = buildWorkstreamLabelInput(workstream, sessionResults, workLocations)
    const cached = await getCachedWorkstreamLabel(input)
    if (cached) workstream.name = cached
  }
}

function buildPrompt(inputs: WorkstreamLabelInput[]) {
  return [
    'You are labeling developer workstreams from local Claude Code / Codex history.',
    'Write concise, user-facing intent names that help someone recognize what the work was trying to accomplish.',
    '',
    'Rules:',
    '- 2 to 5 words.',
    '- Use a short noun phrase or verb-object phrase.',
    '- Be specific about the actual task, system area, or intended outcome.',
    '- Prefer domain terms, filenames, product areas, and bug/fix targets over generic verbs.',
    '- Do not include dates.',
    '- Do not include filler or conversational wording such as "hey", "can you", "look at", "help with", or "please".',
    '- For status-check prompts such as "ok, where are we right now", infer the subject from repo, branch, touched paths, and nearby messages.',
    '- Never emit only "Current Status Review"; include the thing being reviewed, such as "HL Node Handoff Status" or "Renderer Cleanup Status".',
    '- Do not include trailing sentence fragments from an unfinished prompt.',
    '- Do not include generic words like "session", "workstream", "Claude", or "Codex" unless essential.',
    '- Do not just repeat the first prompt.',
    '- Prefer title case.',
    '- Prefer labels like "HL Node Handoff Review", "Terminal Log Indexing", "Startup Race Fix", or "Portfolio Plan Brainstorming".',
    '- Bad: "hey, can you look at the hl node handoff? the". Good: "HL Node Handoff Review".',
    '- Bad: "Ok, Where Are We Right Now". Good: "HL Node Handoff Status" when the surrounding context is HL node handoff work.',
    '',
    'Input workstreams:',
    JSON.stringify(inputs, null, 2),
    '',
    'Respond ONLY with JSON matching the provided schema.',
  ].join('\n')
}

function parseLabelResponse(raw: string) {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { labels?: unknown }
  const labels = new Map<string, string>()
  if (!parsed || !Array.isArray(parsed.labels)) return labels
  for (const item of parsed.labels) {
    if (!item || typeof item !== 'object') continue
    const typed = item as Record<string, unknown>
    if (typeof typed.workstreamId !== 'string' || typeof typed.name !== 'string') continue
    const cleaned = cleanLabel(typed.name)
    if (cleaned) labels.set(typed.workstreamId, cleaned)
  }
  return labels
}

export async function labelWorkstreamsWithLlm(args: {
  inputs: WorkstreamLabelInput[]
  runner?: CodexRunner
}) {
  if (args.inputs.length === 0) return new Map<string, string>()
  const runner = args.runner ?? defaultCodexRunner
  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-workstream-labels-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), 'utf8')

  try {
    const raw = await runner({ prompt: buildPrompt(args.inputs), schemaPath })
    const labels = parseLabelResponse(raw)
    for (const input of args.inputs) {
      const label = labels.get(input.workstreamId)
      if (!label) continue
      const finalLabel = finalizeLabel(input, label)
      if (finalLabel) labels.set(input.workstreamId, finalLabel)
      else labels.delete(input.workstreamId)
    }
    return labels
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}
