import type { LibrarySong, PlaybackMode, RecentLibrarySong } from './contracts'
import { formatDuration } from './formatters'
import { getDisplayArtists, getSongArtists } from './artists'
import type { Translator } from './i18n'

const CARD_LIMIT = 18

function formatCount(value: number, singular: string, plural = `${singular}s`, t?: Translator) {
  if (!t) {
    return `${value} ${value === 1 ? singular : plural}`
  }

  if (singular === 'song') {
    return t('cards.songCount', { count: value })
  }

  if (singular === 'track') {
    return t('cards.trackCount', { count: value })
  }

  if (singular === 'album') {
    return t('cards.albumCount', { count: value })
  }

  if (singular === 'artist') {
    return t('cards.artistCount', { count: value })
  }

  return `${value} ${value === 1 ? singular : plural}`
}

function getArtworkUrl(songs: LibrarySong[]) {
  return songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''
}

function getFolderPath(filePath: string) {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : ''
}

function getPathLabel(path: string) {
  const segments = path.split(/[/\\]+/).filter(Boolean)
  return segments.at(-1) ?? path
}

function getRelativeFolderLabel(folderPath: string, rootPath: string) {
  if (!rootPath) {
    return folderPath
  }

  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedFolder = normalize(folderPath)
  const normalizedRoot = normalize(rootPath)

  if (normalizedFolder === normalizedRoot) {
    return 'Library root'
  }

  if (normalizedFolder.startsWith(`${normalizedRoot}/`)) {
    return normalizedFolder.slice(normalizedRoot.length + 1)
  }

  return folderPath
}

function formatPlayedAt(playedAt: string, t?: Translator) {
  const parsed = new Date(playedAt)

  if (Number.isNaN(parsed.getTime())) {
    return t?.('cards.recently') ?? 'recently'
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000))

  if (diffSeconds < 60) {
    return t?.('common.justNow') ?? 'just now'
  }

  if (diffSeconds < 3600) {
    const count = Math.floor(diffSeconds / 60)
    return t?.('common.minAgo', { count }) ?? `${count} min ago`
  }

  if (diffSeconds < 86_400) {
    const count = Math.floor(diffSeconds / 3600)
    return t?.('common.hrAgo', { count }) ?? `${count} hr ago`
  }

  if (diffSeconds < 604_800) {
    const count = Math.floor(diffSeconds / 86_400)
    return t?.('cards.dayAgo', { count }) ?? `${count} day ago`
  }

  return parsed.toLocaleDateString()
}

function formatMode(mode: PlaybackMode) {
  switch (mode) {
    case 'repeat':
      return 'repeat all'
    case 'repeat-one':
      return 'repeat one'
    case 'shuffle':
      return 'shuffle'
    default:
      return 'play once'
  }
}

export function buildArtistCards(songs: LibrarySong[], t?: Translator) {
  const groups = new Map<
    string,
    { count: number; duration: number; albums: Set<string>; artworkUrl: string }
  >()

  for (const song of songs) {
    for (const artist of getSongArtists(song, t?.('common.artistUnknown'))) {
      const current =
        groups.get(artist) ?? { count: 0, duration: 0, albums: new Set<string>(), artworkUrl: '' }

      current.count += 1
      current.duration += song.duration
      if (song.album) {
        current.albums.add(song.album)
      }
      if (!current.artworkUrl && song.artworkUrl) {
        current.artworkUrl = song.artworkUrl
      }

      groups.set(artist, current)
    }
  }

  return [...groups.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, CARD_LIMIT)
    .map(([artist, summary]) => ({
      title: artist,
      subtitle: t
        ? t('cards.artistSubtitle', {
            songs: formatCount(summary.count, 'song', undefined, t),
            albums: formatCount(summary.albums.size, 'album', undefined, t),
          })
        : `${formatCount(summary.count, 'song')} across ${formatCount(summary.albums.size, 'album')}`,
      artworkUrl: summary.artworkUrl,
      detail:
        summary.duration > 0
          ? t?.('cards.artistRuntime', {
              duration: formatDuration(summary.duration),
            }) ?? `${formatDuration(summary.duration)} total runtime in the imported library.`
          : t?.('cards.artistNoRuntime') ??
            'Runtime metadata has not been detected for these tracks yet.',
    }))
}

export function buildAlbumCards(songs: LibrarySong[], t?: Translator) {
  const groups = new Map<
    string,
    { count: number; duration: number; artists: Set<string>; artworkUrl: string }
  >()

  for (const song of songs) {
    const album = song.album || t?.('common.albumUnknown') || 'Unknown album'
    const current =
      groups.get(album) ?? { count: 0, duration: 0, artists: new Set<string>(), artworkUrl: '' }

    current.count += 1
    current.duration += song.duration
    for (const artist of getSongArtists(song, t?.('common.artistUnknown'))) {
      current.artists.add(artist)
    }
    if (!current.artworkUrl && song.artworkUrl) {
      current.artworkUrl = song.artworkUrl
    }

    groups.set(album, current)
  }

  return [...groups.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, CARD_LIMIT)
    .map(([album, summary]) => ({
      title: album,
      subtitle: t
        ? t('cards.albumSubtitle', {
            tracks: formatCount(summary.count, 'track', undefined, t),
            artists: formatCount(summary.artists.size, 'artist', undefined, t),
          })
        : `${formatCount(summary.count, 'track')} by ${formatCount(summary.artists.size, 'artist')}`,
      artworkUrl: summary.artworkUrl,
      detail:
        summary.duration > 0
          ? t?.('cards.albumRuntime', {
              duration: formatDuration(summary.duration),
            }) ?? `${formatDuration(summary.duration)} total runtime in this album group.`
          : t?.('cards.albumNoRuntime') ??
            'Duration data is still missing from the imported tags for this album.',
    }))
}

