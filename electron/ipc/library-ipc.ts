import { copyFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { app, dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'

import type {
  HiddenStorageItem,
  LocalFolderSortCriterion,
  ScanLibraryProgress,
} from '../../src/shared/contracts'
import { SMPLAYER_DB_NAME } from '../services/constants'
import { DataService } from '../services/data-service'
import type { MoveConflictResolver } from '../services/local-item-service'

interface LibraryIpcOptions {
  audioDialogExtensions: string[]
  getWindow: () => BrowserWindow | null
  getLibraryService: () => DataService
  setLibraryService: (libraryService: DataService) => void
  trashPathIfExists: (targetPath: string) => Promise<void>
  resolveMoveConflict: MoveConflictResolver
  updateWindowsJumpList: () => void
}

const canceledLocalFolderScanOperationIds = new Set<string>()

export function registerLibraryIpc(options: LibraryIpcOptions) {
  const getLibraryService = options.getLibraryService
  const getMusicQueryService = () => getLibraryService().musicQueryService
  const getArtworkService = () => getLibraryService().artworkService
  const getSongService = () => getLibraryService().songService
  const getLocalItemService = () => getLibraryService().localItemService
  const getHiddenItemService = () => getLibraryService().hiddenItemService
  const getPreferenceService = () => getLibraryService().preferenceService
  const getLyricsService = () => getLibraryService().lyricsService
  const getSettingsService = () => getLibraryService().settingsService
  const getScanService = () => getLibraryService().scanService

  ipcMain.handle('library:get-settings', () => getMusicQueryService().getSettings())
  ipcMain.handle('library:get-counts', () => getMusicQueryService().getCounts())
  ipcMain.handle('library:get-songs', () => getMusicQueryService().getSongs())
  ipcMain.handle('library:get-folders', () => getMusicQueryService().getFolders())
  ipcMain.handle('library:get-recent-songs', () => getMusicQueryService().getRecentSongs())
  ipcMain.handle('library:get-recent-playlists', () => getMusicQueryService().getRecentPlaylists())
  ipcMain.handle('library:get-recent-albums', () => getMusicQueryService().getRecentAlbums())
  ipcMain.handle('library:get-recent-artists', () => getMusicQueryService().getRecentArtists())
  ipcMain.handle('library:get-playlists', () => getMusicQueryService().getPlaylists())
  ipcMain.handle('library:get-favorites', () => getMusicQueryService().getFavorites())
  ipcMain.handle('library:get-now-playing', () => getMusicQueryService().getNowPlaying())
  ipcMain.handle('library:get-search', () => getMusicQueryService().getSearch())
  ipcMain.handle('library:get-artwork-snapshot', (_event, songId: number) =>
    getArtworkService().getSongArtworkSnapshot(songId),
  )
  ipcMain.handle('library:get-artwork-snapshots', (_event, songIds: number[]) =>
    getArtworkService().getSongArtworkSnapshots(songIds),
  )
  ipcMain.handle('library:get-song-properties', (_event, songId: number) =>
    getSongService().getSongProperties(songId),
  )
  ipcMain.handle('library:update-song-properties', (_event, songId: number, update) =>
    getSongService().updateSongProperties(songId, update),
  )
  ipcMain.handle('library:update-song-play-count', (_event, songId: number, playCount: number) =>
    getSongService().updateSongPlayCount(songId, playCount),
  )
  ipcMain.handle('library:pick-album-artwork', async (_event, albumName: string) => {
    const result = await showOpenDialog(options.getWindow(), {
      title: 'Choose Album Artwork',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    })

    if (!result.canceled) {
      getArtworkService().setAlbumArtwork(albumName, result.filePaths[0]!)
    }
  })
  ipcMain.handle('library:pick-album-artwork-source', async () =>
    pickArtworkSource(options, false),
  )
  ipcMain.handle('library:save-album-artwork', (_event, albumName: string, sourcePath: string) =>
    getArtworkService().saveAlbumArtwork(albumName, sourcePath),
  )
  ipcMain.handle('library:delete-album-artwork', (_event, albumName: string) =>
    getArtworkService().deleteAlbumArtwork(albumName),
  )
  ipcMain.handle('library:pick-song-artwork-source', async () =>
    pickArtworkSource(options, true),
  )
  ipcMain.handle('library:save-song-artwork', (_event, songId: number, sourcePath: string) =>
    getArtworkService().saveSongArtwork(songId, sourcePath),
  )
  ipcMain.handle('library:delete-song-artwork', (_event, songId: number) =>
    getArtworkService().deleteSongArtwork(songId),
  )
  ipcMain.handle('library:delete-song-from-disk', async (_event, songId: number) => {
    const songPath = getSongService().getSongPath(songId)
    await options.trashPathIfExists(songPath)
    getLocalItemService().deleteSong(songId)
  })
  ipcMain.handle('library:hide-song', (_event, songId: number) => {
    getLocalItemService().hideSong(songId)
  })
  ipcMain.handle('library:move-song-to-folder', (_event, songId: number, folderPath: string) =>
    getLocalItemService().moveSongToFolder(songId, folderPath, options.resolveMoveConflict),
  )
  ipcMain.handle('library:move-songs-to-folder', (_event, songIds: number[], folderPath: string) =>
    getLocalItemService().moveSongsToFolder(songIds, folderPath, options.resolveMoveConflict),
  )
  ipcMain.handle('library:move-local-folder-to-folder', (_event, sourceFolderPath: string, targetFolderPath: string) =>
    getLocalItemService().moveLocalFolderToFolder(sourceFolderPath, targetFolderPath, options.resolveMoveConflict),
  )
  ipcMain.handle('library:move-local-items-to-folder', (_event, songIds: number[], folderPaths: string[], targetFolderPath: string) =>
    getLocalItemService().moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath, options.resolveMoveConflict),
  )
  ipcMain.handle('library:delete-songs-from-disk', async (_event, songIds: number[]) => {
    const songPaths = getSongService().getSongPaths(songIds)
    for (const songPath of songPaths) {
      await options.trashPathIfExists(songPath)
    }
    getLocalItemService().deleteSongs(songIds, songPaths)
  })
  ipcMain.handle('library:delete-local-items', async (_event, songIds: number[], folderPaths: string[]) => {
    const songPaths = getSongService().getSongPaths(songIds)
    const standaloneSongPaths = songPaths.filter((songPath) => !folderPaths.some((folderPath) =>
        songPath.startsWith(`${folderPath}\\`) || songPath.startsWith(`${folderPath}/`),
      ))
    for (const songPath of standaloneSongPaths) {
      await options.trashPathIfExists(songPath)
    }
    for (const folderPath of folderPaths) {
      await options.trashPathIfExists(folderPath)
    }
    getLocalItemService().deleteLocalItems(songIds, folderPaths, songPaths)
  })
  ipcMain.handle('library:update-local-folder-sort', (_event, folderPath: string, sortCriterion: LocalFolderSortCriterion) =>
    getLocalItemService().updateLocalFolderSort(folderPath, sortCriterion),
  )
  ipcMain.handle('library:rename-local-folder', (_event, folderPath: string, name: string) =>
    getLocalItemService().renameLocalFolder(folderPath, name),
  )
  ipcMain.handle('library:delete-local-folder', async (_event, folderPath: string) => {
    await options.trashPathIfExists(folderPath)
    getLocalItemService().deleteLocalFolder(folderPath)
  })
  ipcMain.handle('library:hide-local-folder', (_event, folderPath: string) => {
    getHiddenItemService().hideFolder(folderPath)
  })
  ipcMain.handle('library:get-hidden-storage-items', () => getHiddenItemService().getItems())
  ipcMain.handle('library:resume-hidden-storage-item', (_event, item: HiddenStorageItem) => {
    getHiddenItemService().resume(item)
  })
  ipcMain.handle('preferences:get-settings', () => getPreferenceService().getPreferenceSettings())
  ipcMain.handle('lyrics:get', (_event, songId: number, mode) => getLyricsService().getLyrics(songId, mode))
  ipcMain.handle('lyrics:import', async () => {
    const result = await showOpenDialog(options.getWindow(), {
      title: 'Import Lyrics',
      properties: ['openFile'],
      filters: [
        { name: 'Lyrics or Music', extensions: ['lrc', 'txt', ...options.audioDialogExtensions] },
        { name: 'Lyrics', extensions: ['lrc', 'txt'] },
        { name: 'Music', extensions: options.audioDialogExtensions },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, rawText: '' }
    }

    return {
      canceled: false,
      rawText: await getLyricsService().readLyricsFromFile(result.filePaths[0]!),
    }
  })
  ipcMain.handle('lyrics:save', (_event, songId: number, rawLyrics: string) =>
    getLyricsService().saveSongLyrics(songId, rawLyrics),
  )
  ipcMain.handle('lyrics:open-search-browser', (_event, songId: number) =>
    shell.openExternal(getLyricsService().getLyricsSearchUrl(songId)),
  )
  ipcMain.handle('lyrics:save-internet-to-file', (_event, songId: number) =>
    getLyricsService().saveInternetLyricsToFile(songId),
  )
  ipcMain.handle('library:pick-root', async () => {
    const settings = getSettingsService().getSettingsSnapshot()
    const result = await showOpenDialog(options.getWindow(), {
      title: 'Choose Music Library Folder',
      defaultPath: settings.rootPath || app.getPath('music'),
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { rootPath: null }
    }

    const [rootPath] = result.filePaths
    getSettingsService().setRootPath(rootPath)

    return { rootPath }
  })
  ipcMain.handle('library:scan', async (_event, requestedRootPath?: string) =>
    getScanService().scanAll(requestedRootPath),
  )
  ipcMain.handle('library:prepare-scan-folder', async (_event, folderPath: string) =>
    getScanService().prepareFolderScan(folderPath),
  )
  ipcMain.handle('library:scan-folder', async (event, folderPath: string, operationId?: string, progressMax?: number) => {
    if (operationId) {
      canceledLocalFolderScanOperationIds.delete(operationId)
    }

    try {
      return await getScanService().scanFolder(folderPath, {
        operationId,
        progressMax,
        isCanceled: () => operationId ? canceledLocalFolderScanOperationIds.has(operationId) : false,
        onProgress: (progress: ScanLibraryProgress) => {
          event.sender.send('library:scan-folder-progress', progress)
        },
      })
    } finally {
      if (operationId) {
        canceledLocalFolderScanOperationIds.delete(operationId)
      }
    }
  })
  ipcMain.handle('library:cancel-scan-folder', (_event, operationId: string) => {
    canceledLocalFolderScanOperationIds.add(operationId)
  })
  ipcMain.handle('data:export', async () => {
    const result = await showSaveDialog(options.getWindow(), {
      title: 'Export Data',
      defaultPath: join(app.getPath('documents'), SMPLAYER_DB_NAME),
      filters: [{ name: 'Simple Melody Player Database', extensions: ['db'] }],
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true, path: null }
    }

    getLibraryService().flush()
    await copyFile(join(app.getPath('userData'), SMPLAYER_DB_NAME), result.filePath)
    return { canceled: false, path: result.filePath }
  })
  ipcMain.handle('data:import', async () => {
    const result = await showOpenDialog(options.getWindow(), {
      title: 'Import Data',
      defaultPath: app.getPath('documents'),
      filters: [{ name: 'Simple Melody Player Database', extensions: ['db'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }

    const [sourcePath] = result.filePaths
    const currentRootPath = getSettingsService().getSettingsSnapshot().rootPath
    const targetPath = join(app.getPath('userData'), SMPLAYER_DB_NAME)
    getLibraryService().close()
    await mkdir(app.getPath('userData'), { recursive: true })
    await copyFile(sourcePath, targetPath)
    const nextLibraryService = new DataService(app.getPath('userData'))
    options.setLibraryService(nextLibraryService)
    const importedRootPath = nextLibraryService.settingsService.getSettingsSnapshot().rootPath
    if (currentRootPath && importedRootPath && currentRootPath !== importedRootPath) {
      nextLibraryService.localItemService.replaceRootPathReferences(importedRootPath, currentRootPath)
    }
    options.updateWindowsJumpList()
    return { canceled: false, path: sourcePath }
  })
}

async function pickArtworkSource(options: LibraryIpcOptions, includeNoArtworkError: boolean) {
  const result = await showOpenDialog(options.getWindow(), {
    title: 'Choose Album Artwork',
    properties: ['openFile'],
    filters: [
      { name: 'Artwork or Music', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', ...options.audioDialogExtensions] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
      { name: 'Music', extensions: options.audioDialogExtensions },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, sourcePath: '', artworkUrl: '', sourceName: '' }
  }

  const sourcePath = result.filePaths[0]!
  const sourceName = basename(sourcePath, extname(sourcePath))
  try {
    const artworkSource = await options.getLibraryService().artworkService.prepareArtworkSource(sourcePath)
    return {
      canceled: false,
      sourcePath: artworkSource.sourcePath,
      artworkUrl: artworkSource.artworkUrl,
      sourceName,
    }
  } catch (error) {
    if (!includeNoArtworkError || !(error instanceof Error) || error.message !== 'No album art found in the selected music file.') {
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
}

async function showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions) {
  return window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options)
}

async function showSaveDialog(window: BrowserWindow | null, options: SaveDialogOptions) {
  return window
    ? dialog.showSaveDialog(window, options)
    : dialog.showSaveDialog(options)
}
