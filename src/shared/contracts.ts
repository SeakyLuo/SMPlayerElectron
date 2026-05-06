export interface AppInfo {
  platform: string
  version: string
  isPackaged: boolean
  userDataPath: string
}

export type PlaybackMode = 'once' | 'repeat' | 'repeat-one' | 'shuffle'
export type GlobalMediaCommand = 'play-pause' | 'next' | 'previous' | 'stop'
export type NotificationSendMode = 'music-changed' | 'never'
export type NotificationDisplayMode = 'reminder' | 'normal' | 'quick'
export type MusicLibrarySortCriterion =
  | 'title'
  | 'artist'
  | 'album'
  | 'duration'
  | 'play-count'
  | 'date-added'

export type PlaylistSortCriterion = MusicLibrarySortCriterion

export interface LibrarySong {
  id: number
  path: string
  mediaUrl: string
  artworkUrl: string
  title: string
  artist: string
  artists: string[]
  album: string
  duration: number
  playCount: number
  dateAdded: string
  favorite: boolean
}

export interface RecentLibrarySong extends LibrarySong {
  playedAt: string
}

export interface LibraryPlaylist {
  id: number
  name: string
  songCount: number
  songIds: number[]
  sortCriterion: PlaylistSortCriterion
  isBuiltIn: boolean
}

export interface NowPlayingSnapshot {
  playlistId: number
  songIds: number[]
}

export interface SearchHistoryEntry {
  id: number
  query: string
  searchedAt: string
}

export interface SearchSnapshot {
  lastQuery: string
  recentSearches: SearchHistoryEntry[]
}

export type LyricsSource = 'none' | 'lrc-file' | 'text-file' | 'music-file' | 'internet'
export type LyricsRequestMode = 'internet' | 'local' | 'embedded' | 'auto'
export type PreferredLanguage = 'system' | 'en-US' | 'zh-CN'
export type PreferenceEntityType =
  | 'song'
  | 'artist'
  | 'album'
  | 'playlist'
  | 'folder'
  | 'recent-added'
  | 'my-favorites'
  | 'most-played'
  | 'least-played'
export type PreferenceLevel = 'do-not-appear' | 'dislike' | 'normal' | 'high' | 'higher' | 'very-high'

export interface LyricsLine {
  id: number
  timestampMs: number | null
  text: string
}

export interface LyricsSnapshot {
  source: LyricsSource
  isSynced: boolean
  rawText: string
  lines: LyricsLine[]
}

export type LyricsSaveStatus = 'saved' | 'missing' | 'failed' | 'skipped'

export interface LyricsSaveResult {
  status: LyricsSaveStatus
}

export interface TrackNotificationPayload {
  songId: number
  title: string
  artist: string
  album: string
}

export interface LibraryCounts {
  songs: number
  artists: number
  albums: number
  folders: number
}

export interface SettingsSnapshot {
  rootPath: string
  useFilenameNotMusicName: boolean
  showCount: boolean
  themeColor: string
  notificationSend: NotificationSendMode
  notificationDisplay: NotificationDisplayMode
  showNotifications: boolean
  autoLyrics: boolean
  showLyricsInNotification: boolean
  notificationLyricsSource: LyricsRequestMode
  saveLyricsImmediately: boolean
  preferredLanguage: PreferredLanguage
  musicLibrarySort: MusicLibrarySortCriterion
  lastMusicIndex: number
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  musicProgress: number
  autoPlay: boolean
  saveMusicProgress: boolean
  hideMultiSelectCommandBarAfterOperation: boolean
  quitOnClose: boolean
  lastPage: string
  lastPlaylistId: number
}

export interface LibrarySnapshot {
  settings: SettingsSnapshot
  counts: LibraryCounts
  songs: LibrarySong[]
  recentSongs: RecentLibrarySong[]
  playlists: LibraryPlaylist[]
  nowPlaying: NowPlayingSnapshot
  search: SearchSnapshot
}

export interface PreferenceItemSnapshot {
  id: number
  type: PreferenceEntityType
  itemId: string
  name: string
  tooltip: string
  isEnabled: boolean
  level: PreferenceLevel
  isValid: boolean
  canRemove: boolean
}

export interface PreferenceSettingsSnapshot {
  enabled: {
    songs: boolean
    artists: boolean
    albums: boolean
    playlists: boolean
    folders: boolean
  }
  songs: PreferenceItemSnapshot[]
  artists: PreferenceItemSnapshot[]
  albums: PreferenceItemSnapshot[]
  playlists: PreferenceItemSnapshot[]
  folders: PreferenceItemSnapshot[]
  others: PreferenceItemSnapshot[]
}

export interface PreferenceSettingsUpdate {
  songs?: boolean
  artists?: boolean
  albums?: boolean
  playlists?: boolean
  folders?: boolean
}

