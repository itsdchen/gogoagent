import { randomUUID } from 'node:crypto'
import type { RefineJobStatus } from '@gogoagent/shared'
import type { TranscriptParseResult } from './parseTranscript.js'
import { getCachedRefined, putCachedRefined } from './refineCache.js'
import {
  type CodexRunner,
  defaultCodexRunner,
  refineLessonsForSession,
} from './refineLessons.js'

const jobs = new Map<string, RefineJobStatus>()

function makeStatus(total: number): RefineJobStatus {
  return {
    jobId: randomUUID(),
    state: 'pending',
    total,
    processed: 0,
    skipped: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  }
}

// Simple promise semaphore so a big batch can't stampede the CLI.
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return results
}

interface StartJobArgs {
  sessionResults: TranscriptParseResult[]
  sessionIds?: string[]
  force?: boolean
  concurrency?: number
  runner?: CodexRunner
}

export function startRefineJob(args: StartJobArgs): RefineJobStatus {
  const filtered = args.sessionResults.filter((result) => {
    const hasLessons = result.candidates.some((c) => c.kind === 'lesson')
    if (!hasLessons) return false
    if (args.sessionIds && args.sessionIds.length > 0) {
      return args.sessionIds.includes(result.session.id)
    }
    return true
  })

  const status = makeStatus(filtered.length)
  jobs.set(status.jobId, status)

  const runner = args.runner ?? defaultCodexRunner
  const concurrency = args.concurrency ?? 4

  ;(async () => {
    status.state = 'running'
    try {
      await withConcurrency(filtered, concurrency, async (result) => {
        try {
          const lessonCandidates = result.candidates.filter((c) => c.kind === 'lesson')

          // Split into cached vs. uncached so we only pay for new/changed ones.
          const uncached = []
          for (const candidate of lessonCandidates) {
            const cached = args.force
              ? undefined
              : await getCachedRefined(candidate.id, candidate.text)
            if (!cached) uncached.push(candidate)
          }

          if (uncached.length === 0) {
            status.skipped += lessonCandidates.length
            status.processed += 1
            return
          }

          const refined = await refineLessonsForSession({
            sessionId: result.session.id,
            cwd: result.session.cwd,
            title: result.session.title,
            candidates: uncached,
            messages: result.messages,
            runner,
          })

          const byId = new Map(uncached.map((c) => [c.id, c]))
          for (const lesson of refined) {
            const source = byId.get(lesson.sourceCandidateId)
            if (!source) continue
            await putCachedRefined(source.id, source.text, lesson)
          }
          status.processed += 1
        } catch (error) {
          status.errors.push({
            sessionId: result.session.id,
            message: error instanceof Error ? error.message : String(error),
          })
          status.processed += 1
        }
      })
      status.state = status.errors.length > 0 ? 'error' : 'done'
    } catch (error) {
      status.state = 'error'
      status.errors.push({
        sessionId: '*',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      status.finishedAt = new Date().toISOString()
    }
  })()

  return status
}

export function getJob(jobId: string) {
  return jobs.get(jobId)
}

export function listJobs() {
  return Array.from(jobs.values())
}

// Return a preview of the prompts that would be sent, without calling codex.
export async function dryRunRefine(args: Omit<StartJobArgs, 'runner'>) {
  const previews: { sessionId: string; candidateCount: number; cached: number }[] = []
  const filtered = args.sessionResults.filter((result) => {
    const hasLessons = result.candidates.some((c) => c.kind === 'lesson')
    if (!hasLessons) return false
    if (args.sessionIds && args.sessionIds.length > 0) {
      return args.sessionIds.includes(result.session.id)
    }
    return true
  })
  for (const result of filtered) {
    const lessonCandidates = result.candidates.filter((c) => c.kind === 'lesson')
    let cached = 0
    for (const candidate of lessonCandidates) {
      if (await getCachedRefined(candidate.id, candidate.text)) cached += 1
    }
    previews.push({
      sessionId: result.session.id,
      candidateCount: lessonCandidates.length,
      cached,
    })
  }
  return previews
}
