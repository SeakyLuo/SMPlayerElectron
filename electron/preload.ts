import { contextBridge, ipcRenderer } from 'electron'

import type { SmplayerApi } from '../src/shared/contracts'

const api: SmplayerApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  getLyrics: (songId, mode) => ipcRenderer.invoke('lyrics:get', songId, mode),
  revealItemInFolder: (path) => ipcRenderer.invoke('shell:reveal-item', path),
  showTrackNotification: (track) => ipcRenderer.invoke('shell:show-track-notification', track),
  pickLibraryRoot: () => ipcRenderer.invoke('library:pick-root'),
  scanLibrary: (rootPath?: string) => ipcRenderer.invoke('library:scan', rootPath),
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
  clearRecentSearches: () => ipcRenderer.invoke('search:clear-recent'),
  updateSettings: (update) => ipcRenderer.invoke('settings:update', update),
  saveViewState: (update) => ipcRenderer.invoke('view-state:save', update),
  savePlaybackSettings: (update) => ipcRenderer.invoke('playback:save-settings', update),
  markSongPlayed: (songId) => ipcRenderer.invoke('playback:mark-song-played', songId),
}

contextBridge.exposeInMainWorld('smplayer', api)
