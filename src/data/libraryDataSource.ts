import type {
  AppSettingsUpdate,
  LibraryCounts,
  LibraryFolder,
  LibraryPlaylist,
  LibrarySnapshot,
  LibrarySong,
  MusicLibrarySortCriterion,
  MyFavoritesSnapshot,
  NowPlayingSnapshot,
  RemoteLibrarySnapshot,
  SearchSnapshot,
  SettingsSnapshot,
} from '../shared/contracts'
import { getSongArtists } from '../shared/artists'

export type LibraryDataSourceKind = 'local' | 'remote'

export interface LibraryArtistQueryResult {
  name: string
  songs: LibrarySong[]
  songCount: number
  albumCount: number
  playCount: number
  duration: number
  artworkUrl: string
}

export interface LibraryAlbumQueryResult {
  name: string
  artist: string
  songs: LibrarySong[]
  songCount: number
  playCount: number
  duration: number
  artworkUrl: string
}

export interface LibraryDataSource {
  readonly kind: LibraryDataSourceKind
  readonly id: string
  readonly name: string
  getSnapshot: () => Promise<LibrarySnapshot>
  getSettings: () => Promise<SettingsSnapshot>
  getCounts: () => Promise<LibraryCounts>
  getSongs: () => Promise<LibrarySong[]>
  getArtists: () => Promise<LibraryArtistQueryResult[]>
  getAlbums: () => Promise<LibraryAlbumQueryResult[]>
  getFolders: () => Promise<LibraryFolder[]>
  getPlaylists: () => Promise<LibraryPlaylist[]>
  getFavorites: () => Promise<MyFavoritesSnapshot>
  getNowPlaying: () => Promise<NowPlayingSnapshot>
  getSearch: () => Promise<SearchSnapshot>
  updateSettings: (update: AppSettingsUpdate) => Promise<void>
  getStreamUrl: (song: LibrarySong) => string
}

function createRemoteSettings(musicLibrarySort: MusicLibrarySortCriterion) {
  return {
    rootPath: '',
    useFilenameNotMusicName: false,
    showCount: true,
    themeColor: '#0078D7',
    nightMode: 'never' as const,
    nightModeStartTime: '20:00',
    nightModeEndTime: '06:00',
    notificationSend: 'never' as const,
    notificationDisplay: 'normal' as const,
    showNotifications: false,
    autoLyrics: false,
    showLyricsInNotification: false,
    notificationLyricsSource: 'local' as const,
    playerLyricsSource: 'auto' as const,
    saveLyricsImmediately: false,
    preserveInternetLyricsTimestamps: true,
    preferredLanguage: 'system' as const,
    musicLibrarySort,
    albumsSort: 'default' as const,
    searchArtistsCriterion: 'default' as const,
    searchAlbumsCriterion: 'default' as const,
    searchSongsCriterion: 'default' as const,
    searchPlaylistsCriterion: 'default' as const,
    searchFoldersCriterion: 'default' as const,
    lastMusicIndex: -1,
    volume: 72,
    isMuted: false,
    mode: 'once' as const,
    musicProgress: 0,
    autoPlay: false,
    saveMusicProgress: false,
    hideMultiSelectCommandBarAfterOperation: true,
    localViewMode: 'grid' as const,
    quitOnClose: true,
    lastPage: '/remote',
    lastPlaylistId: 0,
    lastReleaseNotesVersion: '',
  }
}

function createSnapshotFromRemote(remoteSnapshot: RemoteLibrarySnapshot, musicLibrarySort: MusicLibrarySortCriterion): LibrarySnapshot {
  const albums = new Set(remoteSnapshot.songs.map((song) => song.album).filter(Boolean))
  const artists = new Set(remoteSnapshot.songs.flatMap((song) => song.artists.length > 0 ? song.artists : [song.artist]).filter(Boolean))

  return {
    settings: createRemoteSettings(musicLibrarySort),
    counts: {
      songs: remoteSnapshot.songs.length,
      artists: artists.size,
      albums: albums.size,
      folders: 0,
    },
    songs: remoteSnapshot.songs,
    folders: [],
    recentSongs: [],
    playlists: remoteSnapshot.playlists,
    favorites: remoteSnapshot.favorites,
    nowPlaying: remoteSnapshot.nowPlaying,
    search: {
      lastQuery: '',
      recentSearches: [],
    },
  }
}

export async function getLibrarySnapshotFromDataSource(dataSource: LibraryDataSource): Promise<LibrarySnapshot> {
  return dataSource.getSnapshot()
}

