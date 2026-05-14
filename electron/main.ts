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
import { createMoveConflictResolver, trashPathIfExists } from './services/local-file-actions'
import { ExternalAudioFileOpener } from './services/open-file-coordinator'
import { registerMediaProtocols, registerMediaProtocolSchemes } from './services/media-protocols'
import { RemotePlayServer } from './services/remote-play-server'
import { resolveUserDataPath } from './services/user-data-path'
import {
  cancelWindowsSpeechRecognition,
  recognizeWindowsSpeech,
} from './services/windows-speech-recognition'
import type { TrayCommand } from '../src/shared/contracts'
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
const resolveMoveConflict = createMoveConflictResolver(() => mainWindow)

app.commandLine.appendSwitch(
  'disable-features',
  'OverlayScrollbar,FluentOverlayScrollbar,FluentOverlayScrollbarMinimalMode,WindowsScrollingPersonality',
)

registerMediaProtocolSchemes()

const audioDialogExtensions = [...AUDIO_EXTENSIONS].map((extension) => extension.slice(1))
const windowsAppUserModelId = 'com.seaky.smplayer'

if (process.platform === 'win32') {
  app.setAppUserModelId(windowsAppUserModelId)
}

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

app.on('second-instance', (_event, argv) => {
  showMainWindow()
  void externalAudioFileOpener.openFromShell(argv)
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  void externalAudioFileOpener.openFromShell([filePath])
})

app.whenReady().then(async () => {
  app.setPath('userData', await resolveUserDataPath())
  libraryService = new DataService(app.getPath('userData'))
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
    setTrayPlaybackState: (isPlaying) => trayController.setPlaybackState(isPlaying),
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
    updateTrayMenu: () => trayController.updateMenu(),
    updateWindowsJumpList: () => trayController.updateWindowsJumpList(),
  })

  await createWindow()
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
  trayController.unregisterGlobalMediaShortcuts()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
