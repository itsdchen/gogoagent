import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project, WorkLocationRecord } from '@gogoagent/shared'
import { type CodexRunner, defaultCodexRunner } from './refineLessons.js'
import { slugName } from './utils.js'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['name', 'summary'],
}

export interface SessionOpener {
  startedAt: string
  firstUserText: string
}

export interface ProjectTitleContext {
  project: Project
  sessionOpeners: SessionOpener[]
  touchedPaths: WorkLocationRecord[]
}

export interface SuggestedTitle {
  name: string
  summary: string
}

function buildPrompt(ctx: ProjectTitleContext): string {
  const p = ctx.project
  const repoName = slugName(p.repoRoot)
  const openers = ctx.sessionOpeners
    .slice(0, 8)
    .map((o, i) => `${i + 1}. (${o.startedAt.slice(0, 10)}) ${o.firstUserText.slice(0, 400)}`)
  const paths = ctx.touchedPaths
    .slice(0, 10)
    .map((loc) => `- ${loc.path} (${loc.evidence}, ${loc.count}×)`)

  return [
    `You are naming a "workstream" — a cluster of Claude Code sessions on the same repo + branch.`,
    ``,
    `Repo: ${p.repoRoot}`,
    `Branch: ${p.branch ?? '(none)'}`,
    `Sessions: ${p.sessionCount}`,
    `Date range: ${p.firstStartedAt.slice(0, 10)} → ${p.lastUpdatedAt.slice(0, 10)}`,
    ``,
    `First user message of each session (oldest first):`,
    ...(openers.length ? openers : ['(no user prompts captured)']),
    ``,
    `Top touched paths in this workstream:`,
    ...(paths.length ? paths : ['(none)']),
    ``,
    `Give a specific name (≤70 chars) describing what was actually done across these sessions.`,
    `Use concrete verbs and nouns — avoid generic words like "work", "stuff", "session", "project", "tasks".`,
    `Do not include the repo name ("${repoName}") or branch in the name.`,
    ``,
    `Also write a one-sentence summary (≤160 chars) giving a bit more context.`,
    ``,
    `Respond ONLY with JSON matching the provided schema. Do not use tools.`,
  ].join('\n')
}

export interface CompactTitleContext {
  repoRoot: string
  branch?: string
  firstUserMessages: string[]
}

function buildCompactPrompt(ctx: CompactTitleContext): string {
  const repoName = slugName(ctx.repoRoot)
  const messages = ctx.firstUserMessages
    .slice(0, 3)
    .map((text, i) => `${i + 1}. ${text.slice(0, 400)}`)

  return [
    `Based on the first few prompts a user sent to Claude Code, describe what they were trying to accomplish.`,
    ``,
    `Repo: ${repoName}`,
    `Branch: ${ctx.branch ?? '(none)'}`,
    ``,
    `First user prompts:`,
    ...(messages.length ? messages : ['(no prompts captured)']),
    ``,
    `Return a short, specific name (≤70 chars) describing the task.`,
    `Use concrete verbs and nouns — avoid generic words like "work", "stuff", "session", "project", "tasks".`,
    `Do not include the repo name ("${repoName}") or branch in the name.`,
    ``,
    `Also write a one-sentence summary (≤160 chars).`,
    ``,
    `Respond ONLY with JSON matching the provided schema. Do not use tools.`,
  ].join('\n')
}

export async function suggestCompactProjectTitle(
  ctx: CompactTitleContext,
  runner: CodexRunner = defaultCodexRunner,
): Promise<SuggestedTitle> {
  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-title-schema-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), 'utf8')
  try {
    const prompt = buildCompactPrompt(ctx)
    const raw = await runner({ prompt, schemaPath })
    const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(text) as { name?: unknown; summary?: unknown }
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    if (!name) throw new Error('LLM returned empty title')
    return { name, summary }
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function suggestProjectTitle(
  ctx: ProjectTitleContext,
  runner: CodexRunner = defaultCodexRunner,
): Promise<SuggestedTitle> {
  const schemaDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-title-schema-'))
  const schemaPath = path.join(schemaDir, 'schema.json')
  await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), 'utf8')
  try {
    const prompt = buildPrompt(ctx)
    const raw = await runner({ prompt, schemaPath })
    const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(text) as { name?: unknown; summary?: unknown }
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    if (!name) throw new Error('LLM returned empty title')
    return { name, summary }
  } finally {
    await rm(schemaDir, { recursive: true, force: true }).catch(() => {})
  }
}
