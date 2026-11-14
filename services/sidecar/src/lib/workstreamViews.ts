import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Project, WorkstreamView } from '@gogoagent/shared'

const directory = process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const file = path.join(directory, 'workstream-views.json')
let views: Record<string, WorkstreamView> | null = null
let writes = Promise.resolve()
let revision = 0

export function getWorkstreamViewRevision() {
  return revision
}

async function load() {
  if (views) return views
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { entries?: Record<string, WorkstreamView> }
    views = {}
    for (const [id, entry] of Object.entries(parsed.entries ?? {})) {
      if (entry && typeof entry.viewedAt === 'string' && Number.isFinite(Date.parse(entry.viewedAt))) {
        views[id] = { viewedAt: entry.viewedAt, terminalId: typeof entry.terminalId === 'string' ? entry.terminalId : undefined }
      }
    }
  } catch {
    views = {}
  }
  return views
}

export async function applyWorkstreamViews(workstreams: Project[]) {
  const stored = await load()
  for (const workstream of workstreams) {
    const view = stored[workstream.id]
    workstream.view = view ? { ...view } : undefined
    const activityAt = [workstream.lastUpdatedAt, workstream.state?.updatedAt]
      .filter((value): value is string => Boolean(value)).sort().at(-1)
    workstream.newSinceLastView = Boolean(view && activityAt && activityAt > view.viewedAt)
  }
}

export async function markWorkstreamViewed(workstreamId: string, terminalId?: string) {
  const stored = await load()
  const previous = stored[workstreamId]
  const now = new Date().toISOString()
  const next: WorkstreamView = {
    viewedAt: previous?.viewedAt && previous.viewedAt > now ? previous.viewedAt : now,
    terminalId: terminalId ?? previous?.terminalId,
  }
  stored[workstreamId] = next
  const payload = JSON.stringify({ version: 'v1', entries: stored }, null, 2)
  const operation = writes.then(async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  })
  writes = operation.catch(() => undefined)
  await operation
  revision += 1
  return { ...next }
}
