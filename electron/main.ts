import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerRecorderHandlers } from './ipc/recorder'
import { registerAnalyzerHandlers } from './ipc/analyzer'
import { registerTelemetryHandlers } from './ipc/telemetry'
import { registerExportHandlers } from './ipc/export'
import { registerSessionHandlers } from './ipc/sessions'
import { registerFollowUpHandlers } from './ipc/follow-up'
import { registerDevtoolsHandlers } from './ipc/devtools'
import { checkAndFirePendingFollowUps } from '../src/notifications/follow-up-scheduler'
import { initDatabase } from '../src/db/schema'
import { initSettings } from '../src/db/settings'
import { listSessions, updateSession } from '../src/db/sessions'

function createWindow(): BrowserWindow {
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

  return win
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
        console.log(
          `[main] marked session ${s.id.slice(-8)} as interrupted (app closed mid-recording)`
        )
      }
    }
  } catch (err) {
    console.error('[main] interrupted session recovery failed', err)
  }
}

let tray: Tray | null = null

function createTray(win: BrowserWindow): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')

  if (!existsSync(iconPath)) {
    console.warn(
      '[tray] icon not found at',
      iconPath,
      '— skipping tray (add resources/icon.png to enable)'
    )
    return
  }

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Black Box')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Black Box',
      click: () => {
        win.show()
        win.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])

  tray.setContextMenu(menu)

  tray.on('double-click', () => {
    win.show()
    win.focus()
  })
}

/** Push the follow-up:show event to all renderer windows */
function notifyFollowUpFired(followUpId: string, sessionId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('follow-up:show', { followUpId, sessionId })
  }
}

app.whenReady().then(() => {
  initDatabase()
  initSettings(app.getVersion())
  recoverInterruptedSessions()

  registerRecorderHandlers()
  registerAnalyzerHandlers()
  registerTelemetryHandlers()
  registerExportHandlers()
  registerSessionHandlers()
  registerFollowUpHandlers(notifyFollowUpFired)

  if (!app.isPackaged) {
    registerDevtoolsHandlers()
  }

  // Fire any follow-ups that became due while the app was closed.
  checkAndFirePendingFollowUps(notifyFollowUpFired)

  const win = createWindow()
  createTray(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
