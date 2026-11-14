import { BrowserWindow, Menu, app, dialog, ipcMain, type Event as ElectronEvent, type Input } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MIN_ZOOM_LEVEL = -3
const MAX_ZOOM_LEVEL = 4
const ZOOM_LEVEL_STEP = 0.5
let appZoomLevel = 0
const SELECT_DIRECTORY_CHANNEL = 'gogoagent:select-directory'
const screenshotDirectory = process.env.GOGOAGENT_CAPTURE_SCREENSHOTS_DIR?.trim()

if (screenshotDirectory) {
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  if (process.platform === 'linux' && process.env.GOGOAGENT_CAPTURE_NO_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox')
  }
}

ipcMain.handle(SELECT_DIRECTORY_CHANNEL, async (event, defaultPath?: unknown) => {
  if (process.env.GOGOAGENT_REMOTE_ATTACH === '1') return null
  const window = BrowserWindow.fromWebContents(event.sender)
  const options = {
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
    ...(typeof defaultPath === 'string' && defaultPath.trim() ? { defaultPath: defaultPath.trim() } : {}),
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] ?? null
})


function clampZoomLevel(level: number) {
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, level))
}

function setWindowZoom(window: BrowserWindow, level: number) {
  appZoomLevel = clampZoomLevel(level)
  window.webContents.setZoomLevel(appZoomLevel)
}

function handleZoomShortcut(window: BrowserWindow, event: ElectronEvent, input: Input) {
  if (input.type !== 'keyDown' || input.isComposing || input.alt) return

  const commandModifier = process.platform === 'darwin' ? input.meta : input.control
  if (!commandModifier) return

  const key = input.key.toLowerCase()
  const isZoomIn = key === '+' || key === '=' || input.code === 'Equal' || input.code === 'NumpadAdd'
  const isZoomOut = key === '-' || key === '_' || input.code === 'Minus' || input.code === 'NumpadSubtract'
  const isReset = key === '0' || key === ')' || input.code === 'Digit0' || input.code === 'Numpad0'
  if (!isZoomIn && !isZoomOut && !isReset) return

  event.preventDefault()
  if (isReset) {
    setWindowZoom(window, 0)
  } else {
    setWindowZoom(window, window.webContents.getZoomLevel() + (isZoomIn ? ZOOM_LEVEL_STEP : -ZOOM_LEVEL_STEP))
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRenderer(window: BrowserWindow, expression: string, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await window.webContents.executeJavaScript(`Boolean(${expression})`)
    if (ready) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for screenshot state: ${expression}`)
}

async function captureDemoScreenshots(window: BrowserWindow) {
  if (!screenshotDirectory) return
  await mkdir(screenshotDirectory, { recursive: true })
  await waitForRenderer(window, `document.querySelectorAll('.project-card').length >= 3`)
  if (process.env.GOGOAGENT_CAPTURE_EXPECT_INPUT === '1') {
    await waitForRenderer(window, `Boolean(document.querySelector('.project-input-indicator'))`)
  }
  await window.webContents.executeJavaScript(`document.querySelector('.project-card')?.click()`)
  await waitForRenderer(window, `
    !document.querySelector('#project-detail')?.classList.contains('hidden') &&
    Boolean(document.querySelector('.timeline-session:not(.timeline-loading)'))
  `)
  if (process.env.GOGOAGENT_CAPTURE_EXPECT_INPUT === '1') {
    await waitForRenderer(window, `
      Array.from(document.querySelectorAll('.terminal-tab small'))
        .some((element) => element.textContent?.includes('needs input')) &&
      Boolean(document.querySelector('#terminal-host:not(.hidden) .xterm-rows'))
    `)
  }
  await delay(450)

  const overview = await window.webContents.capturePage()
  await writeFile(path.join(screenshotDirectory, 'overview.png'), overview.toPNG())

  const recentDirectories = (() => {
    try {
      const parsed = JSON.parse(process.env.GOGOAGENT_CAPTURE_RECENT_DIRECTORIES ?? '[]') as unknown
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    } catch {
      return []
    }
  })()
  await window.webContents.executeJavaScript(`
    localStorage.setItem('gogoagent.recentCwds.v1', ${JSON.stringify(JSON.stringify(recentDirectories))});
    const input = document.querySelector('#global-cwd-input');
    if (input instanceof HTMLInputElement) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  `)
  await waitForRenderer(window, `!document.querySelector('#global-cwd-suggestions')?.classList.contains('hidden')`)
  await delay(250)

  const launcher = await window.webContents.capturePage()
  await writeFile(path.join(screenshotDirectory, 'launcher.png'), launcher.toPNG())

  if (process.env.GOGOAGENT_CAPTURE_PHONE === '1') {
    await window.webContents.executeJavaScript(`document.querySelector('#phone-toggle')?.click()`)
    await waitForRenderer(window, `Boolean(document.querySelector('#phone-dialog')?.open)`)
    await window.webContents.executeJavaScript(`document.querySelector('#phone-start-button')?.click()`)
    await waitForRenderer(window, `
      !document.querySelector('#phone-online')?.classList.contains('hidden') &&
      Boolean(document.querySelector('#phone-qr-image')?.getAttribute('src')) &&
      document.querySelector('#phone-pairing-code')?.textContent?.trim() !== '—'
    `)
    await delay(250)
    const phone = await window.webContents.capturePage()
    await writeFile(path.join(screenshotDirectory, 'phone.png'), phone.toPNG())
    await window.webContents.executeJavaScript(`document.querySelector('#phone-stop-button')?.click()`)
    await waitForRenderer(window, `!document.querySelector('#phone-offline')?.classList.contains('hidden')`)
  }
  app.quit()
}

function createWindow() {
  const remoteTarget = process.env.GOGOAGENT_REMOTE_ATTACH === '1' ? process.env.GOGOAGENT_REMOTE_TARGET : undefined
  const partition = remoteTarget
    ? `persist:gogoagent-remote-${createHash('sha256').update(remoteTarget).digest('hex').slice(0, 16)}`
    : undefined
  const window = new BrowserWindow({
    width: screenshotDirectory ? 1440 : 1200,
    height: screenshotDirectory ? 960 : 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b1020',
    webPreferences: {
      ...(partition ? { partition } : {}),
      preload: path.join(__dirname, 'preload.cjs'),
      // The preload owns the loopback auth token and uses Node APIs for the
      // narrow sidecar bridge. The renderer remains isolated and has no Node.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: remoteTarget ? `gogoagent · ${remoteTarget}` : 'gogoagent',
  })

  setWindowZoom(window, appZoomLevel)
  window.webContents.on('before-input-event', (event, input) => {
    handleZoomShortcut(window, event, input)
  })
  if (screenshotDirectory) {
    window.webContents.once('did-finish-load', () => {
      void captureDemoScreenshots(window).catch((error) => {
        console.error(`[gogoagent/screenshots] ${error instanceof Error ? error.message : String(error)}`)
        app.exit(1)
      })
    })
  }

  window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