export function createLocalLibraryDataSource(snapshot: LibrarySnapshot, updateSettings: (update: AppSettingsUpdate) => Promise<void>): LibraryDataSource {
  return {
    kind: 'local',
    id: 'local',
    name: 'Local',
    getSnapshot: async () => snapshot,
    getSettings: async () => snapshot.settings,
    getCounts: async () => snapshot.counts,
    getSongs: async () => snapshot.songs,
    getArtists: async () => buildArtistQueryResults(snapshot.songs),
    getAlbums: async () => buildAlbumQueryResults(snapshot.songs),
    getFolders: async () => snapshot.folders,
    getPlaylists: async () => snapshot.playlists,
    getFavorites: async () => snapshot.favorites,
    getNowPlaying: async () => snapshot.nowPlaying,
    getSearch: async () => snapshot.search,
    updateSettings,
    getStreamUrl: (song) => song.mediaUrl,
  }
}

export function createRemoteLibraryDataSource(hostId: number): LibraryDataSource {
  let cachedSnapshot: RemoteLibrarySnapshot | null = null
  let cachedLibrarySnapshot: LibrarySnapshot | null = null
  let musicLibrarySort: MusicLibrarySortCriterion = 'title'

  const loadSnapshot = async () => {
    const nextSnapshot = await window.smplayer!.getRemoteHostLibrary(hostId)
    const songIdMap = new Map<number, number>()
    for (const [index, song] of nextSnapshot.songs.entries()) {
      songIdMap.set(song.id, -(index + 1))
    }
    const mapSongIds = (songIds: number[]) => songIds.map((songId) => songIdMap.get(songId)!)
    cachedSnapshot = {
      ...nextSnapshot,
      songs: nextSnapshot.songs.map((song, index) => ({
        ...song,
        id: -(index + 1),
      })),
      playlists: nextSnapshot.playlists.map((playlist) => ({
        ...playlist,
        songIds: mapSongIds(playlist.songIds),
        songCount: playlist.songIds.length,
      })),
      favorites: {
        ...nextSnapshot.favorites,
        songIds: mapSongIds(nextSnapshot.favorites.songIds),
      },
      nowPlaying: {
        ...nextSnapshot.nowPlaying,
        songIds: mapSongIds(nextSnapshot.nowPlaying.songIds),
      },
    }
    cachedLibrarySnapshot = createSnapshotFromRemote(cachedSnapshot, musicLibrarySort)
    return cachedLibrarySnapshot
  }

  const getSnapshot = async () => cachedLibrarySnapshot ?? await loadSnapshot()

  return {
    kind: 'remote',
    id: `remote:${hostId}`,
    get name() {
      return cachedSnapshot?.host.name ?? ''
    },
    getSnapshot: getSnapshot,
    getSettings: async () => (await getSnapshot()).settings,
    getCounts: async () => (await getSnapshot()).counts,
    getSongs: async () => (await getSnapshot()).songs,
    getArtists: async () => buildArtistQueryResults((await getSnapshot()).songs),
    getAlbums: async () => buildAlbumQueryResults((await getSnapshot()).songs),
    getFolders: async () => (await getSnapshot()).folders,
    getPlaylists: async () => (await getSnapshot()).playlists,
    getFavorites: async () => (await getSnapshot()).favorites,
    getNowPlaying: async () => (await getSnapshot()).nowPlaying,
    getSearch: async () => (await getSnapshot()).search,
    async updateSettings(update) {
      if (update.musicLibrarySort) {
        musicLibrarySort = update.musicLibrarySort
        if (cachedSnapshot) {
          cachedLibrarySnapshot = createSnapshotFromRemote(cachedSnapshot, musicLibrarySort)
        }
      }
    },
    getStreamUrl(song) {
      return song.mediaUrl
    },
  }
}

function buildArtistQueryResults(songs: LibrarySong[]) {
  const songsByArtist = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    for (const artist of getSongArtists(song)) {
      songsByArtist.set(artist, [...(songsByArtist.get(artist) ?? []), song])
    }
  }

  return [...songsByArtist.entries()]
    .map(([name, artistSongs]) => {
      const albums = new Set(artistSongs.map((song) => song.album).filter(Boolean))
      return {
        name,
        songs: artistSongs,
        songCount: artistSongs.length,
        albumCount: albums.size,
        playCount: artistSongs.reduce((total, song) => total + song.playCount, 0),
        duration: artistSongs.reduce((total, song) => total + song.duration, 0),
        artworkUrl: artistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function buildAlbumQueryResults(songs: LibrarySong[]) {
  const songsByAlbum = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    songsByAlbum.set(song.album, [...(songsByAlbum.get(song.album) ?? []), song])
  }

  return [...songsByAlbum.entries()]
    .map(([name, albumSongs]) => ({
      name,
      artist: albumSongs[0]!.artist,
      songs: albumSongs,
      songCount: albumSongs.length,
      playCount: albumSongs.reduce((total, song) => total + song.playCount, 0),
      duration: albumSongs.reduce((total, song) => total + song.duration, 0),
      artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}
