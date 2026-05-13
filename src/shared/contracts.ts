export interface AppInfo {
  platform: string
  version: string
  isPackaged: boolean
  userDataPath: string
}

export type PlaybackMode = 'once' | 'repeat' | 'repeat-one' | 'shuffle'
export type GlobalMediaCommand = 'play-pause' | 'next' | 'previous' | 'stop'
export type TrayCommand = 'scan-library' | 'show-window'
export type NotificationSendMode = 'music-changed' | 'never'
export type NotificationDisplayMode = 'reminder' | 'normal' | 'quick'
export type NightMode = 'auto' | 'on' | 'never'
export type LocalViewMode = 'grid' | 'list'
export type MusicLibrarySortCriterion =
  | 'title'
  | 'artist'
  | 'album'
  | 'duration'
  | 'play-count'
  | 'date-added'

export type PlaylistSortCriterion = MusicLibrarySortCriterion
export type LocalFolderSortCriterion = 'title' | 'artist' | 'album' | 'reverse'
export type AlbumSortCriterion = 'default' | 'name' | 'artist' | 'reverse'
export type SearchSortCriterion =
  | 'default'
  | 'name'
  | 'title'
  | 'artist'
  | 'album'
  | 'play-count'
  | 'duration'
  | 'date-added'

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

export type SongArtworkSource = 'cached' | 'embedded' | 'shell' | 'none'

export interface SongArtworkSnapshot {
  songId: number
  artworkUrl: string
  source: SongArtworkSource
}

export interface RecentLibrarySong extends LibrarySong {
  playedAt: string
}

export interface RecentPlaylistPlayback {
  id: number
  playlistId: number
  playedAt: string
}

export interface RecentAlbumPlayback {
  id: number
  album: string
  playedAt: string
}

export interface RecentArtistPlayback {
  id: number
  artist: string
  playedAt: string
}

export interface LibraryPlaylist {
  id: number
  name: string
  priority: number
  songCount: number
  songIds: number[]
  sortCriterion: PlaylistSortCriterion
  isBuiltIn: boolean
}

export interface LibraryFolder {
  id: number
  path: string
  parentId: number
  criterion: number
}

export interface HiddenStorageItem {
  id: number
  type: 'folder' | 'file'
  path: string
}

export interface RemoteShareSettings {
  deviceId: string
  deviceName: string
  shareEnabled: boolean
  port: number
  password: string
}

export interface RemoteShareStatus extends RemoteShareSettings {
  running: boolean
  addresses: string[]
}

export interface RemoteShareSettingsUpdate {
  deviceName?: string
  shareEnabled?: boolean
  port?: number
  password?: string
}

export type AuthorizedDeviceAuth = 'allowed' | 'blocked'

export interface AuthorizedDevice {
  id: number
  deviceId: string
  deviceName: string
  platform: string
  browser: string
  ip: string
  auth: AuthorizedDeviceAuth
  createdAt: string
  updatedAt: string
  lastSeenAt: string
}

export interface RemoteHost {
  id: number
  hostId: string
  name: string
  baseUrl: string
  platform: string
  createdAt: string
  updatedAt: string
  lastConnectedAt: string
}

export interface RemoteHostConnectRequest {
  baseUrl: string
  password: string
}

export interface RemoteHostConnectResult {
  host: RemoteHost
  songCount: number
}

export interface RemoteMusicData {
  host: RemoteHost
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favorites: MyFavoritesSnapshot
  nowPlaying: NowPlayingSnapshot
}

export interface NowPlayingSnapshot {
  playlistId: number
  songIds: number[]
}

export interface MyFavoritesSnapshot {
  playlistId: number
  songIds: number[]
  sortCriterion: PlaylistSortCriterion
}

export interface SearchHistoryEntry {
  id: number
  query: string
  type: SearchHistoryType
  searchedAt: string
}

export type SearchHistoryType = 'sidebar' | 'artists' | 'albums' | 'songs' | 'playlists' | 'folders'

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

