import type { LibraryFolder, LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceLevel, PreferenceSettingsSnapshot } from './contracts'
import { getSongArtists } from './artists'
import { getLeastPlayedSongs, getMostPlayedSongs, getRecentAddedSongs, isSongDirectlyInFolder, isSongInFolder, randomItems } from './RandomPlayHelper'

export interface QuickPlaySource {
  songs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  folders: LibraryFolder[]
  preferences: PreferenceSettingsSnapshot
}

const RANDOM_PREFERENCE_ITEMS = 5

export function quickPlay(source: QuickPlaySource, randomLimit = 100) {
  const songsById = new Map(source.songs.map((song) => [song.id, song]))
  const playlistsById = new Map(source.playlists.map((playlist) => [playlist.id, playlist]))
  const foldersById = new Map(source.folders.map((folder) => [folder.id, folder]))
  const selectedSongs = new Map<number, LibrarySong>()
  const preferences = source.preferences

  addUniqueSongs(selectedSongs, randomItems(source.songs, randomLimit * 2))

  if (preferences.enabled.songs) {
    for (const item of getEnabledPreferenceItems(preferences.songs)) {
      const song = songsById.get(Number(item.itemId))
      if (song) {
        addUniqueSong(selectedSongs, song)
      }
    }
  }

  if (preferences.enabled.artists) {
    const preferredSongs = getEnabledPreferenceItems(preferences.artists).flatMap((item) =>
      randomItems(
        randomItems(
          source.songs.filter((song) => getSongArtists(song).includes(item.itemId)),
          getRandomPreferredItems(item.level),
        ),
        RANDOM_PREFERENCE_ITEMS,
      ),
    )
    addUniqueSongs(selectedSongs, preferredSongs)
  }

  if (preferences.enabled.albums) {
    const preferredSongs = getEnabledPreferenceItems(preferences.albums).flatMap((item) =>
      randomItems(
        randomItems(source.songs.filter((song) => song.album === item.itemId), getRandomPreferredItems(item.level)),
        RANDOM_PREFERENCE_ITEMS,
      ),
    )
    addUniqueSongs(selectedSongs, preferredSongs)
  }

  if (preferences.enabled.playlists) {
    const preferredSongs = getEnabledPreferenceItems(preferences.playlists).flatMap((item) => {
      const playlist = playlistsById.get(Number(item.itemId))
      return playlist
        ? randomItems(playlist.songIds.map((songId) => songsById.get(songId)!), getRandomPreferredItems(item.level))
        : []
    })
    addUniqueSongs(selectedSongs, randomItems(preferredSongs, RANDOM_PREFERENCE_ITEMS))
  }

  if (preferences.enabled.folders) {
    const preferredSongs = getEnabledPreferenceItems(preferences.folders).flatMap((item) => {
      const folder = foldersById.get(Number(item.itemId))
      return folder
        ? randomItems(source.songs.filter((song) => isSongDirectlyInFolder(song, folder.path)), getRandomPreferredItems(item.level))
        : []
    })
    addUniqueSongs(selectedSongs, randomItems(preferredSongs, RANDOM_PREFERENCE_ITEMS))
  }

  const recentAddedCount = getEnabledBuiltinPreferenceCount(preferences.others.find((item) => item.type === 'recent-added'))
  if (recentAddedCount > 0) {
    addUniqueSongs(selectedSongs, randomItems(getRecentAddedSongs(source.songs), recentAddedCount))
  }

  const myFavoritesCount = getEnabledBuiltinPreferenceCount(preferences.others.find((item) => item.type === 'my-favorites'))
  if (myFavoritesCount > 0) {
    addUniqueSongs(selectedSongs, randomItems(source.songs.filter((song) => song.favorite), myFavoritesCount))
  }

  if (getEnabledBuiltinPreferenceCount(preferences.others.find((item) => item.type === 'most-played')) > 0) {
    addUniqueSongs(selectedSongs, getMostPlayedSongs(source.songs, randomLimit))
  }

  if (getEnabledBuiltinPreferenceCount(preferences.others.find((item) => item.type === 'least-played')) > 0) {
    addUniqueSongs(selectedSongs, getLeastPlayedSongs(source.songs, randomLimit))
  }

  removeDislikedSongs(selectedSongs, source, 'dislike')
  removeDislikedSongs(selectedSongs, source, 'do-not-appear')

  return randomItems([...selectedSongs.values()], randomLimit).map((song) => song.id)
}

