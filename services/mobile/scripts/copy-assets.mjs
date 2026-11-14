import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const serviceRoot = path.resolve(scriptDirectory, '..')

await mkdir(path.join(serviceRoot, 'dist', 'public'), { recursive: true })
await cp(path.join(serviceRoot, 'public'), path.join(serviceRoot, 'dist', 'public'), { recursive: true })
