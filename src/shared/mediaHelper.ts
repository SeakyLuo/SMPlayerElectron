import type {
  LibraryFolder,
  LibraryPlaylist,
  LibrarySong,
  PlaybackMode,
  PreferenceItemSnapshot,
  PreferenceLevel,
  PreferenceSettingsSnapshot,
} from './contracts'
import { getSongArtists } from './artists'

export interface PlaybackQueueResult {
  songIds: number[]
  trackId: number | null
  trackIndex: number | null
}

export function currentIndex(songIds: number[], currentTrackId: number | null, currentTrackIndex = -1) {
  if (currentTrackId == null) {
    return -1
  }

  return currentTrackIndex > -1 && songIds[currentTrackIndex] === currentTrackId
    ? currentTrackIndex
    : songIds.indexOf(currentTrackId)
}

export function normalizeQueueSongIds(songIds: number[], songs: LibrarySong[]) {
  const songIdsInLibrary = new Set(songs.map((song) => song.id))
  return songIds.filter((songId) => songIdsInLibrary.has(songId))
}

export function samePlaylist(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((songId, index) => songId === right[index])
}

export function addMusic(songIds: number[], songId: number, index = songIds.length) {
  const nextSongIds = songIds.slice()
  nextSongIds.splice(index, 0, songId)
  return nextSongIds
}

export function clear() {
  return []
}

export function setPlaylist(songIds: number[], targetTrackId: number | null = null): PlaybackQueueResult {
  const targetIndex = currentIndex(songIds, targetTrackId)
  const trackIndex = targetIndex > -1 ? targetIndex : songIds.length > 0 ? 0 : -1

  return {
    songIds: songIds.slice(),
    trackId: trackIndex > -1 ? songIds[trackIndex] : null,
    trackIndex: trackIndex > -1 ? trackIndex : null,
  }
}

export function setPlaylistAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(songIds, targetTrackId)
}

export function setMusicAndPlay(songId: number): PlaybackQueueResult {
  return {
    songIds: addMusic(clear(), songId),
    trackId: songId,
    trackIndex: 0,
  }
}

export function setMusicAndPlayFromPlaylist(
  currentSongIds: number[],
  nextSongIds: number[],
  targetTrackId: number,
  shuffleEnabled: boolean,
  targetIndex = -1,
) {
  const songIds = samePlaylist(nextSongIds, currentSongIds)
    ? currentSongIds
    : shuffleEnabled
      ? shufflePlaylist(nextSongIds, targetTrackId)
      : nextSongIds.slice()
  const resolvedTargetIndex = currentIndex(songIds, targetTrackId, shuffleEnabled && !samePlaylist(nextSongIds, currentSongIds) ? -1 : targetIndex)
  const trackIndex = resolvedTargetIndex > -1 ? resolvedTargetIndex : songIds.length > 0 ? 0 : -1

  return {
    songIds,
    trackId: trackIndex > -1 ? songIds[trackIndex] : null,
    trackIndex: trackIndex > -1 ? trackIndex : null,
  }
}

export function shuffleAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(shufflePlaylist(songIds, targetTrackId ?? undefined), targetTrackId)
}

export interface QuickPlaySource {
  songs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  folders: LibraryFolder[]
  preferences: PreferenceSettingsSnapshot
}

const RANDOM_PREFERENCE_ITEMS = 5
const RECENT_ADDED_TIMELINE_LIMIT = 500

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

export function randomItems<T>(items: T[], count: number) {
  if (items.length <= count) {
    return shuffleArray(items)
  }

  const indices = new Set<number>()
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * items.length))
  }

  return [...indices].map((index) => items[index])
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

function getParentPath(path: string) {
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return separatorIndex > -1 ? path.slice(0, separatorIndex) : ''
}

function isSongInFolder(song: LibrarySong, folderPath: string) {
  return getParentPath(song.path) === folderPath || song.path.startsWith(`${folderPath}\\`) || song.path.startsWith(`${folderPath}/`)
}

function isSongDirectlyInFolder(song: LibrarySong, folderPath: string) {
  return getParentPath(song.path) === folderPath
}

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

