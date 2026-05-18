import type {
  AppSettingsUpdate,
  LibraryCounts,
  LibraryFolder,
  LibraryPlaylist,
  MusicData,
  LibrarySong,
  MusicLibrarySortCriterion,
  MyFavoritesSnapshot,
  NowPlayingSnapshot,
  RecentAlbumPlayback,
  RecentArtistPlayback,
  RecentLibrarySong,
  RecentPlaylistPlayback,
  RemoteMusicData,
  SearchSnapshot,
  SettingsSnapshot,
} from '../shared/contracts'
import { getSongArtists } from '../shared/artists'

export type MusicDataSourceKind = 'local' | 'remote'

export interface ArtistQueryResult {
  name: string
  songs: LibrarySong[]
  songCount: number
  albumCount: number
  playCount: number
  duration: number
  artworkUrl: string
}

export interface AlbumQueryResult {
  name: string
  artist: string
  songs: LibrarySong[]
  songCount: number
  playCount: number
  duration: number
  artworkUrl: string
}

export interface MusicDataSource {
  readonly kind: MusicDataSourceKind
  readonly id: string
  readonly name: string
  getSettings: () => Promise<SettingsSnapshot>
  getCounts: () => Promise<LibraryCounts>
  getSongs: () => Promise<LibrarySong[]>
  getArtists: () => Promise<ArtistQueryResult[]>
  getAlbums: () => Promise<AlbumQueryResult[]>
  getFolders: () => Promise<LibraryFolder[]>
  getRecentSongs: () => Promise<RecentLibrarySong[]>
  getRecentPlaylists: () => Promise<RecentPlaylistPlayback[]>
  getRecentAlbums: () => Promise<RecentAlbumPlayback[]>
  getRecentArtists: () => Promise<RecentArtistPlayback[]>
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
    smartMultiArtistRecognition: true,
    showCount: true,
    themeColor: '#0078D7',
    nightMode: 'never' as const,
    nightModeStartTime: '20:00',
    nightModeEndTime: '06:00',
    notificationSend: 'never' as const,
    notificationDisplay: 'normal' as const,
    showNotifications: false,
    autoLyrics: true,
    showLyricsInNotification: false,
    notificationLyricsSource: 'local' as const,
    playerLyricsSource: 'auto' as const,
    saveLyricsImmediately: true,
    preserveInternetLyricsTimestamps: true,
    desktopLyricsEnabled: false,
    desktopLyricsLocked: false,
    desktopLyricsColor: '#4aa8ff',
    desktopLyricsStrokeColor: '#111111',
    desktopLyricsFontSize: 28,
    desktopLyricsFontFamily: 'system' as const,
    desktopLyricsOpacity: 88,
    desktopLyricsBounds: '',
    preferredLanguage: 'system' as const,
    musicLibrarySort,
    albumsSort: 'default' as const,
    searchArtistsCriterion: 'default' as const,
    searchAlbumsCriterion: 'default' as const,
    searchSongsCriterion: 'default' as const,
    searchPlaylistsCriterion: 'default' as const,
    searchFoldersCriterion: 'default' as const,
    lastMusicIndex: -1,
    volume: 50,
    isMuted: false,
    mode: 'once' as const,
    musicProgress: 0,
    autoPlay: false,
    saveMusicProgress: true,
    hideMultiSelectCommandBarAfterOperation: true,
    localViewMode: 'grid' as const,
    quitOnClose: true,
    lastPage: '/remote',
    lastPlaylistId: 0,
    lastReleaseNotesVersion: '',
  }
}

function createDataFromRemote(remoteData: RemoteMusicData, musicLibrarySort: MusicLibrarySortCriterion): MusicData {
  const albums = new Set(remoteData.songs.map((song) => song.album).filter(Boolean))
  const artists = new Set(remoteData.songs.flatMap((song) => song.artists.length > 0 ? song.artists : [song.artist]).filter(Boolean))

  return {
    settings: createRemoteSettings(musicLibrarySort),
    counts: {
      songs: remoteData.songs.length,
      artists: artists.size,
      albums: albums.size,
      folders: 0,
    },
    songs: remoteData.songs,
    folders: [],
    recentSongs: [],
    recentPlaylists: [],
    recentAlbums: [],
    recentArtists: [],
    playlists: remoteData.playlists,
    favorites: remoteData.favorites,
    nowPlaying: remoteData.nowPlaying,
    search: {
      lastQuery: '',
      recentSearches: [],
    },
  }
}

