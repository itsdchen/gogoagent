#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateDir = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-document-'))
process.env.GOGOAGENT_STATE_DIR = stateDir
const modulePath = path.join(root, 'services', 'sidecar', 'dist', 'services', 'sidecar', 'src', 'lib', 'workstreamDocuments.js')
const { askWorkstreamDocument, DocumentConflictError, draftWorkstreamDocument, getWorkstreamDocument, saveWorkstreamDocument } = await import(pathToFileURL(modulePath).href)
const linksPath = path.join(root, 'services', 'sidecar', 'dist', 'services', 'sidecar', 'src', 'lib', 'linkedInvestigations.js')
const { addInvestigation, listInvestigations, markInvestigationStarted, removeInvestigation } = await import(pathToFileURL(linksPath).href)

try {
  const project = {
    id: 'workstream-demo', name: 'Demo workstream', repoRoot: '/tmp/demo', sessionIds: ['session-a'],
    lastUpdatedAt: '2026-11-22T12:00:00.000Z', state: { goal: 'Fix the parser' },
  }
  const current = await getWorkstreamDocument(project.id)
  assert.equal(current.revision, 0)
  const runner = async ({ prompt, schemaPath }) => {
    assert.match(prompt, /Fix the parser/)
    assert.match(prompt, /Source sessions:/)
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    assert(schema.properties.sections.properties.findings)
    return JSON.stringify({ sections: {
      overview: 'Parser repair [1]', currentStatus: 'Implemented; verification unrecorded [1]',
      findings: 'The old parser dropped a field [1]', decisions: 'Keep the existing format [1]',
      openQuestions: 'Does the fix cover old files? [1]', nextSteps: 'Run the migration test [1]',
    } })
  }
  const draft = await draftWorkstreamDocument({
    project, current, runner,
    sessionResults: [{ session: { id: 'session-a', title: 'Parser repair', updatedAt: '2026-11-22T12:00:00.000Z' },
      messages: [{ role: 'user', text: 'Fix the parser' }, { role: 'assistant', text: 'The parser now keeps the field.' }] }],
  })
  assert.equal((await getWorkstreamDocument(project.id)).revision, 0, 'drafting must not save automatically')
  assert.deepEqual(draft.sourceSessionIds, ['session-a'])
  const saved = await saveWorkstreamDocument(project.id, current.revision, draft.sections, draft.sourceSessionIds, draft.evidenceThrough)
  assert.equal(saved.revision, 1)
  assert.equal((await getWorkstreamDocument(project.id)).sections.findings, 'The old parser dropped a field [1]')
  const updatedDraft = await draftWorkstreamDocument({
    project: { ...project, sessionIds: ['session-a', 'session-b'] }, current: saved,
    runner: async ({ prompt }) => {
      assert.match(prompt, /\[1\] Parser repair/)
      assert.match(prompt, /\[2\] Follow-up/)
      return JSON.stringify({ sections: saved.sections })
    },
    sessionResults: [
      { session: { id: 'session-a', title: 'Parser repair', updatedAt: '2026-11-22T12:00:00.000Z' }, messages: [] },
      { session: { id: 'session-b', title: 'Follow-up', updatedAt: '2026-11-22T13:00:00.000Z' }, messages: [] },
    ],
  })
  assert.deepEqual(updatedDraft.sourceSessionIds, ['session-a', 'session-b'], 'existing citation numbers remain stable')
  const chat = await askWorkstreamDocument({
    project, current: saved, question: 'What remains uncertain?', mode: 'rewrite', section: 'openQuestions',
    sessionResults: [{ session: { id: 'session-a', title: 'Parser repair', updatedAt: '2026-11-22T12:00:00.000Z' }, messages: [] }],
    runner: async ({ prompt, schemaPath }) => {
      assert.match(prompt, /proposed rewrite of the openQuestions section/)
      assert.match(prompt, /\[1\] Parser repair/)
      const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
      assert(schema.properties.answer && schema.properties.replacement)
      return JSON.stringify({ answer: 'The migration remains unverified [1].', replacement: 'Does the migration cover old files? [1]' })
    },
  })
  assert.equal(chat.replacement, 'Does the migration cover old files? [1]')
  assert.deepEqual(chat.sourceSessionIds, ['session-a'])
  assert.equal((await getWorkstreamDocument(project.id)).revision, 1, 'chat must not save a proposed rewrite')
  const manySessions = Array.from({ length: 12 }, (_, index) => ({
    session: { id: `session-${index}`, title: index === 0 ? 'Holiday replay findings' : `General work ${index}`,
      updatedAt: `2026-11-22T12:${String(index).padStart(2, '0')}:00.000Z` },
    messages: [{ role: 'user', text: index === 0 ? 'Check holiday replay coverage' : 'Review current work' }],
  }))
  const olderAnswer = await askWorkstreamDocument({
    project: { ...project, sessionIds: manySessions.map(({ session }) => session.id) },
    current, question: 'What did the holiday replay cover?', mode: 'answer', sessionResults: manySessions,
    runner: async ({ prompt }) => {
      assert.match(prompt, /Holiday replay findings/, 'question-relevant older sessions should be available')
      return JSON.stringify({ answer: 'The older session covered holiday replay [4].', replacement: '' })
    },
  })
  assert(olderAnswer.sourceSessionIds.includes('session-0'))
  assert.equal(olderAnswer.evidenceSessionsTotal, 12)
  assert.equal(olderAnswer.evidenceSessionsUsed, 10)

  const queued = await addInvestigation(project.id, 'Old file coverage', 'Does the migration cover old files?')
  assert.equal((await listInvestigations(project.id)).items[0].id, queued.id)
  await markInvestigationStarted(project.id, queued.id, 'investigation-child')
  assert.equal((await listInvestigations('investigation-child')).parent?.parentWorkstreamId, project.id)
  assert.equal(await removeInvestigation(project.id, queued.id), false, 'started links must stay linked')
  const removable = await addInvestigation(project.id, 'Temporary', 'Can this be removed?')
  assert.equal(await removeInvestigation(project.id, removable.id), true)
  await assert.rejects(
    saveWorkstreamDocument(project.id, current.revision, draft.sections, [], draft.evidenceThrough),
    DocumentConflictError,
  )
  console.log('Working document smoke test passed: structured draft, read-only chat, linked investigations, explicit save, and revision conflict.')
} finally {
  await rm(stateDir, { recursive: true, force: true })
}
