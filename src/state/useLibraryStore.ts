import { create } from 'zustand'

import type {
  AppSettingsUpdate,
  HiddenStorageItem,
  LibraryPlaylist,
  LibrarySnapshot,
  LocalFolderSortCriterion,
  PlaylistSortCriterion,
  ScanLibraryResult,
  SearchHistoryEntry,
  ViewStateUpdate,
} from '../shared/contracts'

interface LibraryStoreState {
  snapshot: LibrarySnapshot
  loading: boolean
  scanning: boolean
  error: string | null
  clearError: () => void
  refresh: () => Promise<void>
  pickLibraryRoot: () => Promise<void>
  scanLibrary: () => Promise<ScanLibraryResult | null>
  scanLocalFolder: (folderPath: string) => Promise<ScanLibraryResult | null>
  setSongFavorite: (songId: number, favorite: boolean) => Promise<void>
  setSongsFavorite: (songIds: number[], favorite: boolean) => Promise<void>
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
  deleteSongFromDisk: (songId: number) => Promise<void>
  hideSong: (songId: number) => Promise<void>
  moveSongToFolder: (songId: number, folderPath: string) => Promise<void>
  moveSongsToFolder: (songIds: number[], folderPath: string) => Promise<void>
  moveLocalFolderToFolder: (sourceFolderPath: string, targetFolderPath: string) => Promise<void>
  moveLocalItemsToFolder: (songIds: number[], folderPaths: string[], targetFolderPath: string) => Promise<void>
  createLocalFolder: (rootPath: string, relativePath: string, name: string) => Promise<ScanLibraryResult | null>
  deleteLocalItems: (songIds: number[], folderPaths: string[]) => Promise<void>
  updateLocalFolderSort: (folderPath: string, sortCriterion: LocalFolderSortCriterion) => Promise<void>
  renameLocalFolder: (folderPath: string, name: string) => Promise<void>
  deleteLocalFolder: (folderPath: string) => Promise<void>
  hideLocalFolder: (folderPath: string) => Promise<void>
  resumeHiddenStorageItem: (item: HiddenStorageItem) => Promise<void>
  resumeHiddenStorageItemByPath: (path: string) => Promise<void>
  clearNowPlaying: () => Promise<void>
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string) => Promise<void>
  removeRecentSearch: (entryId: number) => Promise<void>
  removeRecentSearches: (entryIds: number[]) => Promise<void>
  restoreRecentSearch: (entry: SearchHistoryEntry) => Promise<void>
  clearRecentSearches: () => Promise<void>
  removeRecentPlayed: (songIds: number[]) => Promise<void>
  restoreRecentPlayed: (songIds: number[]) => Promise<void>
  clearRecentPlayed: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
}

const emptySnapshot: LibrarySnapshot = {
  settings: {
    rootPath: '',
    useFilenameNotMusicName: false,
    showCount: true,
    themeColor: '#0078D7',
    nightMode: 'never',
    nightModeStartTime: '20:00',
    nightModeEndTime: '06:00',
    notificationSend: 'music-changed',
    notificationDisplay: 'normal',
    showNotifications: true,
    autoLyrics: false,
    showLyricsInNotification: false,
    notificationLyricsSource: 'internet',
    playerLyricsSource: 'auto',
    saveLyricsImmediately: false,
    preserveInternetLyricsTimestamps: true,
    preferredLanguage: 'system',
    musicLibrarySort: 'title',
    albumsSort: 'default',
    searchArtistsCriterion: 'default',
    searchAlbumsCriterion: 'default',
    searchSongsCriterion: 'default',
    searchPlaylistsCriterion: 'default',
    searchFoldersCriterion: 'default',
    lastMusicIndex: -1,
    volume: 50,
    isMuted: false,
    mode: 'once',
    musicProgress: 0,
    autoPlay: false,
    saveMusicProgress: false,
    hideMultiSelectCommandBarAfterOperation: true,
    localViewMode: 'grid',
    quitOnClose: true,
    lastPage: '/songs',
    lastPlaylistId: 0,
    lastReleaseNotesVersion: '',
  },
  counts: {
    songs: 0,
    artists: 0,
    albums: 0,
    folders: 0,
  },
  songs: [],
  folders: [],
  recentSongs: [],
  playlists: [],
  favorites: {
    playlistId: 0,
    songIds: [],
    sortCriterion: 'title',
  },
  nowPlaying: {
    playlistId: 0,
    songIds: [],
  },
  search: {
    lastQuery: '',
    recentSearches: [],
  },
}

function toLocalFolderSortValue(criterion: LocalFolderSortCriterion) {
  return {
    title: 0,
    artist: 1,
    album: 2,
    reverse: 7,
  }[criterion]
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown library error.'
}

