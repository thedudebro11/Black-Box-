import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerRecorderHandlers } from './ipc/recorder'
import { registerAnalyzerHandlers } from './ipc/analyzer'
import { registerTelemetryHandlers } from './ipc/telemetry'
import { registerExportHandlers } from './ipc/export'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0F',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerRecorderHandlers()
  registerAnalyzerHandlers()
  registerTelemetryHandlers()
  registerExportHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
