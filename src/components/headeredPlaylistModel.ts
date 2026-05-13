import { getDisplayArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, MusicLibrarySortCriterion } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

export const sortOptions: MusicLibrarySortCriterion[] = ['title', 'artist', 'album', 'duration', 'play-count', 'date-added']

export const captions: Record<string, string> = {
  album: 'common.album',
  artist: 'common.artist',
  cancel: 'common.cancel',
  clear: 'common.clear',
  delete: 'playlists.delete',
  duration: 'common.duration',
  editArtwork: 'albums.editArtwork',
  multiSelect: 'albums.multiSelect',
  name: 'common.name',
  play: 'context.play',
  removeSelected: 'playlists.removeSelected',
  rename: 'playlists.rename',
  save: 'playlists.save',
  shuffle: 'nowPlaying.randomPlay',
  sort: 'common.sort',
  preferenceSettings: 'settings.preferenceSettings',
  songArtist: 'headeredPlaylist.songArtist',
  songsPrefix: 'headeredPlaylist.songsPrefix',
  'sort.album': 'table.album',
  'sort.artist': 'table.artist',
  'sort.date-added': 'table.dateAdded',
  'sort.duration': 'table.duration',
  'sort.play-count': 'table.playCount',
  'sort.reverse': 'albums.sort.reverse',
  'sort.title': 'table.title',
}

export function getHeaderPlaylistInfo(songs: LibrarySong[], t: Translator) {
  const countText = `${t('headeredPlaylist.songsPrefix')}${songs.length}`
  if (songs.length < 2) {
    return countText
  }

  const duration = songs.reduce((total, song) => total + song.duration, 0)
  return `${countText} • ${formatDuration(duration)}`
}

export function getAlbumPreferenceDisplayName(albumName: string, songs: LibrarySong[], t: Translator) {
  const albumTitle = albumName || t('common.albumUnknown')
  const firstSong = songs[0]
  const artist = firstSong ? getDisplayArtists(firstSong, t('common.artistUnknown')) : t('common.artistUnknown')
  return `${albumTitle} - ${artist}`
}

export function sortSongs(songs: LibrarySong[], criterion: MusicLibrarySortCriterion) {
  const sortedSongs = songs.slice().sort((left, right) => {
    switch (criterion) {
      case 'artist':
        return getDisplayArtists(left).localeCompare(getDisplayArtists(right))
      case 'album':
        return left.album.localeCompare(right.album)
      case 'duration':
        return left.duration - right.duration
      case 'play-count':
        return left.playCount - right.playCount
      case 'date-added':
        return left.dateAdded.localeCompare(right.dateAdded)
      case 'title':
        return left.title.localeCompare(right.title)
    }
  })

  return sortedSongs
}

export function inferSortCriterion(songs: LibrarySong[]) {
  for (const criterion of sortOptions) {
    const sortedSongIds = sortSongs(songs, criterion).map((song) => song.id)
    if (sortedSongIds.every((songId, index) => songId === songs[index]!.id)) {
      return criterion
    }
  }

  return 'title'
}

export function isBadNewPlaylistName(name: string, t: Translator) {
  return name === t('common.nowPlaying') || name === t('common.myFavorites')
}

export function validatePlaylistName(name: string, playlists: LibraryPlaylist[], currentName: string, t: Translator) {
  if (!name) {
    return t('playlists.nameEmpty')
  }

  if (name.length > 50) {
    return t('playlists.nameTooLong')
  }

  if (playlists.some((playlist) => playlist.name !== currentName && playlist.name === name)) {
    return t('playlists.nameUsed')
  }

  if (name.includes('+++++') || name.includes('{0}') || name.includes('{1}')) {
    return t('playlists.nameSpecial')
  }

  return ''
}

export function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  if (!name) {
    return ''
  }

  const playlistNames = new Set(playlists.map((playlist) => playlist.name))
  const siblingCount = playlists.filter((playlist) => playlist.name.startsWith(name)).length
  for (let index = 1; index <= siblingCount; index += 1) {
    const nextName = `${name} (${index})`
    if (!playlistNames.has(nextName)) {
      return nextName
    }
  }

  return name
}

export function shuffleSongIds(songIds: number[]) {
  const shuffledSongIds = songIds.slice()

  for (let index = shuffledSongIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffledSongIds[index]
    shuffledSongIds[index] = shuffledSongIds[randomIndex]
    shuffledSongIds[randomIndex] = current
  }

  return shuffledSongIds
}

export function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}
