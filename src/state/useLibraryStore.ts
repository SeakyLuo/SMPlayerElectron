import { create } from 'zustand'

import type {
  AppSettingsUpdate,
  ArtistSplitResultItem,
  HiddenStorageItem,
  LibraryPlaylist,
  MusicData,
  LocalFolderSortCriterion,
  MoveLocalItemsProgress,
  PendingLocalItemsDelete,
  PendingSongDelete,
  PlaylistSortCriterion,
  ScanLibraryResult,
  ScanLibraryProgress,
  SearchHistoryEntry,
  ViewStateUpdate,
} from '../shared/contracts'
import {
  emptySnapshot,
  getErrorMessage,
  getFavoritePlaylistId,
  getLocalFolderPath,
  insertCustomPlaylistFirst,
  insertPlaylistAtIndex,
  insertRecentAlbumPlayback,
  insertRecentArtistPlayback,
  insertRecentPlaylistPlayback,
  patchPlaylistSongs,
  patchSnapshotSettings,
  SCAN_CANCELED_ERROR_MESSAGE,
  toLocalFolderSortValue,
} from './libraryStoreModel'

let songsLoadRequest: Promise<void> | null = null
let foldersLoadRequest: Promise<void> | null = null
let recentLoadRequest: Promise<void> | null = null

type LibraryDataRequirements = { songs?: boolean; folders?: boolean; recent?: boolean }
type LibraryRefreshOptions = { silent?: boolean }

