import { Notification, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { SettingsSnapshot } from '../src/shared/contracts'
import type { WindowController } from './window-controller'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const appWindowBackgroundColor = '#f6f8fb'
export const nightAppWindowBackgroundColor = '#101419'
export const titleBarOverlayColor = '#00000000'
export const nightTitleBarOverlayColor = '#00000000'
export const defaultTitleBarSymbolColor = '#111111'
export const immersiveTitleBarSymbolColor = '#ffffff'

const restorableRoutes = new Set([
  '/songs',
  '/artists',
  '/albums',
  '/now-playing',
  '/recent',
  '/local',
  '/playlists',
  '/favorites',
])

interface MainWindowOptions {
  windowController: WindowController
  getSettings: () => SettingsSnapshot
  getAppIconPath: () => string
  isQuitting: () => boolean
  onCreated: (window: BrowserWindow) => void
  hideWindow: () => void
  showWindow: () => void
  updateTrayMenu: () => void
}

let hasShownTrayHint = false

export async function createMainWindow(options: MainWindowOptions) {
  const startupNightModeActive = getStartupNightModeActive(options.getSettings())
  const defaultWindowMinimumSize = options.windowController.getDefaultMinimumSize()
  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: defaultWindowMinimumSize.width,
    minHeight: defaultWindowMinimumSize.height,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: startupNightModeActive ? nightAppWindowBackgroundColor : appWindowBackgroundColor,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: startupNightModeActive ? nightTitleBarOverlayColor : titleBarOverlayColor,
            symbolColor: startupNightModeActive ? immersiveTitleBarSymbolColor : defaultTitleBarSymbolColor,
            height: 32,
          }
        : undefined,
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: 'active',
    title: 'Simple Melody Player',
    icon: options.getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, 'preload.mjs'),
      additionalArguments: [
        `--smplayer-startup-night-mode=${startupNightModeActive ? '1' : '0'}`,
      ],
    },
  })
  options.onCreated(window)

  window.on('close', (event) => {
    if (options.isQuitting()) {
      return
    }

    if (options.getSettings().quitOnClose) {
      return
    }

    event.preventDefault()
    options.hideWindow()

    if (!hasShownTrayHint && Notification.isSupported()) {
      hasShownTrayHint = true
      new Notification({
        title: 'Simple Melody Player is still running',
        body: 'The window was hidden to the system tray. Use the tray icon to restore or quit.',
        silent: true,
      }).show()
    }
  })
  window.on('closed', () => {
    options.windowController.stopDrag()
  })
  window.on('enter-full-screen', () => options.windowController.emitFullScreenChange(window))
  window.on('leave-full-screen', () => options.windowController.emitFullScreenChange(window))
  window.on('show', () => {
    options.updateTrayMenu()
  })
  window.on('hide', () => {
    options.updateTrayMenu()
  })
  window.once('ready-to-show', () => {
    options.showWindow()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined
    callback(permission === 'media' && (mediaTypes === undefined || mediaTypes.includes('audio')))
  })
  window.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media'
  })

  const startupRoute = resolveStartupRoute(options.getSettings().lastPage)
  if (process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL)
    devServerUrl.searchParams.set('startupNightMode', startupNightModeActive ? '1' : '0')
    devServerUrl.hash = startupRoute
    await window.loadURL(devServerUrl.toString())
  } else {
    const indexUrl = pathToFileURL(join(__dirname, '../dist/index.html'))
    indexUrl.searchParams.set('startupNightMode', startupNightModeActive ? '1' : '0')
    indexUrl.hash = startupRoute
    await window.loadURL(indexUrl.toString())
  }

  return window
}

function resolveStartupRoute(lastPage: string) {
  const route = lastPage.trim()
  return restorableRoutes.has(route) ? route : '/songs'
}

function settingsTimeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function isClockMinuteInRange(current: number, start: number, end: number) {
  if (start < end) {
    return current >= start && current < end
  }

  return current >= start || current < end
}

function getClockMinute() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function getStartupNightModeActive(settings: SettingsSnapshot) {
  return settings.nightMode === 'on' || (
    settings.nightMode === 'auto' &&
    isClockMinuteInRange(
      getClockMinute(),
      settingsTimeToMinute(settings.nightModeStartTime),
      settingsTimeToMinute(settings.nightModeEndTime),
    )
  )
}
