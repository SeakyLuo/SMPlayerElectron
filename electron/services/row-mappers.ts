import type {
  LibraryFolder,
  LibraryPlaylist,
  SearchHistoryEntry,
  SearchHistoryType,
} from '../../src/shared/contracts.ts'

export interface PlaylistRow {
  id: number
  name: string
  songCount: number
  priority: number
  criterion: number
}

export interface PlaylistItemRow {
  playlistId: number
  songId: number
}

export interface SongArtistRow {
  songId: number
  name: string
}

export interface SearchHistoryRow {
  id: number
  query: string
  type: string
  searchedAt: string
}

const searchHistoryTypes = new Set<SearchHistoryType>(['sidebar', 'artists', 'albums', 'songs', 'playlists', 'folders'])

function toSearchHistoryType(value: string): SearchHistoryType {
  return searchHistoryTypes.has(value as SearchHistoryType) ? value as SearchHistoryType : 'sidebar'
}

export function toSearchHistoryEntry(row: SearchHistoryRow): SearchHistoryEntry {
  return {
    id: Number(row.id),
    query: row.query,
    type: toSearchHistoryType(row.type),
    searchedAt: row.searchedAt,
  }
}

export function toFolder(row: LibraryFolder): LibraryFolder {
  return {
    id: Number(row.id),
    path: row.path,
    parentId: Number(row.parentId),
    criterion: Number(row.criterion),
  }
}

export function toPlaylistItemRow(row: PlaylistItemRow): PlaylistItemRow {
  return {
    playlistId: Number(row.playlistId),
    songId: Number(row.songId),
  }
}

export function toSongArtistRow(row: SongArtistRow): SongArtistRow {
  return {
    songId: Number(row.songId),
    name: row.name,
  }
}

export function toPlaylist(
  row: PlaylistRow,
  playlistSongIds: Map<number, number[]>,
  favoritesPlaylistId: number,
  mapPlaylistSort: (criterion: number) => LibraryPlaylist['sortCriterion'],
): LibraryPlaylist {
  return {
    id: Number(row.id),
    name: row.name,
    priority: Number(row.priority),
    songCount: Number(row.songCount),
    songIds: playlistSongIds.get(row.id) ?? [],
    sortCriterion: mapPlaylistSort(row.criterion),
    isBuiltIn: row.id === favoritesPlaylistId,
  }
}