export function buildFolderCards(songs: LibrarySong[], rootPath: string) {
  const groups = new Map<string, { count: number; duration: number; artworkUrl: string }>()

  for (const song of songs) {
    const folderPath = getFolderPath(song.path)
    const current = groups.get(folderPath) ?? { count: 0, duration: 0, artworkUrl: '' }

    current.count += 1
    current.duration += song.duration
    if (!current.artworkUrl && song.artworkUrl) {
      current.artworkUrl = song.artworkUrl
    }

    groups.set(folderPath, current)
  }

  return [...groups.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, CARD_LIMIT)
    .map(([folderPath, summary]) => ({
      title: getPathLabel(folderPath) || 'Library root',
      subtitle: `${formatCount(summary.count, 'song')} stored here`,
      artworkUrl: summary.artworkUrl,
      detail: `${getRelativeFolderLabel(folderPath, rootPath)}${summary.duration > 0 ? ` - ${formatDuration(summary.duration)}` : ''}`,
    }))
}

export function buildRecentCards(recentSongs: RecentLibrarySong[], t?: Translator) {
  return recentSongs.slice(0, CARD_LIMIT).map((song) => ({
    title: song.title,
    subtitle: `${getDisplayArtists(song, t?.('common.artistUnknown'))} - ${formatDuration(song.duration)}`,
    artworkUrl: song.artworkUrl,
    detail: `${t?.('cards.played', {
      time: formatPlayedAt(song.playedAt, t),
    }) ?? `Played ${formatPlayedAt(song.playedAt)}`}${song.album ? ` - ${song.album}` : ''}`,
  }))
}

export function buildFavoriteCards(songs: LibrarySong[], t?: Translator) {
  return songs
    .filter((song) => song.favorite)
    .sort((left, right) => {
      if (right.playCount !== left.playCount) {
        return right.playCount - left.playCount
      }

      return left.title.localeCompare(right.title)
    })
    .slice(0, CARD_LIMIT)
    .map((song) => ({
      title: song.title,
      subtitle: `${getDisplayArtists(song, t?.('common.artistUnknown'))} - ${formatDuration(song.duration)}`,
      artworkUrl: song.artworkUrl,
      detail: t
        ? t('cards.playedTimes', {
            album: song.album || t('common.albumUnknown'),
            count: song.playCount,
          })
        : `${song.album || 'Unknown album'} - Played ${song.playCount} times`,
    }))
}

export function buildQueueCards(songs: LibrarySong[], currentTrackId: number | null) {
  if (songs.length === 0) {
    return []
  }

  const currentIndex = songs.findIndex((song) => song.id === currentTrackId)
  const startIndex = currentIndex >= 0 ? currentIndex : 0

  return songs.slice(startIndex, startIndex + 8).map((song, index) => ({
    title: song.title,
    subtitle: `${getDisplayArtists(song)} - ${formatDuration(song.duration)}`,
    artworkUrl: song.artworkUrl,
    detail:
      index === 0
        ? `${song.album || 'Unknown album'} - Current selection`
        : `${song.album || 'Unknown album'} - Up next #${index}`,
  }))
}

export function buildPlaylistCards(
  songs: LibrarySong[],
  recentSongs: RecentLibrarySong[],
  currentTrack: LibrarySong | null,
  mode: PlaybackMode,
) {
  const favoritesCount = songs.filter((song) => song.favorite).length

  return [
    {
      title: 'Now Playing',
      artworkUrl: currentTrack?.artworkUrl ?? '',
      subtitle: currentTrack
        ? `${currentTrack.title} is active`
        : songs.length > 0
          ? 'Queue is ready to start'
          : 'Queue is empty',
      detail: `Playback is currently set to ${formatMode(mode)} over ${formatCount(songs.length, 'track')}.`,
    },
    {
      title: 'My Favorites',
      artworkUrl: getArtworkUrl(songs.filter((song) => song.favorite)),
      subtitle: `${formatCount(favoritesCount, 'song')} marked as favorite`,
      detail:
        favoritesCount > 0
          ? 'Favorites already round-trip through the migrated playlist table.'
          : 'Marking favorites in the Electron UI is the next playlist-related gap to close.',
    },
    {
      title: 'Recent',
      artworkUrl: recentSongs[0]?.artworkUrl ?? '',
      subtitle: `${formatCount(recentSongs.length, 'song')} in recent playback`,
      detail:
        recentSongs.length > 0
          ? 'Recent history now comes directly from SQLite instead of mock renderer state.'
          : 'Play a few songs and this surface will start filling from RecentRecord.',
    },
  ]
}