export interface PreferenceItemUpdate {
  isEnabled?: boolean
  level?: PreferenceLevel
}

export interface ChooseLibraryRootResult {
  rootPath: string | null
}

export interface ScanLibraryResult {
  rootPath: string
  songCount: number
  folderCount: number
  elapsedMs: number
}

export interface DataTransferResult {
  canceled: boolean
  path: string | null
}

export interface PlaybackSettingsUpdate {
  lastMusicIndex?: number
  volume?: number
  isMuted?: boolean
  mode?: PlaybackMode
  musicProgress?: number
}

export interface AppSettingsUpdate {
  useFilenameNotMusicName?: boolean
  showCount?: boolean
  themeColor?: string
  notificationSend?: NotificationSendMode
  notificationDisplay?: NotificationDisplayMode
  showNotifications?: boolean
  autoLyrics?: boolean
  showLyricsInNotification?: boolean
  notificationLyricsSource?: LyricsRequestMode
  saveLyricsImmediately?: boolean
  preferredLanguage?: PreferredLanguage
  musicLibrarySort?: MusicLibrarySortCriterion
  autoPlay?: boolean
  saveMusicProgress?: boolean
  hideMultiSelectCommandBarAfterOperation?: boolean
  quitOnClose?: boolean
}

export interface ViewStateUpdate {
  lastPage?: string
  lastPlaylistId?: number
}

export interface SmplayerApi {
  getAppInfo: () => Promise<AppInfo>
  getLibrarySnapshot: () => Promise<LibrarySnapshot>
  getPreferenceSettings: () => Promise<PreferenceSettingsSnapshot>
  getLyrics: (songId: number, mode?: LyricsRequestMode) => Promise<LyricsSnapshot>
  saveInternetLyricsToFile: (songId: number) => Promise<LyricsSaveResult>
  revealItemInFolder: (path: string) => Promise<void>
  startWindowDrag: () => Promise<void>
  stopWindowDrag: () => Promise<void>
  createLocalFolder: (rootPath: string, relativePath: string, name: string) => Promise<void>
  revealSystemLogs: () => Promise<void>
  showTrackNotification: (track: TrackNotificationPayload) => Promise<void>
  getSongArtwork: (songId: number) => Promise<string>
  pickAlbumArtwork: (albumName: string) => Promise<void>
  deleteSongFromDisk: (songId: number) => Promise<void>
  pickLibraryRoot: () => Promise<ChooseLibraryRootResult>
  scanLibrary: (rootPath?: string) => Promise<ScanLibraryResult>
  exportData: () => Promise<DataTransferResult>
  importData: () => Promise<DataTransferResult>
  sendFeedbackEmail: () => Promise<void>
  openFeedbackInBrowser: () => Promise<void>
  setSongFavorite: (songId: number, favorite: boolean) => Promise<void>
  createPlaylist: (name: string, songIds?: number[]) => Promise<void>
  deletePlaylist: (playlistId: number) => Promise<void>
  renamePlaylist: (playlistId: number, name: string) => Promise<void>
  reorderPlaylists: (playlistIds: number[]) => Promise<void>
  addSongToPlaylist: (playlistId: number, songId: number) => Promise<void>
  addSongsToPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  removeSongFromPlaylist: (playlistId: number, songId: number) => Promise<void>
  removeSongsFromPlaylist: (playlistId: number, songIds: number[]) => Promise<void>
  reorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => Promise<void>
  replaceNowPlaying: (songIds: number[]) => Promise<void>
  removeSongFromNowPlaying: (songId: number) => Promise<void>
  clearNowPlaying: () => Promise<void>
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string) => Promise<void>
  removeRecentSearch: (entryId: number) => Promise<void>
  removeRecentSearches: (entryIds: number[]) => Promise<void>
  clearRecentSearches: () => Promise<void>
  removeRecentPlayed: (songIds: number[]) => Promise<void>
  clearRecentPlayed: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  updatePreferenceSettings: (update: PreferenceSettingsUpdate) => Promise<void>
  addPreferenceItem: (type: PreferenceEntityType, itemId: string, name: string, level?: PreferenceLevel) => Promise<void>
  updatePreferenceItem: (itemId: number, update: PreferenceItemUpdate) => Promise<void>
  removePreferenceItem: (itemId: number) => Promise<void>
  clearInvalidPreferenceItems: (type: PreferenceEntityType) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
  savePlaybackSettings: (update: PlaybackSettingsUpdate) => Promise<void>
  markSongPlayed: (songId: number) => Promise<void>
  updateSongDuration: (songId: number, duration: number) => Promise<void>
  onGlobalMediaCommand: (callback: (command: GlobalMediaCommand) => void) => () => void
}
