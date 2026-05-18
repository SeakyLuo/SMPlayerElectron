import { getSongArtists, joinArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, PreferredLanguage, RecentAlbumPlayback, RecentArtistPlayback, RecentPlaylistPlayback } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

export interface RecentPlaylistView {
  playlist: LibraryPlaylist
  songs: LibrarySong[]
  playedAt: string
}

export interface RecentAlbumView {
  name: string
  artist: string
  songs: LibrarySong[]
  artworkUrl: string
  songIds: number[]
  playedAt: string
}

export interface RecentArtistView {
  name: string
  songs: LibrarySong[]
  artworkUrl: string
  playedAt: string
}

export function buildRecentPlaylistViews(
  playlists: LibraryPlaylist[],
  songs: LibrarySong[],
  recentPlaylists: RecentPlaylistPlayback[],
) {
  const songsById = new Map(songs.map((song) => [song.id, song]))
  const playlistsById = new Map(playlists.map((playlist) => [playlist.id, playlist]))

  const views: RecentPlaylistView[] = []
  for (const recentPlaylist of recentPlaylists) {
    const playlist = playlistsById.get(recentPlaylist.playlistId)
    if (playlist) {
      views.push({
        playlist,
        songs: playlist.songIds.map((songId) => songsById.get(songId)).filter((song) => song !== undefined),
        playedAt: recentPlaylist.playedAt,
      })
    }
  }

  return views
}

export function buildRecentAlbumViews(songs: LibrarySong[], recentAlbums: RecentAlbumPlayback[], t: Translator) {
  const songsByAlbum = new Map<string, LibrarySong[]>()
  for (const song of songs) {
    const albumName = song.album || t('common.albumUnknown')
    const albumSongs = songsByAlbum.get(albumName)
    if (albumSongs) {
      albumSongs.push(song)
    } else {
      songsByAlbum.set(albumName, [song])
    }
  }

  const views: RecentAlbumView[] = []
  for (const recentAlbum of recentAlbums) {
    const albumName = recentAlbum.album
    const albumSongs = songsByAlbum.get(albumName)
    if (albumSongs) {
      views.push({
        name: albumName,
        artist: getRecentAlbumArtistLabel(albumSongs, t),
        songs: albumSongs,
        artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        songIds: albumSongs.map((song) => song.id),
        playedAt: recentAlbum.playedAt,
      })
    }
  }

  return views
}

export function buildRecentArtistViews(songs: LibrarySong[], recentArtists: RecentArtistPlayback[], t: Translator) {
  const songsByArtist = new Map<string, LibrarySong[]>()
  for (const song of songs) {
    for (const artistName of getSongArtists(song, t('common.artistUnknown'))) {
      const artistSongs = songsByArtist.get(artistName)
      if (artistSongs) {
        artistSongs.push(song)
      } else {
        songsByArtist.set(artistName, [song])
      }
    }
  }

  const views: RecentArtistView[] = []
  for (const recentArtist of recentArtists) {
    const artistSongs = songsByArtist.get(recentArtist.artist)
    if (artistSongs) {
      views.push({
        name: recentArtist.artist,
        songs: artistSongs,
        artworkUrl: artistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        playedAt: recentArtist.playedAt,
      })
    }
  }

  return views
}

export function dateValue(value: string) {
  return new Date(value).getTime()
}

export function categorizeRecentDate(value: string, t: Translator) {
  const date = new Date(value)
  const now = new Date()

  if (sameCalendarDate(date, now)) {
    return t('recent.time.today')
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameCalendarDate(date, yesterday)) {
    return t('recent.time.yesterday')
  }

  const recent7Days = new Date(now)
  recent7Days.setDate(now.getDate() - 7)
  if (date > recent7Days) {
    return t('recent.time.recent7Days')
  }

  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return t('recent.time.thisMonth')
  }

  const recent30Days = new Date(now)
  recent30Days.setDate(now.getDate() - 30)
  if (date > recent30Days) {
    return t('recent.time.recent30Days')
  }

  if (date.getFullYear() === now.getFullYear()) {
    return t(`recent.time.month${date.getMonth() + 1}`)
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function formatRecentDateTime(value: string, preferredLanguage: PreferredLanguage) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()

  return date.toLocaleString(resolveDateLocale(preferredLanguage), {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRecentAlbumArtistLabel(songs: LibrarySong[], t: Translator) {
  const artists = [...new Set(songs.flatMap((song) => getSongArtists(song, t('common.artistUnknown'))))]

  if (artists.length >= 3) {
    return t('albums.artistsAndMore', { first: artists[0]!, second: artists[1]!, count: artists.length - 2 })
  }

  return joinArtists(artists)
}

function sameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function resolveDateLocale(preferredLanguage: PreferredLanguage) {
  return preferredLanguage === 'system' ? undefined : preferredLanguage
}
