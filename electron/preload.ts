import { contextBridge, ipcRenderer } from 'electron'

import type { SmplayerApi } from '../src/shared/contracts'

const api: SmplayerApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  getPreferenceSettings: () => ipcRenderer.invoke('preferences:get-settings'),
  getLyrics: (songId, mode) => ipcRenderer.invoke('lyrics:get', songId, mode),
  saveInternetLyricsToFile: (songId) => ipcRenderer.invoke('lyrics:save-internet-to-file', songId),
  revealItemInFolder: (path) => ipcRenderer.invoke('shell:reveal-item', path),
  revealSystemLogs: () => ipcRenderer.invoke('shell:reveal-system-logs'),
  showTrackNotification: (track) => ipcRenderer.invoke('shell:show-track-notification', track),
  getSongArtwork: (songId) => ipcRenderer.invoke('library:get-artwork', songId),
  deleteSongFromDisk: (songId) => ipcRenderer.invoke('library:delete-song-from-disk', songId),
  pickLibraryRoot: () => ipcRenderer.invoke('library:pick-root'),
  scanLibrary: (rootPath?: string) => ipcRenderer.invoke('library:scan', rootPath),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  sendFeedbackEmail: () => ipcRenderer.invoke('shell:send-feedback-email'),
  openFeedbackInBrowser: () => ipcRenderer.invoke('shell:open-feedback-browser'),
  setSongFavorite: (songId, favorite) =>
    ipcRenderer.invoke('library:set-favorite', songId, favorite),
  createPlaylist: (name) => ipcRenderer.invoke('playlist:create', name),
  deletePlaylist: (playlistId) => ipcRenderer.invoke('playlist:delete', playlistId),
  renamePlaylist: (playlistId, name) => ipcRenderer.invoke('playlist:rename', playlistId, name),
  reorderPlaylists: (playlistIds) => ipcRenderer.invoke('playlist:reorder', playlistIds),
  addSongToPlaylist: (playlistId, songId) =>
    ipcRenderer.invoke('playlist:add-song', playlistId, songId),
  addSongsToPlaylist: (playlistId, songIds) =>
    ipcRenderer.invoke('playlist:add-songs', playlistId, songIds),
  removeSongFromPlaylist: (playlistId, songId) =>
    ipcRenderer.invoke('playlist:remove-song', playlistId, songId),
  removeSongsFromPlaylist: (playlistId, songIds) =>
    ipcRenderer.invoke('playlist:remove-songs', playlistId, songIds),
  reorderPlaylistSongs: (playlistId, songIds) =>
    ipcRenderer.invoke('playlist:reorder-songs', playlistId, songIds),
  replaceNowPlaying: (songIds) => ipcRenderer.invoke('queue:replace', songIds),
  removeSongFromNowPlaying: (songId) => ipcRenderer.invoke('queue:remove-song', songId),
  clearNowPlaying: () => ipcRenderer.invoke('queue:clear'),
  saveSearchQuery: (query) => ipcRenderer.invoke('search:save-query', query),
  addRecentSearch: (query) => ipcRenderer.invoke('search:add-recent', query),
  removeRecentSearch: (entryId) => ipcRenderer.invoke('search:remove-recent', entryId),
  removeRecentSearches: (entryIds) => ipcRenderer.invoke('search:remove-recents', entryIds),
  clearRecentSearches: () => ipcRenderer.invoke('search:clear-recent'),
  removeRecentPlayed: (songIds) => ipcRenderer.invoke('recent-played:remove', songIds),
  clearRecentPlayed: () => ipcRenderer.invoke('recent-played:clear'),
  updateSettings: (update) => ipcRenderer.invoke('settings:update', update),
  updatePreferenceSettings: (update) => ipcRenderer.invoke('preferences:update-settings', update),
  updatePreferenceItem: (itemId, update) => ipcRenderer.invoke('preferences:update-item', itemId, update),
  removePreferenceItem: (itemId) => ipcRenderer.invoke('preferences:remove-item', itemId),
  clearInvalidPreferenceItems: (type) => ipcRenderer.invoke('preferences:clear-invalid', type),
  saveViewState: (update) => ipcRenderer.invoke('view-state:save', update),
  savePlaybackSettings: (update) => ipcRenderer.invoke('playback:save-settings', update),
  markSongPlayed: (songId) => ipcRenderer.invoke('playback:mark-song-played', songId),
  updateSongDuration: (songId, duration) =>
    ipcRenderer.invoke('library:update-song-duration', songId, duration),
  onGlobalMediaCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => {
      callback(command)
    }

    ipcRenderer.on('playback:global-media-command', listener)

    return () => {
      ipcRenderer.removeListener('playback:global-media-command', listener)
    }
  },
}

contextBridge.exposeInMainWorld('smplayer', api)
