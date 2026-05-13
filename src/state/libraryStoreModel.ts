import type {
  AppSettingsUpdate,
  LibraryPlaylist,
  MusicData,
  LocalFolderSortCriterion,
  RecentAlbumPlayback,
  RecentArtistPlayback,
  RecentPlaylistPlayback,
  ViewStateUpdate,
} from '../shared/contracts'

export const emptySnapshot: MusicData = {
  settings: {
    rootPath: '',
    useFilenameNotMusicName: false,
    smartMultiArtistRecognition: true,
    showCount: true,
    themeColor: '#0078D7',
    nightMode: 'never',
    nightModeStartTime: '20:00',
    nightModeEndTime: '06:00',
    notificationSend: 'music-changed',
    notificationDisplay: 'normal',
    showNotifications: true,
    autoLyrics: false,
    showLyricsInNotification: false,
    notificationLyricsSource: 'internet',
    playerLyricsSource: 'auto',
    saveLyricsImmediately: false,
    preserveInternetLyricsTimestamps: true,
    preferredLanguage: 'system',
    musicLibrarySort: 'title',
    albumsSort: 'default',
    searchArtistsCriterion: 'default',
    searchAlbumsCriterion: 'default',
    searchSongsCriterion: 'default',
    searchPlaylistsCriterion: 'default',
    searchFoldersCriterion: 'default',
    lastMusicIndex: -1,
    volume: 50,
    isMuted: false,
    mode: 'once',
    musicProgress: 0,
    autoPlay: false,
    saveMusicProgress: false,
    hideMultiSelectCommandBarAfterOperation: true,
    localViewMode: 'grid',
    quitOnClose: true,
    lastPage: '/songs',
    lastPlaylistId: 0,
    lastReleaseNotesVersion: '',
  },
  counts: {
    songs: 0,
    artists: 0,
    albums: 0,
    folders: 0,
  },
  songs: [],
  folders: [],
  recentSongs: [],
  recentPlaylists: [],
  recentAlbums: [],
  recentArtists: [],
  playlists: [],
  favorites: {
    playlistId: 0,
    songIds: [],
    sortCriterion: 'title',
  },
  nowPlaying: {
    playlistId: 0,
    songIds: [],
  },
  search: {
    lastQuery: '',
    recentSearches: [],
  },
}

export const SCAN_CANCELED_ERROR_MESSAGE = 'Scan canceled'

export function toLocalFolderSortValue(criterion: LocalFolderSortCriterion) {
  return {
    title: 0,
    artist: 1,
    album: 2,
    reverse: 7,
  }[criterion]
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown library error.'
}

export function getLocalFolderPath(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return rootPath
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${folderRelativePath.split('/').join(separator)}`
}

export function patchSnapshotSettings(update: AppSettingsUpdate & ViewStateUpdate) {
  return (state: { snapshot: MusicData; error: string | null }) => ({
    error: null,
    snapshot: {
      ...state.snapshot,
      settings: {
        ...state.snapshot.settings,
        ...update,
      },
    },
  })
}

export function insertRecentPlaylistPlayback(
  items: RecentPlaylistPlayback[],
  entry: RecentPlaylistPlayback,
) {
  return [entry, ...items.filter((item) => item.playlistId !== entry.playlistId)]
}

export function insertRecentAlbumPlayback(
  items: RecentAlbumPlayback[],
  entry: RecentAlbumPlayback,
) {
  return [entry, ...items.filter((item) => item.album !== entry.album)]
}

export function insertRecentArtistPlayback(
  items: RecentArtistPlayback[],
  entry: RecentArtistPlayback,
) {
  return [entry, ...items.filter((item) => item.artist !== entry.artist)]
}

export function patchPlaylistSongs(
  snapshot: MusicData,
  playlistId: number,
  songIds: number[],
  active: boolean,
): MusicData {
  const targetPlaylist = snapshot.playlists.find((playlist) => playlist.id === playlistId)
  const isFavoritesPlaylist = playlistId === snapshot.favorites.playlistId
  const nextSnapshot = isFavoritesPlaylist ? patchSongsFavorite(snapshot, songIds, active) : snapshot
  const nextFavorites = isFavoritesPlaylist
    ? {
        ...nextSnapshot.favorites,
        songIds: patchPlaylistSongState(
          { ...targetPlaylist!, songIds: nextSnapshot.favorites.songIds, songCount: nextSnapshot.favorites.songIds.length },
          songIds,
          active,
        ).songIds,
      }
    : nextSnapshot.favorites

  return {
    ...nextSnapshot,
    favorites: nextFavorites,
    playlists: nextSnapshot.playlists.map((playlist) =>
      playlist.id === playlistId ? patchPlaylistSongState(playlist, songIds, active) : playlist,
    ),
  }
}

export function getFavoritePlaylistId(snapshot: MusicData) {
  return snapshot.favorites.playlistId
}

export function insertCustomPlaylistFirst(playlists: LibraryPlaylist[], playlist: LibraryPlaylist) {
  const firstCustomPlaylistIndex = playlists.findIndex((item) => !item.isBuiltIn)

  if (firstCustomPlaylistIndex < 0) {
    return [...playlists, playlist]
  }

  return [
    ...playlists.slice(0, firstCustomPlaylistIndex),
    playlist,
    ...playlists.slice(firstCustomPlaylistIndex),
  ]
}

export function insertPlaylistAtIndex(playlists: LibraryPlaylist[], playlist: LibraryPlaylist, index: number) {
  return [
    ...playlists.slice(0, index),
    playlist,
    ...playlists.slice(index),
  ]
}

function uniqueSongIds(songIds: number[]) {
  return [...new Set(songIds.map(Number))]
}

function patchSongsFavorite(snapshot: MusicData, songIds: number[], favorite: boolean): MusicData {
  const songIdSet = new Set(songIds)

  return {
    ...snapshot,
    songs: snapshot.songs.map((song) => (songIdSet.has(song.id) ? { ...song, favorite } : song)),
    recentSongs: snapshot.recentSongs.map((song) => (songIdSet.has(song.id) ? { ...song, favorite } : song)),
  }
}

function patchPlaylistSongState(playlist: LibraryPlaylist, songIds: number[], active: boolean): LibraryPlaylist {
  const uniqueIds = uniqueSongIds(songIds)
  const songIdSet = new Set(uniqueIds)
  const nextSongIds = active
    ? [...playlist.songIds, ...uniqueIds.filter((songId) => !playlist.songIds.includes(songId))]
    : playlist.songIds.filter((songId) => !songIdSet.has(songId))

  return {
    ...playlist,
    songIds: nextSongIds,
    songCount: nextSongIds.length,
  }
}
