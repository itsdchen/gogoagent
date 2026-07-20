import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const port = Number(process.env.GOGOAGENT_PORT ?? 43111)
const authTokenPath = process.env.GOGOAGENT_AUTH_TOKEN_FILE
  ?? path.join(os.homedir(), '.gogoagent', `sidecar-${port}.token`)

async function main() {
  const baseUrl = `http://127.0.0.1:${port}`

  try {
    const authToken = (await readFile(authTokenPath, 'utf8')).trim()
    const response = await fetch(`${baseUrl}/snapshot`, {
      headers: { authorization: `Bearer ${authToken}` },
    })
    if (!response.ok) throw new Error(`snapshot request failed: ${response.status}`)
    const snapshot = await response.json()

    console.log('[gogoagent/desktop] connected to sidecar')
    console.log(JSON.stringify(snapshot, null, 2))
  } catch (error) {
    console.error('[gogoagent/desktop] failed to reach sidecar')
    console.error(error)
    process.exitCode = 1
  }
}

void main()