export interface LyricsImportResult {
  canceled: boolean
  rawText: string
}

export interface SongArtworkPickResult {
  canceled: boolean
  sourcePath: string
  artworkUrl: string
  sourceName: string
  error?: 'no-artwork' | 'error'
}

export interface PendingSongDelete {
  id: string
  songId: number
}

export interface PendingLocalItemsDelete {
  id: string
  songIds: number[]
  folderPaths: string[]
}

export interface SongPropertiesSnapshot {
  songId: number
  path: string
  title: string
  subtitle: string
  artist: string
  artists: string[]
  album: string
  albumArtist: string
  publisher: string
  trackNumber: number
  year: number
  genre: string
  composers: string
  duration: number
  bitrate: number
  fileSize: number
  dateCreated: string
  dateModified: string
  fileType: string
  playCount: number
}

export interface SongPropertiesUpdate {
  title: string
  subtitle?: string
  artist: string
  artists?: string[]
  album: string
  albumArtist?: string
  publisher?: string
  trackNumber?: number
  year?: number
  genre?: string
  composers?: string
  playCount?: number
}

export interface TrackNotificationPayload {
  songId: number
  title: string
  artist: string
  album: string
}

export interface VoiceRecognitionResult {
  text: string
  error?: 'unsupported-platform' | 'unavailable' | 'privacy-required' | 'no-speech' | 'audio-capture' | 'canceled' | 'failed'
}

export interface VoiceRecognitionHypothesis {
  text: string
}

export interface VoiceRecognitionStateChange {
  state: 'idle' | 'capturing' | 'processing'
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
  smartMultiArtistRecognition: boolean
  showCount: boolean
  themeColor: string
  nightMode: NightMode
  nightModeStartTime: string
  nightModeEndTime: string
  notificationSend: NotificationSendMode
  notificationDisplay: NotificationDisplayMode
  showNotifications: boolean
  autoLyrics: boolean
  showLyricsInNotification: boolean
  notificationLyricsSource: LyricsRequestMode
  playerLyricsSource: LyricsRequestMode
  saveLyricsImmediately: boolean
  preserveInternetLyricsTimestamps: boolean
  preferredLanguage: PreferredLanguage
  musicLibrarySort: MusicLibrarySortCriterion
  albumsSort: AlbumSortCriterion
  searchArtistsCriterion: SearchSortCriterion
  searchAlbumsCriterion: SearchSortCriterion
  searchSongsCriterion: SearchSortCriterion
  searchPlaylistsCriterion: SearchSortCriterion
  searchFoldersCriterion: SearchSortCriterion
  lastMusicIndex: number
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  musicProgress: number
  autoPlay: boolean
  saveMusicProgress: boolean
  hideMultiSelectCommandBarAfterOperation: boolean
  localViewMode: LocalViewMode
  quitOnClose: boolean
  lastPage: string
  lastPlaylistId: number
  lastReleaseNotesVersion: string
}

export interface MusicData {
  settings: SettingsSnapshot
  counts: LibraryCounts
  songs: LibrarySong[]
  folders: LibraryFolder[]
  recentSongs: RecentLibrarySong[]
  recentPlaylists: RecentPlaylistPlayback[]
  recentAlbums: RecentAlbumPlayback[]
  recentArtists: RecentArtistPlayback[]
  playlists: LibraryPlaylist[]
  favorites: MyFavoritesSnapshot
  nowPlaying: NowPlayingSnapshot
  search: SearchSnapshot
}

export type LibraryShellSnapshot = Pick<
  MusicData,
  'settings' | 'counts' | 'playlists' | 'favorites' | 'nowPlaying' | 'search'
>

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

export type PlaybackRuntimeSettings = Pick<SettingsSnapshot, 'volume' | 'isMuted' | 'mode'>

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
  filesAdded: string[]
  filesRemoved: string[]
  filesMoved: string[]
  artistSplitsApplied: ArtistSplitResultItem[]
  artistSplitSuggestions: ArtistSplitResultItem[]
}

