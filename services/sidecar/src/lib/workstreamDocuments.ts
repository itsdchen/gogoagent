import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project, WorkstreamChatResponse, WorkstreamDocument, WorkstreamDocumentSections } from '@gogoagent/shared'
import type { TranscriptParseResult } from './parseTranscript.js'
import { type CodexRunner, defaultCodexRunner } from './refineLessons.js'

const directory = process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const file = path.join(directory, 'workstream-documents.json')
const sectionNames = ['overview', 'currentStatus', 'findings', 'decisions', 'openQuestions', 'nextSteps'] as const
const sectionLimit = 12_000
let documents: Record<string, WorkstreamDocument> | null = null
let writes = Promise.resolve()

const outputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    sections: {
      type: 'object', additionalProperties: false,
      properties: Object.fromEntries(sectionNames.map((name) => [name, { type: 'string' }])),
      required: [...sectionNames],
    },
  },
  required: ['sections'],
}
const chatOutputSchema = {
  type: 'object', additionalProperties: false,
  properties: { answer: { type: 'string' }, replacement: { type: 'string' } },
  required: ['answer', 'replacement'],
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, sectionLimit) : ''
}

function cleanSections(value: unknown): WorkstreamDocumentSections {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(sectionNames.map((name) => [name, clean(source[name])])) as unknown as WorkstreamDocumentSections
}

function emptyDocument(workstreamId: string): WorkstreamDocument {
  return { workstreamId, revision: 0, sections: cleanSections({}), sourceSessionIds: [] }
}

async function load() {
  if (documents) return documents
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { entries?: Record<string, WorkstreamDocument> }
    documents = {}
    for (const [id, raw] of Object.entries(parsed.entries ?? {})) {
      if (!raw || typeof raw !== 'object') continue
      documents[id] = {
        workstreamId: id,
        revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
        evidenceThrough: typeof raw.evidenceThrough === 'string' ? raw.evidenceThrough : undefined,
        sections: cleanSections(raw.sections),
        sourceSessionIds: Array.isArray(raw.sourceSessionIds)
          ? raw.sourceSessionIds.filter((value): value is string => typeof value === 'string').slice(0, 12)
          : [],
      }
    }
  } catch {
    documents = {}
  }
  return documents
}

export async function getWorkstreamDocument(workstreamId: string) {
  const stored = (await load())[workstreamId]
  return stored ? { ...stored, sections: { ...stored.sections }, sourceSessionIds: [...stored.sourceSessionIds] } : emptyDocument(workstreamId)
}

export class DocumentConflictError extends Error {}

export async function saveWorkstreamDocument(
  workstreamId: string,
  expectedRevision: number,
  sections: WorkstreamDocumentSections,
  sourceSessionIds: string[],
  evidenceThrough?: string,
) {
  const store = await load()
  const previous = store[workstreamId] ?? emptyDocument(workstreamId)
  if (previous.revision !== expectedRevision) throw new DocumentConflictError('The document changed. Reload it before saving.')
  const next: WorkstreamDocument = {
    workstreamId,
    revision: previous.revision + 1,
    updatedAt: new Date().toISOString(),
    evidenceThrough: evidenceThrough || previous.evidenceThrough,
    sections: cleanSections(sections),
    sourceSessionIds: [...new Set(sourceSessionIds)].slice(0, 12),
  }
  store[workstreamId] = next
  const payload = JSON.stringify({ version: 'v1', entries: store }, null, 2)
  const operation = writes.then(async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  })
  writes = operation.catch(() => undefined)
  await operation
  return getWorkstreamDocument(workstreamId)
}

