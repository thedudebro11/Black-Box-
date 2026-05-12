import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerRecorderHandlers } from './ipc/recorder'
import { registerAnalyzerHandlers } from './ipc/analyzer'
import { registerTelemetryHandlers } from './ipc/telemetry'
import { initDatabase } from '../src/db/schema'
import { initSettings } from '../src/db/settings'
import { listSessions, updateSession } from '../src/db/sessions'

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

/**
 * On startup, find any sessions that were left in 'recording' status —
 * meaning the app was closed mid-session — and mark them 'interrupted'.
 * Phase 12 will offer to re-analyze these; for now we just prevent them
 * from appearing as stuck-in-recording in the history screen.
 */
function recoverInterruptedSessions(): void {
  try {
    const sessions = listSessions(200)
    for (const s of sessions) {
      if (s.status === 'recording') {
        updateSession(s.id, { status: 'interrupted' })
        console.log(`[main] marked session ${s.id.slice(-8)} as interrupted (app closed mid-recording)`)
      }
    }
  } catch (err) {
    console.error('[main] interrupted session recovery failed', err)
  }
}

app.whenReady().then(() => {
  initDatabase()
  initSettings(app.getVersion())
  recoverInterruptedSessions()

  registerRecorderHandlers()
  registerAnalyzerHandlers()
  registerTelemetryHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