export function shuffleOthers(songIds: number[], currentTrackId: number | null) {
  const index = currentIndex(songIds, currentTrackId)
  if (index === -1) {
    return songIds
  }

  return shufflePlaylist(songIds, currentTrackId!)
}

export function shufflePlaylist(songIds: number[], startTrackId?: number) {
  const shuffled = shuffleArray(songIds)

  if (startTrackId != null) {
    const startIndex = shuffled.indexOf(startTrackId)
    if (startIndex > -1) {
      shuffled.splice(startIndex, 1)
      shuffled.unshift(startTrackId)
    }
  }

  return shuffled
}

export function shuffleArray<T>(items: T[]) {
  const shuffled = items.slice()

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = current
  }

  return shuffled
}

export function moveToMusic(songIds: number[], targetTrackId: number | null) {
  return targetTrackId != null && songIds.includes(targetTrackId)
}

export function moveToMusicOrPlay(
  songIds: number[],
  targetTrackId: number,
  targetIndex: number,
  currentTrackId: number | null,
  currentTrackIndex = -1,
) {
  if (targetIndex > -1 && targetIndex < songIds.length && songIds[targetIndex] === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: targetIndex,
    }
  }

  const activeIndex = currentIndex(songIds, currentTrackId, currentTrackIndex)
  if (activeIndex > -1 && songIds[activeIndex] === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: activeIndex,
    }
  }

  const playlistIndex = songIds.indexOf(targetTrackId)
  return playlistIndex === -1
    ? addNextAndPlay(songIds, targetTrackId, currentTrackId, currentTrackIndex)
    : {
        songIds,
        trackId: targetTrackId,
        trackIndex: playlistIndex,
      }
}

export function addNextAndPlay(
  songIds: number[],
  targetTrackId: number,
  currentTrackId: number | null,
  currentTrackIndex = -1,
) {
  const targetIndex = songIds.indexOf(targetTrackId)
  if (targetIndex > -1) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: targetIndex,
    }
  }

  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const nextSongIds = addMusic(songIds, targetTrackId, index + 1)
  return {
    songIds: nextSongIds,
    trackId: targetTrackId,
    trackIndex: index + 1,
  }
}

export function moveNext(songIds: number[], currentTrackId: number | null, mode: PlaybackMode, currentTrackIndex = -1) {
  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const nextIndex = index + 1

  if (nextIndex < songIds.length) {
    return songIds[nextIndex]
  }

  return mode === 'repeat' || mode === 'shuffle' ? songIds[0] : null
}

export function movePrev(songIds: number[], currentTrackId: number | null, mode: PlaybackMode, currentTrackIndex = -1) {
  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const previousIndex = index - 1

  if (previousIndex >= 0) {
    return songIds[previousIndex]
  }

  return mode === 'repeat' || mode === 'shuffle' ? songIds[songIds.length - 1] : null
}

export function playNext(
  songIds: number[],
  targetTrackId: number,
  currentTrackId: number | null,
  targetIndex = -1,
  currentTrackIndex = -1,
) {
  const activeIndex = currentIndex(songIds, currentTrackId, currentTrackIndex)

  if (targetIndex > -1 && targetIndex < songIds.length && songIds[targetIndex] === targetTrackId) {
    return moveMusic(songIds, targetIndex, activeIndex + (targetIndex < activeIndex ? 0 : 1), currentTrackId, currentTrackIndex)
  }

  return addMusic(songIds, targetTrackId, activeIndex + 1)
}

export function moveMusic(songIds: number[], from: number, to: number, currentTrackId: number | null, currentTrackIndex = -1) {
  if (from === to) {
    return songIds
  }

  const nextSongIds = songIds.slice()
  const current = nextSongIds[from]

  if (from === currentIndex(nextSongIds, currentTrackId, currentTrackIndex)) {
    const stepCount = Math.abs(from - to)
    for (let index = 0; index < stepCount; index += 1) {
      const item = nextSongIds[to]
      nextSongIds.splice(to, 1)
      nextSongIds.splice(from, 0, item)
    }
    return nextSongIds
  }

  nextSongIds.splice(from, 1)
  nextSongIds.splice(to, 0, current)
  return nextSongIds
}

export function removeMusic(songIds: number[], index: number) {
  const nextSongIds = songIds.slice()
  nextSongIds.splice(index, 1)
  return nextSongIds
}

