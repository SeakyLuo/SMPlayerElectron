import { app, Notification, BrowserWindow, nativeImage, screen, shell, type Rectangle } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { MainWindowBounds, SettingsSnapshot } from '../src/shared/contracts'
import { createTranslator } from '../src/shared/i18n'
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
  windowsAppUserModelId: string
  isQuitting: () => boolean
  onCreated: (window: BrowserWindow) => void
  hideWindow: () => void
  showWindow: () => void
  updateTrayMenu: () => void
  saveWindowState: (state: { bounds: MainWindowBounds; maximized: boolean }) => void
  requestQuit: () => void
}

let hasShownTrayHint = false

export async function createMainWindow(options: MainWindowOptions) {
  const settings = options.getSettings()
  const t = createTranslator(settings.preferredLanguage, app.getLocale())
  const startupNightModeActive = getStartupNightModeActive(settings)
  const defaultWindowMinimumSize = options.windowController.getDefaultMinimumSize()
  const appIcon = nativeImage.createFromPath(options.getAppIconPath())
  const initialBounds = resolveInitialMainWindowBounds(settings, defaultWindowMinimumSize)
  const window = new BrowserWindow({
    ...initialBounds,
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
    title: t('app.shell'),
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false,
      preload: join(__dirname, 'preload.mjs'),
      additionalArguments: [
        `--smplayer-startup-night-mode=${startupNightModeActive ? '1' : '0'}`,
      ],
    },
  })
  window.setIcon(appIcon)
  if (process.platform === 'win32') {
    window.setAppDetails({
      appId: options.windowsAppUserModelId,
      appIconPath: options.getAppIconPath(),
      appIconIndex: 0,
      relaunchCommand: getRelaunchCommand(),
      relaunchDisplayName: t('app.shell'),
    })
  }
  if (settings.mainWindowMaximized) {
    window.maximize()
  }
  options.onCreated(window)

  const saveMainWindowState = () => {
    if (window.isDestroyed() || window.isFullScreen() || options.windowController.getMiniMode()) {
      return
    }

    const rawBounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
    const bounds = clampMainWindowBounds(rawBounds, defaultWindowMinimumSize)
    options.saveWindowState({ bounds, maximized: window.isMaximized() })
  }

  window.on('close', (event) => {
    saveMainWindowState()
    if (options.isQuitting()) {
      return
    }

    if (options.getSettings().quitOnClose) {
      options.requestQuit()
      return
    }

    event.preventDefault()
    options.hideWindow()

    if (!hasShownTrayHint && Notification.isSupported()) {
      hasShownTrayHint = true
      new Notification({
        title: t('app.trayRunningTitle'),
        body: t('app.trayRunningBody'),
        silent: true,
      }).show()
    }
  })
  window.on('closed', () => {
    options.windowController.stopDrag()
  })
  window.on('moved', saveMainWindowState)
  window.on('resized', saveMainWindowState)
  window.on('maximize', saveMainWindowState)
  window.on('unmaximize', saveMainWindowState)
  window.on('enter-full-screen', () => options.windowController.emitFullScreenChange(window))
  window.on('leave-full-screen', () => options.windowController.emitFullScreenChange(window))
  window.on('show', () => {
    options.updateTrayMenu()
  })
  window.on('hide', () => {
    options.updateTrayMenu()
  })
  window.once('ready-to-show', () => {
    if (!settings.mainWindowMaximized) {
      window.setBounds(initialBounds, false)
    }
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

function resolveInitialMainWindowBounds(
  settings: SettingsSnapshot,
  minimumSize: { width: number; height: number },
): Rectangle {
  const parsedBounds = parseMainWindowBounds(settings.mainWindowBounds)
  if (!parsedBounds) {
    const workArea = screen.getPrimaryDisplay().workArea
    const width = Math.min(1460, workArea.width)
    const height = Math.min(940, workArea.height)

    return {
      width,
      height,
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
    }
  }

  return clampMainWindowBounds(parsedBounds, minimumSize)
}

function clampMainWindowBounds(
  bounds: Rectangle,
  minimumSize: { width: number; height: number },
): Rectangle {
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea
  const width = Math.min(Math.max(bounds.width, minimumSize.width), workArea.width)
  const height = Math.min(Math.max(bounds.height, minimumSize.height), workArea.height)

  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
  }
}

function parseMainWindowBounds(rawBounds: string): MainWindowBounds | null {
  if (!rawBounds) {
    return null
  }

  const value = JSON.parse(rawBounds) as Partial<MainWindowBounds>
  if (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  ) {
    return {
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    }
  }

  return null
}

function resolveStartupRoute(lastPage: string) {
  const route = lastPage.trim()
  return restorableRoutes.has(route) ? route : '/songs'
}

function getRelaunchCommand() {
  return app.isPackaged
    ? quoteWindowsCommandPart(process.execPath)
    : `${quoteWindowsCommandPart(process.execPath)} ${quoteWindowsCommandPart(app.getAppPath())}`
}

function quoteWindowsCommandPart(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`
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