function addUniqueSong(target: Map<number, LibrarySong>, song: LibrarySong) {
  target.set(song.id, song)
}

function addUniqueSongs(target: Map<number, LibrarySong>, songs: LibrarySong[]) {
  for (const song of songs) {
    addUniqueSong(target, song)
  }
}

function preferenceLevelValue(level: PreferenceLevel) {
  return {
    'do-not-appear': 0,
    dislike: -1,
    normal: 1,
    high: 2,
    higher: 3,
    'very-high': 4,
  }[level]
}

function getRandomPreferredItems(level: PreferenceLevel) {
  const minimum = preferenceLevelValue(level) + 1
  return Math.floor(Math.random() * (minimum * 2)) + minimum
}

function toss(probability = 2) {
  return probability <= 1 || Math.floor(Math.random() * probability) === 0
}

function getEnabledPreferenceItems(items: PreferenceItemSnapshot[]) {
  const sourceItems = items.filter((item) => item.isEnabled && item.isValid)

  if (sourceItems.length === 0) {
    return []
  }

  if (sourceItems.length === 1) {
    return sourceItems
  }

  return sourceItems.flatMap((item) => {
    if (preferenceLevelValue(item.level) <= 0) {
      return []
    }

    const selected: PreferenceItemSnapshot[] = []
    const maximum = getRandomPreferredItems(item.level)
    for (let index = 0; index < maximum; index += 1) {
      if (toss()) {
        selected.push(item)
      }
    }

    return distinctPreferenceItems(randomItems(selected, RANDOM_PREFERENCE_ITEMS))
  })
}

function distinctPreferenceItems(items: PreferenceItemSnapshot[]) {
  const seen = new Set<number>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }

    seen.add(item.id)
    return true
  })
}

function getEnabledBuiltinPreferenceCount(item: PreferenceItemSnapshot | undefined) {
  return item?.isEnabled ? getRandomPreferredItems(item.level) : 0
}

function removeDislikedSongs(
  selectedSongs: Map<number, LibrarySong>,
  source: QuickPlaySource,
  level: 'dislike' | 'do-not-appear',
) {
  const preferences = [
    ...source.preferences.songs,
    ...source.preferences.artists,
    ...source.preferences.albums,
    ...source.preferences.playlists,
    ...source.preferences.folders,
  ].filter((item) => item.isEnabled && item.isValid && item.level === level)
  const probability = level === 'do-not-appear' ? 1 : 2
  const songIds = new Set(preferences.filter((item) => item.type === 'song').map((item) => Number(item.itemId)))
  const artists = new Set(preferences.filter((item) => item.type === 'artist').map((item) => item.itemId))
  const albums = new Set(preferences.filter((item) => item.type === 'album').map((item) => item.itemId))
  const playlistIds = new Set(preferences.filter((item) => item.type === 'playlist').map((item) => Number(item.itemId)))
  const folderIds = new Set(preferences.filter((item) => item.type === 'folder').map((item) => Number(item.itemId)))
  const playlistSongIds = new Set(
    source.playlists
      .filter((playlist) => playlistIds.has(playlist.id))
      .flatMap((playlist) => playlist.songIds),
  )
  const folderPaths = source.folders.filter((folder) => folderIds.has(folder.id)).map((folder) => folder.path)

  for (const song of selectedSongs.values()) {
    if (
      toss(probability) &&
      (
        songIds.has(song.id) ||
        getSongArtists(song).some((artist) => artists.has(artist)) ||
        albums.has(song.album) ||
        playlistSongIds.has(song.id) ||
        folderPaths.some((folderPath) => isSongInFolder(song, folderPath))
      )
    ) {
      selectedSongs.delete(song.id)
    }
  }
}
