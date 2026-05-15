import type { AlbumTileData } from '../components/AlbumTile'
import { getSongArtists, joinArtists } from '../shared/artists'
import type { LibrarySong, PreferenceEntityType } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { SearchResult, SearchResultType } from '../shared/SearchHelper'

export function getSearchResultCardKey(sectionKey: SearchResultType, card: SearchResult) {
  return `${sectionKey}:${card.path}:${card.title}`
}

export function getSearchAlbumTileData(card: SearchResult, songsById: Map<number, LibrarySong>, t: Translator): AlbumTileData {
  const songs = card.songIds.map((songId) => songsById.get(songId)!)
  return {
    name: card.title,
    artist: getSearchAlbumArtistLabel(songs, t),
    artworkUrl: card.artworkUrl,
    songIds: card.songIds,
  }
}

function getSearchAlbumArtistLabel(songs: LibrarySong[], t: Translator) {
  const artists = [...new Set(songs.flatMap((song) => getSongArtists(song, t('common.artistUnknown'))))]

  if (artists.length >= 3) {
    return t('albums.artistsAndMore', { first: artists[0], second: artists[1], count: artists.length })
  }

  return joinArtists(artists)
}

export function getUniqueSongIds(songIds: number[]) {
  return [...new Set(songIds)]
}

export function getSearchResultPreferenceType(sectionKey: SearchResultType): PreferenceEntityType | null {
  const preferenceTypeBySection = {
    artists: 'artist',
    albums: 'album',
    playlists: 'playlist',
    folders: 'folder',
  } as const

  return preferenceTypeBySection[sectionKey as keyof typeof preferenceTypeBySection] ?? null
}

export function getSearchResultPreferenceId(type: PreferenceEntityType, card: SearchResult) {
  return type === 'folder' || type === 'playlist' ? card.sourceId! : card.title
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
