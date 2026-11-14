import http from 'node:http'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDirectory = path.join(__dirname, 'public')

const mobileHost = process.env.GOGOAGENT_MOBILE_HOST?.trim() || '127.0.0.1'
const mobilePort = Number(process.env.GOGOAGENT_MOBILE_PORT ?? 43112)
const sidecarPort = Number(process.env.GOGOAGENT_PORT ?? 43111)
const allowRemote = process.env.GOGOAGENT_MOBILE_ALLOW_REMOTE === '1'
const secureCookie = process.env.GOGOAGENT_MOBILE_SECURE_COOKIE === '1'
const sidecarUrl = `http://127.0.0.1:${sidecarPort}`
const sidecarTokenPath = process.env.GOGOAGENT_AUTH_TOKEN_FILE
  ?? path.join(os.homedir(), '.gogoagent', `sidecar-${sidecarPort}.token`)
const parentPid = Number(process.env.GOGOAGENT_MOBILE_PARENT_PID)

const SESSION_COOKIE = 'gogoagent_mobile_session'
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60
const PAIR_WINDOW_MS = 10 * 60 * 1000
const PAIR_ATTEMPT_LIMIT = 8
const PAIR_LINK_LIFETIME_MS = 10 * 60 * 1000
const pairingCode = String(randomInt(100_000, 1_000_000))
let pairingToken = randomBytes(32).toString('base64url')
let pairingTokenExpiresAt = Date.now() + PAIR_LINK_LIFETIME_MS
const sessions = new Map<string, number>()
const pairingAttempts = new Map<string, { attempts: number; startedAt: number }>()
let controlConnections: Array<{ url: string; label: string }> = []

const staticAssets = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
  ['/manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json' }],
  ['/icon.svg', { file: 'icon.svg', type: 'image/svg+xml' }],
])

class SidecarRequestError extends Error {
  constructor(readonly status: number, readonly payload: unknown) {
    super(`Sidecar request returned ${status}`)
  }
}

function isLoopbackHost(host: string) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

if (!Number.isInteger(mobilePort) || mobilePort < 0 || mobilePort > 65535) {
  throw new Error(`Invalid GOGOAGENT_MOBILE_PORT: ${process.env.GOGOAGENT_MOBILE_PORT ?? ''}`)
}
if (!isLoopbackHost(mobileHost) && !allowRemote) {
  throw new Error('Remote mobile binding requires GOGOAGENT_MOBILE_ALLOW_REMOTE=1')
}

function securityHeaders(res: http.ServerResponse) {
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  securityHeaders(res)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    bytes += buffer.length
    if (bytes > 32 * 1024) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  if (!chunks.length) return {} as Record<string, unknown>
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function cookies(req: http.IncomingMessage) {
  const values = new Map<string, string>()
  for (const item of (req.headers.cookie ?? '').split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0) continue
    values.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()))
  }
  return values
}

function isAuthorized(req: http.IncomingMessage) {
  const token = cookies(req).get(SESSION_COOKIE)
  if (!token) return false
  const expiresAt = sessions.get(token)
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

function cookieHeader(token: string, maxAge = SESSION_MAX_AGE_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`
}

function requestHasSameOrigin(req: http.IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function codesMatch(candidate: string) {
  const expected = Buffer.from(pairingCode)
  const received = Buffer.from(candidate)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function pairingTokensMatch(candidate: string) {
  if (pairingTokenExpiresAt <= Date.now()) return false
  const expected = Buffer.from(pairingToken)
  const received = Buffer.from(candidate)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function pruneSessions() {
  const now = Date.now()
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token)
  }
}

function emitControlState() {
  if (process.env.GOGOAGENT_MOBILE_CONTROL !== '1' || !controlConnections.length) return
  pruneSessions()
  console.log(`[gogoagent/mobile-control] ${JSON.stringify({
    connections: controlConnections,
    pairingCode,
    pairingToken,
    pairingTokenExpiresAt: new Date(pairingTokenExpiresAt).toISOString(),
    pairedDevices: sessions.size,
  })}`)
}

function rotatePairingToken() {
  pairingToken = randomBytes(32).toString('base64url')
  pairingTokenExpiresAt = Date.now() + PAIR_LINK_LIFETIME_MS
  emitControlState()
}

function pairingAllowed(req: http.IncomingMessage) {
  const key = req.socket.remoteAddress ?? 'unknown'
  const now = Date.now()
  const current = pairingAttempts.get(key)
  if (!current || now - current.startedAt > PAIR_WINDOW_MS) {
    pairingAttempts.set(key, { attempts: 1, startedAt: now })
    return true
  }
  current.attempts += 1
  return current.attempts <= PAIR_ATTEMPT_LIMIT
}

async function sidecarJson(pathName: string, init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}) {
  const token = (await readFile(sidecarTokenPath, 'utf8')).trim()
  if (!token) throw new Error('The sidecar authentication token is empty')
  const response = await fetch(`${sidecarUrl}${pathName}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { error: text || `Sidecar returned ${response.status}` }
  }
  if (!response.ok) throw new SidecarRequestError(response.status, payload)
  return payload
}

