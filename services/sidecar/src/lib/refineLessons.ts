import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  ExtractionCandidate,
  LessonScope,
  RefinedLesson,
  SessionMessageRecord,
} from '@gogoagent/shared'
import { stableId } from './utils.js'

export const REFINE_PROMPT_VERSION = 'v1'

// JSON Schema enforced on the LLM's final output via `codex exec --output-schema`.
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceCandidateId: { type: 'string' },
          keep: { type: 'boolean' },
          rule: { type: 'string' },
          why: { type: 'string' },
          scope: { type: 'string', enum: ['project', 'global', 'one_off'] },
        },
        required: ['sourceCandidateId', 'keep', 'rule', 'why', 'scope'],
      },
    },
  },
  required: ['lessons'],
}

interface RawRefined {
  sourceCandidateId: string
  keep: boolean
  rule: string
  why: string
  scope: LessonScope
}

export interface CodexRunnerArgs {
  prompt: string
  schemaPath: string
}

// Injected so tests can swap in a fake. Returns the agent's final text message
// (typically JSON matching OUTPUT_SCHEMA).
export type CodexRunner = (args: CodexRunnerArgs) => Promise<string>

const CODEX_WRITING_GUIDANCE = [
  'Writing guidance for every generated text field:',
  'Be concise and clear. State concrete facts, findings, or actions directly.',
  'Use familiar words. Do not invent jargon, labels, or acronyms. Keep necessary technical terms and explain them briefly when unclear.',
  'Avoid filler and repetition. Preserve important evidence, uncertainty, and citations.',
  'Follow the requested JSON schema; this guidance applies to the strings inside it.',
].join('\n')

export const defaultCodexRunner: CodexRunner = async ({ prompt, schemaPath }) => {
  const lastMessageFile = path.join(
    await mkdtemp(path.join(os.tmpdir(), 'gogoagent-codex-')),
    'last.txt',
  )
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'codex',
        [
          'exec',
          '--sandbox',
          'read-only',
          '--skip-git-repo-check',
          '--output-schema',
          schemaPath,
          '--output-last-message',
          lastMessageFile,
          '-',
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] },
      )
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`codex exec exited with code ${code}`))
      })
      child.stdin.end(`${prompt}\n\n${CODEX_WRITING_GUIDANCE}\n`)
    })
    return await readFile(lastMessageFile, 'utf8')
  } finally {
    await rm(path.dirname(lastMessageFile), { recursive: true, force: true }).catch(() => {})
  }
}

function buildPrompt(
  sessionContext: { cwd: string; title: string },
  candidates: ExtractionCandidate[],
  messagesById: Map<string, SessionMessageRecord>,
  allMessages: SessionMessageRecord[],
) {
  const items = candidates.map((candidate) => {
    const msg = candidate.sourceMessageId ? messagesById.get(candidate.sourceMessageId) : undefined
    const idx = msg ? allMessages.findIndex((m) => m.id === msg.id) : -1
    const prior = idx > 0 ? allMessages[idx - 1] : undefined
    const priorText = prior ? prior.text.slice(0, 400) : '(no prior context)'
    return [
      `--- candidate ${candidate.id} ---`,
      `user said: ${candidate.text}`,
      `prior assistant/user turn: ${priorText}`,
    ].join('\n')
  })

  return [
    `You are refining candidate "lessons" extracted from a Claude Code session transcript.`,
    `Each candidate is a user message that looked like a correction. Decide which are durable, generalizable rules`,
    `vs. one-off corrections that do not generalize.`,
    ``,
    `Session cwd: ${sessionContext.cwd}`,
    `Session title: ${sessionContext.title}`,
    ``,
    `For each candidate, return:`,
    `- sourceCandidateId: the candidate id given`,
    `- keep: true only if this is a durable lesson worth remembering for future sessions`,
    `- rule: a concise imperative restatement of the lesson (max 200 chars). Empty string if keep=false.`,
    `- why: a one-sentence explanation of the underlying reason. Empty string if keep=false.`,
    `- scope: "project" if specific to this codebase, "global" if broadly applicable, "one_off" if keep=false`,
    ``,
    `Candidates:`,
    ...items,
    ``,
    `Respond ONLY with JSON matching the provided schema. Do not use tools.`,
  ].join('\n')
}

export async function refineLessonsForSession(args: {
  sessionId: string
  cwd: string
  title: string
  candidates: ExtractionCandidate[]
  messages: SessionMessageRecord[]
  runner?: CodexRunner
}): Promise<RefinedLesson[]> {
  const lessonCandidates = args.candidates.filter((c) => c.kind === 'lesson')
  if (lessonCandidates.length === 0) return []

  const runner = args.runner ?? defaultCodexRunner

  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-schema-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), 'utf8')

  try {
    const messagesById = new Map(args.messages.map((m) => [m.id, m]))
    const prompt = buildPrompt(
      { cwd: args.cwd, title: args.title },
      lessonCandidates,
      messagesById,
      args.messages,
    )

    const raw = await runner({ prompt, schemaPath })
    const parsed = parseRefineResponse(raw)

    const createdAt = new Date().toISOString()
    const byId = new Map(lessonCandidates.map((c) => [c.id, c]))
    const refined: RefinedLesson[] = []
    for (const item of parsed) {
      const source = byId.get(item.sourceCandidateId)
      if (!source) continue
      refined.push({
        id: stableId('refined_lesson', `${args.sessionId}:${source.id}:${REFINE_PROMPT_VERSION}`),
        sessionId: args.sessionId,
        sourceCandidateId: source.id,
        sourceMessageId: source.sourceMessageId,
        rule: item.rule,
        why: item.why,
        scope: item.scope,
        keep: item.keep,
        promptVersion: REFINE_PROMPT_VERSION,
        createdAt,
      })
    }
    return refined
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}

export function parseRefineResponse(raw: string): RawRefined[] {
  const text = raw.trim()
  // Tolerate code-fenced output even though the schema should prevent it.
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { lessons?: unknown }
  if (!parsed || !Array.isArray(parsed.lessons)) {
    throw new Error('Refine response missing "lessons" array')
  }
  const out: RawRefined[] = []
  for (const entry of parsed.lessons) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.sourceCandidateId !== 'string') continue
    if (typeof e.keep !== 'boolean') continue
    if (typeof e.rule !== 'string') continue
    if (typeof e.why !== 'string') continue
    if (e.scope !== 'project' && e.scope !== 'global' && e.scope !== 'one_off') continue
    out.push({
      sourceCandidateId: e.sourceCandidateId,
      keep: e.keep,
      rule: e.rule,
      why: e.why,
      scope: e.scope,
    })
  }
  return out
}
