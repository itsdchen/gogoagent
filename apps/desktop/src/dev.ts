import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const sidecarDir = path.resolve(rootDir, '../../services/sidecar')

const port = process.env.GOGOAGENT_PORT ?? '43111'
const env = { ...process.env, GOGOAGENT_PORT: port }

const sidecar = spawn('corepack', ['pnpm', 'dev'], {
  cwd: sidecarDir,
  env,
  stdio: 'inherit',
})

const electron = spawn(
  'node',
  [path.resolve(rootDir, 'node_modules/electron/cli.js'), '--enable-logging', '.'],
  {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  },
)

function shutdown(code = 0) {
  if (!sidecar.killed) sidecar.kill('SIGTERM')
  if (!electron.killed) electron.kill('SIGTERM')
  process.exit(code)
}

electron.on('exit', (code) => {
  shutdown(code ?? 0)
})

sidecar.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown(code)
  }
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
