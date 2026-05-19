import { contextBridge, ipcRenderer } from 'electron'

import type { SmplayerApi } from '../src/shared/contracts'

const startupNightModeActive = process.argv.includes('--smplayer-startup-night-mode=1')
const reportedRendererIssueKeys = new Set<string>()
const MAX_REPORTED_RENDERER_ISSUE_KEYS = 100

type StartupDocument = {
  documentElement?: {
    classList?: { add: (className: string) => void }
    style?: { backgroundColor: string }
  }
  body?: {
    classList?: { add: (className: string) => void }
    style?: { backgroundColor: string }
  }
  readyState?: string
  getElementById?: (id: string) => RendererElement | null
  addEventListener?: (type: string, listener: () => void, options: { once: boolean }) => void
}

type RendererElement = {
  childElementCount?: number
  tagName?: string
  id?: string
  className?: string
  textContent?: string | null
  currentSrc?: string
  src?: string
  href?: string
  style?: {
    setProperty?: (name: string, value: string) => void
  }
  getBoundingClientRect?: () => {
    width: number
    height: number
  }
  querySelectorAll?: (selector: string) => ArrayLike<RendererElement>
}

type RendererErrorEvent = {
  error: unknown
  message: string
  filename: string
  lineno: number
  colno: number
  target?: unknown
}

type RendererUnhandledRejectionEvent = {
  reason: unknown
}

type RendererGlobal = typeof globalThis & {
  addEventListener: {
    (type: 'error', listener: (event: RendererErrorEvent) => void, options?: boolean): void
    (type: 'unhandledrejection', listener: (event: RendererUnhandledRejectionEvent) => void): void
  }
}

function applyStartupNightMode() {
  const rendererDocument = (globalThis as unknown as { document?: StartupDocument }).document
  rendererDocument?.documentElement?.classList?.add('night-mode')

  if (rendererDocument?.documentElement?.style) {
    rendererDocument.documentElement.style.backgroundColor = '#101419'
  }

  rendererDocument?.body?.classList?.add('night-mode')
  if (rendererDocument?.body?.style) {
    rendererDocument.body.style.backgroundColor = '#101419'
  }

  rendererDocument?.getElementById?.('root')?.style?.setProperty?.('background-color', '#101419')
}

if (startupNightModeActive) {
  try {
    applyStartupNightMode()
    ;(globalThis as unknown as { document?: StartupDocument }).document?.addEventListener?.('DOMContentLoaded', applyStartupNightMode, { once: true })
  } catch {
    // Keep IPC injection available even if the preload document is not ready yet.
  }
}

function getRendererErrorPayload(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message,
      stackTrace: error.stack ?? '',
      source: '',
      line: 0,
      column: 0,
    }
  }

  return {
    type: 'Error',
    message: fallbackMessage,
    stackTrace: '',
    source: '',
    line: 0,
    column: 0,
  }
}

function reportRendererIssue(payload: ReturnType<typeof getRendererErrorPayload>) {
  const issueKey = [
    payload.type,
    payload.message,
    payload.source,
    payload.line,
    payload.column,
  ].join('|')

  if (reportedRendererIssueKeys.has(issueKey)) {
    return
  }
  if (reportedRendererIssueKeys.size >= MAX_REPORTED_RENDERER_ISSUE_KEYS) {
    return
  }
  reportedRendererIssueKeys.add(issueKey)
  ipcRenderer.send('app-center:renderer-issue', payload)
}

;(globalThis as RendererGlobal).addEventListener('error', (event) => {
  const payload = getRendererErrorPayload(event.error, event.message || 'Resource load failed')
  reportRendererIssue({
    ...payload,
    type: event.error instanceof Error ? payload.type : 'RendererResourceLoadFailure',
    source: event.filename || getResourceSource(event.target),
    line: event.lineno,
    column: event.colno,
  })
}, true)

;(globalThis as RendererGlobal).addEventListener('unhandledrejection', (event) => {
  reportRendererIssue(getRendererErrorPayload(event.reason, 'Unhandled promise rejection'))
})

