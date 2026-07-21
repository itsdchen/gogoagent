import { BrowserWindow, Menu, app, dialog, ipcMain, type Event as ElectronEvent, type Input } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MIN_ZOOM_LEVEL = -3
const MAX_ZOOM_LEVEL = 4
const ZOOM_LEVEL_STEP = 0.5
let appZoomLevel = 0
const SELECT_DIRECTORY_CHANNEL = 'gogoagent:select-directory'

ipcMain.handle(SELECT_DIRECTORY_CHANNEL, async (event, defaultPath?: unknown) => {
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

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // The preload owns the loopback auth token and uses Node APIs for the
      // narrow sidecar bridge. The renderer remains isolated and has no Node.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'gogoagent',
  })

  setWindowZoom(window, appZoomLevel)
  window.webContents.on('before-input-event', (event, input) => {
    handleZoomShortcut(window, event, input)
  })

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
