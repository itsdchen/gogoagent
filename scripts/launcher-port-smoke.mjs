#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'gogoagent-sidecar' }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address !== 'string', 'could not reserve a launcher test port')

  let child
  let output = ''
  try {
    child = spawn(process.execPath, ['apps/desktop/scripts/dev.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GOGOAGENT_PORT: String(address.port),
        GOGOAGENT_REUSE_SIDECAR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })

    const exitCode = await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('launcher port test timed out')), 30000)),
    ])
    assert.notEqual(exitCode, 0, 'launcher should refuse to replace a healthy sidecar when reuse is disabled')
    assert.match(output, /refusing to switch ports implicitly/i)
    assert.doesNotMatch(output, /starting this dev run on/i)
    console.log('Launcher port smoke test passed: occupied ports never trigger an implicit port switch.')
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL')
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