function getLocalFolderPath(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return rootPath
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${folderRelativePath.split('/').join(separator)}`
}

function patchSnapshotSettings(update: AppSettingsUpdate & ViewStateUpdate) {
  return (state: LibraryStoreState): Pick<LibraryStoreState, 'error' | 'snapshot'> => ({
    error: null,
    snapshot: {
      ...state.snapshot,
      settings: {
        ...state.snapshot.settings,
        ...update,
      },
    },
  })
}

function uniqueSongIds(songIds: number[]) {
  return [...new Set(songIds.map(Number))]
}

function patchSongsFavorite(state: LibraryStoreState, songIds: number[], favorite: boolean): LibrarySnapshot {
  const songIdSet = new Set(songIds)

  return {
    ...state.snapshot,
    songs: state.snapshot.songs.map((song) => (songIdSet.has(song.id) ? { ...song, favorite } : song)),
    recentSongs: state.snapshot.recentSongs.map((song) => (songIdSet.has(song.id) ? { ...song, favorite } : song)),
  }
}

function patchPlaylistSongState(playlist: LibraryPlaylist, songIds: number[], active: boolean): LibraryPlaylist {
  const uniqueIds = uniqueSongIds(songIds)
  const songIdSet = new Set(uniqueIds)
  const nextSongIds = active
    ? [...playlist.songIds, ...uniqueIds.filter((songId) => !playlist.songIds.includes(songId))]
    : playlist.songIds.filter((songId) => !songIdSet.has(songId))

  return {
    ...playlist,
    songIds: nextSongIds,
    songCount: nextSongIds.length,
  }
}

function patchPlaylistSongs(
  state: LibraryStoreState,
  playlistId: number,
  songIds: number[],
  active: boolean,
): LibrarySnapshot {
  const targetPlaylist = state.snapshot.playlists.find((playlist) => playlist.id === playlistId)
  const snapshot = targetPlaylist?.isBuiltIn ? patchSongsFavorite(state, songIds, active) : state.snapshot

  return {
    ...snapshot,
    playlists: snapshot.playlists.map((playlist) =>
      playlist.id === playlistId ? patchPlaylistSongState(playlist, songIds, active) : playlist,
    ),
  }
}

function getFavoritePlaylistId(snapshot: LibrarySnapshot) {
  return snapshot.favorites.playlistId
}

function insertCustomPlaylistFirst(playlists: LibraryPlaylist[], playlist: LibraryPlaylist) {
  const firstCustomPlaylistIndex = playlists.findIndex((item) => !item.isBuiltIn)

  if (firstCustomPlaylistIndex < 0) {
    return [...playlists, playlist]
  }

  return [
    ...playlists.slice(0, firstCustomPlaylistIndex),
    playlist,
    ...playlists.slice(firstCustomPlaylistIndex),
  ]
}

function insertPlaylistAtIndex(playlists: LibraryPlaylist[], playlist: LibraryPlaylist, index: number) {
  return [
    ...playlists.slice(0, index),
    playlist,
    ...playlists.slice(index),
  ]
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  snapshot: emptySnapshot,
  loading: false,
  scanning: false,
  error: null,
  clearError: () => {
    set({ error: null })
  },
  refresh: async () => {
    if (!window.smplayer) {
      return
    }

    set({ loading: true, error: null })

    try {
      const snapshot = await window.smplayer.getLibrarySnapshot()
      set({
        snapshot,
      })
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },
  pickLibraryRoot: async () => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      const result = await window.smplayer.pickLibraryRoot()
      if (result.rootPath) {
        await get().refresh()
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  scanLibrary: async () => {
    if (!window.smplayer) {
      return null
    }

    if (get().scanning) {
      return null
    }

    set({ scanning: true, error: null })

    try {
      const result = await window.smplayer.scanLibrary()
      await get().refresh()
      return result
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    } finally {
      set({ scanning: false })
    }
  },
  scanLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return null
    }

    if (get().scanning) {
      return null
    }

    set({ scanning: true, error: null })

    try {
      const result = await window.smplayer.scanLocalFolder(folderPath)
      await get().refresh()
      return result
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    } finally {
      set({ scanning: false })
    }
  },
  setSongFavorite: async (songId, favorite) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.setSongFavorite(songId, favorite)
      set((state) => ({
        snapshot: patchPlaylistSongs(state, getFavoritePlaylistId(state.snapshot), [songId], favorite),
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
        snapshot: patchPlaylistSongs(state, getFavoritePlaylistId(state.snapshot), songIds, favorite),
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
        snapshot: patchPlaylistSongs(state, playlistId, [songId], true),
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
        snapshot: patchPlaylistSongs(state, playlistId, songIds, true),
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
        snapshot: patchPlaylistSongs(state, playlistId, [songId], false),
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
        snapshot: patchPlaylistSongs(state, playlistId, songIds, false),
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
      return
    }

    set({ error: null })

    try {
      await window.smplayer.deleteSongFromDisk(songId)
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  moveLocalItemsToFolder: async (songIds, folderPaths, targetFolderPath) => {
    if (!window.smplayer || songIds.length + folderPaths.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath)
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  createLocalFolder: async (rootPath, relativePath, name) => {
    if (!window.smplayer) {
      return null
    }

    set({ scanning: true, error: null })

    try {
      await window.smplayer.createLocalFolder(rootPath, relativePath, name)
      const result = await window.smplayer.scanLocalFolder(getLocalFolderPath(rootPath, relativePath))
      await get().refresh()
      return result
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    } finally {
      set({ scanning: false })
    }
  },
  deleteLocalItems: async (songIds, folderPaths) => {
    if (!window.smplayer || songIds.length + folderPaths.length === 0) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.deleteLocalItems(songIds, folderPaths)
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
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
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  deleteLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.deleteLocalFolder(folderPath)
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  hideLocalFolder: async (folderPath) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.hideLocalFolder(folderPath)
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
  addRecentSearch: async (query) => {
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
      const entry = await window.smplayer.addRecentSearch(query)
      if (entry) {
        set((state) => ({
          snapshot: {
            ...state.snapshot,
            search: {
              ...state.snapshot.search,
              recentSearches: [
                entry,
                ...state.snapshot.search.recentSearches.filter(
                  (recentSearch) => recentSearch.query.toLocaleLowerCase() !== entry.query.toLocaleLowerCase(),
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
      await get().refresh()
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
