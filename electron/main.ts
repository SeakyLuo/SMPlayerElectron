import {
  Menu,
  Notification,
  Tray,
  app,
  nativeImage,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  shell,
} from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import type { AppInfo, GlobalMediaCommand, TrackNotificationPayload } from '../src/shared/contracts'
import { SmplayerDataStore } from './services/data-store'
import { SMPLAYER_DB_NAME } from './services/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let dataStore: SmplayerDataStore | null = null
let appTray: Tray | null = null
let isQuitting = false
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
const feedbackEmailSubject = 'Feedbacks about SMPlayer'

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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#f6f8fb',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: '#f6f8fb',
            symbolColor: '#111111',
            height: 44,
          }
        : undefined,
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: 'active',
    title: '简音播放器',
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, 'preload.mjs'),
    },
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    hideMainWindow()

    if (!hasShownTrayHint && Notification.isSupported()) {
      hasShownTrayHint = true
      new Notification({
        title: 'SMPlayer is still running',
        body: 'The window was hidden to the system tray. Use the tray icon to restore or quit.',
        silent: true,
      }).show()
    }
  })

  mainWindow.on('show', () => {
    updateTrayMenu()
  })

  mainWindow.on('hide', () => {
    updateTrayMenu()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

function getTrayIcon() {
  const icon = nativeImage.createFromPath(getAppIconPath())

  if (process.platform === 'win32') {
    return icon.resize({ width: 16, height: 16 })
  }

  return icon.resize({ width: 18, height: 18 })
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
}

function hideMainWindow() {
  if (!mainWindow) {
    return
  }

  mainWindow.setSkipTaskbar(true)
  mainWindow.hide()
}

function updateTrayMenu() {
  if (!appTray) {
    return
  }

  const isWindowVisible = Boolean(mainWindow?.isVisible())
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isWindowVisible ? 'Hide SMPlayer' : 'Show SMPlayer',
      click: () => {
        if (isWindowVisible) {
          hideMainWindow()
        } else {
          showMainWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  appTray.setContextMenu(contextMenu)
  appTray.setToolTip('SMPlayer')
}

function createTray() {
  if (appTray) {
    return
  }

  appTray = new Tray(getTrayIcon())
  appTray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      hideMainWindow()
    } else {
      showMainWindow()
    }
  })
  appTray.on('click', () => {
    if (mainWindow?.isVisible()) {
      hideMainWindow()
    } else {
      showMainWindow()
    }
  })

  updateTrayMenu()
}

function sendGlobalMediaCommand(command: GlobalMediaCommand) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('playback:global-media-command', command)
}

