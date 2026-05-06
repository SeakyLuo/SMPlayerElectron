import { create } from 'zustand'

import type { AppSettingsUpdate, LibrarySnapshot, ViewStateUpdate } from '../shared/contracts'

interface LibraryStoreState {
  snapshot: LibrarySnapshot
  loading: boolean
  scanning: boolean
  error: string | null
  refresh: () => Promise<void>
  pickLibraryRoot: () => Promise<void>
  scanLibrary: () => Promise<void>
  setSongFavorite: (songId: number, favorite: boolean) => Promise<void>
  createPlaylist: (name: string) => Promise<void>
  deletePlaylist: (playlistId: number) => Promise<void>
  renamePlaylist: (playlistId: number, name: string) => Promise<void>
  reorderPlaylists: (playlistIds: number[]) => Promise<void>
  addSongToPlaylist: (playlistId: number, songId: number) => Promise<void>
  addSongsToPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  removeSongFromPlaylist: (playlistId: number, songId: number) => Promise<void>
  removeSongsFromPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  reorderPlaylistSongs: (playlistId: number, songIds: number[]) => Promise<void>
  replaceNowPlaying: (songIds: number[]) => Promise<void>
  removeSongFromNowPlaying: (songId: number) => Promise<void>
  deleteSongFromDisk: (songId: number) => Promise<void>
  clearNowPlaying: () => Promise<void>
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string) => Promise<void>
  removeRecentSearch: (entryId: number) => Promise<void>
  removeRecentSearches: (entryIds: number[]) => Promise<void>
  clearRecentSearches: () => Promise<void>
  removeRecentPlayed: (songIds: number[]) => Promise<void>
  clearRecentPlayed: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
}

const emptySnapshot: LibrarySnapshot = {
  settings: {
    rootPath: '',
    useFilenameNotMusicName: false,
    showCount: true,
    themeColor: '#5b87b6',
    notificationSend: 'music-changed',
    notificationDisplay: 'normal',
    showNotifications: true,
    autoLyrics: false,
    showLyricsInNotification: false,
    notificationLyricsSource: 'internet',
    saveLyricsImmediately: false,
    preferredLanguage: 'system',
    musicLibrarySort: 'title',
    lastMusicIndex: -1,
    volume: 72,
    isMuted: false,
    mode: 'once',
    musicProgress: 0,
    autoPlay: false,
    saveMusicProgress: false,
    hideMultiSelectCommandBarAfterOperation: true,
    lastPage: '/songs',
    lastPlaylistId: 0,
  },
  counts: {
    songs: 0,
    artists: 0,
    albums: 0,
    folders: 0,
  },
  songs: [],
  recentSongs: [],
  playlists: [],
  nowPlaying: {
    playlistId: 0,
    songIds: [],
  },
  search: {
    lastQuery: '',
    recentSearches: [],
  },
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown library error.'
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  snapshot: emptySnapshot,
  loading: false,
  scanning: false,
  error: null,
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
      return
    }

    set({ scanning: true, error: null })

    try {
      await window.smplayer.scanLibrary()
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
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
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  createPlaylist: async (name) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.createPlaylist(name)
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  reorderPlaylistSongs: async (playlistId, songIds) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.reorderPlaylistSongs(playlistId, songIds)
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
  clearNowPlaying: async () => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.clearNowPlaying()
      await get().refresh()
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
      await window.smplayer.addRecentSearch(query)
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
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
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  updateSettings: async (update) => {
    if (!window.smplayer) {
      return
    }

    set({ error: null })

    try {
      await window.smplayer.updateSettings(update)
      await get().refresh()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
  saveViewState: async (update) => {
    if (!window.smplayer) {
      return
    }

    try {
      await window.smplayer.saveViewState(update)
      if (update.lastPlaylistId !== undefined) {
        set((state) => ({
          snapshot: {
            ...state.snapshot,
            settings: {
              ...state.snapshot.settings,
              lastPlaylistId: update.lastPlaylistId!,
            },
          },
        }))
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
    }
  },
}))
