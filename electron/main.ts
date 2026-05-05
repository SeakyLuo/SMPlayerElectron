import { Menu, Notification, Tray, app, nativeImage, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { OpenDialogOptions } from 'electron'
import type { AppInfo, TrackNotificationPayload } from '../src/shared/contracts'
import { SmplayerDataStore } from './services/data-store'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let dataStore: SmplayerDataStore | null = null
let appTray: Tray | null = null
let isQuitting = false
let hasShownTrayHint = false

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
    backgroundColor: '#f7efe6',
    title: 'SMPlayer',
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
  const iconPath = join(app.getAppPath(), 'src/assets/hero.png')
  const icon = nativeImage.createFromPath(iconPath)

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

app.whenReady().then(async () => {
  app.setAppUserModelId('com.seaky.smplayer')
  dataStore = new SmplayerDataStore(app.getPath('userData'))

  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('library:get-snapshot', () => dataStore!.getLibrarySnapshot())
  ipcMain.handle('lyrics:get', (_event, songId: number, mode) => dataStore!.getLyrics(songId, mode))
  ipcMain.handle('shell:reveal-item', (_event, itemPath: string) => {
    shell.showItemInFolder(itemPath)
  })
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
  ipcMain.handle('library:set-favorite', (_event, songId: number, favorite: boolean) =>
    dataStore!.setSongFavorite(songId, favorite),
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
  ipcMain.handle('search:clear-recent', () => dataStore!.clearRecentSearches())
  ipcMain.handle('settings:update', (_event, update) => dataStore!.updateSettings(update))
  ipcMain.handle('view-state:save', (_event, update) => dataStore!.saveViewState(update))
  ipcMain.handle('playback:save-settings', (_event, update) =>
    dataStore!.savePlaybackSettings(update),
  )
  ipcMain.handle('playback:mark-song-played', (_event, songId: number) =>
    dataStore!.markSongPlayed(songId),
  )

  await createWindow()
  createTray()

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
