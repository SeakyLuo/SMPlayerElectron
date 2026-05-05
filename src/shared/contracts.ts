export interface AppInfo {
  platform: string
  version: string
  isPackaged: boolean
  userDataPath: string
}

export type PlaybackMode = 'once' | 'repeat' | 'repeat-one' | 'shuffle'

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
export type LyricsRequestMode = 'auto' | 'local' | 'internet'
export type PreferredLanguage = 'system' | 'zh-CN' | 'en-US' | 'ja-JP'

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
  showNotifications: boolean
  autoLyrics: boolean
  showLyricsInNotification: boolean
  notificationLyricsSource: LyricsRequestMode
  saveLyricsImmediately: boolean
  preferredLanguage: PreferredLanguage
  lastMusicIndex: number
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  musicProgress: number
  autoPlay: boolean
  saveMusicProgress: boolean
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

export interface ChooseLibraryRootResult {
  rootPath: string | null
}

export interface ScanLibraryResult {
  rootPath: string
  songCount: number
  folderCount: number
  elapsedMs: number
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
  showNotifications?: boolean
  autoLyrics?: boolean
  showLyricsInNotification?: boolean
  notificationLyricsSource?: LyricsRequestMode
  saveLyricsImmediately?: boolean
  preferredLanguage?: PreferredLanguage
  autoPlay?: boolean
  saveMusicProgress?: boolean
}

export interface ViewStateUpdate {
  lastPage?: string
  lastPlaylistId?: number
}

export interface SmplayerApi {
  getAppInfo: () => Promise<AppInfo>
  getLibrarySnapshot: () => Promise<LibrarySnapshot>
  getLyrics: (songId: number, mode?: LyricsRequestMode) => Promise<LyricsSnapshot>
  revealItemInFolder: (path: string) => Promise<void>
  showTrackNotification: (track: TrackNotificationPayload) => Promise<void>
  pickLibraryRoot: () => Promise<ChooseLibraryRootResult>
  scanLibrary: (rootPath?: string) => Promise<ScanLibraryResult>
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
  clearNowPlaying: () => Promise<void>
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string) => Promise<void>
  removeRecentSearch: (entryId: number) => Promise<void>
  clearRecentSearches: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
  savePlaybackSettings: (update: PlaybackSettingsUpdate) => Promise<void>
  markSongPlayed: (songId: number) => Promise<void>
}
