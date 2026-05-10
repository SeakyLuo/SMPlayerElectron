import type { LibraryFolder, LibraryPlaylist, LibrarySong } from './contracts'
import { getSongArtists } from './artists'

export function randomItem<T>(items: T[]) {
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

export function getRecentAddedSongs(songs: LibrarySong[]) {
  return songs.slice().sort((left, right) => right.dateAdded.localeCompare(left.dateAdded)).slice(0, 500)
}

export function getMostPlayedSongs(songs: LibrarySong[], randomLimit: number) {
  return getPlayedSongs(songs, randomLimit, 'descending')
}

export function getLeastPlayedSongs(songs: LibrarySong[], randomLimit: number) {
  return getPlayedSongs(songs, randomLimit, 'ascending')
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

export function isSongInFolder(song: LibrarySong, folderPath: string) {
  return getFileParentPath(song.path) === folderPath || song.path.startsWith(`${folderPath}\\`) || song.path.startsWith(`${folderPath}/`)
}

export function isSongDirectlyInFolder(song: LibrarySong, folderPath: string) {
  return getFileParentPath(song.path) === folderPath
}

export function getFileParentPath(path: string) {
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return separatorIndex > -1 ? path.slice(0, separatorIndex) : ''
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