function scheduleBlankScreenCheck(delayMs: number) {
  setTimeout(() => {
    const rendererDocument = (globalThis as unknown as { document?: StartupDocument }).document
    const root = rendererDocument?.getElementById?.('root')
    if (!root || hasVisibleRootContent(root)) {
      return
    }

    reportRendererIssue({
      type: 'RendererBlankScreen',
      message: `rootContentMissing delayMs=${delayMs} readyState=${rendererDocument?.readyState ?? ''}`,
      stackTrace: '',
      source: 'renderer',
      line: 0,
      column: 0,
    })
  }, delayMs)
}

function hasVisibleRootContent(root: RendererElement) {
  if (!root.childElementCount) {
    return false
  }

  const elements = root.querySelectorAll?.('*')
  const maxElementsToInspect = Math.min(elements?.length ?? 0, 80)
  for (let index = 0; index < maxElementsToInspect; index += 1) {
    const element = elements![index]!
    const rect = element.getBoundingClientRect?.()
    if (rect && rect.width > 1 && rect.height > 1) {
      return true
    }
  }

  return Boolean(root.textContent?.trim())
}

function getResourceSource(target: unknown) {
  const element = target as RendererElement
  return element.currentSrc || element.src || element.href || describeResourceElement(element)
}

function describeResourceElement(element: RendererElement) {
  return [
    element.tagName ?? 'resource',
    element.id ? `#${element.id}` : '',
    typeof element.className === 'string' && element.className ? `.${element.className.split(/\s+/).join('.')}` : '',
  ].join('')
}

const originalConsoleError = console.error.bind(console)
console.error = (...values: unknown[]) => {
  reportRendererIssue({
    type: 'RendererConsoleError',
    message: values.map((value) => value instanceof Error ? value.stack || value.message : String(value)).join('\n'),
    stackTrace: values.find((value): value is Error => value instanceof Error)?.stack ?? '',
    source: 'console.error',
    line: 0,
    column: 0,
  })
  originalConsoleError(...values)
}

function scheduleStartupBlankScreenChecks() {
  scheduleBlankScreenCheck(8000)
  scheduleBlankScreenCheck(20000)
}

const startupDocument = (globalThis as unknown as { document?: StartupDocument }).document
if (startupDocument?.readyState === 'complete' || startupDocument?.readyState === 'interactive') {
  scheduleStartupBlankScreenChecks()
} else {
  startupDocument?.addEventListener?.('DOMContentLoaded', scheduleStartupBlankScreenChecks, { once: true })
}