async function serveAsset(urlPath: string, res: http.ServerResponse) {
  const asset = staticAssets.get(urlPath)
  if (!asset) return false
  try {
    const contents = await readFile(path.join(publicDirectory, asset.file))
    securityHeaders(res)
    res.writeHead(200, {
      'content-type': asset.type,
      'cache-control': asset.file === 'index.html' ? 'no-store' : 'private, max-age=300',
    })
    res.end(contents)
  } catch (error) {
    sendJson(res, 500, { error: 'Mobile asset is unavailable', detail: error instanceof Error ? error.message : String(error) })
  }
  return true
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    try {
      await sidecarJson('/health')
      sendJson(res, 200, { ok: true, service: 'gogoagent-mobile' })
    } catch {
      sendJson(res, 503, { ok: false, service: 'gogoagent-mobile', error: 'Sidecar unavailable' })
    }
    return
  }

  if (url.pathname === '/api/session' && req.method === 'GET') {
    sendJson(res, 200, { paired: isAuthorized(req) })
    return
  }

  if (url.pathname === '/api/pair' && req.method === 'POST') {
    if (!requestHasSameOrigin(req)) {
      sendJson(res, 403, { error: 'Origin rejected' })
      return
    }
    if (!pairingAllowed(req)) {
      sendJson(res, 429, { error: 'Too many pairing attempts. Try again later.' })
      return
    }
    const body = await readJsonBody(req)
    const rawCandidate = typeof body.code === 'string' ? body.code.trim() : ''
    const tokenPairing = pairingTokensMatch(rawCandidate)
    const codePairing = codesMatch(rawCandidate.replace(/\D/g, ''))
    if (!tokenPairing && !codePairing) {
      sendJson(res, 401, { error: 'Pairing code is incorrect.' })
      return
    }
    const session = randomBytes(32).toString('base64url')
    sessions.set(session, Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
    sendJson(res, 200, { paired: true }, { 'set-cookie': cookieHeader(session) })
    if (tokenPairing) rotatePairingToken()
    else emitControlState()
    return
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Pair this device to continue.' })
    return
  }
  if ((req.method === 'POST' || req.method === 'PATCH') && !requestHasSameOrigin(req)) {
    sendJson(res, 403, { error: 'Origin rejected' })
    return
  }

  if (url.pathname === '/api/signout' && req.method === 'POST') {
    const session = cookies(req).get(SESSION_COOKIE)
    if (session) sessions.delete(session)
    sendJson(res, 200, { ok: true }, { 'set-cookie': cookieHeader('', 0) })
    emitControlState()
    return
  }

  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const [projectResponse, attentionResponse, terminalResponse] = await Promise.all([
      sidecarJson('/projects'),
      sidecarJson('/attention'),
      sidecarJson('/terminals'),
    ])
    const projects = (projectResponse as { projects?: unknown[] }).projects ?? []
    const attention = (attentionResponse as { items?: unknown[] }).items ?? []
    const terminals = (terminalResponse as { terminals?: unknown[] }).terminals ?? []
    sendJson(res, 200, { projects, attention, terminals })
    return
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/)
  if (projectMatch && req.method === 'GET') {
    const projectId = decodeURIComponent(projectMatch[1])
    sendJson(res, 200, await sidecarJson(`/projects/${encodeURIComponent(projectId)}`))
    return
  }

  const stateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/state$/)
  if (stateMatch && req.method === 'PATCH') {
    const projectId = decodeURIComponent(stateMatch[1])
    const body = await readJsonBody(req)
    const fields = ['goal', 'currentState', 'blocker', 'nextAction', 'lastVerification'] as const
    const state: Record<string, string> = {}
    for (const field of fields) {
      if (typeof body[field] === 'string') state[field] = body[field].slice(0, 1200)
    }
    sendJson(res, 200, await sidecarJson(`/workstreams/${encodeURIComponent(projectId)}/state`, { method: 'PATCH', body: state }))
    return
  }

  const viewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/view$/)
  if (viewMatch && req.method === 'POST') {
    const projectId = decodeURIComponent(viewMatch[1])
    const body = await readJsonBody(req)
    sendJson(res, 200, await sidecarJson(`/workstreams/${encodeURIComponent(projectId)}/view`, {
      method: 'POST',
      body: { terminalId: typeof body.terminalId === 'string' ? body.terminalId : undefined },
    }))
    return
  }

  const continuationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/continuation$/)
  if (continuationMatch && (req.method === 'GET' || req.method === 'POST')) {
    const projectId = decodeURIComponent(continuationMatch[1])
    const route = `/workstreams/${encodeURIComponent(projectId)}/continuation`
    if (req.method === 'GET') {
      sendJson(res, 200, await sidecarJson(route))
    } else {
      const body = await readJsonBody(req)
      sendJson(res, 201, await sidecarJson(route, {
        method: 'POST',
        body: {
          sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
          repositoryFingerprint: typeof body.repositoryFingerprint === 'string' ? body.repositoryFingerprint : undefined,
        },
      }))
    }
    return
  }

  const logMatch = url.pathname.match(/^\/api\/terminals\/([^/]+)\/log$/)
  if (logMatch && req.method === 'GET') {
    const terminalId = decodeURIComponent(logMatch[1])
    sendJson(res, 200, await sidecarJson(`/terminals/${encodeURIComponent(terminalId)}/log?maxBytes=262144`))
    return
  }

  const decisionMatch = url.pathname.match(/^\/api\/terminals\/([^/]+)\/decision$/)
  if (decisionMatch && req.method === 'GET') {
    const terminalId = decodeURIComponent(decisionMatch[1])
    sendJson(res, 200, await sidecarJson(`/terminals/${encodeURIComponent(terminalId)}/decision`))
    return
  }

  const respondMatch = url.pathname.match(/^\/api\/terminals\/([^/]+)\/respond$/)
  if (respondMatch && req.method === 'POST') {
    const terminalId = decodeURIComponent(respondMatch[1])
    const body = await readJsonBody(req)
    const text = typeof body.text === 'string' ? body.text.slice(0, 4000) : ''
    const submit = body.submit !== false
    const choice = body.choice === true
    sendJson(res, 200, await sidecarJson(`/terminals/${encodeURIComponent(terminalId)}/respond`, {
      method: 'POST',
      body: { text, submit, choice, decisionId: typeof body.decisionId === 'string' ? body.decisionId : undefined },
    }))
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' })
    return
  }
  const url = new URL(req.url, `http://${req.headers.host ?? `${mobileHost}:${mobilePort}`}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    if (req.method === 'GET' && await serveAsset(url.pathname, res)) return
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof SidecarRequestError) {
      sendJson(res, error.status, error.payload)
      return
    }
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

function displayConnections(boundPort: number) {
  if (mobileHost !== '0.0.0.0') {
    return [{ url: `http://${mobileHost}:${boundPort}`, label: mobileHost }]
  }
  const connections = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries ?? []).map((entry) => ({ name, entry })))
    .filter(({ entry }) => entry.family === 'IPv4' && !entry.internal)
    .map(({ name, entry }) => ({ url: `http://${entry.address}:${boundPort}`, label: `${name} · ${entry.address}` }))
  return connections.length
    ? connections
    : [{ url: `http://127.0.0.1:${boundPort}`, label: 'This computer only' }]
}

server.listen(mobilePort, mobileHost, () => {
  const address = server.address()
  const boundPort = address && typeof address !== 'string' ? address.port : mobilePort
  controlConnections = displayConnections(boundPort)
  console.log('[gogoagent/mobile] phone UI ready')
  for (const connection of controlConnections) console.log(`[gogoagent/mobile] open ${connection.url}`)
  console.log(`[gogoagent/mobile] pairing code: ${pairingCode}`)
  console.log('[gogoagent/mobile] pairing and device sessions reset when this gateway restarts')
  emitControlState()
  if (!isLoopbackHost(mobileHost) && !secureCookie) {
    console.warn('[gogoagent/mobile] warning: remote HTTP is not encrypted; use a trusted private network or an HTTPS reverse proxy')
  }
})

setInterval(rotatePairingToken, PAIR_LINK_LIFETIME_MS).unref()

if (Number.isInteger(parentPid) && parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0)
    } catch {
      shutdown()
    }
  }, 2000).unref()
}

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
