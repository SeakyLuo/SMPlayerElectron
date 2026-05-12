import {
  Notification,
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from 'electron'
import { mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { AppInfo } from '../src/shared/contracts'
import { DataService } from './services/data-service'
import { AUDIO_EXTENSIONS } from './services/constants'
import { OpenFileCoordinator } from './services/open-file-coordinator'
import { RemotePlayServer } from './services/remote-play-server'
import { resolveUserDataPath } from './services/user-data-path'
import {
  cancelWindowsSpeechRecognition,
  recognizeWindowsSpeech,
} from './services/windows-speech-recognition'
import { registerDataIpc } from './ipc/data-ipc'
import { registerLibraryIpc } from './ipc/library-ipc'
import { registerRemoteIpc } from './ipc/remote-ipc'
import { createLocalFolder, registerShellIpc } from './ipc/shell-ipc'
import { registerWindowIpc } from './ipc/window-ipc'
import { TrayController } from './tray-controller'
import { WindowController } from './window-controller'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let libraryService: DataService | null = null
let remotePlayServer: RemotePlayServer | null = null
let isQuitting = false
const windowController = new WindowController()
const trayController = new TrayController({
  getWindow: () => mainWindow,
  getAppIconPath,
  getRootPath: () => libraryService!.settingsService.getSettingsSnapshot().rootPath,
  getPreferredLanguage: () => libraryService!.settingsService.getSettingsSnapshot().preferredLanguage,
  getRecentPlayedSongPaths: (limit) => libraryService!.historyService.getRecentPlayedSongPaths(limit),
  hideWindow: () => hideMainWindow(),
  showWindow: () => showMainWindow(),
  openAppRoute: (route) => openAppRoute(route),
  sendTrayCommand: (command) => sendTrayCommand(command),
  requestQuit: () => {
    isQuitting = true
    app.quit()
  },
})
const openFileCoordinator = new OpenFileCoordinator()

let hasShownTrayHint = false

app.commandLine.appendSwitch(
  'disable-features',
  'OverlayScrollbar,FluentOverlayScrollbar,FluentOverlayScrollbarMinimalMode,WindowsScrollingPersonality',
)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'smplayer-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: 'smplayer-artwork',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

const feedbackIssueUrl = 'https://github.com/SeakyLuo/SMPlayerEletron/issues'
const feedbackEmailAddress = 'luokiss9@qq.com'
const feedbackEmailSubject = 'Feedback about Simple Melody Player'
const audioDialogExtensions = [...AUDIO_EXTENSIONS].map((extension) => extension.slice(1))
const appWindowBackgroundColor = '#f6f8fb'
const nightAppWindowBackgroundColor = '#101419'
const titleBarOverlayColor = '#00000000'
const nightTitleBarOverlayColor = '#00000000'
const defaultTitleBarSymbolColor = '#111111'
const immersiveTitleBarSymbolColor = '#ffffff'
const windowsAppUserModelId = 'com.seaky.smplayer'

if (process.platform === 'win32') {
  app.setAppUserModelId(windowsAppUserModelId)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
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

if (!gotSingleInstanceLock) {
  app.quit()
}

function enqueuePendingOpenFilePaths(filePaths: string[]) {
  openFileCoordinator.enqueueFilePaths(filePaths)
}

function enqueuePendingOpenSongIds(songIds: number[]) {
  openFileCoordinator.enqueueSongIds(songIds)
}

function takePendingOpenSongIds() {
  return openFileCoordinator.takeSongIds()
}

function takePendingOpenFilePaths() {
  return openFileCoordinator.takeFilePaths()
}

async function openPendingFilePaths() {
  await openAudioFilesFromShell([...takePendingOpenFilePaths(), ...process.argv])
}

function getPackagedAssetPath(assetName: string) {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets', assetName)
    : join(app.getAppPath(), 'src/assets', assetName)
}

function getAppIconPath() {
  const iconFileName = process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets', iconFileName)
    : join(app.getAppPath(), 'public', iconFileName)

  if (existsSync(iconPath)) {
    return iconPath
  }

  const fallbackPath = app.isPackaged
    ? join(process.resourcesPath, 'assets', 'app-icon.png')
    : join(app.getAppPath(), 'public', 'app-icon.png')

  return existsSync(fallbackPath) ? fallbackPath : getPackagedAssetPath('hero.png')
}

function getAppInfo(): AppInfo {
  return {
    platform: process.platform,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
  }
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

function getStartupNightModeActive() {
  const settings = libraryService!.settingsService.getSettingsSnapshot()
  return settings.nightMode === 'on' || (
    settings.nightMode === 'auto' &&
    isClockMinuteInRange(
      getClockMinute(),
      settingsTimeToMinute(settings.nightModeStartTime),
      settingsTimeToMinute(settings.nightModeEndTime),
    )
  )
}

async function openVoiceAssistantPrivacySettings() {
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:privacy-speech')
    return
  }

  await shell.openExternal(process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    : 'https://support.microsoft.com/windows/manage-app-permissions-for-your-microphone-in-windows',
  )
}

async function createWindow() {
  const startupNightModeActive = getStartupNightModeActive()
  const defaultWindowMinimumSize = windowController.getDefaultMinimumSize()
  mainWindow = new BrowserWindow({
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
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, 'preload.mjs'),
      additionalArguments: [
        `--smplayer-startup-night-mode=${startupNightModeActive ? '1' : '0'}`,
      ],
    },
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    if (libraryService!.settingsService.getSettingsSnapshot().quitOnClose) {
      return
    }

    event.preventDefault()
    hideMainWindow()

    if (!hasShownTrayHint && Notification.isSupported()) {
      hasShownTrayHint = true
      new Notification({
        title: 'Simple Melody Player is still running',
        body: 'The window was hidden to the system tray. Use the tray icon to restore or quit.',
        silent: true,
      }).show()
    }
  })
  mainWindow.on('closed', () => {
    windowController.stopDrag()
  })
  mainWindow.on('enter-full-screen', () => windowController.emitFullScreenChange(mainWindow!))
  mainWindow.on('leave-full-screen', () => windowController.emitFullScreenChange(mainWindow!))

  mainWindow.on('show', () => {
    trayController.updateMenu()
  })

  mainWindow.on('hide', () => {
    trayController.updateMenu()
  })
  mainWindow.once('ready-to-show', () => {
    showMainWindow()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined
    callback(permission === 'media' && (mediaTypes === undefined || mediaTypes.includes('audio')))
  })
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media'
  })

  const startupRoute = resolveStartupRoute(libraryService!.settingsService.getSettingsSnapshot().lastPage)
  if (process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL)
    devServerUrl.hash = startupRoute
    await mainWindow.loadURL(devServerUrl.toString())
  } else {
    const indexUrl = pathToFileURL(join(__dirname, '../dist/index.html'))
    indexUrl.hash = startupRoute
    await mainWindow.loadURL(indexUrl.toString())
  }
}