export interface ArtistSplitResultItem {
  songId: number
  path: string
  title: string
  artist: string
  artists: string[]
}

export type ScanLibraryProgressStage = 'checking' | 'updating'

export interface ScanLibraryProgress {
  operationId: string
  stage: ScanLibraryProgressStage
  progress: number
  max: number
  folderName?: string
  canCancel: boolean
}

export interface ScanLocalFolderPreparation {
  progressMax: number
}

export interface MoveLocalItemsProgress {
  operationId: string
  progress: number
  max: number
  currentItem: string
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
  smartMultiArtistRecognition?: boolean
  showCount?: boolean
  themeColor?: string
  nightMode?: NightMode
  nightModeStartTime?: string
  nightModeEndTime?: string
  notificationSend?: NotificationSendMode
  notificationDisplay?: NotificationDisplayMode
  showNotifications?: boolean
  autoLyrics?: boolean
  showLyricsInNotification?: boolean
  notificationLyricsSource?: LyricsRequestMode
  playerLyricsSource?: LyricsRequestMode
  saveLyricsImmediately?: boolean
  preserveInternetLyricsTimestamps?: boolean
  preferredLanguage?: PreferredLanguage
  musicLibrarySort?: MusicLibrarySortCriterion
  albumsSort?: AlbumSortCriterion
  searchArtistsCriterion?: SearchSortCriterion
  searchAlbumsCriterion?: SearchSortCriterion
  searchSongsCriterion?: SearchSortCriterion
  searchPlaylistsCriterion?: SearchSortCriterion
  searchFoldersCriterion?: SearchSortCriterion
  autoPlay?: boolean
  saveMusicProgress?: boolean
  hideMultiSelectCommandBarAfterOperation?: boolean
  localViewMode?: LocalViewMode
  quitOnClose?: boolean
  lastReleaseNotesVersion?: string
}

export interface ViewStateUpdate {
  lastPage?: string
  lastPlaylistId?: number
}

