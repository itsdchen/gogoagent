import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LinkedInvestigation } from '@gogoagent/shared'

const directory = process.env.GOGOAGENT_STATE_DIR ?? path.join(os.homedir(), '.gogoagent', 'state')
const file = path.join(directory, 'linked-investigations.json')
let entries: LinkedInvestigation[] | null = null
let writes = Promise.resolve()

async function load() {
  if (entries) return entries
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { entries?: LinkedInvestigation[] }
    entries = Array.isArray(parsed.entries) ? parsed.entries.filter((item) =>
      item && typeof item.id === 'string' && typeof item.parentWorkstreamId === 'string'
      && typeof item.title === 'string' && typeof item.question === 'string') : []
  } catch { entries = [] }
  return entries
}

async function persist() {
  const payload = JSON.stringify({ version: 'v1', entries: await load() }, null, 2)
  const operation = writes.then(async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  })
  writes = operation.catch(() => undefined)
  await operation
}

export async function listInvestigations(workstreamId: string) {
  const all = await load()
  return {
    items: all.filter((item) => item.parentWorkstreamId === workstreamId),
    parent: all.find((item) => item.childWorkstreamId === workstreamId),
  }
}

export async function addInvestigation(parentWorkstreamId: string, title: string, question: string) {
  const item: LinkedInvestigation = {
    id: randomUUID(), parentWorkstreamId, title: title.trim().slice(0, 120),
    question: question.trim().slice(0, 2000), createdAt: new Date().toISOString(),
  }
  ;(await load()).push(item)
  await persist()
  return item
}

export async function getInvestigation(parentWorkstreamId: string, id: string) {
  return (await load()).find((item) => item.parentWorkstreamId === parentWorkstreamId && item.id === id)
}

export async function removeInvestigation(parentWorkstreamId: string, id: string) {
  const all = await load()
  const index = all.findIndex((item) => item.parentWorkstreamId === parentWorkstreamId && item.id === id && !item.childWorkstreamId)
  if (index < 0) return false
  all.splice(index, 1)
  await persist()
  return true
}

export async function markInvestigationStarted(parentWorkstreamId: string, id: string, childWorkstreamId: string) {
  const item = await getInvestigation(parentWorkstreamId, id)
  if (!item || item.childWorkstreamId) throw new Error('Investigation is missing or already started.')
  item.childWorkstreamId = childWorkstreamId
  item.startedAt = new Date().toISOString()
  await persist()
  return item
}