interface LibraryStoreState {
  snapshot: MusicData
  loading: boolean
  songsLoaded: boolean
  foldersLoaded: boolean
  recentLoaded: boolean
  scanning: boolean
  scanProgress: ScanLibraryProgress | null
  moveProgress: MoveLocalItemsProgress | null
  error: string | null
  clearError: () => void
  refreshShell: () => Promise<void>
  loadSongs: () => Promise<void>
  loadFolders: () => Promise<void>
  loadRecent: () => Promise<void>
  loadRequiredData: (requirements: LibraryDataRequirements) => Promise<void>
  refresh: (requirements?: LibraryDataRequirements, options?: LibraryRefreshOptions) => Promise<void>
  pickLibraryRoot: () => Promise<string | null>
  scanLibrary: (rootPath?: string) => Promise<ScanLibraryResult | null>
  scanLocalFolder: (folderPath: string) => Promise<ScanLibraryResult | null>
  applyArtistSplits: (splits: ArtistSplitResultItem[]) => Promise<void>
  cancelLocalFolderScan: () => Promise<void>
  setSongFavorite: (songId: number, favorite: boolean) => Promise<void>
  setSongsFavorite: (songIds: number[], favorite: boolean) => Promise<void>
  updateSongLyricsOffset: (songId: number, lyricsOffsetMs: number) => Promise<void>
  createPlaylist: (name: string, songIds?: number[]) => Promise<void>
  deletePlaylist: (playlistId: number) => Promise<void>
  restorePlaylist: (playlist: LibraryPlaylist, restoreIndex: number) => Promise<void>
  renamePlaylist: (playlistId: number, name: string) => Promise<void>
  reorderPlaylists: (playlistIds: number[]) => Promise<void>
  addSongToPlaylist: (playlistId: number, songId: number) => Promise<void>
  addSongsToPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  removeSongFromPlaylist: (playlistId: number, songId: number) => Promise<void>
  removeSongsFromPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  reorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => Promise<void>
  replaceNowPlaying: (songIds: number[]) => Promise<void>
  removeSongFromNowPlaying: (songId: number) => Promise<void>
  deleteSongFromDisk: (songId: number) => Promise<PendingSongDelete | null>
  undoDeleteSongFromDisk: (deleteId: string) => Promise<void>
  commitDeleteSongFromDisk: (deleteId: string) => Promise<void>
  hideSong: (songId: number) => Promise<void>
  moveSongToFolder: (songId: number, folderPath: string) => Promise<void>
  moveSongsToFolder: (songIds: number[], folderPath: string) => Promise<void>
  moveLocalFolderToFolder: (sourceFolderPath: string, targetFolderPath: string) => Promise<void>
  moveLocalItemsToFolder: (songIds: number[], folderPaths: string[], targetFolderPath: string) => Promise<void>
  createLocalFolder: (rootPath: string, relativePath: string, name: string) => Promise<ScanLibraryResult | null>
  deleteLocalItems: (songIds: number[], folderPaths: string[]) => Promise<PendingLocalItemsDelete | null>
  updateLocalFolderSort: (folderPath: string, sortCriterion: LocalFolderSortCriterion) => Promise<void>
  renameLocalFolder: (folderPath: string, name: string) => Promise<void>
  deleteLocalFolder: (folderPath: string) => Promise<PendingLocalItemsDelete | null>
  hideLocalFolder: (folderPath: string) => Promise<void>
  resumeHiddenStorageItem: (item: HiddenStorageItem) => Promise<void>
  resumeHiddenStorageItemByPath: (path: string) => Promise<void>
  clearNowPlaying: () => Promise<void>
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string, type?: SearchHistoryEntry['type']) => Promise<void>
  removeRecentSearch: (entryId: number) => Promise<void>
  removeRecentSearches: (entryIds: number[]) => Promise<void>
  restoreRecentSearch: (entry: SearchHistoryEntry) => Promise<void>
  clearRecentSearches: () => Promise<void>
  recordRecentPlaylistPlayed: (playlistId: number) => Promise<void>
  recordRecentAlbumPlayed: (album: string) => Promise<void>
  recordRecentArtistPlayed: (artist: string) => Promise<void>
  removeRecentPlayed: (songIds: number[]) => Promise<void>
  restoreRecentPlayed: (songIds: number[]) => Promise<void>
  clearRecentPlayed: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  snapshot: emptySnapshot,
  loading: false,
  songsLoaded: false,
  foldersLoaded: false,
  recentLoaded: false,
  scanning: false,
  scanProgress: null,
  moveProgress: null,
  error: null,
  clearError: () => {
    set({ error: null })
  },
  refreshShell: async () => {
    if (!window.smplayer) {
      return
    }

    set({ loading: true, error: null })

    try {
      const shell = await window.smplayer.getLibraryShell()
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          ...shell,
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },
  loadSongs: async () => {
    if (!window.smplayer || get().songsLoaded) {
      return
    }

    songsLoadRequest ??= (async () => {
      set({ error: null })

      try {
        const songs = await window.smplayer!.getLibrarySongs()
        set((state) => ({
          songsLoaded: true,
          snapshot: {
            ...state.snapshot,
            songs,
          },
        }))
      } catch (error) {
        set({ error: getErrorMessage(error) })
      } finally {
        songsLoadRequest = null
      }
    })()
    await songsLoadRequest
  },
  loadFolders: async () => {
    if (!window.smplayer || get().foldersLoaded) {
      return
    }

    foldersLoadRequest ??= (async () => {
      set({ error: null })

      try {
        const folders = await window.smplayer!.getLibraryFolders()
        set((state) => ({
          foldersLoaded: true,
          snapshot: {
            ...state.snapshot,
            folders,
          },
        }))
      } catch (error) {
        set({ error: getErrorMessage(error) })
      } finally {
        foldersLoadRequest = null
      }
    })()
    await foldersLoadRequest
  },
  loadRecent: async () => {
    if (!window.smplayer || get().recentLoaded) {
      return
    }

    recentLoadRequest ??= (async () => {
      set({ error: null })

      try {
        const [recentSongs, recentPlaylists, recentAlbums, recentArtists] = await Promise.all([
          window.smplayer!.getRecentSongs(),
          window.smplayer!.getRecentPlaylists(),
          window.smplayer!.getRecentAlbums(),
          window.smplayer!.getRecentArtists(),
        ])
        set((state) => ({
          recentLoaded: true,
          snapshot: {
            ...state.snapshot,
            recentSongs,
            recentPlaylists,
            recentAlbums,
            recentArtists,
          },
        }))
      } catch (error) {
        set({ error: getErrorMessage(error) })
      } finally {
        recentLoadRequest = null
      }
    })()
    await recentLoadRequest
  },
  loadRequiredData: async (requirements) => {
    const state = get()
    const loads: Array<() => Promise<void>> = []

    if (requirements.songs && !state.songsLoaded) {
      loads.push(get().loadSongs)
    }

    if (requirements.folders && !state.foldersLoaded) {
      loads.push(get().loadFolders)
    }

    if (requirements.recent && !state.recentLoaded) {
      loads.push(get().loadRecent)
    }

    if (loads.length === 0) {
      return
    }

    set({ loading: true })
    try {
      await Promise.all(loads.map((load) => load()))
    } finally {
      set({ loading: false })
    }
  },
  refresh: async (
    requirements: LibraryDataRequirements = { songs: true, folders: true, recent: true },
    options: LibraryRefreshOptions = {},
  ) => {
    if (!window.smplayer) {
      return
    }

    if (options.silent) {
      set({ error: null })
    } else {
      set({ loading: true, error: null })
    }

    try {
      const state = get()
      const shouldRefreshSongs = requirements.songs && state.songsLoaded
      const shouldRefreshFolders = requirements.folders && state.foldersLoaded
      const shouldRefreshRecent = requirements.recent && state.recentLoaded
      const [shell, songs, folders, recent] = await Promise.all([
        window.smplayer.getLibraryShell(),
        shouldRefreshSongs ? window.smplayer.getLibrarySongs() : Promise.resolve(state.snapshot.songs),
        shouldRefreshFolders ? window.smplayer.getLibraryFolders() : Promise.resolve(state.snapshot.folders),
        shouldRefreshRecent
          ? Promise.all([
              window.smplayer.getRecentSongs(),
              window.smplayer.getRecentPlaylists(),
              window.smplayer.getRecentAlbums(),
              window.smplayer.getRecentArtists(),
            ])
          : Promise.resolve([
              state.snapshot.recentSongs,
              state.snapshot.recentPlaylists,
              state.snapshot.recentAlbums,
              state.snapshot.recentArtists,
            ] as const),
      ])
      const [recentSongs, recentPlaylists, recentAlbums, recentArtists] = recent

      set((current) => {
        const currentState = get()
        return {
          songsLoaded: currentState.songsLoaded,
          foldersLoaded: currentState.foldersLoaded,
          recentLoaded: currentState.recentLoaded,
          snapshot: {
            ...current.snapshot,
            ...shell,
            songs,
            folders,
            recentSongs,
            recentPlaylists,
            recentAlbums,
            recentArtists,
          },
        }
      })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      if (!options.silent) {
        set({ loading: false })
      }
    }
  },
  pickLibraryRoot: async () => {
    if (!window.smplayer) {
      return null
    }

    set({ error: null })

    try {
      const result = await window.smplayer.pickLibraryRoot()
      return result.rootPath
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    }
  },
  scanLibrary: async (selectedRootPath) => {
    if (!window.smplayer) {
      return null
    }

    if (get().scanning) {
      return null
    }

    const rootPath = selectedRootPath ?? get().snapshot.settings.rootPath
    const operationId = rootPath ? crypto.randomUUID() : ''
    let removeProgressListener: (() => void) | null = null

    set({
      scanning: true,
      error: null,
      scanProgress: rootPath
        ? {
            operationId,
            stage: 'checking',
            progress: 0,
            max: 1,
            folderName: rootPath.split(/[\\/]+/).filter(Boolean).at(-1) ?? rootPath,
            checkedFolderCount: 0,
            folderCount: 1,
            processedSongCount: 0,
            songCount: 0,
            addedCount: 0,
            updatedCount: 0,
            missingCount: 0,
            canCancel: true,
          }
        : null,
    })

    try {
      let progressMax: number | undefined
      if (rootPath) {
        removeProgressListener = window.smplayer.onScanLocalFolderProgress((progress) => {
          if (progress.operationId === operationId) {
            set({ scanProgress: progress })
          }
        })
        const preparedProgressMax = (await window.smplayer.prepareScanLocalFolder(rootPath)).progressMax
        progressMax = preparedProgressMax
        set((state) => state.scanProgress?.operationId === operationId
          ? {
              scanProgress: {
                ...state.scanProgress,
                max: preparedProgressMax,
                folderCount: preparedProgressMax,
              },
            }
          : state)
      }

      const result = await window.smplayer.scanLibrary(selectedRootPath, operationId || undefined, progressMax)
      // Hide the scan progress overlay as soon as the IPC returns. The library
      // refresh runs in the background so the caller can show the result
      // notification without waiting for a full library re-fetch.
      removeProgressListener?.()
      removeProgressListener = null
      set({ scanning: false, scanProgress: null })
      void get().refresh(undefined, { silent: true })
      return result
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    } finally {
      removeProgressListener?.()
      set({ scanning: false, scanProgress: null })
    }
  },
  scanLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return null
    }

    if (get().scanning) {
      return null
    }

    set({ error: null, scanProgress: null })

    let removeProgressListener: (() => void) | null = null
    try {
      const preparation = await window.smplayer.prepareScanLocalFolder(folderPath)
      const operationId = crypto.randomUUID()
      removeProgressListener = window.smplayer.onScanLocalFolderProgress((progress) => {
        if (progress.operationId === operationId) {
          set({ scanProgress: progress })
        }
      })

      set({
        scanning: true,
        scanProgress: {
          operationId,
          stage: 'checking',
          progress: 0,
          max: preparation.progressMax,
          checkedFolderCount: 0,
          folderCount: preparation.progressMax,
          processedSongCount: 0,
          songCount: 0,
          addedCount: 0,
          updatedCount: 0,
          missingCount: 0,
          canCancel: true,
        },
      })

      const result = await window.smplayer.scanLocalFolder(folderPath, operationId, preparation.progressMax)
      // Hide the scan progress overlay as soon as the IPC returns. The library
      // refresh runs in the background so the caller can show the result
      // notification without waiting for a full library re-fetch.
      removeProgressListener?.()
      removeProgressListener = null
      set({ scanning: false, scanProgress: null })
      void get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
      return result
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (errorMessage !== SCAN_CANCELED_ERROR_MESSAGE) {
        set({ error: errorMessage })
      }
      return null
    } finally {
      removeProgressListener?.()
      set({ scanning: false, scanProgress: null })
    }
  },
  cancelLocalFolderScan: async () => {
    const operationId = get().scanProgress?.operationId
    if (operationId) {
      await window.smplayer?.cancelScanLocalFolder(operationId)
    }
  },
  applyArtistSplits: async (splits) => {
    if (!window.smplayer || splits.length === 0) {
      return
    }

    await window.smplayer.applyArtistSplits(splits)
    await get().refresh({ songs: true, folders: false, recent: false })
  },
  setSongFavorite: async (songId, favorite) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.setSongFavorite(songId, favorite)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, getFavoritePlaylistId(state.snapshot), [songId], favorite),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  setSongsFavorite: async (songIds, favorite) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.setSongsFavorite(songIds, favorite)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, getFavoritePlaylistId(state.snapshot), songIds, favorite),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  updateSongLyricsOffset: async (songId, lyricsOffsetMs) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.updateSongLyricsOffset(songId, lyricsOffsetMs)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          songs: state.snapshot.songs.map((song) =>
            song.id === songId ? { ...song, lyricsOffsetMs } : song,
          ),
          recentSongs: state.snapshot.recentSongs.map((song) =>
            song.id === songId ? { ...song, lyricsOffsetMs } : song,
          ),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  createPlaylist: async (name, songIds) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const playlist = await window.smplayer.createPlaylist(name, songIds)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          playlists: insertCustomPlaylistFirst(state.snapshot.playlists, playlist),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  deletePlaylist: async (playlistId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.deletePlaylist(playlistId)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          playlists: state.snapshot.playlists.filter((playlist) => playlist.id !== playlistId),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  restorePlaylist: async (playlist, restoreIndex) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.restorePlaylist(playlist)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          playlists: insertPlaylistAtIndex(state.snapshot.playlists, playlist, restoreIndex),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  renamePlaylist: async (playlistId, name) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.renamePlaylist(playlistId, name)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          playlists: state.snapshot.playlists.map((playlist) =>
            playlist.id === playlistId ? { ...playlist, name } : playlist,
          ),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  reorderPlaylists: async (playlistIds) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.reorderPlaylists(playlistIds)
      set((state) => {
        const playlistById = new Map(state.snapshot.playlists.map((playlist) => [playlist.id, playlist]))
        const reorderedPlaylistIdSet = new Set(playlistIds)
        const reorderedPlaylists = playlistIds.map((playlistId) => playlistById.get(playlistId)!)
        return {
          snapshot: {
            ...state.snapshot,
            playlists: [
              ...state.snapshot.playlists.filter((playlist) => !reorderedPlaylistIdSet.has(playlist.id)),
              ...reorderedPlaylists,
            ],
          },
        }
      })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  addSongToPlaylist: async (playlistId, songId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.addSongToPlaylist(playlistId, songId)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, playlistId, [songId], true),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  addSongsToPlaylist: async (playlistId, songIds) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.addSongsToPlaylist(playlistId, songIds)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, playlistId, songIds, true),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeSongFromPlaylist: async (playlistId, songId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeSongFromPlaylist(playlistId, songId)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, playlistId, [songId], false),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeSongsFromPlaylist: async (playlistId, songIds) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeSongsFromPlaylist(playlistId, songIds)
      set((state) => ({
        snapshot: patchPlaylistSongs(state.snapshot, playlistId, songIds, false),
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  reorderPlaylistSongs: async (playlistId, songIds, sortCriterion) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.reorderPlaylistSongs(playlistId, songIds, sortCriterion)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          favorites: playlistId === state.snapshot.favorites.playlistId
            ? {
                ...state.snapshot.favorites,
                songIds,
                sortCriterion: sortCriterion ?? state.snapshot.favorites.sortCriterion,
              }
            : state.snapshot.favorites,
          playlists: state.snapshot.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  songIds,
                  songCount: songIds.length,
                  sortCriterion: sortCriterion ?? playlist.sortCriterion,
                }
              : playlist,
          ),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  replaceNowPlaying: async (songIds) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.replaceNowPlaying(songIds)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          nowPlaying: {
            ...state.snapshot.nowPlaying,
            songIds,
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeSongFromNowPlaying: async (songId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeSongFromNowPlaying(songId)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          nowPlaying: {
            ...state.snapshot.nowPlaying,
            songIds: state.snapshot.nowPlaying.songIds.filter((queuedSongId) => queuedSongId !== songId),
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  deleteSongFromDisk: async (songId) => {
    if (!window.smplayer) {
      return null
    }

    set({ error: null })

    try {
      const pendingDelete = await window.smplayer.deleteSongFromDisk(songId)
      await get().refresh({ songs: true, folders: true, recent: false })
      return pendingDelete
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    }
  },
  undoDeleteSongFromDisk: async (deleteId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.undoDeleteSongFromDisk(deleteId)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  commitDeleteSongFromDisk: async (deleteId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.commitDeleteSongFromDisk(deleteId)
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  hideSong: async (songId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.hideSong(songId)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  moveSongToFolder: async (songId, folderPath) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.moveSongToFolder(songId, folderPath)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  moveSongsToFolder: async (songIds, folderPath) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.moveSongsToFolder(songIds, folderPath)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  moveLocalFolderToFolder: async (sourceFolderPath, targetFolderPath) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.moveLocalFolderToFolder(sourceFolderPath, targetFolderPath)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  moveLocalItemsToFolder: async (songIds, folderPaths, targetFolderPath) => {
    if (!window.smplayer || songIds.length + folderPaths.length === 0) {
      return
    }

    const operationId = crypto.randomUUID()
    let removeProgressListener: (() => void) | null = null

    set({
      error: null,
      moveProgress: {
        operationId,
        progress: 0,
        max: songIds.length + folderPaths.length,
        currentItem: folderPaths[0] ?? '',
      },
    })

    try {
      removeProgressListener = window.smplayer.onMoveLocalItemsProgress((progress) => {
        if (progress.operationId === operationId) {
          set({ moveProgress: progress })
        }
      })
      await window.smplayer.moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath, operationId)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      removeProgressListener?.()
      set({ moveProgress: null })
    }
  },
  createLocalFolder: async (rootPath, relativePath, name) => {
    if (!window.smplayer) {
      return null
    }

    set({ error: null })

    try {
      await window.smplayer.createLocalFolder(rootPath, relativePath, name)
      const result = await window.smplayer.scanLocalFolder(getLocalFolderPath(rootPath, relativePath))
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
      return result
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    }
  },
  deleteLocalItems: async (songIds, folderPaths) => {
    if (!window.smplayer || songIds.length + folderPaths.length === 0) {
      return null
    }

    set({ error: null })

    try {
      const pendingDelete = await window.smplayer.deleteLocalItems(songIds, folderPaths)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
      return pendingDelete
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    }
  },
  updateLocalFolderSort: async (folderPath, sortCriterion) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.updateLocalFolderSort(folderPath, sortCriterion)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          folders: state.snapshot.folders.map((folder) =>
            folder.path === folderPath ? { ...folder, criterion: toLocalFolderSortValue(sortCriterion) } : folder,
          ),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  renameLocalFolder: async (folderPath, name) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.renameLocalFolder(folderPath, name)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  deleteLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return null
    }

    set({ error: null })

    try {
      const pendingDelete = await window.smplayer.deleteLocalFolder(folderPath)
      await get().refresh({ songs: true, folders: true, recent: false }, { silent: true })
      return pendingDelete
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    }
  },
  hideLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.hideLocalFolder(folderPath)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  resumeHiddenStorageItem: async (item) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.resumeHiddenStorageItem(item)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  resumeHiddenStorageItemByPath: async (path) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const hiddenItems = await window.smplayer.getHiddenStorageItems()
      const hiddenItem = hiddenItems.find((item) => item.path === path)
      await window.smplayer.resumeHiddenStorageItem(hiddenItem!)
      await get().refresh({ songs: true, folders: true, recent: false })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  clearNowPlaying: async () => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.clearNowPlaying()
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          nowPlaying: {
            ...state.snapshot.nowPlaying,
            songIds: [],
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  saveSearchQuery: async (query) => {
    if (!window.smplayer) {
      return
    }

    set((state) => ({
      error: null,
      snapshot: {
        ...state.snapshot,
        search: {
          ...state.snapshot.search,
          lastQuery: query,
        },
      },
    }))

    try {
      await window.smplayer.saveSearchQuery(query)
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  addRecentSearch: async (query, type = 'sidebar') => {
    if (!window.smplayer) {
      return
    }

    const nextQuery = query.trim()

    set((state) => ({
      error: null,
      snapshot: {
        ...state.snapshot,
        search: {
          ...state.snapshot.search,
          lastQuery: nextQuery,
        },
      },
    }))

    try {
      const entry = await window.smplayer.addRecentSearch(query, type)
      if (entry) {
        set((state) => ({
          snapshot: {
            ...state.snapshot,
            search: {
              ...state.snapshot.search,
              recentSearches: [
                entry,
                ...state.snapshot.search.recentSearches.filter(
                  (recentSearch) => recentSearch.type !== entry.type || recentSearch.query.toLocaleLowerCase() !== entry.query.toLocaleLowerCase(),
                ),
              ],
            },
          },
        }))
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeRecentSearch: async (entryId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeRecentSearch(entryId)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          search: {
            ...state.snapshot.search,
            recentSearches: state.snapshot.search.recentSearches.filter((entry) => entry.id !== entryId),
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeRecentSearches: async (entryIds) => {
    if (!window.smplayer || entryIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeRecentSearches(entryIds)
      const entryIdSet = new Set(entryIds)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          search: {
            ...state.snapshot.search,
            recentSearches: state.snapshot.search.recentSearches.filter((entry) => !entryIdSet.has(entry.id)),
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  restoreRecentSearch: async (entry) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.restoreRecentSearch(entry)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          search: {
            ...state.snapshot.search,
            recentSearches: [entry, ...state.snapshot.search.recentSearches.filter((item) => item.id !== entry.id)]
              .sort((left, right) => right.searchedAt.localeCompare(left.searchedAt)),
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  clearRecentSearches: async () => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.clearRecentSearches()
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          search: {
            ...state.snapshot.search,
            recentSearches: [],
          },
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  recordRecentPlaylistPlayed: async (playlistId) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const entry = await window.smplayer.recordRecentPlaylistPlayed(playlistId)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          recentPlaylists: insertRecentPlaylistPlayback(state.snapshot.recentPlaylists, entry),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  recordRecentAlbumPlayed: async (album) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const entry = await window.smplayer.recordRecentAlbumPlayed(album)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          recentAlbums: insertRecentAlbumPlayback(state.snapshot.recentAlbums, entry),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  recordRecentArtistPlayed: async (artist) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const entry = await window.smplayer.recordRecentArtistPlayed(artist)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          recentArtists: insertRecentArtistPlayback(state.snapshot.recentArtists, entry),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  removeRecentPlayed: async (songIds) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.removeRecentPlayed(songIds)
      const songIdSet = new Set(songIds)
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          recentSongs: state.snapshot.recentSongs.filter((song) => !songIdSet.has(song.id)),
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  restoreRecentPlayed: async (songIds) => {
    if (!window.smplayer || songIds.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.restoreRecentPlayed(songIds)
      await get().refresh({ songs: false, folders: false, recent: true })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  clearRecentPlayed: async () => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.clearRecentPlayed()
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          recentSongs: [],
          recentPlaylists: [],
          recentAlbums: [],
          recentArtists: [],
        },
      }))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  updateSettings: async (update) => {
    if (!window.smplayer) {
      return
    }

    set(patchSnapshotSettings(update))

    try {
      await window.smplayer.updateSettings(update)
    } catch (error) {
      set({ error: getErrorMessage(error) })
      await get().refresh()
    }
  },
  saveViewState: async (update) => {
    if (!window.smplayer) {
      return
    }

    try {
      await window.smplayer.saveViewState(update)
      set(patchSnapshotSettings(update))
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
}))
