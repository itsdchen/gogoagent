import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

await mkdir(path.join(root, 'dist', 'renderer'), { recursive: true })
await cp(path.join(root, 'src', 'renderer', 'index.html'), path.join(root, 'dist', 'renderer', 'index.html'))
await cp(path.join(root, 'src', 'renderer', 'styles.css'), path.join(root, 'dist', 'renderer', 'styles.css'))
await cp(path.join(root, 'src', 'renderer', 'light.css'), path.join(root, 'dist', 'renderer', 'light.css'))

await mkdir(path.join(root, 'dist', 'renderer', 'vendor'), { recursive: true })
await cp(
  path.join(root, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
  path.join(root, 'dist', 'renderer', 'vendor', 'xterm.js'),
)
await cp(
  path.join(root, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'),
  path.join(root, 'dist', 'renderer', 'vendor', 'addon-fit.js'),
)
await cp(
  path.join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
  path.join(root, 'dist', 'renderer', 'vendor', 'xterm.css'),
)