function showMainWindow() {
  if (!mainWindow) {
    return
  }

  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('app:tray-command', 'show-window')
}

function hideMainWindow() {
  if (!mainWindow) {
    return
  }

  mainWindow.setSkipTaskbar(true)
  mainWindow.hide()
}

function openAppRoute(route: string) {
  showMainWindow()
  void mainWindow!.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route)}`)
}

function sendTrayCommand(command: 'scan-library') {
  showMainWindow()
  mainWindow!.webContents.send('app:tray-command', command)
}

async function trashPathIfExists(targetPath: string) {
  try {
    await stat(targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }

  await shell.trashItem(targetPath)
}

function getProtocolSongId(url: string) {
  const parsedUrl = new URL(url)
  const songId = Number(parsedUrl.pathname.slice(1))

  if (!Number.isInteger(songId) || parsedUrl.hostname !== 'song') {
    throw new Error('Invalid media URL.')
  }

  return songId
}

function registerMediaProtocols() {
  protocol.registerFileProtocol('smplayer-media', (request, callback) => {
    const songId = getProtocolSongId(request.url)
    callback({ path: libraryService!.songService.getSongPath(songId) })
  })

  protocol.handle('smplayer-artwork', async (request) => {
    const songId = getProtocolSongId(request.url)
    const artworkUrl = await libraryService!.artworkService.getSongArtworkFileUrl(songId)
    if (!artworkUrl) {
      return new Response(null, { status: 404 })
    }

    const response = await net.fetch(artworkUrl, {
      headers: request.headers,
    })
    const headers = new Headers(response.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('cache-control', 'public, max-age=31536000, immutable')

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  })
}

async function sendFeedbackEmail() {
  const mailtoUrl = new URL(`mailto:${feedbackEmailAddress}`)
  mailtoUrl.searchParams.set('subject', feedbackEmailSubject)
  await shell.openExternal(mailtoUrl.toString())
}

async function openFeedbackInBrowser() {
  await shell.openExternal(feedbackIssueUrl)
}

async function revealSystemLogs() {
  const logsPath = join(app.getPath('userData'), 'Logs')
  await mkdir(logsPath, { recursive: true })
  shell.openPath(logsPath)
}

function getAudioFilePathsFromArgs(args: string[]) {
  return args.filter((arg) =>
    AUDIO_EXTENSIONS.has(extname(arg).toLocaleLowerCase()) && existsSync(arg),
  )
}

async function openAudioFilesFromShell(filePaths: string[]) {
  const audioFilePaths = getAudioFilePathsFromArgs(filePaths)

  if (audioFilePaths.length === 0) {
    return
  }

  if (!libraryService) {
    enqueuePendingOpenFilePaths(audioFilePaths)
    return
  }

  const songIds = await libraryService.externalAudioService.addNextAndPlay(audioFilePaths)
  enqueuePendingOpenSongIds(songIds)
  mainWindow?.webContents.send('app:open-files', songIds)
  showMainWindow()
}

async function resolveMoveConflict(sourcePath: string, targetPath: string) {
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Replace', 'Keep Both', 'Skip'],
        defaultId: 1,
        cancelId: 2,
        message: `A file named "${basename(targetPath)}" already exists in the target folder.`,
        detail: sourcePath,
      })
    : await dialog.showMessageBox({
        type: 'question',
        buttons: ['Replace', 'Keep Both', 'Skip'],
        defaultId: 1,
        cancelId: 2,
        message: `A file named "${basename(targetPath)}" already exists in the target folder.`,
        detail: sourcePath,
      })

  return result.response === 0 ? 'replace' : result.response === 1 ? 'keep-both' : 'skip'
}

app.on('second-instance', (_event, argv) => {
  showMainWindow()
  void openAudioFilesFromShell(argv)
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  void openAudioFilesFromShell([filePath])
})

app.whenReady().then(async () => {
  app.setPath('userData', await resolveUserDataPath())
  libraryService = new DataService(app.getPath('userData'))
  trayController.updateWindowsJumpList()
  remotePlayServer = new RemotePlayServer(
    libraryService.remoteStore,
    libraryService.musicQueryService,
    libraryService.songService,
  )
  if (libraryService.remoteStore.getRemoteShareSettings().shareEnabled) {
    await remotePlayServer.start()
  }
  registerMediaProtocols()

  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('app:take-pending-open-files', () => {
    return takePendingOpenSongIds()
  })
  registerLibraryIpc({
    audioDialogExtensions,
    getWindow: () => mainWindow,
    getLibraryService: () => libraryService!,
    setLibraryService: (nextLibraryService) => {
      libraryService = nextLibraryService
    },
    trashPathIfExists,
    resolveMoveConflict,
    updateWindowsJumpList: () => trayController.updateWindowsJumpList(),
  })
  registerRemoteIpc({
    getLibraryService: () => libraryService!,
    getRemotePlayServer: () => remotePlayServer!,
  })
  registerShellIpc({
    getWindow: () => mainWindow,
    createLocalFolder,
    sendFeedbackEmail,
    openFeedbackInBrowser,
    openVoiceAssistantPrivacySettings,
    recognizeWindowsSpeech: (language) => recognizeWindowsSpeech(language, {
      onHypothesis: (hypothesis) => {
        mainWindow?.webContents.send('voice:recognition-hypothesis', hypothesis)
      },
      onStateChange: (update) => {
        mainWindow?.webContents.send('voice:recognition-state', update)
      },
    }),
    cancelWindowsSpeechRecognition,
    revealSystemLogs,
    showNotifications: () => Boolean(libraryService?.settingsService.getSettingsSnapshot().showNotifications),
    getTrackNotificationBody: (_songId) => Promise.resolve(''),
  })
  registerWindowIpc({
    getWindow: () => mainWindow!,
    windowController,
    appWindowBackgroundColor,
    nightAppWindowBackgroundColor,
    titleBarOverlayColor,
    nightTitleBarOverlayColor,
    defaultTitleBarSymbolColor,
    immersiveTitleBarSymbolColor,
  })
  registerDataIpc({
    getLibraryService: () => libraryService!,
    updateWindowsJumpList: () => trayController.updateWindowsJumpList(),
  })

  await createWindow()
  await openPendingFilePaths()
  trayController.createTray()
  trayController.registerGlobalMediaShortcuts()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
      trayController.createTray()
      return
    }

    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  libraryService?.flush()
  void remotePlayServer?.stop()
})

app.on('will-quit', () => {
  trayController.unregisterGlobalMediaShortcuts()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
