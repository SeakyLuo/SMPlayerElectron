export interface SongRow {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  favorite?: boolean
  playCount?: number
}

export interface CollectionCardData {
  title: string
  subtitle: string
  detail: string
  artworkUrl?: string
}

export const songs: SongRow[] = [
  { id: '1', title: '22', artist: 'Taylor Swift', album: 'Red (Deluxe Version)', duration: '3:52' },
  { id: '2', title: 'A Perfectly Good Heart', artist: 'Taylor Swift', album: 'Taylor Swift', duration: '3:40' },
  { id: '3', title: 'A Place In This World', artist: 'Taylor Swift', album: 'Taylor Swift', duration: '3:19' },
  { id: '4', title: 'All Too Well', artist: 'Taylor Swift', album: 'Red (Deluxe Version)', duration: '5:29', favorite: true },
  { id: '5', title: 'All You Had To Do Was Stay', artist: 'Taylor Swift', album: '1989 (Deluxe)', duration: '3:13' },
  { id: '6', title: 'Back to December (US Version)', artist: 'Taylor Swift', album: 'Speak Now', duration: '4:52', playCount: 1 },
  { id: '7', title: 'Back to December', artist: 'Taylor Swift', album: 'Speak Now', duration: '4:54' },
  { id: '8', title: 'Bad Blood', artist: 'Taylor Swift', album: '1989 (Deluxe)', duration: '3:31' },
  { id: '9', title: 'Begin Again', artist: 'Taylor Swift', album: 'Red (Deluxe Version)', duration: '3:57', favorite: true },
  { id: '10', title: 'Better Than Revenge', artist: 'Taylor Swift', album: 'Speak Now', duration: '3:37' },
  { id: '11', title: 'Blank Space (Guitar Vocal)', artist: 'Taylor Swift', album: '1989 (Deluxe)', duration: '2:11' },
  { id: '12', title: 'Blank Space', artist: 'Taylor Swift', album: '1989 (Deluxe)', duration: '3:51' },
  { id: '13', title: 'Breathe', artist: 'Taylor Swift', album: 'Fearless (Platinum Edition)', duration: '4:23' },
  { id: '14', title: 'Brought Up That Way', artist: 'Taylor Swift', album: 'Unreleased Songs', duration: '4:17' },
  { id: '15', title: 'Change', artist: 'Taylor Swift', album: 'Fearless (Platinum Edition)', duration: '4:41' },
  { id: '16', title: 'Clean', artist: 'Taylor Swift', album: '1989 (Deluxe)', duration: '4:31' },
  { id: '17', title: 'Cold As You', artist: 'Taylor Swift', album: 'Taylor Swift', duration: '3:59' },
  { id: '18', title: 'Come Back... Be Here', artist: 'Taylor Swift', album: 'Red (Deluxe Version)', duration: '3:43', favorite: true },
]

export const currentTrack = songs[5]

export const artists: CollectionCardData[] = [
  {
    title: 'Taylor Swift',
    subtitle: '18 songs in the seeded library shell',
    detail: 'The real migration target is a dynamic artist index backed by scanned tags and a persistent local database.',
  },
  {
    title: 'Compilation Artist',
    subtitle: 'Future multi-artist support',
    detail: 'This slot is reserved for the metadata rules that will reconcile album artists, track artists, and unknown tags.',
  },
  {
    title: 'Imported Voice',
    subtitle: 'Lyrics and remote play hooks',
    detail: 'The original app mixes playback, lyrics, and remote endpoints around the active artist context. That integration stays on the roadmap.',
  },
]

export const albums: CollectionCardData[] = [
  {
    title: 'Red (Deluxe Version)',
    subtitle: '4 seeded tracks',
    detail: 'Album drilldowns will carry artwork, sort modes, and contextual playback actions once the playback store is in place.',
  },
  {
    title: '1989 (Deluxe)',
    subtitle: '5 seeded tracks',
    detail: 'The album surface will keep the groove-style split between list browsing and a richer now-playing view.',
  },
  {
    title: 'Speak Now',
    subtitle: '3 seeded tracks',
    detail: 'This is the visual reference for the first pass of the large artwork treatment and bottom transport bar.',
  },
]

export const recentTracks: CollectionCardData[] = [
  {
    title: 'Last Played',
    subtitle: 'Back to December (US Version)',
    detail: 'Recent play history will come from the migrated settings and playback tables rather than renderer state.',
  },
  {
    title: 'Last Search',
    subtitle: 'Taylor Swift',
    detail: 'The original app keeps recent searches in SQLite. The Electron rebuild will preserve that model for history and suggestions.',
  },
  {
    title: 'Last Focus',
    subtitle: 'Music Library',
    detail: 'Navigation state and last page restoration are already part of the target settings schema.',
  },
]

export const localFolders: CollectionCardData[] = [
  {
    title: 'Primary Library Root',
    subtitle: 'Folder scan not wired yet',
    detail: 'The next backend milestone is scanning a chosen root folder and mapping every file into the same logical tables used by the old app.',
  },
  {
    title: 'Hidden Folders',
    subtitle: 'Migration placeholder',
    detail: 'The original local page supports hiding branches and non-music files. That behavior will live in the storage service, not the renderer.',
  },
  {
    title: 'Batch Operations',
    subtitle: 'Move, rename, and delete flow',
    detail: 'File operations will stay in the main process so the renderer remains a pure view layer with explicit IPC calls.',
  },
]

export const playlists: CollectionCardData[] = [
  {
    title: 'Now Playing',
    subtitle: 'Dynamic queue',
    detail: 'The UWP app models the current queue as a playlist. The Electron rebuild will keep that shape so queue actions stay predictable.',
  },
  {
    title: 'Road Trip Mix',
    subtitle: 'Manual playlist shell',
    detail: 'Playlist persistence is planned for the first SQLite pass so favorites and custom playlists can share the same infrastructure.',
  },
  {
    title: 'Focus Rotation',
    subtitle: 'Sort and reorder preview',
    detail: 'Drag sorting and playlist criteria will move over once the library and command bars are wired.',
  },
]

export const favorites: CollectionCardData[] = [
  {
    title: 'Liked Songs',
    subtitle: '3 seeded favorites',
    detail: 'Favorites remain a special playlist, just like in the original project, which simplifies migration and keeps behavior consistent.',
  },
  {
    title: 'Favorite Albums',
    subtitle: 'Planned preference view',
    detail: 'Preference pages from the UWP app will become derived views over songs, albums, artists, and playlists.',
  },
  {
    title: 'Most Played',
    subtitle: 'Playback analytics placeholder',
    detail: 'Play counts will be updated by the playback core, not inferred in the renderer, so counts stay consistent across windows and sessions.',
  },
]

export const settingsGroups: CollectionCardData[] = [
  {
    title: 'Storage',
    subtitle: 'Library root, hidden folders, scans',
    detail: 'This is the first backend migration because songs, albums, artists, and search all depend on it.',
  },
  {
    title: 'Playback',
    subtitle: 'Mode, volume, queue, progress',
    detail: 'The old player mixes repeat, shuffle, autoplay, mute, and progress persistence. Those move into a dedicated Electron playback service.',
  },
  {
    title: 'Shell Integration',
    subtitle: 'Tray, notifications, media keys',
    detail: 'These replace the UWP-only integration points with Electron-friendly equivalents on Windows and macOS.',
  },
]
