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
  screen,
  shell,
} from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import type {
  AppInfo,
  GlobalMediaCommand,
  HiddenStorageItem,
  PlaylistSortCriterion,
  LocalFolderSortCriterion,
  PreferenceEntityType,
  PreferenceLevel,
  TrackNotificationPayload,
} from '../src/shared/contracts'
import { SmplayerDataStore } from './services/data-store'
import { AUDIO_EXTENSIONS, SMPLAYER_DB_NAME } from './services/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let dataStore: SmplayerDataStore | null = null
let appTray: Tray | null = null
let isQuitting = false
let windowDragInterval: NodeJS.Timeout | null = null

function stopWindowDrag() {
  if (windowDragInterval) {
    clearInterval(windowDragInterval)
    windowDragInterval = null
  }
}

function startWindowDrag() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) {
    return
  }

  stopWindowDrag()
  const startCursor = screen.getCursorScreenPoint()
  const [startX, startY] = mainWindow.getPosition()

  windowDragInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopWindowDrag()
      return
    }

    const cursor = screen.getCursorScreenPoint()
    mainWindow.setPosition(
      Math.round(startX + cursor.x - startCursor.x),
      Math.round(startY + cursor.y - startCursor.y),
    )
  }, 16)
}
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
const audioDialogExtensions = [...AUDIO_EXTENSIONS].map((extension) => extension.slice(1))

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
            color: '#00000000',
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

    if (dataStore!.getSettingsSnapshot().quitOnClose) {
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
  mainWindow.on('closed', () => {
    stopWindowDrag()
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
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined
    callback(permission === 'media' && mediaTypes?.includes('audio') === true)
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

app.whenReady().then(async () => {
  app.setAppUserModelId('com.seaky.smplayer')
  dataStore = new SmplayerDataStore(app.getPath('userData'))
  registerMediaProtocols()

  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('library:get-snapshot', () => dataStore!.getLibrarySnapshot())
  ipcMain.handle('library:get-artwork', (_event, songId: number) => dataStore!.getSongArtwork(songId))
  ipcMain.handle('library:get-song-properties', (_event, songId: number) =>
    dataStore!.getSongProperties(songId),
  )
  ipcMain.handle('library:update-song-properties', (_event, songId: number, update) =>
    dataStore!.updateSongProperties(songId, update),
  )
  ipcMain.handle('library:update-song-play-count', (_event, songId: number, playCount: number) =>
    dataStore!.updateSongPlayCount(songId, playCount),
  )
  ipcMain.handle('library:pick-album-artwork', async (_event, albumName: string) => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          title: 'Choose Album Artwork',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
        })
      : await dialog.showOpenDialog({
          title: 'Choose Album Artwork',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
        })

    if (!result.canceled) {
      dataStore!.setAlbumArtwork(albumName, result.filePaths[0]!)
    }
  })
  ipcMain.handle('library:pick-album-artwork-source', async () => {
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose Album Artwork',
      properties: ['openFile'],
      filters: [
        { name: 'Artwork or Music', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', ...audioDialogExtensions] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
        { name: 'Music', extensions: audioDialogExtensions },
      ],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, sourcePath: '', artworkUrl: '', sourceName: '' }
    }

    const sourcePath = result.filePaths[0]!
    const sourceName = basename(sourcePath, extname(sourcePath))
    const artworkSource = await dataStore!.prepareArtworkSource(sourcePath)
    return {
      canceled: false,
      sourcePath: artworkSource.sourcePath,
      artworkUrl: artworkSource.artworkUrl,
      sourceName,
    }
  })
  ipcMain.handle('library:save-album-artwork', (_event, albumName: string, sourcePath: string) =>
    dataStore!.saveAlbumArtwork(albumName, sourcePath),
  )
  ipcMain.handle('library:delete-album-artwork', (_event, albumName: string) =>
    dataStore!.deleteAlbumArtwork(albumName),
  )
  ipcMain.handle('library:pick-song-artwork-source', async () => {
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose Album Artwork',
      properties: ['openFile'],
      filters: [
        { name: 'Artwork or Music', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', ...audioDialogExtensions] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
        { name: 'Music', extensions: audioDialogExtensions },
      ],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, sourcePath: '', artworkUrl: '', sourceName: '' }
    }

    const sourcePath = result.filePaths[0]!
    const sourceName = basename(sourcePath, extname(sourcePath))
    try {
      const artworkSource = await dataStore!.prepareArtworkSource(sourcePath)
      return {
        canceled: false,
        sourcePath: artworkSource.sourcePath,
        artworkUrl: artworkSource.artworkUrl,
        sourceName,
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'No album art found in the selected music file.') {
        return {
          canceled: false,
          sourcePath: '',
          artworkUrl: '',
          sourceName,
          error: 'error',
        }
      }

      return {
        canceled: false,
        sourcePath: '',
        artworkUrl: '',
        sourceName,
        error: 'no-artwork',
      }
    }
  })
  ipcMain.handle('library:save-song-artwork', (_event, songId: number, sourcePath: string) =>
    dataStore!.saveSongArtwork(songId, sourcePath),
  )
  ipcMain.handle('library:delete-song-artwork', (_event, songId: number) =>
    dataStore!.deleteSongArtwork(songId),
  )
  ipcMain.handle('library:delete-song-from-disk', async (_event, songId: number) => {
    const songPath = dataStore!.getSongPath(songId)
    await stat(songPath)
    await shell.trashItem(songPath)
    dataStore!.deleteSong(songId)
  })
  ipcMain.handle('library:hide-song', (_event, songId: number) => {
    dataStore!.hideSong(songId)
  })
  ipcMain.handle('library:move-song-to-folder', (_event, songId: number, folderPath: string) =>
    dataStore!.moveSongToFolder(songId, folderPath, resolveMoveConflict),
  )
  ipcMain.handle('library:move-songs-to-folder', (_event, songIds: number[], folderPath: string) =>
    dataStore!.moveSongsToFolder(songIds, folderPath, resolveMoveConflict),
  )
  ipcMain.handle('library:move-local-folder-to-folder', (_event, sourceFolderPath: string, targetFolderPath: string) =>
    dataStore!.moveLocalFolderToFolder(sourceFolderPath, targetFolderPath, resolveMoveConflict),
  )
  ipcMain.handle('library:delete-songs-from-disk', async (_event, songIds: number[]) => {
    const songPaths = songIds.map((songId) => dataStore!.getSongPath(songId))
    for (const songPath of songPaths) {
      await stat(songPath)
      await shell.trashItem(songPath)
    }
    dataStore!.deleteSongs(songIds)
  })
  ipcMain.handle('library:delete-local-items', async (_event, songIds: number[], folderPaths: string[]) => {
    const songPaths = songIds
      .map((songId) => dataStore!.getSongPath(songId))
      .filter((songPath) => !folderPaths.some((folderPath) =>
        songPath.startsWith(`${folderPath}\\`) || songPath.startsWith(`${folderPath}/`),
      ))
    for (const songPath of songPaths) {
      await stat(songPath)
      await shell.trashItem(songPath)
    }
    for (const folderPath of folderPaths) {
      await stat(folderPath)
      await shell.trashItem(folderPath)
    }
    dataStore!.deleteLocalItems(songIds, folderPaths)
  })
  ipcMain.handle('library:update-local-folder-sort', (_event, folderPath: string, sortCriterion: LocalFolderSortCriterion) =>
    dataStore!.updateLocalFolderSort(folderPath, sortCriterion),
  )
  ipcMain.handle('library:rename-local-folder', (_event, folderPath: string, name: string) =>
    dataStore!.renameLocalFolder(folderPath, name),
  )
  ipcMain.handle('library:delete-local-folder', async (_event, folderPath: string) => {
    await stat(folderPath)
    await shell.trashItem(folderPath)
    dataStore!.deleteLocalFolder(folderPath)
  })
  ipcMain.handle('library:hide-local-folder', (_event, folderPath: string) => {
    dataStore!.hideLocalFolder(folderPath)
  })
  ipcMain.handle('library:get-hidden-storage-items', () => dataStore!.getHiddenStorageItems())
  ipcMain.handle('library:resume-hidden-storage-item', (_event, item: HiddenStorageItem) => {
    dataStore!.resumeHiddenStorageItem(item)
  })
  ipcMain.handle('preferences:get-settings', () => dataStore!.getPreferenceSettings())
  ipcMain.handle('lyrics:get', (_event, songId: number, mode) => dataStore!.getLyrics(songId, mode))
  ipcMain.handle('lyrics:import', async () => {
    const dialogOptions: OpenDialogOptions = {
      title: 'Import Lyrics',
      properties: ['openFile'],
      filters: [
        { name: 'Lyrics or Music', extensions: ['lrc', 'txt', ...audioDialogExtensions] },
        { name: 'Lyrics', extensions: ['lrc', 'txt'] },
        { name: 'Music', extensions: audioDialogExtensions },
      ],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, rawText: '' }
    }

    return {
      canceled: false,
      rawText: await dataStore!.readLyricsFromFile(result.filePaths[0]!),
    }
  })
  ipcMain.handle('lyrics:save', (_event, songId: number, rawLyrics: string) =>
    dataStore!.saveSongLyrics(songId, rawLyrics),
  )
  ipcMain.handle('lyrics:open-search-browser', (_event, songId: number) =>
    shell.openExternal(dataStore!.getLyricsSearchUrl(songId)),
  )
  ipcMain.handle('lyrics:save-internet-to-file', (_event, songId: number) =>
    dataStore!.saveInternetLyricsToFile(songId),
  )
  ipcMain.handle('shell:reveal-item', async (_event, itemPath: string) => {
    await stat(itemPath)
    shell.showItemInFolder(itemPath)
  })
  ipcMain.handle('window:start-drag', () => {
    startWindowDrag()
  })
  ipcMain.handle('window:stop-drag', () => {
    stopWindowDrag()
  })
  ipcMain.handle('shell:create-local-folder', async (_event, rootPath: string, relativePath: string, name: string) => {
    await mkdir(join(rootPath, relativePath, name), { recursive: true })
  })
  ipcMain.handle('shell:send-feedback-email', () => sendFeedbackEmail())
  ipcMain.handle('shell:open-feedback-browser', () => openFeedbackInBrowser())
  ipcMain.handle('shell:open-voice-assistant-privacy-settings', () => openVoiceAssistantPrivacySettings())
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
  ipcMain.handle('library:scan-folder', async (_event, folderPath: string) =>
    dataStore!.scanLocalFolder(folderPath),
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
  ipcMain.handle('playlist:create', (_event, name: string, songIds?: number[]) => dataStore!.createPlaylist(name, songIds))
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
  ipcMain.handle('playlist:reorder-songs', (_event, playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) =>
    dataStore!.reorderPlaylistSongs(playlistId, songIds, sortCriterion),
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
  ipcMain.handle('preferences:add-item', (_event, type: PreferenceEntityType, itemId: string, name: string, level?: PreferenceLevel) =>
    dataStore!.addPreferenceItem(type, itemId, name, level),
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
