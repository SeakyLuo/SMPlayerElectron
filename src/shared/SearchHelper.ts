import { getSongArtists } from './artists'
import type { AppSettingsUpdate, LibraryFolder, LibraryPlaylist, LibrarySong, SearchSortCriterion } from './contracts'
import type { Translator } from './i18n'

export interface SearchResult {
  title: string
  subtitle: string
  artworkUrl: string
  path: string
  score: number
  songCount: number
  playCount: number
  duration: number
  albumCount: number
  songIds: number[]
  sourceId?: string
  sourcePath?: string
  localFolderRelativePath?: string
}

export type SearchResultType = 'artists' | 'albums' | 'songs' | 'playlists' | 'folders'
export function getSortOptions(
  section: SearchResultType,
  t: Translator,
): Array<{ value: SearchSortCriterion; label: string }> {
  const baseOptions: Array<{ value: SearchSortCriterion; label: string }> = [
    { value: 'default', label: t('search.sortDefault') },
  ]

  switch (section) {
    case 'artists':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'album', label: t('common.albums') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'albums':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'songs':
      return [
        ...baseOptions,
        { value: 'title', label: t('search.sortTitle') },
        { value: 'artist', label: t('common.artist') },
        { value: 'album', label: t('common.album') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
        { value: 'date-added', label: t('common.dateAdded') },
      ]
    case 'playlists':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'folders':
      return [...baseOptions, { value: 'name', label: t('search.sortName') }]
  }
}

export function getSearchCriterionSetting(section: SearchResultType): keyof AppSettingsUpdate {
  switch (section) {
    case 'artists':
      return 'searchArtistsCriterion'
    case 'albums':
      return 'searchAlbumsCriterion'
    case 'songs':
      return 'searchSongsCriterion'
    case 'playlists':
      return 'searchPlaylistsCriterion'
    case 'folders':
      return 'searchFoldersCriterion'
  }
}

export function sortSearchResults(cards: SearchResult[], criterion: SearchSortCriterion) {
  const sorted = cards.slice()

  switch (criterion) {
    case 'name':
    case 'title':
      return sorted.sort((left, right) => left.title.localeCompare(right.title))
    case 'album':
      return sorted.sort((left, right) => right.albumCount - left.albumCount || left.title.localeCompare(right.title))
    case 'play-count':
      return sorted.sort((left, right) => right.playCount - left.playCount || left.title.localeCompare(right.title))
    case 'duration':
      return sorted.sort((left, right) => right.duration - left.duration || left.title.localeCompare(right.title))
    default:
      return sorted
  }
}

export function sortSearchSongs(songs: LibrarySong[], criterion: SearchSortCriterion) {
  const sorted = songs.slice()

  switch (criterion) {
    case 'title':
    case 'name':
      return sorted.sort((left, right) => left.title.localeCompare(right.title) || right.playCount - left.playCount)
    case 'artist':
      return sorted.sort((left, right) => getPrimaryArtist(left).localeCompare(getPrimaryArtist(right)) || right.playCount - left.playCount)
    case 'album':
      return sorted.sort((left, right) => left.album.localeCompare(right.album) || right.playCount - left.playCount)
    case 'play-count':
      return sorted.sort((left, right) => right.playCount - left.playCount || left.title.localeCompare(right.title))
    case 'duration':
      return sorted.sort((left, right) => left.duration - right.duration || right.playCount - left.playCount)
    case 'date-added':
      return sorted.sort((left, right) => Date.parse(left.dateAdded) - Date.parse(right.dateAdded) || right.playCount - left.playCount)
    default:
      return sorted
  }
}

function getPrimaryArtist(song: LibrarySong) {
  return getSongArtists(song)[0]
}

export function buildSearchResults(
  songs: LibrarySong[],
  folders: LibraryFolder[],
  playlists: LibraryPlaylist[],
  rootPath: string,
  normalizedQuery: string,
  t: Translator,
) {
  const matchedSongs = normalizedQuery
    ? songs
        .map((song) => ({ entity: song, score: matchSong(song, normalizedQuery) }))
        .filter((result) => result.score > 0)
        .sort(sortByScoreThenTitle)
        .map((result) => result.entity)
    : []
  const artists = buildArtistResults(songs, matchedSongs, normalizedQuery, t)
  const albums = buildAlbumResults(songs, matchedSongs, normalizedQuery, t)
  const folderResults = buildFolderResults(songs, folders, matchedSongs, rootPath, normalizedQuery, t)
  const scopedSongsById = new Map(songs.map((song) => [song.id, song]))
  const playlistResults = playlists
    .map((playlist) => ({
      entity: playlist,
      score: Math.max(
        evaluateString(playlist.name, normalizedQuery),
        playlist.songIds.some((songId) => matchedSongs.some((song) => song.id === songId)) ? 1 : 0,
      ),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entity.name.localeCompare(right.entity.name))
    .map(({ entity, score }) => {
      const playlistSongs = entity.songIds.map((songId) => scopedSongsById.get(songId)).filter((song) => song !== undefined)
      return {
        score,
        title: entity.name,
        subtitle: t('cards.songCount', { count: entity.songCount }),
        artworkUrl: playlistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        path: `/playlists/${entity.id}`,
        songCount: entity.songCount,
        playCount: playlistSongs.reduce((sum, song) => sum + song.playCount, 0),
        duration: playlistSongs.reduce((sum, song) => sum + song.duration, 0),
        albumCount: 0,
        songIds: playlistSongs.map((song) => song.id),
        sourceId: String(entity.id),
      }
    })

  return {
    artists,
    albums,
    songs: matchedSongs,
    playlists: playlistResults,
    folders: folderResults,
  }
}

function buildArtistResults(
  allSongs: LibrarySong[],
  _matchedSongs: LibrarySong[],
  normalizedQuery: string,
  t: Translator,
) {
  const groups = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    for (const artist of getSongArtists(song)) {
      if (artist.toLocaleLowerCase().includes(normalizedQuery)) {
        groups.set(artist, [...(groups.get(artist) ?? []), song])
      }
    }
  }

  return [...groups.entries()]
    .map(([artist, artistSongs]) => ({
      artist,
      artistSongs,
      score: evaluateString(artist, normalizedQuery),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.artist.localeCompare(right.artist))
    .map(({ artist, artistSongs, score }) => {
      const albums = new Set(artistSongs.map((song) => song.album).filter(Boolean))
      return {
        score,
        title: artist,
        subtitle: t('artists.artistSummary', { albums: albums.size, songs: artistSongs.length }),
        artworkUrl: artistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        path: `/artists?artist=${encodeURIComponent(artist)}`,
        songCount: artistSongs.length,
        playCount: artistSongs.reduce((sum, song) => sum + song.playCount, 0),
        duration: artistSongs.reduce((sum, song) => sum + song.duration, 0),
        albumCount: albums.size,
        songIds: artistSongs.map((song) => song.id),
      }
    })
}

function buildAlbumResults(
  allSongs: LibrarySong[],
  _matchedSongs: LibrarySong[],
  normalizedQuery: string,
  t: Translator,
) {
  const groups = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    const album = song.album || t('common.albumUnknown')
    const artists = getSongArtists(song)
    if (
      album.toLocaleLowerCase().includes(normalizedQuery) ||
      artists.some((artist) => artist.toLocaleLowerCase().includes(normalizedQuery))
    ) {
      groups.set(album, [...(groups.get(album) ?? []), song])
    }
  }

  return [...groups.entries()]
    .map(([album, albumSongs]) => {
      const artists = [...new Set(albumSongs.flatMap((song) => getSongArtists(song)))]
      const artistScore = Math.max(0, ...artists.map((artist) => evaluateString(artist, normalizedQuery) - 10))
      return {
        album,
        albumSongs,
        artists,
        score: Math.max(evaluateString(album, normalizedQuery), artistScore),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.album.localeCompare(right.album))
    .map(({ album, albumSongs, artists, score }) => ({
      score,
      title: album,
      subtitle: t('cards.albumSubtitle', {
        tracks: t('cards.trackCount', { count: albumSongs.length }),
        artists: t('cards.artistCount', { count: artists.length }),
      }),
      artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
      path: `/albums?album=${encodeURIComponent(album)}`,
      songCount: albumSongs.length,
      playCount: albumSongs.reduce((sum, song) => sum + song.playCount, 0),
      duration: albumSongs.reduce((sum, song) => sum + song.duration, 0),
      albumCount: 0,
      songIds: albumSongs.map((song) => song.id),
    }))
}

function buildFolderResults(
  allSongs: LibrarySong[],
  folders: LibraryFolder[],
  matchedSongs: LibrarySong[],
  rootPath: string,
  normalizedQuery: string,
  t: Translator,
) {
  const matchedFolderPaths = new Set(matchedSongs.map((song) => getFolderPath(song.path)))
  const candidateFolderPaths = new Set<string>()
  const folderByPath = new Map(folders.map((folder) => [folder.path, folder]))

  for (const folder of folders) {
    const folderName = getPathLabel(folder.path)
    if (evaluateString(folderName, normalizedQuery) > 0 || evaluateString(folder.path, normalizedQuery) > 0) {
      candidateFolderPaths.add(folder.path)
    }
  }

  for (const folderPath of matchedFolderPaths) {
    candidateFolderPaths.add(folderPath)
  }

  const songsByFolder = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    for (const candidateFolderPath of candidateFolderPaths) {
      if (isSongUnderFolder(song.path, candidateFolderPath)) {
        songsByFolder.set(candidateFolderPath, [...(songsByFolder.get(candidateFolderPath) ?? []), song])
      }
    }
  }

  return [...candidateFolderPaths]
    .map((folderPath) => {
      const folderSongs = songsByFolder.get(folderPath) ?? []
      const folderName = getPathLabel(folderPath) || t('local.libraryRoot')
      return {
        folderPath,
        folderSongs,
        score: Math.max(
          evaluateString(folderName, normalizedQuery),
          evaluateString(folderPath, normalizedQuery),
          matchedFolderPaths.has(folderPath) ? 1 : 0,
        ),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.folderPath.localeCompare(right.folderPath))
    .map(({ folderPath, folderSongs, score }) => ({
      score,
      title: getPathLabel(folderPath) || t('local.libraryRoot'),
      subtitle: t('cards.songCount', { count: folderSongs.length }),
      artworkUrl: folderSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
      path: '/local',
      localFolderRelativePath: getRelativeFolderPath(folderPath, rootPath),
      songCount: folderSongs.length,
      playCount: folderSongs.reduce((sum, song) => sum + song.playCount, 0),
      duration: folderSongs.reduce((sum, song) => sum + song.duration, 0),
      albumCount: 0,
      songIds: folderSongs.map((song) => song.id),
      sourceId: String(folderByPath.get(folderPath)!.id),
      sourcePath: folderPath,
    }))
}

function matchSong(song: LibrarySong, normalizedQuery: string) {
  const artistScore = Math.max(...getSongArtists(song).map((artist) => evaluateString(artist, normalizedQuery)))
  const baseScore = Math.max(
    evaluateString(song.title, normalizedQuery),
    artistScore - 10,
    evaluateString(song.album, normalizedQuery) - 20,
    0,
  )

  return baseScore === 0 ? 0 : baseScore + Math.min(song.playCount / 10, 10)
}

function evaluateString(value: string, normalizedQuery: string, offset = 0) {
  if (!value) {
    return 0
  }

  const normalizedValue = value.toLocaleLowerCase()
  if (value === normalizedQuery) {
    return 100 + offset
  }
  if (normalizedValue === normalizedQuery) {
    return 95 + offset
  }
  if (value.startsWith(normalizedQuery)) {
    return 90 + offset
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    return 85 + offset
  }
  if (value.includes(normalizedQuery)) {
    return 80 + offset
  }
  if (normalizedValue.includes(normalizedQuery)) {
    return 75 + offset
  }
  if (normalizedQuery.includes(normalizedValue)) {
    return 70 + offset
  }

  const editDistance = getEditDistance(normalizedValue, normalizedQuery)
  const ratio = Math.floor((editDistance * 100) / Math.max(normalizedValue.length, normalizedQuery.length))
  return ratio <= 60 ? 70 - ratio + offset : 0
}

function getEditDistance(target: string, given: string) {
  const dp = Array.from({ length: target.length + 1 }, (_, rowIndex) =>
    Array.from({ length: given.length + 1 }, (__, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  )

  for (let rowIndex = 1; rowIndex <= target.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= given.length; columnIndex += 1) {
      const replaceCost = target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1
      dp[rowIndex][columnIndex] = Math.min(
        dp[rowIndex - 1][columnIndex] + 1,
        dp[rowIndex][columnIndex - 1] + 1,
        dp[rowIndex - 1][columnIndex - 1] + replaceCost,
      )
    }
  }

  return dp[target.length][given.length]
}

function sortByScoreThenTitle(
  left: { entity: LibrarySong; score: number },
  right: { entity: LibrarySong; score: number },
) {
  return right.score - left.score || left.entity.title.localeCompare(right.entity.title)
}

function getFolderPath(filePath: string) {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : ''
}

function getPathLabel(path: string) {
  const segments = path.split(/[/\\]+/).filter(Boolean)
  return segments.at(-1) ?? path
}

export function getRelativeFolderPath(folderPath: string, rootPath: string) {
  const normalizedFolder = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')

  if (normalizedFolder === normalizedRoot) {
    return ''
  }

  if (normalizedFolder.startsWith(`${normalizedRoot}/`)) {
    return normalizedFolder.slice(normalizedRoot.length + 1)
  }

  return folderPath
}

export function isSongUnderFolder(songPath: string, folderPath: string) {
  const normalizedSongPath = songPath.replace(/\\/g, '/')
  const normalizedFolderPath = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')

  return normalizedSongPath.startsWith(`${normalizedFolderPath}/`)
}

export function isFolderUnderFolder(candidatePath: string, folderPath: string) {
  const normalizedCandidatePath = candidatePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedFolderPath = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')

  return normalizedCandidatePath === normalizedFolderPath || normalizedCandidatePath.startsWith(`${normalizedFolderPath}/`)
}

