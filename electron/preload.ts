import { contextBridge, ipcRenderer } from 'electron'

import type { SmplayerApi } from '../src/shared/contracts'

const api: SmplayerApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  getPreferenceSettings: () => ipcRenderer.invoke('preferences:get-settings'),
  getSongProperties: (songId) => ipcRenderer.invoke('library:get-song-properties', songId),
  updateSongProperties: (songId, update) => ipcRenderer.invoke('library:update-song-properties', songId, update),
  updateSongPlayCount: (songId, playCount) => ipcRenderer.invoke('library:update-song-play-count', songId, playCount),
  getLyrics: (songId, mode) => ipcRenderer.invoke('lyrics:get', songId, mode),
  importLyrics: () => ipcRenderer.invoke('lyrics:import'),
  saveSongLyrics: (songId, rawLyrics) => ipcRenderer.invoke('lyrics:save', songId, rawLyrics),
  openLyricsSearchInBrowser: (songId) => ipcRenderer.invoke('lyrics:open-search-browser', songId),
  saveInternetLyricsToFile: (songId) => ipcRenderer.invoke('lyrics:save-internet-to-file', songId),
  revealItemInFolder: (path) => ipcRenderer.invoke('shell:reveal-item', path),
  startWindowDrag: () => ipcRenderer.invoke('window:start-drag'),
  stopWindowDrag: () => ipcRenderer.invoke('window:stop-drag'),
  createLocalFolder: (rootPath, relativePath, name) => ipcRenderer.invoke('shell:create-local-folder', rootPath, relativePath, name),
  revealSystemLogs: () => ipcRenderer.invoke('shell:reveal-system-logs'),
  showTrackNotification: (track) => ipcRenderer.invoke('shell:show-track-notification', track),
  getSongArtwork: (songId) => ipcRenderer.invoke('library:get-artwork', songId),
  pickAlbumArtwork: (albumName) => ipcRenderer.invoke('library:pick-album-artwork', albumName),
  pickAlbumArtworkSource: () => ipcRenderer.invoke('library:pick-album-artwork-source'),
  saveAlbumArtwork: (albumName, sourcePath) => ipcRenderer.invoke('library:save-album-artwork', albumName, sourcePath),
  deleteAlbumArtwork: (albumName) => ipcRenderer.invoke('library:delete-album-artwork', albumName),
  pickSongArtworkSource: () => ipcRenderer.invoke('library:pick-song-artwork-source'),
  saveSongArtwork: (songId, sourcePath) => ipcRenderer.invoke('library:save-song-artwork', songId, sourcePath),
  deleteSongArtwork: (songId) => ipcRenderer.invoke('library:delete-song-artwork', songId),
  deleteSongFromDisk: (songId) => ipcRenderer.invoke('library:delete-song-from-disk', songId),
  hideSong: (songId) => ipcRenderer.invoke('library:hide-song', songId),
  moveSongToFolder: (songId, folderPath) => ipcRenderer.invoke('library:move-song-to-folder', songId, folderPath),
  moveSongsToFolder: (songIds, folderPath) => ipcRenderer.invoke('library:move-songs-to-folder', songIds, folderPath),
  moveLocalFolderToFolder: (sourceFolderPath, targetFolderPath) =>
    ipcRenderer.invoke('library:move-local-folder-to-folder', sourceFolderPath, targetFolderPath),
  deleteSongsFromDisk: (songIds) => ipcRenderer.invoke('library:delete-songs-from-disk', songIds),
  deleteLocalItems: (songIds, folderPaths) => ipcRenderer.invoke('library:delete-local-items', songIds, folderPaths),
  updateLocalFolderSort: (folderPath, sortCriterion) =>
    ipcRenderer.invoke('library:update-local-folder-sort', folderPath, sortCriterion),
  renameLocalFolder: (folderPath, name) => ipcRenderer.invoke('library:rename-local-folder', folderPath, name),
  deleteLocalFolder: (folderPath) => ipcRenderer.invoke('library:delete-local-folder', folderPath),
  hideLocalFolder: (path) => ipcRenderer.invoke('library:hide-local-folder', path),
  getHiddenStorageItems: () => ipcRenderer.invoke('library:get-hidden-storage-items'),
  resumeHiddenStorageItem: (item) => ipcRenderer.invoke('library:resume-hidden-storage-item', item),
  pickLibraryRoot: () => ipcRenderer.invoke('library:pick-root'),
  scanLibrary: (rootPath?: string) => ipcRenderer.invoke('library:scan', rootPath),
  scanLocalFolder: (folderPath) => ipcRenderer.invoke('library:scan-folder', folderPath),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  sendFeedbackEmail: () => ipcRenderer.invoke('shell:send-feedback-email'),
  openFeedbackInBrowser: () => ipcRenderer.invoke('shell:open-feedback-browser'),
  openVoiceAssistantPrivacySettings: () => ipcRenderer.invoke('shell:open-voice-assistant-privacy-settings'),
  setSongFavorite: (songId, favorite) =>
    ipcRenderer.invoke('library:set-favorite', songId, favorite),
  createPlaylist: (name, songIds) => ipcRenderer.invoke('playlist:create', name, songIds),
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
  reorderPlaylistSongs: (playlistId, songIds, sortCriterion) =>
    ipcRenderer.invoke('playlist:reorder-songs', playlistId, songIds, sortCriterion),
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
  addPreferenceItem: (type, itemId, name, level) => ipcRenderer.invoke('preferences:add-item', type, itemId, name, level),
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
