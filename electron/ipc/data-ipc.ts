import { ipcMain } from 'electron'

import type {
  LibraryPlaylist,
  PlaybackRuntimeSettings,
  PlaylistSortCriterion,
  PreferenceEntityType,
  PreferenceLevel,
  SearchHistoryEntry,
  SearchHistoryType,
} from '../../src/shared/contracts'
import type { DataService } from '../services/data-service'

interface DataIpcOptions {
  getLibraryService: () => DataService
  updateTrayMenu: () => void
  updateWindowsJumpList: () => void
}

export function registerDataIpc(options: DataIpcOptions) {
  const getPlaylistService = () => options.getLibraryService().playlistService
  const getHistoryService = () => options.getLibraryService().historyService
  const getSettingsService = () => options.getLibraryService().settingsService
  const getPreferenceService = () => options.getLibraryService().preferenceService
  const getNowPlayingService = () => options.getLibraryService().nowPlayingService
  const getSongService = () => options.getLibraryService().songService

  ipcMain.handle('library:set-favorite', (_event, songId: number, favorite: boolean) =>
    getPlaylistService().setSongFavorite(songId, favorite),
  )
  ipcMain.handle('library:set-favorites', (_event, songIds: number[], favorite: boolean) =>
    getPlaylistService().setSongsFavorite(songIds, favorite),
  )
  ipcMain.handle('library:update-song-duration', (_event, songId: number, duration: number) =>
    getSongService().updateSongDuration(songId, duration),
  )
  ipcMain.handle('playlist:create', (_event, name: string, songIds?: number[]) => getPlaylistService().createPlaylist(name, songIds))
  ipcMain.handle('playlist:delete', (_event, playlistId: number) =>
    getPlaylistService().deletePlaylist(playlistId),
  )
  ipcMain.handle('playlist:restore', (_event, playlist: LibraryPlaylist) =>
    getPlaylistService().restorePlaylist(playlist),
  )
  ipcMain.handle('playlist:rename', (_event, playlistId: number, name: string) =>
    getPlaylistService().renamePlaylist(playlistId, name),
  )
  ipcMain.handle('playlist:reorder', (_event, playlistIds: number[]) =>
    getPlaylistService().reorderPlaylists(playlistIds),
  )
  ipcMain.handle('playlist:add-song', (_event, playlistId: number, songId: number) =>
    getPlaylistService().addSongToPlaylist(playlistId, songId),
  )
  ipcMain.handle('playlist:add-songs', (_event, playlistId: number, songIds: number[]) =>
    getPlaylistService().addSongsToPlaylist(playlistId, songIds),
  )
  ipcMain.handle('playlist:remove-song', (_event, playlistId: number, songId: number) =>
    getPlaylistService().removeSongFromPlaylist(playlistId, songId),
  )
  ipcMain.handle('playlist:remove-songs', (_event, playlistId: number, songIds: number[]) =>
    getPlaylistService().removeSongsFromPlaylist(playlistId, songIds),
  )
  ipcMain.handle('playlist:reorder-songs', (_event, playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) =>
    getPlaylistService().reorderPlaylistSongs(playlistId, songIds, sortCriterion),
  )
  ipcMain.handle('queue:replace', (_event, songIds: number[]) => getNowPlayingService().writeSongIds(songIds))
  ipcMain.handle('queue:remove-song', (_event, songId: number) =>
    getNowPlayingService().writeSongIds(getNowPlayingService().readSongIdsByPath().filter((queuedSongId) => queuedSongId !== songId)),
  )
  ipcMain.handle('queue:clear', () => getNowPlayingService().writeSongIds([]))
  ipcMain.handle('search:save-query', (_event, query: string) => getHistoryService().saveSearchQuery(query))
  ipcMain.handle('search:add-recent', (_event, query: string, type?: SearchHistoryType) =>
    getHistoryService().addRecentSearch(query, type),
  )
  ipcMain.handle('search:remove-recent', (_event, entryId: number) =>
    getHistoryService().removeRecentSearch(entryId),
  )
  ipcMain.handle('search:remove-recents', (_event, entryIds: number[]) =>
    getHistoryService().removeRecentSearches(entryIds),
  )
  ipcMain.handle('search:restore-recent', (_event, entry: SearchHistoryEntry) =>
    getHistoryService().restoreRecentSearch(entry),
  )
  ipcMain.handle('search:clear-recent', () => getHistoryService().clearRecentSearches())
  ipcMain.handle('recent-played:record-playlist', (_event, playlistId: number) =>
    getHistoryService().recordRecentPlaylistPlayed(playlistId),
  )
  ipcMain.handle('recent-played:record-album', (_event, album: string) =>
    getHistoryService().recordRecentAlbumPlayed(album),
  )
  ipcMain.handle('recent-played:record-artist', (_event, artist: string) =>
    getHistoryService().recordRecentArtistPlayed(artist),
  )
  ipcMain.handle('recent-played:remove', (_event, songIds: number[]) => {
    const result = getHistoryService().removeRecentPlayed(songIds)
    options.updateWindowsJumpList()
    return result
  })
  ipcMain.handle('recent-played:restore', (_event, songIds: number[]) => {
    const result = getHistoryService().restoreRecentPlayed(songIds)
    options.updateWindowsJumpList()
    return result
  })
  ipcMain.handle('recent-played:clear', () => {
    const result = getHistoryService().clearRecentPlayed()
    options.updateWindowsJumpList()
    return result
  })
  ipcMain.handle('settings:update', (_event, update) => {
    const result = getSettingsService().updateSettings(update)
    options.updateTrayMenu()
    options.updateWindowsJumpList()
    return result
  })
  ipcMain.handle('preferences:update-settings', (_event, update) =>
    getPreferenceService().updatePreferenceSettings(update),
  )
  ipcMain.handle('preferences:add-item', (_event, type: PreferenceEntityType, itemId: string, name: string, level?: PreferenceLevel) =>
    getPreferenceService().addPreferenceItem(type, itemId, name, level),
  )
  ipcMain.handle('preferences:update-item', (_event, itemId: number, update) =>
    getPreferenceService().updatePreferenceItem(itemId, update),
  )
  ipcMain.handle('preferences:remove-item', (_event, itemId: number) =>
    getPreferenceService().removePreferenceItem(itemId),
  )
  ipcMain.handle('preferences:clear-invalid', (_event, type) =>
    getPreferenceService().clearInvalidPreferenceItems(type),
  )
  ipcMain.handle('view-state:save', (_event, update) => getSettingsService().saveViewState(update))
  ipcMain.handle('playback:save-settings', (_event, update) =>
    getSettingsService().savePlaybackSettings(update),
  )
  ipcMain.on('playback:get-settings-immediate', (event) => {
    const settings = getSettingsService().getSettingsSnapshot()
    event.returnValue = {
      volume: settings.volume,
      isMuted: settings.isMuted,
      mode: settings.mode,
    } satisfies PlaybackRuntimeSettings
  })
  ipcMain.on('playback:save-settings-immediate', (event, update) => {
    getSettingsService().savePlaybackSettings(update)
    event.returnValue = true
  })
  ipcMain.handle('playback:mark-song-played', (_event, songId: number) => {
    const result = getHistoryService().markSongPlayed(songId)
    options.updateWindowsJumpList()
    return result
  })
}