function getRecentAddedSongs(songs: LibrarySong[]) {
  return songs.slice().sort((left, right) => right.dateAdded.localeCompare(left.dateAdded)).slice(0, RECENT_ADDED_TIMELINE_LIMIT)
}

export function getMostPlayedSongs(songs: LibrarySong[], randomLimit: number) {
  return getPlayedSongs(songs, randomLimit, 'descending')
}

export function getLeastPlayedSongs(songs: LibrarySong[], randomLimit: number) {
  return getPlayedSongs(songs, randomLimit, 'ascending')
}

function getPlayedSongs(songs: LibrarySong[], randomLimit: number, direction: 'ascending' | 'descending') {
  const songsByPlayCount = new Map<number, LibrarySong[]>()
  for (const song of songs) {
    const group = songsByPlayCount.get(song.playCount)
    if (group) {
      group.push(song)
    } else {
      songsByPlayCount.set(song.playCount, [song])
    }
  }

  const playCounts = [...songsByPlayCount.keys()].sort((left, right) =>
    direction === 'ascending' ? left - right : right - left,
  )
  const selectedSongs: LibrarySong[] = []

  for (const playCount of playCounts) {
    if (selectedSongs.length > randomLimit) {
      break
    }

    selectedSongs.push(...songsByPlayCount.get(playCount)!)
  }

  return selectedSongs
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

export function randomLibrary(songIds: number[], randomLimit = 100) {
  return randomItems(songIds, randomLimit)
}

export function randomArtist(songs: LibrarySong[], randomLimit = 100) {
  const songsByArtist = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    for (const artist of getSongArtists(song)) {
      const group = songsByArtist.get(artist)
      if (group) {
        group.push(song)
      } else {
        songsByArtist.set(artist, [song])
      }
    }
  }

  return randomItems(randomItem([...songsByArtist.values()]) ?? [], randomLimit).map((song) => song.id)
}

export function randomAlbum(songs: LibrarySong[], randomLimit = 100) {
  return randomItems(randomSongGroup(songs, (song) => song.album), randomLimit).map((song) => song.id)
}

export function randomPlaylist(songs: LibrarySong[], playlists: LibraryPlaylist[], randomLimit = 100) {
  const songsById = new Map(songs.map((song) => [song.id, song]))
  const playablePlaylists = playlists.filter((playlist) => playlist.songIds.length > 0)
  const playlist = randomItem(playablePlaylists)
  return randomItems(playlist.songIds.map((songId) => songsById.get(songId)!).filter(Boolean), randomLimit).map((song) => song.id)
}

export function randomFolder(songs: LibrarySong[], folders: LibraryFolder[], randomLimit = 100) {
  const playableFolders = folders
    .map((folder) => ({
      folder,
      songs: songs.filter((song) => isSongDirectlyInFolder(song, folder.path)),
    }))
    .filter((item) => item.songs.length > 0)
  const selected = randomItem(playableFolders)

  return selected ? randomItems(selected.songs, randomLimit).map((song) => song.id) : []
}

export function randomRecentAdded(songs: LibrarySong[], randomLimit = 100) {
  return randomItems(getRecentAddedSongs(songs), randomLimit).map((song) => song.id)
}

export function randomRecentPlayed(songs: LibrarySong[]) {
  return shuffleArray(songs).map((song) => song.id)
}

export function randomMostPlayed(songs: LibrarySong[], randomLimit = 100) {
  return shuffleArray(getMostPlayedSongs(songs, randomLimit)).slice(0, randomLimit).map((song) => song.id)
}

export function randomLeastPlayed(songs: LibrarySong[], randomLimit = 100) {
  return shuffleArray(getLeastPlayedSongs(songs, randomLimit)).slice(0, randomLimit).map((song) => song.id)
}

function randomSongGroup(songs: LibrarySong[], getKey: (song: LibrarySong) => string) {
  const groups = new Map<string, LibrarySong[]>()
  for (const song of songs) {
    const key = getKey(song)
    const group = groups.get(key)
    if (group) {
      group.push(song)
    } else {
      groups.set(key, [song])
    }
  }

  return shuffleArray(randomItem([...groups.values()]) ?? [])
}