export async function getMusicDataFromDataSource(dataSource: MusicDataSource): Promise<MusicData> {
  const [
    settings,
    counts,
    songs,
    folders,
    recentSongs,
    recentPlaylists,
    recentAlbums,
    recentArtists,
    playlists,
    favorites,
    nowPlaying,
    search,
  ] = await Promise.all([
    dataSource.getSettings(),
    dataSource.getCounts(),
    dataSource.getSongs(),
    dataSource.getFolders(),
    dataSource.getRecentSongs(),
    dataSource.getRecentPlaylists(),
    dataSource.getRecentAlbums(),
    dataSource.getRecentArtists(),
    dataSource.getPlaylists(),
    dataSource.getFavorites(),
    dataSource.getNowPlaying(),
    dataSource.getSearch(),
  ])

  return {
    settings,
    counts,
    songs,
    folders,
    recentSongs,
    recentPlaylists,
    recentAlbums,
    recentArtists,
    playlists,
    favorites,
    nowPlaying,
    search,
  }
}

export function createLocalMusicDataSource(snapshot: MusicData, updateSettings: (update: AppSettingsUpdate) => Promise<void>): MusicDataSource {
  return {
    kind: 'local',
    id: 'local',
    name: 'Local',
    getSettings: async () => snapshot.settings,
    getCounts: async () => snapshot.counts,
    getSongs: async () => snapshot.songs,
    getArtists: async () => buildArtistQueryResults(snapshot.songs),
    getAlbums: async () => buildAlbumQueryResults(snapshot.songs),
    getFolders: async () => snapshot.folders,
    getRecentSongs: async () => snapshot.recentSongs,
    getRecentPlaylists: async () => snapshot.recentPlaylists,
    getRecentAlbums: async () => snapshot.recentAlbums,
    getRecentArtists: async () => snapshot.recentArtists,
    getPlaylists: async () => snapshot.playlists,
    getFavorites: async () => snapshot.favorites,
    getNowPlaying: async () => snapshot.nowPlaying,
    getSearch: async () => snapshot.search,
    updateSettings,
    getStreamUrl: (song) => song.mediaUrl,
  }
}

export function createRemoteMusicDataSource(hostId: number): MusicDataSource {
  let cachedRemoteData: RemoteMusicData | null = null
  let cachedMusicData: MusicData | null = null
  let loadingData: Promise<MusicData> | null = null
  let musicLibrarySort: MusicLibrarySortCriterion = 'title'

  const loadRemoteData = async () => {
    const nextData = await window.smplayer!.getRemoteHostLibrary(hostId)
    const songIdMap = new Map<number, number>()
    for (const [index, song] of nextData.songs.entries()) {
      songIdMap.set(song.id, -(index + 1))
    }
    const mapSongIds = (songIds: number[]) => songIds.map((songId) => songIdMap.get(songId)!)
    cachedRemoteData = {
      ...nextData,
      songs: nextData.songs.map((song, index) => ({
        ...song,
        id: -(index + 1),
      })),
      playlists: nextData.playlists.map((playlist) => ({
        ...playlist,
        songIds: mapSongIds(playlist.songIds),
        songCount: playlist.songIds.length,
      })),
      favorites: {
        ...nextData.favorites,
        songIds: mapSongIds(nextData.favorites.songIds),
      },
      nowPlaying: {
        ...nextData.nowPlaying,
        songIds: mapSongIds(nextData.nowPlaying.songIds),
      },
    }
    cachedMusicData = createDataFromRemote(cachedRemoteData, musicLibrarySort)
    return cachedMusicData
  }

  const loadData = async () => {
    if (cachedMusicData) {
      return cachedMusicData
    }

    loadingData ??= loadRemoteData().finally(() => {
      loadingData = null
    })
    return await loadingData
  }

  return {
    kind: 'remote',
    id: `remote:${hostId}`,
    get name() {
      return cachedRemoteData?.host.name ?? ''
    },
    getSettings: async () => (await loadData()).settings,
    getCounts: async () => (await loadData()).counts,
    getSongs: async () => (await loadData()).songs,
    getArtists: async () => buildArtistQueryResults((await loadData()).songs),
    getAlbums: async () => buildAlbumQueryResults((await loadData()).songs),
    getFolders: async () => (await loadData()).folders,
    getRecentSongs: async () => [],
    getRecentPlaylists: async () => [],
    getRecentAlbums: async () => [],
    getRecentArtists: async () => [],
    getPlaylists: async () => (await loadData()).playlists,
    getFavorites: async () => (await loadData()).favorites,
    getNowPlaying: async () => (await loadData()).nowPlaying,
    getSearch: async () => (await loadData()).search,
    async updateSettings(update) {
      if (update.musicLibrarySort) {
        musicLibrarySort = update.musicLibrarySort
        if (cachedRemoteData) {
          cachedMusicData = createDataFromRemote(cachedRemoteData, musicLibrarySort)
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