const api: SmplayerApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getSystemFonts: () => ipcRenderer.invoke('app:get-system-fonts'),
  getLibraryShell: () => ipcRenderer.invoke('library:get-shell'),
  getLibrarySettings: () => ipcRenderer.invoke('library:get-settings'),
  getLibraryCounts: () => ipcRenderer.invoke('library:get-counts'),
  getLibrarySongs: () => ipcRenderer.invoke('library:get-songs'),
  getLibraryFolders: () => ipcRenderer.invoke('library:get-folders'),
  getRecentSongs: () => ipcRenderer.invoke('library:get-recent-songs'),
  getRecentPlaylists: () => ipcRenderer.invoke('library:get-recent-playlists'),
  getRecentAlbums: () => ipcRenderer.invoke('library:get-recent-albums'),
  getRecentArtists: () => ipcRenderer.invoke('library:get-recent-artists'),
  getLibraryPlaylists: () => ipcRenderer.invoke('library:get-playlists'),
  getLibraryFavorites: () => ipcRenderer.invoke('library:get-favorites'),
  getNowPlaying: () => ipcRenderer.invoke('library:get-now-playing'),
  getSearch: () => ipcRenderer.invoke('library:get-search'),
  getPreferenceSettings: () => ipcRenderer.invoke('preferences:get-settings'),
  getSongProperties: (songId) => ipcRenderer.invoke('library:get-song-properties', songId),
  updateSongProperties: (songId, update) => ipcRenderer.invoke('library:update-song-properties', songId, update),
  updateSongPlayCount: (songId, playCount) => ipcRenderer.invoke('library:update-song-play-count', songId, playCount),
  updateSongLyricsOffset: (songId, lyricsOffsetMs) => ipcRenderer.invoke('library:update-song-lyrics-offset', songId, lyricsOffsetMs),
  getLyrics: (songId, mode) => ipcRenderer.invoke('lyrics:get', songId, mode),
  importLyrics: () => ipcRenderer.invoke('lyrics:import'),
  saveSongLyrics: (songId, rawLyrics) => ipcRenderer.invoke('lyrics:save', songId, rawLyrics),
  openLyricsSearchInBrowser: (songId) => ipcRenderer.invoke('lyrics:open-search-browser', songId),
  saveInternetLyricsToFile: (songId) => ipcRenderer.invoke('lyrics:save-internet-to-file', songId),
  revealItemInFolder: (path) => ipcRenderer.invoke('shell:reveal-item', path),
  startWindowDrag: () => ipcRenderer.invoke('window:start-drag'),
  stopWindowDrag: () => ipcRenderer.invoke('window:stop-drag'),
  setWindowControlsLight: (light) => ipcRenderer.invoke('window:set-controls-light', light),
  setWindowFullScreen: (fullScreen) => ipcRenderer.invoke('window:set-full-screen', fullScreen),
  getWindowFullScreen: () => ipcRenderer.invoke('window:get-full-screen'),
  setWindowMiniMode: (miniMode) => ipcRenderer.invoke('window:set-mini-mode', miniMode),
  getWindowMiniMode: () => ipcRenderer.invoke('window:get-mini-mode'),
  createLocalFolder: (rootPath, relativePath, name) => ipcRenderer.invoke('shell:create-local-folder', rootPath, relativePath, name),
  revealSystemLogs: () => ipcRenderer.invoke('shell:reveal-system-logs'),
  showTrackNotification: (track) => ipcRenderer.invoke('shell:show-track-notification', track),
  getSongArtworkSnapshot: (songId) => ipcRenderer.invoke('library:get-artwork-snapshot', songId),
  getSongArtworkSnapshots: (songIds) => ipcRenderer.invoke('library:get-artwork-snapshots', songIds),
  pickAlbumArtwork: (albumName) => ipcRenderer.invoke('library:pick-album-artwork', albumName),
  pickAlbumArtworkSource: () => ipcRenderer.invoke('library:pick-album-artwork-source'),
  saveAlbumArtwork: (albumName, sourcePath) => ipcRenderer.invoke('library:save-album-artwork', albumName, sourcePath),
  deleteAlbumArtwork: (albumName) => ipcRenderer.invoke('library:delete-album-artwork', albumName),
  pickSongArtworkSource: () => ipcRenderer.invoke('library:pick-song-artwork-source'),
  saveSongArtwork: (songId, sourcePath) => ipcRenderer.invoke('library:save-song-artwork', songId, sourcePath),
  deleteSongArtwork: (songId) => ipcRenderer.invoke('library:delete-song-artwork', songId),
  deleteSongFromDisk: (songId) => ipcRenderer.invoke('library:delete-song-from-disk', songId),
  undoDeleteSongFromDisk: (deleteId) => ipcRenderer.invoke('library:undo-delete-song-from-disk', deleteId),
  commitDeleteSongFromDisk: (deleteId) => ipcRenderer.invoke('library:commit-delete-song-from-disk', deleteId),
  hideSong: (songId) => ipcRenderer.invoke('library:hide-song', songId),
  moveSongToFolder: (songId, folderPath) => ipcRenderer.invoke('library:move-song-to-folder', songId, folderPath),
  moveSongsToFolder: (songIds, folderPath) => ipcRenderer.invoke('library:move-songs-to-folder', songIds, folderPath),
  moveLocalFolderToFolder: (sourceFolderPath, targetFolderPath) =>
    ipcRenderer.invoke('library:move-local-folder-to-folder', sourceFolderPath, targetFolderPath),
  moveLocalItemsToFolder: (songIds, folderPaths, targetFolderPath, operationId) =>
    ipcRenderer.invoke('library:move-local-items-to-folder', songIds, folderPaths, targetFolderPath, operationId),
  deleteSongsFromDisk: (songIds) => ipcRenderer.invoke('library:delete-songs-from-disk', songIds),
  deleteLocalItems: (songIds, folderPaths) => ipcRenderer.invoke('library:delete-local-items', songIds, folderPaths),
  updateLocalFolderSort: (folderPath, sortCriterion) =>
    ipcRenderer.invoke('library:update-local-folder-sort', folderPath, sortCriterion),
  renameLocalFolder: (folderPath, name) => ipcRenderer.invoke('library:rename-local-folder', folderPath, name),
  deleteLocalFolder: (folderPath) => ipcRenderer.invoke('library:delete-local-items', [], [folderPath]),
  hideLocalFolder: (path) => ipcRenderer.invoke('library:hide-local-folder', path),
  getHiddenStorageItems: () => ipcRenderer.invoke('library:get-hidden-storage-items'),
  resumeHiddenStorageItem: (item) => ipcRenderer.invoke('library:resume-hidden-storage-item', item),
  getRemoteShareStatus: () => ipcRenderer.invoke('remote-share:get-status'),
  updateRemoteShareSettings: (update) => ipcRenderer.invoke('remote-share:update-settings', update),
  startRemoteShare: () => ipcRenderer.invoke('remote-share:start'),
  stopRemoteShare: () => ipcRenderer.invoke('remote-share:stop'),
  getAuthorizedDevices: () => ipcRenderer.invoke('authorized-devices:list'),
  updateAuthorizedDevice: (deviceId, update) => ipcRenderer.invoke('authorized-devices:update', deviceId, update),
  deleteAuthorizedDevice: (deviceId) => ipcRenderer.invoke('authorized-devices:delete', deviceId),
  getRemoteHosts: () => ipcRenderer.invoke('remote-hosts:list'),
  connectRemoteHost: (request) => ipcRenderer.invoke('remote-hosts:connect', request),
  getRemoteHostLibrary: (hostId) => ipcRenderer.invoke('remote-hosts:get-library', hostId),
  deleteRemoteHost: (hostId) => ipcRenderer.invoke('remote-hosts:delete', hostId),
  pickLibraryRoot: () => ipcRenderer.invoke('library:pick-root'),
  scanLibrary: (rootPath, operationId, progressMax) => ipcRenderer.invoke('library:scan', rootPath, operationId, progressMax),
  prepareScanLocalFolder: (folderPath) => ipcRenderer.invoke('library:prepare-scan-folder', folderPath),
  scanLocalFolder: (folderPath, operationId, progressMax) => ipcRenderer.invoke('library:scan-folder', folderPath, operationId, progressMax),
  cancelScanLocalFolder: (operationId) => ipcRenderer.invoke('library:cancel-scan-folder', operationId),
  analyzeArtistSplits: () => ipcRenderer.invoke('library:analyze-artist-splits'),
  shouldCheckStartupArtistSplits: () => ipcRenderer.invoke('library:should-check-startup-artist-splits'),
  applyArtistSplits: (splits) => ipcRenderer.invoke('library:apply-artist-splits', splits),
  onScanLocalFolderProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => {
      callback(progress)
    }

    ipcRenderer.on('library:scan-folder-progress', listener)

    return () => {
      ipcRenderer.removeListener('library:scan-folder-progress', listener)
    }
  },
  onMoveLocalItemsProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => {
      callback(progress)
    }

    ipcRenderer.on('library:move-local-items-progress', listener)

    return () => {
      ipcRenderer.removeListener('library:move-local-items-progress', listener)
    }
  },
  takePendingOpenFiles: () => ipcRenderer.invoke('app:take-pending-open-files'),
  takePendingExternalCommands: () => ipcRenderer.invoke('app:take-pending-external-commands'),
  setTrayPlaybackState: (isPlaying) => ipcRenderer.invoke('app:set-tray-playback-state', isPlaying),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  onDataTransferState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => {
      callback(state)
    }

    ipcRenderer.on('data:transfer-state', listener)

    return () => {
      ipcRenderer.removeListener('data:transfer-state', listener)
    }
  },
  sendFeedbackEmail: () => ipcRenderer.invoke('shell:send-feedback-email'),
  openFeedbackInBrowser: () => ipcRenderer.invoke('shell:open-feedback-browser'),
  openVoiceAssistantPrivacySettings: () => ipcRenderer.invoke('shell:open-voice-assistant-privacy-settings'),
  recognizeSpeech: (language) => ipcRenderer.invoke('voice:recognize', language),
  cancelSpeechRecognition: () => ipcRenderer.invoke('voice:cancel-recognition'),
  onVoiceRecognitionHypothesis: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, hypothesis: Parameters<typeof callback>[0]) => {
      callback(hypothesis)
    }

    ipcRenderer.on('voice:recognition-hypothesis', listener)

    return () => {
      ipcRenderer.removeListener('voice:recognition-hypothesis', listener)
    }
  },
  onVoiceRecognitionStateChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: Parameters<typeof callback>[0]) => {
      callback(update)
    }

    ipcRenderer.on('voice:recognition-state', listener)

    return () => {
      ipcRenderer.removeListener('voice:recognition-state', listener)
    }
  },
  setSongFavorite: (songId, favorite) =>
    ipcRenderer.invoke('library:set-favorite', songId, favorite),
  setSongsFavorite: (songIds, favorite) =>
    ipcRenderer.invoke('library:set-favorites', songIds, favorite),
  createPlaylist: (name, songIds) => ipcRenderer.invoke('playlist:create', name, songIds),
  deletePlaylist: (playlistId) => ipcRenderer.invoke('playlist:delete', playlistId),
  restorePlaylist: (playlist) => ipcRenderer.invoke('playlist:restore', playlist),
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
  addRecentSearch: (query, type) => ipcRenderer.invoke('search:add-recent', query, type),
  removeRecentSearch: (entryId) => ipcRenderer.invoke('search:remove-recent', entryId),
  removeRecentSearches: (entryIds) => ipcRenderer.invoke('search:remove-recents', entryIds),
  restoreRecentSearch: (entry) => ipcRenderer.invoke('search:restore-recent', entry),
  clearRecentSearches: () => ipcRenderer.invoke('search:clear-recent'),
  recordRecentPlaylistPlayed: (playlistId) => ipcRenderer.invoke('recent-played:record-playlist', playlistId),
  recordRecentAlbumPlayed: (album) => ipcRenderer.invoke('recent-played:record-album', album),
  recordRecentArtistPlayed: (artist) => ipcRenderer.invoke('recent-played:record-artist', artist),
  removeRecentPlayed: (songIds) => ipcRenderer.invoke('recent-played:remove', songIds),
  restoreRecentPlayed: (songIds) => ipcRenderer.invoke('recent-played:restore', songIds),
  clearRecentPlayed: () => ipcRenderer.invoke('recent-played:clear'),
  updateSettings: (update) => ipcRenderer.invoke('settings:update', update),
  updatePreferenceSettings: (update) => ipcRenderer.invoke('preferences:update-settings', update),
  addPreferenceItem: (type, itemId, name, level) => ipcRenderer.invoke('preferences:add-item', type, itemId, name, level),
  updatePreferenceItem: (itemId, update) => ipcRenderer.invoke('preferences:update-item', itemId, update),
  removePreferenceItem: (itemId) => ipcRenderer.invoke('preferences:remove-item', itemId),
  clearInvalidPreferenceItems: (type) => ipcRenderer.invoke('preferences:clear-invalid', type),
  saveViewState: (update) => ipcRenderer.invoke('view-state:save', update),
  savePlaybackSettings: (update) => ipcRenderer.invoke('playback:save-settings', update),
  getPlaybackSettingsImmediate: () => ipcRenderer.sendSync('playback:get-settings-immediate'),
  savePlaybackSettingsImmediate: (update) => {
    ipcRenderer.sendSync('playback:save-settings-immediate', update)
  },
  markSongPlayed: (songId) => ipcRenderer.invoke('playback:mark-song-played', songId),
  updateSongDuration: (songId, duration) =>
    ipcRenderer.invoke('library:update-song-duration', songId, duration),
  loadMpvPlaybackSong: (request) => ipcRenderer.invoke('playback:mpv-load-song', request),
  playMpvPlayback: () => ipcRenderer.invoke('playback:mpv-play'),
  pauseMpvPlayback: () => ipcRenderer.invoke('playback:mpv-pause'),
  seekMpvPlayback: (seconds) => ipcRenderer.invoke('playback:mpv-seek', seconds),
  setMpvPlaybackVolume: (volume) => ipcRenderer.invoke('playback:mpv-set-volume', volume),
  setMpvPlaybackMuted: (muted) => ipcRenderer.invoke('playback:mpv-set-muted', muted),
  stopMpvPlayback: () => ipcRenderer.invoke('playback:mpv-stop'),
  getMpvPlaybackState: () => ipcRenderer.invoke('playback:mpv-state'),
  onMpvPlaybackEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: Parameters<typeof callback>[0]) => {
      callback(event)
    }

    ipcRenderer.on('playback:mpv-event', listener)

    return () => {
      ipcRenderer.removeListener('playback:mpv-event', listener)
    }
  },
  onGlobalMediaCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => {
      callback(command)
    }

    ipcRenderer.on('playback:global-media-command', listener)

    return () => {
      ipcRenderer.removeListener('playback:global-media-command', listener)
    }
  },
  onTrayCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => {
      callback(command)
    }

    ipcRenderer.on('app:tray-command', listener)

    return () => {
      ipcRenderer.removeListener('app:tray-command', listener)
    }
  },
  onExternalCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => {
      callback(command)
    }

    ipcRenderer.on('app:external-command', listener)

    return () => {
      ipcRenderer.removeListener('app:external-command', listener)
    }
  },
  onWindowFullScreenChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, fullScreen: boolean) => {
      callback(fullScreen)
    }

    ipcRenderer.on('window:full-screen-change', listener)

    return () => {
      ipcRenderer.removeListener('window:full-screen-change', listener)
    }
  },
  onWindowMiniModeChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, miniMode: boolean) => {
      callback(miniMode)
    }

    ipcRenderer.on('window:mini-mode-change', listener)

    return () => {
      ipcRenderer.removeListener('window:mini-mode-change', listener)
    }
  },
  onOpenFiles: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, songIds: number[]) => {
      callback(songIds)
    }

    ipcRenderer.on('app:open-files', listener)

    return () => {
      ipcRenderer.removeListener('app:open-files', listener)
    }
  },
  updateDesktopLyricsState: (state) => ipcRenderer.invoke('desktop-lyrics:update-state', state),
  onDesktopLyricsState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => {
      callback(state)
    }

    ipcRenderer.on('desktop-lyrics:state', listener)

    return () => {
      ipcRenderer.removeListener('desktop-lyrics:state', listener)
    }
  },
  requestDesktopLyricsCommand: (command) => ipcRenderer.invoke('desktop-lyrics:request-command', command),
  onDesktopLyricsCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => {
      callback(command)
    }

    ipcRenderer.on('desktop-lyrics:command', listener)

    return () => {
      ipcRenderer.removeListener('desktop-lyrics:command', listener)
    }
  },
}

contextBridge.exposeInMainWorld('smplayer', api)
