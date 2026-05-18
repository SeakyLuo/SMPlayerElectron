import {
  app,
  BrowserWindow,
} from 'electron'

import {
  appWindowBackgroundColor,
  createMainWindow,
  defaultTitleBarSymbolColor,
  immersiveTitleBarSymbolColor,
  nightAppWindowBackgroundColor,
  nightTitleBarOverlayColor,
  titleBarOverlayColor,
} from './app-window'
import { DataService } from './services/data-service'
import { AUDIO_EXTENSIONS } from './services/constants'
import { getAppIconPath } from './services/app-assets'
import { registerAppCenterCrashReporting } from './services/app-center-crash-reporter'
import { extractExternalCommandUrls, parseExternalCommandUrl } from './services/external-command-service'
import { createMoveConflictResolver, trashPathIfExists } from './services/local-file-actions'
import { ExternalAudioFileOpener } from './services/open-file-coordinator'
import { registerMediaProtocols, registerMediaProtocolSchemes } from './services/media-protocols'
import { RemotePlayServer } from './services/remote-play-server'
import { resolveUserDataPath } from './services/user-data-path'
import {
  cancelWindowsSpeechRecognition,
  recognizeWindowsSpeech,
} from './services/windows-speech-recognition'
import type { ExternalAppCommand, PreferredLanguage, TrayCommand } from '../src/shared/contracts'
import { createTranslator } from '../src/shared/i18n'
import { DesktopLyricsWindowController } from './desktop-lyrics-window'
import { registerAppIpc } from './ipc/app-ipc'
import { registerDataIpc } from './ipc/data-ipc'
import { registerLibraryIpc } from './ipc/library-ipc'
import { registerRemoteIpc } from './ipc/remote-ipc'
import { registerShellIpc } from './ipc/shell-ipc'
import { registerWindowIpc } from './ipc/window-ipc'
import { TrayController } from './tray-controller'
import { WindowController } from './window-controller'

