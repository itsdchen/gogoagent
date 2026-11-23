#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sidecarModule = path.join(root, 'services/sidecar/dist/services/sidecar/src/lib/workstreamFiles.js')
const rendererModule = path.join(root, 'apps/desktop/dist/renderer/markdownReader.js')
const { readWorkstreamTextFile } = await import(pathToFileURL(sidecarModule).href)
const { renderMarkdownReader } = await import(pathToFileURL(rendererModule).href)
const base = await mkdtemp(path.join(os.tmpdir(), 'gogoagent-reader-'))

try {
  const workstreamRoot = path.join(base, 'workstream')
  const agyBrainRoot = path.join(base, 'brain')
  await mkdir(workstreamRoot)
  await mkdir(agyBrainRoot)
  await writeFile(path.join(workstreamRoot, 'notes.md'), '# Notes\n\nRead this.\n')
  const agyDoc = path.join(agyBrainRoot, 'plan.txt')
  await writeFile(agyDoc, 'Agent plan')
  const privateFile = path.join(base, 'private.txt')
  await writeFile(privateFile, 'private')
  await symlink(privateFile, path.join(workstreamRoot, 'escape.txt'))
  await writeFile(path.join(workstreamRoot, 'binary.dat'), Buffer.from([0, 1, 2]))
  await writeFile(path.join(workstreamRoot, 'invalid.txt'), Buffer.from([0xff]))
  await writeFile(path.join(workstreamRoot, 'huge.txt'), 'x'.repeat(2 * 1024 * 1024 + 1))

  const input = { workstreamRoot, agyBrainRoot }
  assert.equal((await readWorkstreamTextFile({ ...input, selectedPath: 'notes.md' })).kind, 'markdown')
  assert.equal((await readWorkstreamTextFile({ ...input, selectedPath: agyDoc })).content, 'Agent plan')
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: privateFile }), /outside/)
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: '../private.txt' }), /outside/)
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: 'escape.txt' }), /outside/)
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: 'binary.dat' }), /binary/)
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: 'invalid.txt' }), /UTF-8/)
  await assert.rejects(readWorkstreamTextFile({ ...input, selectedPath: 'huge.txt' }), /too large/)

  const html = renderMarkdownReader('# Plan\n\n| Step | State |\n|---|---|\n| Read | Done |\n\n<script>alert(1)</script>')
  assert.match(html, /<h1>Plan<\/h1>/)
  assert.match(html, /<table>/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
  process.stdout.write('Workstream file reader smoke passed.\n')
} finally {
  await rm(base, { recursive: true, force: true })
}