function clip(text: string, limit: number) {
  const value = text.replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

export async function draftWorkstreamDocument(args: {
  project: Project
  sessionResults: TranscriptParseResult[]
  current: WorkstreamDocument
  runner?: CodexRunner
}) {
  const available = args.sessionResults
    .filter((result) => args.project.sessionIds.includes(result.session.id))
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt))
  const recent = available.slice(0, 6)
  if (!recent.length) throw new Error('No recorded sessions are available to draft from. You can write the document manually.')
  const byId = new Map(available.map((result) => [result.session.id, result]))
  const sourceIds = [...new Set([
    ...args.current.sourceSessionIds.filter((id) => byId.has(id)),
    ...recent.map((result) => result.session.id),
  ])].slice(0, 12)
  const sources = sourceIds.map((id) => byId.get(id)!)
  const evidenceThrough = recent[0].session.updatedAt
  const sourceText = sources.map((result, index) => {
    const messages = result.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-10)
      .map((message) => `${message.role}: ${clip(message.text, 650)}`)
    return [`[${index + 1}] ${result.session.title} · ${result.session.updatedAt}`, ...messages].join('\n')
  }).join('\n\n')
  const current = sectionNames.map((name) => `${name}: ${clip(args.current.sections[name], 3_000) || '(empty)'}`).join('\n')
  const state = args.project.state
  const prompt = [
    'Write a concise living reference article for this coding workstream. Return JSON matching the schema.',
    'Use synthesis, not a chronological recap or copied agent output. Separate established facts from uncertainty.',
    'Sections: overview (purpose and scope), currentStatus (what exists and what is verified), findings (important technical facts), decisions (choices and reasons), openQuestions (unknowns and blockers), nextSteps (concrete remaining work).',
    'Preserve useful existing article content unless newer evidence supersedes it. Do not invent completion, tests, or decisions.',
    'Cite the numbered source sessions inline as [1], [2], etc. Existing source numbers retain their meanings; remove unsupported old citations.',
    `Workstream: ${args.project.name}`,
    `Repo: ${args.project.repoRoot}`,
    args.project.branch ? `Branch: ${args.project.branch}` : '',
    `Saved goal: ${state?.goal ?? ''}`,
    `Saved current state: ${state?.currentState ?? ''}`,
    `Saved blocker: ${state?.blocker ?? ''}`,
    `Saved next action: ${state?.nextAction ?? ''}`,
    `Saved verification: ${state?.lastVerification ?? ''}`,
    'Current article:', current,
    'Source sessions:', sourceText,
  ].join('\n\n')
  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-workstream-document-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  try {
    await writeFile(schemaPath, JSON.stringify(outputSchema), 'utf8')
    const raw = await (args.runner ?? defaultCodexRunner)({ prompt, schemaPath })
    const parsed = JSON.parse(raw) as { sections?: unknown }
    if (!parsed.sections || typeof parsed.sections !== 'object') throw new Error('Draft did not contain article sections.')
    return {
      ...args.current,
      sections: cleanSections(parsed.sections),
      sourceSessionIds: sourceIds,
      evidenceThrough,
    } satisfies WorkstreamDocument
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function askWorkstreamDocument(args: {
  project: Project
  sessionResults: TranscriptParseResult[]
  current: WorkstreamDocument
  question: string
  mode: 'answer' | 'rewrite'
  section?: keyof WorkstreamDocumentSections
  history?: Array<{ role: 'user' | 'assistant'; text: string }>
  runner?: CodexRunner
}): Promise<WorkstreamChatResponse> {
  const available = args.sessionResults
    .filter((result) => args.project.sessionIds.includes(result.session.id))
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt))
  const ignoredTerms = new Set(['what', 'where', 'when', 'which', 'would', 'could', 'should', 'have', 'with', 'from', 'this', 'that', 'there', 'about', 'been', 'were', 'does', 'workstream', 'article', 'rewrite', 'section'])
  const terms = [...new Set((args.question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((term) => !ignoredTerms.has(term)))].slice(0, 12)
  const scored = available.map((result) => {
    const title = result.session.title.toLowerCase()
    const userText = result.messages.filter((message) => message.role === 'user').map((message) => message.text.toLowerCase()).join(' ').slice(0, 20_000)
    const assistantText = result.messages.filter((message) => message.role === 'assistant').map((message) => message.text.toLowerCase()).join(' ').slice(0, 20_000)
    return { result, score: terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + (userText.includes(term) ? 2 : 0) + (assistantText.includes(term) ? 1 : 0), 0) }
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || b.result.session.updatedAt.localeCompare(a.result.session.updatedAt))
  const selected = [...new Map([
    ...available.slice(0, 3),
    ...scored.map(({ result }) => result),
    ...available,
  ].map((result) => [result.session.id, result] as const)).values()].slice(0, 10)
  const byId = new Map(args.sessionResults.map((result) => [result.session.id, result]))
  const sourceSessionIds = [...new Set([
    ...args.current.sourceSessionIds.filter((id) => byId.has(id)),
    ...selected.map((result) => result.session.id),
  ])].slice(0, 22)
  const sources = sourceSessionIds.map((id, index) => {
    const result = byId.get(id)!
    const messages = result.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-6)
      .map((message) => `${message.role}: ${clip(message.text, 400)}`)
    return [`[${index + 1}] ${result.session.title} · ${result.session.updatedAt}`, ...messages].join('\n')
  }).join('\n\n')
  const article = sectionNames.map((name) => `${name}: ${clip(args.current.sections[name], 5_000) || '(empty)'}`).join('\n\n')
  const history = (args.history ?? []).slice(-6).map((turn) => `${turn.role}: ${clip(turn.text, 1_000)}`).join('\n')
  const prompt = [
    'You are the knowledge assistant for one coding workstream. Answer from the supplied article, saved state, and recorded sessions. This is a read-only question: do not propose terminal commands as though they have been run.',
    'Return JSON with answer and replacement. Cite source sessions inline as [1], [2], etc when making factual claims. Say when evidence is missing or uncertain. Do not invent completion or verification.',
    `You have excerpts from ${sourceSessionIds.length} of ${available.length} recorded sessions. Do not imply that omitted sessions were reviewed. If the article is empty or stale, state the evidence limit when relevant.`,
    args.mode === 'rewrite'
      ? `The user requests a proposed rewrite of the ${args.section} section. Put the replacement section text in replacement. Explain the proposed change in answer. Preserve useful facts and existing citation numbers.`
      : 'This is a question. Put an empty string in replacement.',
    `Workstream: ${args.project.name}`,
    `Saved state: ${JSON.stringify(args.project.state ?? {})}`,
    `Article evidence through: ${args.current.evidenceThrough ?? '(not recorded)'}`,
    `Latest recorded session: ${available[0]?.session.updatedAt ?? '(none)'}`,
    `Current article:\n${article}`,
    `Source sessions:\n${sources || '(none)'}`,
    history ? `Recent chat:\n${history}` : '',
    `User request: ${clip(args.question, 2_000)}`,
  ].filter(Boolean).join('\n\n')
  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-workstream-chat-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  try {
    await writeFile(schemaPath, JSON.stringify(chatOutputSchema), 'utf8')
    const raw = await (args.runner ?? defaultCodexRunner)({ prompt, schemaPath })
    const parsed = JSON.parse(raw) as { answer?: unknown; replacement?: unknown }
    if (typeof parsed.answer !== 'string' || typeof parsed.replacement !== 'string') throw new Error('The knowledge assistant returned an invalid answer.')
    return {
      answer: clean(parsed.answer),
      replacement: args.mode === 'rewrite' ? clean(parsed.replacement) : undefined,
      section: args.mode === 'rewrite' ? args.section : undefined,
      sourceSessionIds,
      evidenceThrough: available[0]?.session.updatedAt,
      evidenceSessionsUsed: sourceSessionIds.length,
      evidenceSessionsTotal: available.length,
    }
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}
