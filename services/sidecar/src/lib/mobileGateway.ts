import { spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTROL_PREFIX = '[gogoagent/mobile-control] '
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

interface MobileControlPayload {
  connections: Array<{ url: string; label: string }>
  pairingCode: string
  pairingToken: string
  pairingTokenExpiresAt: string
  pairedDevices: number
}

export interface MobileGatewayStatus {
  running: boolean
  connections: MobileControlPayload['connections']
  pairingCode?: string
  pairingToken?: string
  pairingTokenExpiresAt?: string
  pairedDevices?: number
  error?: string
}

let gateway: ChildProcess | null = null
let status: MobileGatewayStatus = { running: false, connections: [] }
let starting: Promise<MobileGatewayStatus> | null = null

async function mobileEntryPath() {
  const candidates = [
    process.env.GOGOAGENT_MOBILE_ENTRY,
    path.resolve(moduleDirectory, '../../../mobile/dist/index.js'),
    path.resolve(moduleDirectory, '../../../../../../mobile/dist/index.js'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the source or compiled workspace layout.
    }
  }
  throw new Error('Phone gateway build is missing on this host. Run corepack pnpm --filter @gogoagent/mobile build.')
}

export function getMobileGatewayStatus(): MobileGatewayStatus {
  return { ...status, connections: status.connections.map((connection) => ({ ...connection })) }
}

export function startMobileGateway(): Promise<MobileGatewayStatus> {
  if (gateway?.exitCode === null && status.running) return Promise.resolve(getMobileGatewayStatus())
  if (starting) return starting

  starting = (async () => {
    const entry = await mobileEntryPath()
    return new Promise<MobileGatewayStatus>((resolve, reject) => {
      const child = spawn(process.execPath, [entry], {
        cwd: path.dirname(entry),
        env: {
          ...process.env,
          GOGOAGENT_MOBILE_HOST: process.env.GOGOAGENT_MOBILE_HOST?.trim() || '0.0.0.0',
          GOGOAGENT_MOBILE_PORT: process.env.GOGOAGENT_MOBILE_PORT?.trim() || '0',
          GOGOAGENT_MOBILE_ALLOW_REMOTE: '1',
          GOGOAGENT_MOBILE_CONTROL: '1',
          GOGOAGENT_MOBILE_PARENT_PID: String(process.pid),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      gateway = child
      status = { running: false, connections: [] }
      let output = ''
      let errors = ''
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGTERM')
        reject(new Error('Phone access did not become ready in time.'))
      }, 12_000)

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        output += chunk
        const lines = output.split('\n')
        output = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith(CONTROL_PREFIX)) continue
          try {
            const payload = JSON.parse(line.slice(CONTROL_PREFIX.length)) as MobileControlPayload
            if (gateway !== child) continue
            status = {
              running: true,
              connections: payload.connections,
              pairingCode: payload.pairingCode,
              pairingToken: payload.pairingToken,
              pairingTokenExpiresAt: payload.pairingTokenExpiresAt,
              pairedDevices: payload.pairedDevices,
            }
            if (!settled) {
              settled = true
              clearTimeout(timer)
              resolve(getMobileGatewayStatus())
            }
          } catch {
            // Keep waiting for a valid control message.
          }
        }
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => { errors = `${errors}${chunk}`.slice(-4000) })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        if (gateway === child) {
          gateway = null
          status = {
            running: false,
            connections: [],
            ...(code && code !== 0 ? { error: errors.trim() || `Phone gateway exited with code ${code}.` } : {}),
          }
        }
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(errors.trim() || `Phone gateway exited before it was ready (${code ?? 'unknown'}).`))
        }
      })
    })
  })().finally(() => { starting = null })
  return starting
}

export async function stopMobileGateway(): Promise<MobileGatewayStatus> {
  if (starting) await starting.catch(() => undefined)
  const child = gateway
  gateway = null
  status = { running: false, connections: [] }
  if (!child || child.exitCode !== null) return getMobileGatewayStatus()
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
  return getMobileGatewayStatus()
}

export function stopMobileGatewayOnExit() {
  gateway?.kill('SIGTERM')
}