export interface SmplayerApi {
  getAppInfo: () => Promise<AppInfo>
  getLibraryShell: () => Promise<LibraryShellSnapshot>
  getLibrarySettings: () => Promise<SettingsSnapshot>
  getLibraryCounts: () => Promise<LibraryCounts>
  getLibrarySongs: () => Promise<LibrarySong[]>
  getLibraryFolders: () => Promise<LibraryFolder[]>
  getRecentSongs: () => Promise<RecentLibrarySong[]>
  getRecentPlaylists: () => Promise<RecentPlaylistPlayback[]>
  getRecentAlbums: () => Promise<RecentAlbumPlayback[]>
  getRecentArtists: () => Promise<RecentArtistPlayback[]>
  getLibraryPlaylists: () => Promise<LibraryPlaylist[]>
  getLibraryFavorites: () => Promise<MyFavoritesSnapshot>
  getNowPlaying: () => Promise<NowPlayingSnapshot>
  getSearch: () => Promise<SearchSnapshot>
  getPreferenceSettings: () => Promise<PreferenceSettingsSnapshot>
  getSongProperties: (songId: number) => Promise<SongPropertiesSnapshot>
  updateSongProperties: (songId: number, update: SongPropertiesUpdate) => Promise<void>
  updateSongPlayCount: (songId: number, playCount: number) => Promise<void>
  getLyrics: (songId: number, mode?: LyricsRequestMode) => Promise<LyricsSnapshot>
  importLyrics: () => Promise<LyricsImportResult>
  saveSongLyrics: (songId: number, rawLyrics: string) => Promise<void>
  openLyricsSearchInBrowser: (songId: number) => Promise<void>
  saveInternetLyricsToFile: (songId: number) => Promise<LyricsSaveResult>
  revealItemInFolder: (path: string) => Promise<void>
  startWindowDrag: () => Promise<void>
  stopWindowDrag: () => Promise<void>
  setWindowControlsLight: (light: boolean) => Promise<void>
  setWindowFullScreen: (fullScreen: boolean) => Promise<void>
  getWindowFullScreen: () => Promise<boolean>
  setWindowMiniMode: (miniMode: boolean) => Promise<void>
  getWindowMiniMode: () => Promise<boolean>
  createLocalFolder: (rootPath: string, relativePath: string, name: string) => Promise<void>
  revealSystemLogs: () => Promise<void>
  showTrackNotification: (track: TrackNotificationPayload) => Promise<void>
  getSongArtworkSnapshot: (songId: number) => Promise<SongArtworkSnapshot>
  getSongArtworkSnapshots: (songIds: number[]) => Promise<SongArtworkSnapshot[]>
  pickAlbumArtwork: (albumName: string) => Promise<void>
  pickAlbumArtworkSource: () => Promise<SongArtworkPickResult>
  saveAlbumArtwork: (albumName: string, sourcePath: string) => Promise<void>
  deleteAlbumArtwork: (albumName: string) => Promise<void>
  pickSongArtworkSource: () => Promise<SongArtworkPickResult>
  saveSongArtwork: (songId: number, sourcePath: string) => Promise<void>
  deleteSongArtwork: (songId: number) => Promise<void>
  deleteSongFromDisk: (songId: number) => Promise<PendingSongDelete>
  undoDeleteSongFromDisk: (deleteId: string) => Promise<void>
  commitDeleteSongFromDisk: (deleteId: string) => Promise<void>
  hideSong: (songId: number) => Promise<void>
  moveSongToFolder: (songId: number, folderPath: string) => Promise<void>
  moveSongsToFolder: (songIds: number[], folderPath: string) => Promise<void>
  moveLocalFolderToFolder: (sourceFolderPath: string, targetFolderPath: string) => Promise<void>
  moveLocalItemsToFolder: (songIds: number[], folderPaths: string[], targetFolderPath: string, operationId?: string) => Promise<void>
  deleteSongsFromDisk: (songIds: number[]) => Promise<void>
  deleteLocalItems: (songIds: number[], folderPaths: string[]) => Promise<PendingLocalItemsDelete>
  updateLocalFolderSort: (folderPath: string, sortCriterion: LocalFolderSortCriterion) => Promise<void>
  renameLocalFolder: (folderPath: string, name: string) => Promise<void>
  deleteLocalFolder: (folderPath: string) => Promise<PendingLocalItemsDelete>
  hideLocalFolder: (path: string) => Promise<void>
  getHiddenStorageItems: () => Promise<HiddenStorageItem[]>
  resumeHiddenStorageItem: (item: HiddenStorageItem) => Promise<void>
  getRemoteShareStatus: () => Promise<RemoteShareStatus>
  updateRemoteShareSettings: (update: RemoteShareSettingsUpdate) => Promise<RemoteShareStatus>
  startRemoteShare: () => Promise<RemoteShareStatus>
  stopRemoteShare: () => Promise<RemoteShareStatus>
  getAuthorizedDevices: () => Promise<AuthorizedDevice[]>
  updateAuthorizedDevice: (deviceId: number, update: { deviceName?: string; auth?: AuthorizedDeviceAuth }) => Promise<void>
  deleteAuthorizedDevice: (deviceId: number) => Promise<void>
  getRemoteHosts: () => Promise<RemoteHost[]>
  connectRemoteHost: (request: RemoteHostConnectRequest) => Promise<RemoteHostConnectResult>
  getRemoteHostLibrary: (hostId: number) => Promise<RemoteMusicData>
  deleteRemoteHost: (hostId: number) => Promise<void>
  pickLibraryRoot: () => Promise<ChooseLibraryRootResult>
  scanLibrary: (rootPath?: string) => Promise<ScanLibraryResult>
  prepareScanLocalFolder: (folderPath: string) => Promise<ScanLocalFolderPreparation>
  scanLocalFolder: (folderPath: string, operationId?: string, progressMax?: number) => Promise<ScanLibraryResult>
  cancelScanLocalFolder: (operationId: string) => Promise<void>
  applyArtistSplits: (splits: ArtistSplitResultItem[]) => Promise<void>
  onScanLocalFolderProgress: (callback: (progress: ScanLibraryProgress) => void) => () => void
  onMoveLocalItemsProgress: (callback: (progress: MoveLocalItemsProgress) => void) => () => void
  takePendingOpenFiles: () => Promise<number[]>
  exportData: () => Promise<DataTransferResult>
  importData: () => Promise<DataTransferResult>
  sendFeedbackEmail: () => Promise<void>
  openFeedbackInBrowser: () => Promise<void>
  openVoiceAssistantPrivacySettings: () => Promise<void>
  recognizeSpeech: (language: string) => Promise<VoiceRecognitionResult>
  cancelSpeechRecognition: () => Promise<void>
  onVoiceRecognitionHypothesis: (callback: (hypothesis: VoiceRecognitionHypothesis) => void) => () => void
  onVoiceRecognitionStateChange: (callback: (update: VoiceRecognitionStateChange) => void) => () => void
  setSongFavorite: (songId: number, favorite: boolean) => Promise<void>
  setSongsFavorite: (songIds: number[], favorite: boolean) => Promise<void>
  createPlaylist: (name: string, songIds?: number[]) => Promise<LibraryPlaylist>
  deletePlaylist: (playlistId: number) => Promise<void>
  restorePlaylist: (playlist: LibraryPlaylist) => Promise<void>
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
  addRecentSearch: (query: string, type?: SearchHistoryType) => Promise<SearchHistoryEntry | null>
  removeRecentSearch: (entryId: number) => Promise<void>
  removeRecentSearches: (entryIds: number[]) => Promise<void>
  restoreRecentSearch: (entry: SearchHistoryEntry) => Promise<void>
  clearRecentSearches: () => Promise<void>
  recordRecentPlaylistPlayed: (playlistId: number) => Promise<RecentPlaylistPlayback>
  recordRecentAlbumPlayed: (album: string) => Promise<RecentAlbumPlayback>
  recordRecentArtistPlayed: (artist: string) => Promise<RecentArtistPlayback>
  removeRecentPlayed: (songIds: number[]) => Promise<void>
  restoreRecentPlayed: (songIds: number[]) => Promise<void>
  clearRecentPlayed: () => Promise<void>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  updatePreferenceSettings: (update: PreferenceSettingsUpdate) => Promise<void>
  addPreferenceItem: (type: PreferenceEntityType, itemId: string, name: string, level?: PreferenceLevel) => Promise<void>
  updatePreferenceItem: (itemId: number, update: PreferenceItemUpdate) => Promise<void>
  removePreferenceItem: (itemId: number) => Promise<void>
  clearInvalidPreferenceItems: (type: PreferenceEntityType) => Promise<void>
  saveViewState: (update: ViewStateUpdate) => Promise<void>
  savePlaybackSettings: (update: PlaybackSettingsUpdate) => Promise<void>
  getPlaybackSettingsImmediate: () => PlaybackRuntimeSettings
  savePlaybackSettingsImmediate: (update: PlaybackSettingsUpdate) => void
  markSongPlayed: (songId: number) => Promise<void>
  updateSongDuration: (songId: number, duration: number) => Promise<void>
  onGlobalMediaCommand: (callback: (command: GlobalMediaCommand) => void) => () => void
  onTrayCommand: (callback: (command: TrayCommand) => void) => () => void
  onWindowFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void
  onWindowMiniModeChange: (callback: (miniMode: boolean) => void) => () => void
  onOpenFiles: (callback: (songIds: number[]) => void) => () => void
}