let mainWindow: BrowserWindow | null = null
let libraryService: DataService | null = null
let remotePlayServer: RemotePlayServer | null = null
let isQuitting = false
let committingPendingDeletesBeforeQuit = false
let externalCommandRendererReady = false
const pendingExternalCommands: ExternalAppCommand[] = []
const windowController = new WindowController()
const trayController = new TrayController({
  getWindow: () => mainWindow,
  getAppIconPath,
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
const externalAudioFileOpener = new ExternalAudioFileOpener({
  getLibraryService: () => libraryService,
  getWindow: () => mainWindow,
  showWindow: () => showMainWindow(),
})
const desktopLyricsWindowController = new DesktopLyricsWindowController({
  getSettings: () => libraryService!.settingsService.getSettingsSnapshot(),
  getAppIconPath,
  saveBounds: (bounds) => {
    libraryService!.settingsService.updateSettings({ desktopLyricsBounds: JSON.stringify(bounds) })
  },
  sendCommand: (command) => {
    if (command.type === 'open-settings') {
      showMainWindow()
    }
    mainWindow?.webContents.send('desktop-lyrics:command', command)
  },
})
const resolveMoveConflict = createMoveConflictResolver(() => mainWindow)

app.commandLine.appendSwitch(
  'disable-features',
  'OverlayScrollbar,FluentOverlayScrollbar,FluentOverlayScrollbarMinimalMode,WindowsScrollingPersonality',
)

registerMediaProtocolSchemes()

const audioDialogExtensions = [...AUDIO_EXTENSIONS].map((extension) => extension.slice(1))
const windowsAppUserModelId = 'com.seaky.simplemelodyplayer'

function getPreferredLanguage(): PreferredLanguage {
  return libraryService?.settingsService.getSettingsSnapshot().preferredLanguage ?? 'system'
}

function updateAppName(preferredLanguage = getPreferredLanguage()) {
  app.setName(createTranslator(preferredLanguage, app.getLocale())('app.shell'))
}

updateAppName()

if (process.platform === 'win32') {
  app.setAppUserModelId(windowsAppUserModelId)
}

app.setAsDefaultProtocolClient('smplayer')
registerAppCenterCrashReporting()

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

async function createWindow() {
  await createMainWindow({
    windowController,
    getSettings: () => libraryService!.settingsService.getSettingsSnapshot(),
    getAppIconPath,
    isQuitting: () => isQuitting,
    onCreated: (window) => {
      mainWindow = window
    },
    hideWindow: () => hideMainWindow(),
    showWindow: () => showMainWindow(),
    updateTrayMenu: () => trayController.updateMenu(),
    saveWindowState: (state) => {
      libraryService!.settingsService.saveMainWindowState({
        bounds: JSON.stringify(state.bounds),
        maximized: state.maximized,
      })
    },
  })
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

function sendTrayCommand(command: TrayCommand) {
  showMainWindow()
  mainWindow!.webContents.send('app:tray-command', command)
}

function takePendingExternalCommands() {
  externalCommandRendererReady = true
  return pendingExternalCommands.splice(0)
}

function dispatchExternalCommand(command: ExternalAppCommand) {
  if (!mainWindow || !externalCommandRendererReady) {
    pendingExternalCommands.push(command)
    showMainWindow()
    return
  }

  showMainWindow()
  mainWindow.webContents.send('app:external-command', command)
}

function dispatchExternalCommandUrls(argv: string[]) {
  for (const rawUrl of extractExternalCommandUrls(argv)) {
    const command = parseExternalCommandUrl(rawUrl)
    if (command) {
      dispatchExternalCommand(command)
    }
  }
}

app.on('second-instance', (_event, argv) => {
  showMainWindow()
  dispatchExternalCommandUrls(argv)
  void externalAudioFileOpener.openFromShell(argv)
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  dispatchExternalCommandUrls([url])
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  void externalAudioFileOpener.openFromShell([filePath])
})

app.whenReady().then(async () => {
  app.setPath('userData', await resolveUserDataPath())
  libraryService = new DataService(app.getPath('userData'))
  updateAppName()
  await libraryService.pendingSongDeleteService.commitAll()
  trayController.updateWindowsJumpList()
  remotePlayServer = new RemotePlayServer(
    libraryService.remoteStore,
    libraryService.musicQueryService,
    libraryService.songService,
  )
  if (libraryService.remoteStore.getRemoteShareSettings().shareEnabled) {
    await remotePlayServer.start()
  }
  registerMediaProtocols(() => libraryService!)

  registerAppIpc({
    takePendingOpenSongIds: () => externalAudioFileOpener.takePendingSongIds(),
    takePendingExternalCommands,
    setTrayPlaybackState: (isPlaying) => trayController.setPlaybackState(isPlaying),
    updateDesktopLyricsState: (state) => desktopLyricsWindowController.updateState(state),
    requestDesktopLyricsCommand: (command) => desktopLyricsWindowController.requestCommand(command),
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
    recognizeWindowsSpeech: (language) => recognizeWindowsSpeech(language, {
      onHypothesis: (hypothesis) => {
        mainWindow?.webContents.send('voice:recognition-hypothesis', hypothesis)
      },
      onStateChange: (update) => {
        mainWindow?.webContents.send('voice:recognition-state', update)
      },
    }),
    cancelWindowsSpeechRecognition,
    showNotifications: () => Boolean(libraryService?.settingsService.getSettingsSnapshot().showNotifications),
    getTrackNotificationBody: () => Promise.resolve(''),
    getNotificationIconPath: getAppIconPath,
    windowsAppUserModelId,
    getPreferredLanguage: () => libraryService?.settingsService.getSettingsSnapshot().preferredLanguage ?? 'system',
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
    updateAppName,
    updateTrayMenu: () => trayController.updateMenu(),
    updateWindowsJumpList: () => trayController.updateWindowsJumpList(),
  })

  await createWindow()
  dispatchExternalCommandUrls(process.argv)
  await externalAudioFileOpener.openPendingFromArgv(process.argv)
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

app.on('before-quit', (event) => {
  if (!committingPendingDeletesBeforeQuit && libraryService?.pendingSongDeleteService.hasPending()) {
    event.preventDefault()
    committingPendingDeletesBeforeQuit = true
    void libraryService.pendingSongDeleteService.commitAll().finally(() => app.quit())
    isQuitting = true
    return
  }
  isQuitting = true
  libraryService?.flush()
  void remotePlayServer?.stop()
})

app.on('will-quit', () => {
  desktopLyricsWindowController.close()
  trayController.unregisterGlobalMediaShortcuts()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