function registerGlobalMediaShortcuts() {
  const shortcuts: Array<[string, GlobalMediaCommand]> = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['MediaStop', 'stop'],
  ]

  for (const [accelerator, command] of shortcuts) {
    globalShortcut.register(accelerator, () => {
      sendGlobalMediaCommand(command)
    })
  }
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
  protocol.handle('smplayer-media', (request) => {
    const songId = getProtocolSongId(request.url)
    return net.fetch(dataStore!.getSongFileUrl(songId), {
      headers: request.headers,
    })
  })

  protocol.handle('smplayer-artwork', async (request) => {
    const songId = getProtocolSongId(request.url)
    const artworkUrl = await dataStore!.getSongArtworkFileUrl(songId)
    if (!artworkUrl) {
      return new Response(null, { status: 404 })
    }

    return net.fetch(artworkUrl, {
      headers: request.headers,
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

app.whenReady().then(async () => {
  app.setAppUserModelId('com.seaky.smplayer')
  dataStore = new SmplayerDataStore(app.getPath('userData'))
  registerMediaProtocols()

  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('library:get-snapshot', () => dataStore!.getLibrarySnapshot())
  ipcMain.handle('library:get-artwork', (_event, songId: number) => dataStore!.getSongArtwork(songId))
  ipcMain.handle('library:delete-song-from-disk', async (_event, songId: number) => {
    await shell.trashItem(dataStore!.getSongPath(songId))
    dataStore!.deleteSong(songId)
  })
  ipcMain.handle('preferences:get-settings', () => dataStore!.getPreferenceSettings())
  ipcMain.handle('lyrics:get', (_event, songId: number, mode) => dataStore!.getLyrics(songId, mode))
  ipcMain.handle('lyrics:save-internet-to-file', (_event, songId: number) =>
    dataStore!.saveInternetLyricsToFile(songId),
  )
  ipcMain.handle('shell:reveal-item', (_event, itemPath: string) => {
    shell.showItemInFolder(itemPath)
  })
  ipcMain.handle('shell:send-feedback-email', () => sendFeedbackEmail())
  ipcMain.handle('shell:open-feedback-browser', () => openFeedbackInBrowser())
  ipcMain.handle('shell:reveal-system-logs', () => revealSystemLogs())
  ipcMain.handle('shell:show-track-notification', async (_event, track: TrackNotificationPayload) => {
    if (!Notification.isSupported()) {
      return
    }

    if (!dataStore?.getSettingsSnapshot().showNotifications) {
      return
    }

    const lyricsPreview = await dataStore.getTrackNotificationBody(track.songId)
    const defaultBody = [track.artist, track.album].filter(Boolean).join(' - ') || 'SMPlayer'

    const notification = new Notification({
      title: track.title,
      body: lyricsPreview || defaultBody,
      silent: false,
    })

    notification.on('click', () => {
      if (!mainWindow) {
        return
      }

      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    })

    notification.show()
  })
  ipcMain.handle('library:pick-root', async () => {
    const snapshot = dataStore!.getLibrarySnapshot()
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose Music Library Folder',
      defaultPath: snapshot.settings.rootPath || app.getPath('music'),
      properties: ['openDirectory'],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { rootPath: null }
    }

    const [rootPath] = result.filePaths
    dataStore!.setRootPath(rootPath)

    return { rootPath }
  })
  ipcMain.handle('library:scan', async (_event, requestedRootPath?: string) =>
    dataStore!.scanLibrary(requestedRootPath),
  )
  ipcMain.handle('data:export', async () => {
    const dialogOptions: SaveDialogOptions = {
      title: 'Export Data',
      defaultPath: join(app.getPath('documents'), SMPLAYER_DB_NAME),
      filters: [{ name: 'SMPlayer Database', extensions: ['db'] }],
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return { canceled: true, path: null }
    }

    dataStore!.flush()
    await copyFile(join(app.getPath('userData'), SMPLAYER_DB_NAME), result.filePath)
    return { canceled: false, path: result.filePath }
  })
  ipcMain.handle('data:import', async () => {
    const dialogOptions: OpenDialogOptions = {
      title: 'Import Data',
      defaultPath: app.getPath('documents'),
      filters: [{ name: 'SMPlayer Database', extensions: ['db'] }],
      properties: ['openFile'],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }

    const [sourcePath] = result.filePaths
    const currentRootPath = dataStore!.getSettingsSnapshot().rootPath
    const targetPath = join(app.getPath('userData'), SMPLAYER_DB_NAME)
    dataStore!.close()
    await mkdir(app.getPath('userData'), { recursive: true })
    await copyFile(sourcePath, targetPath)
    dataStore = new SmplayerDataStore(app.getPath('userData'))
    const importedRootPath = dataStore.getSettingsSnapshot().rootPath
    if (currentRootPath && importedRootPath && currentRootPath !== importedRootPath) {
      dataStore.replaceRootPathReferences(importedRootPath, currentRootPath)
    }
    return { canceled: false, path: sourcePath }
  })
  ipcMain.handle('library:set-favorite', (_event, songId: number, favorite: boolean) =>
    dataStore!.setSongFavorite(songId, favorite),
  )
  ipcMain.handle('library:update-song-duration', (_event, songId: number, duration: number) =>
    dataStore!.updateSongDuration(songId, duration),
  )
  ipcMain.handle('playlist:create', (_event, name: string) => dataStore!.createPlaylist(name))
  ipcMain.handle('playlist:delete', (_event, playlistId: number) =>
    dataStore!.deletePlaylist(playlistId),
  )
  ipcMain.handle('playlist:rename', (_event, playlistId: number, name: string) =>
    dataStore!.renamePlaylist(playlistId, name),
  )
  ipcMain.handle('playlist:reorder', (_event, playlistIds: number[]) =>
    dataStore!.reorderPlaylists(playlistIds),
  )
  ipcMain.handle('playlist:add-song', (_event, playlistId: number, songId: number) =>
    dataStore!.addSongToPlaylist(playlistId, songId),
  )
  ipcMain.handle('playlist:add-songs', (_event, playlistId: number, songIds: number[]) =>
    dataStore!.addSongsToPlaylist(playlistId, songIds),
  )
  ipcMain.handle('playlist:remove-song', (_event, playlistId: number, songId: number) =>
    dataStore!.removeSongFromPlaylist(playlistId, songId),
  )
  ipcMain.handle('playlist:remove-songs', (_event, playlistId: number, songIds: number[]) =>
    dataStore!.removeSongsFromPlaylist(playlistId, songIds),
  )
  ipcMain.handle('playlist:reorder-songs', (_event, playlistId: number, songIds: number[]) =>
    dataStore!.reorderPlaylistSongs(playlistId, songIds),
  )
  ipcMain.handle('queue:replace', (_event, songIds: number[]) => dataStore!.replaceNowPlaying(songIds))
  ipcMain.handle('queue:remove-song', (_event, songId: number) =>
    dataStore!.removeSongFromNowPlaying(songId),
  )
  ipcMain.handle('queue:clear', () => dataStore!.clearNowPlaying())
  ipcMain.handle('search:save-query', (_event, query: string) => dataStore!.saveSearchQuery(query))
  ipcMain.handle('search:add-recent', (_event, query: string) => dataStore!.addRecentSearch(query))
  ipcMain.handle('search:remove-recent', (_event, entryId: number) =>
    dataStore!.removeRecentSearch(entryId),
  )
  ipcMain.handle('search:remove-recents', (_event, entryIds: number[]) =>
    dataStore!.removeRecentSearches(entryIds),
  )
  ipcMain.handle('search:clear-recent', () => dataStore!.clearRecentSearches())
  ipcMain.handle('recent-played:remove', (_event, songIds: number[]) =>
    dataStore!.removeRecentPlayed(songIds),
  )
  ipcMain.handle('recent-played:clear', () => dataStore!.clearRecentPlayed())
  ipcMain.handle('settings:update', (_event, update) => dataStore!.updateSettings(update))
  ipcMain.handle('preferences:update-settings', (_event, update) =>
    dataStore!.updatePreferenceSettings(update),
  )
  ipcMain.handle('preferences:update-item', (_event, itemId: number, update) =>
    dataStore!.updatePreferenceItem(itemId, update),
  )
  ipcMain.handle('preferences:remove-item', (_event, itemId: number) =>
    dataStore!.removePreferenceItem(itemId),
  )
  ipcMain.handle('preferences:clear-invalid', (_event, type) =>
    dataStore!.clearInvalidPreferenceItems(type),
  )
  ipcMain.handle('view-state:save', (_event, update) => dataStore!.saveViewState(update))
  ipcMain.handle('playback:save-settings', (_event, update) =>
    dataStore!.savePlaybackSettings(update),
  )
  ipcMain.handle('playback:mark-song-played', (_event, songId: number) =>
    dataStore!.markSongPlayed(songId),
  )

  await createWindow()
  createTray()
  registerGlobalMediaShortcuts()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
      createTray()
      return
    }

    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
