import { randomUUID } from 'node:crypto'
import type { Project, RefineJobStatus, WorkLocationRecord } from '@gogoagent/shared'
import type { TranscriptParseResult } from './parseTranscript.js'
import type { CodexRunner } from './refineLessons.js'
import {
  buildWorkstreamLabelInput,
  getCachedWorkstreamLabel,
  getManualWorkstreamLabel,
  labelWorkstreamsWithLlm,
  putCachedWorkstreamLabel,
  type WorkstreamLabelInput,
} from './workstreamLabels.js'

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

function chunks<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface StartWorkstreamLabelJobArgs {
  workstreams: Project[]
  sessionResults: TranscriptParseResult[]
  workLocations: WorkLocationRecord[]
  force?: boolean
  batchSize?: number
  runner?: CodexRunner
}

export async function startWorkstreamLabelJob(args: StartWorkstreamLabelJobArgs): Promise<RefineJobStatus> {
  const allInputs = args.workstreams.map((workstream) =>
    buildWorkstreamLabelInput(workstream, args.sessionResults, args.workLocations),
  )

  const uncached: WorkstreamLabelInput[] = []
  for (const input of allInputs) {
    const manual = await getManualWorkstreamLabel(input.workstreamId)
    if (manual) continue
    const cached = args.force ? null : await getCachedWorkstreamLabel(input)
    if (cached) continue
    uncached.push(input)
  }

  const status = makeStatus(allInputs.length)
  status.skipped = allInputs.length - uncached.length
  status.processed = status.skipped
  status.generated = 0
  jobs.set(status.jobId, status)

  if (uncached.length === 0) {
    status.state = 'done'
    status.finishedAt = new Date().toISOString()
    return status
  }

  const batchSize = args.batchSize ?? 8

  ;(async () => {
    status.state = 'running'
    try {
      for (const batch of chunks(uncached, batchSize)) {
        let labels: Map<string, string>
        try {
          labels = await labelWorkstreamsWithLlm({ inputs: batch, runner: args.runner })
        } catch (error) {
          for (const input of batch) {
            status.errors.push({
              sessionId: input.workstreamId,
              message: error instanceof Error ? error.message : String(error),
            })
            status.processed += 1
          }
          continue
        }

        for (const input of batch) {
          try {
            const label = labels.get(input.workstreamId)
            if (!label) {
              status.errors.push({
                sessionId: input.workstreamId,
                message: 'LLM response did not include a valid label',
              })
              continue
            }
            await putCachedWorkstreamLabel(input, label)
            status.generated = (status.generated ?? 0) + 1
          } catch (error) {
            status.errors.push({
              sessionId: input.workstreamId,
              message: error instanceof Error ? error.message : String(error),
            })
          } finally {
            status.processed += 1
          }
        }
      }
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

export function getWorkstreamLabelJob(jobId: string) {
  return jobs.get(jobId)
}
