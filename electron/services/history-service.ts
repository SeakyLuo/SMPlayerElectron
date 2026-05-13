import type { DatabaseSync } from 'node:sqlite'

import type {
  RecentAlbumPlayback,
  RecentArtistPlayback,
  RecentPlaylistPlayback,
  SearchHistoryEntry,
  SearchHistoryType,
} from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'
import { toSearchHistoryEntry, type SearchHistoryRow } from './row-mappers.ts'

const RECENT_RECORD_TYPE = {
  song: 0,
  playlist: 3,
  album: 4,
  artist: 5,
} as const

interface SearchStateRow {
  LastQuery: string
}

interface RecentRecordRow {
  id: number
  itemId: string
  playedAt: string
}

export class HistoryService {
  private readonly db: DatabaseSync
  private readonly getSearchStateStatement
  private readonly updateSearchStateStatement
  private readonly getSearchHistoryStatement
  private readonly deleteSearchHistoryEntryStatement
  private readonly deleteSearchHistoryByQueryStatement
  private readonly insertSearchHistoryStatement
  private readonly clearSearchHistoryStatement
  private readonly markSongPlayedStatement
  private readonly markRecentPlayedInactiveStatement
  private readonly clearRecentPlayedStatement
  private readonly cleanupInvalidRecentPlayedStatement
  private readonly insertRecentPlayedStatement
  private readonly getRecentSongPathsStatement
  private readonly markRecentItemInactiveStatement
  private readonly insertRecentItemStatement
  private readonly getRecentPlaylistsStatement
  private readonly getRecentAlbumsStatement
  private readonly getRecentArtistsStatement

  constructor(db: DatabaseSync) {
    this.db = db
    this.getSearchStateStatement = this.db.prepare(`
      SELECT LastQuery
      FROM SearchState
      WHERE Id = 1
    `)
    this.updateSearchStateStatement = this.db.prepare(`
      UPDATE SearchState
      SET LastQuery = ?
      WHERE Id = 1
    `)
    this.getSearchHistoryStatement = this.db.prepare(`
      SELECT
        Id AS id,
        Query AS query,
        Type AS type,
        SearchedAt AS searchedAt
      FROM SearchHistory
      ORDER BY datetime(SearchedAt) DESC, Id DESC
    `)
    this.deleteSearchHistoryEntryStatement = this.db.prepare(`
      DELETE FROM SearchHistory
      WHERE Id = ?
    `)
    this.deleteSearchHistoryByQueryStatement = this.db.prepare(`
      DELETE FROM SearchHistory
      WHERE Query = ? COLLATE NOCASE
        AND Type = ?
    `)
    this.insertSearchHistoryStatement = this.db.prepare(`
      INSERT INTO SearchHistory (Query, Type, SearchedAt)
      VALUES (?, ?, ?)
    `)
    this.clearSearchHistoryStatement = this.db.prepare('DELETE FROM SearchHistory')
    this.markSongPlayedStatement = this.db.prepare(`
      UPDATE Music
      SET PlayCount = PlayCount + 1
      WHERE Id = ?
    `)
    this.markRecentPlayedInactiveStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = ${RECENT_RECORD_TYPE.song} AND ItemId = ?
    `)
    this.clearRecentPlayedStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type IN (${RECENT_RECORD_TYPE.song}, ${RECENT_RECORD_TYPE.playlist}, ${RECENT_RECORD_TYPE.album}, ${RECENT_RECORD_TYPE.artist})
    `)
    this.cleanupInvalidRecentPlayedStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = ${RECENT_RECORD_TYPE.song}
        AND State = ?
        AND NOT EXISTS (
          SELECT 1
          FROM Music
          WHERE Music.Id = CAST(RecentRecord.ItemId AS INTEGER)
            AND Music.State = ?
        )
    `)
    this.insertRecentPlayedStatement = this.db.prepare(`
      INSERT INTO RecentRecord (Type, ItemId, Time, State)
      VALUES (${RECENT_RECORD_TYPE.song}, ?, ?, ?)
    `)
    this.getRecentSongPathsStatement = this.db.prepare(`
      SELECT Music.Path AS path
      FROM RecentRecord
      INNER JOIN Music
        ON Music.Id = CAST(RecentRecord.ItemId AS INTEGER)
      WHERE RecentRecord.Type = ${RECENT_RECORD_TYPE.song}
        AND RecentRecord.State = ?
        AND Music.State = ?
      ORDER BY RecentRecord.Id DESC
      LIMIT ?
    `)
    this.markRecentItemInactiveStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = ? AND ItemId = ?
    `)
    this.insertRecentItemStatement = this.db.prepare(`
      INSERT INTO RecentRecord (Type, ItemId, Time, State)
      VALUES (?, ?, ?, ?)
    `)
    this.getRecentPlaylistsStatement = this.db.prepare(`
      SELECT
        RecentRecord.Id AS id,
        RecentRecord.ItemId AS itemId,
        CAST(RecentRecord.Time AS TEXT) AS playedAt
      FROM RecentRecord
      INNER JOIN Playlist
        ON Playlist.Id = CAST(RecentRecord.ItemId AS INTEGER)
      WHERE RecentRecord.Type = ${RECENT_RECORD_TYPE.playlist}
        AND RecentRecord.State = ?
        AND Playlist.State = ?
      ORDER BY RecentRecord.Id DESC
      LIMIT ?
    `)
    this.getRecentAlbumsStatement = this.db.prepare(`
      SELECT
        RecentRecord.Id AS id,
        RecentRecord.ItemId AS itemId,
        CAST(RecentRecord.Time AS TEXT) AS playedAt
      FROM RecentRecord
      WHERE RecentRecord.Type = ${RECENT_RECORD_TYPE.album}
        AND RecentRecord.State = ?
      ORDER BY RecentRecord.Id DESC
      LIMIT ?
    `)
    this.getRecentArtistsStatement = this.db.prepare(`
      SELECT
        RecentRecord.Id AS id,
        RecentRecord.ItemId AS itemId,
        CAST(RecentRecord.Time AS TEXT) AS playedAt
      FROM RecentRecord
      WHERE RecentRecord.Type = ${RECENT_RECORD_TYPE.artist}
        AND RecentRecord.State = ?
        AND EXISTS (
          SELECT 1
          FROM MusicArtist
          INNER JOIN Music
            ON Music.Id = MusicArtist.MusicId
          WHERE MusicArtist.Name = RecentRecord.ItemId
            AND MusicArtist.State = ?
            AND Music.State = ?
        )
      ORDER BY RecentRecord.Id DESC
      LIMIT ?
    `)
  }

  getSearchSnapshot() {
    const searchState = this.getSearchState()
    const recentSearches = (this.getSearchHistoryStatement.all() as unknown as SearchHistoryRow[])
      .map(toSearchHistoryEntry)

    return {
      lastQuery: searchState.LastQuery,
      recentSearches,
    }
  }

  getRecentPlaylists(limit: number): RecentPlaylistPlayback[] {
    const rows = this.getRecentPlaylistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      limit,
    ) as unknown as RecentRecordRow[]
    return rows.map((row) => this.toRecentPlaylistPlayback(row))
  }

  getRecentAlbums(limit: number): RecentAlbumPlayback[] {
    const rows = this.getRecentAlbumsStatement.all(
      ACTIVE_STATE.active,
      limit,
    ) as unknown as RecentRecordRow[]
    return rows.map((row) => this.toRecentAlbumPlayback(row))
  }

  getRecentArtists(limit: number): RecentArtistPlayback[] {
    const rows = this.getRecentArtistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      limit,
    ) as unknown as RecentRecordRow[]
    return rows.map((row) => this.toRecentArtistPlayback(row))
  }

  getRecentPlayedSongPaths(limit: number) {
    const rows = this.getRecentSongPathsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      limit,
    ) as unknown as Array<{ path: string }>

    return rows.map((row) => row.path)
  }

  saveSearchQuery(query: string) {
    this.updateSearchStateStatement.run(query.trim())
  }

  addRecentSearch(query: string, type: SearchHistoryType = 'sidebar'): SearchHistoryEntry | null {
    const nextQuery = query.trim()
    this.saveSearchQuery(nextQuery)

    if (!nextQuery) {
      return null
    }

    const searchedAt = new Date().toISOString()

    this.db.exec('BEGIN')
    try {
      this.deleteSearchHistoryByQueryStatement.run(nextQuery, type)
      const result = this.insertSearchHistoryStatement.run(nextQuery, type, searchedAt)
      this.db.exec('COMMIT')
      return {
        id: Number(result.lastInsertRowid),
        query: nextQuery,
        type,
        searchedAt,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeRecentSearch(entryId: number) {
    this.deleteSearchHistoryEntryStatement.run(entryId)
  }

  removeRecentSearches(entryIds: number[]) {
    const placeholders = entryIds.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM SearchHistory WHERE Id IN (${placeholders})`).run(...entryIds)
  }

  restoreRecentSearch(entry: SearchHistoryEntry) {
    this.db.exec('BEGIN')
    try {
      this.deleteSearchHistoryByQueryStatement.run(entry.query, entry.type)
      this.db.prepare(`
        INSERT INTO SearchHistory (Id, Query, Type, SearchedAt)
        VALUES (?, ?, ?, ?)
      `).run(entry.id, entry.query, entry.type, entry.searchedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  clearRecentSearches() {
    this.clearSearchHistoryStatement.run()
  }

  markSongPlayed(songId: number) {
    this.db.exec('BEGIN')
    try {
      this.markSongPlayedStatement.run(songId)
      this.markRecentPlayedInactiveStatement.run(ACTIVE_STATE.inactive, songId.toString())
      this.insertRecentPlayedStatement.run(
        songId.toString(),
        new Date().toISOString(),
        ACTIVE_STATE.active,
      )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeRecentPlayed(songIds: number[]) {
    const placeholders = songIds.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = ${RECENT_RECORD_TYPE.song}
        AND ItemId IN (${placeholders})
    `).run(ACTIVE_STATE.inactive, ...songIds.map((songId) => songId.toString()))
  }

  restoreRecentPlayed(songIds: number[]) {
    const placeholders = songIds.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = ${RECENT_RECORD_TYPE.song}
        AND ItemId IN (${placeholders})
    `).run(ACTIVE_STATE.active, ...songIds.map((songId) => songId.toString()))
  }

  clearRecentPlayed() {
    this.clearRecentPlayedStatement.run(ACTIVE_STATE.inactive)
  }

  cleanupInvalidRecentPlayed() {
    this.cleanupInvalidRecentPlayedStatement.run(
      ACTIVE_STATE.inactive,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    )
  }

  recordRecentPlaylistPlayed(playlistId: number): RecentPlaylistPlayback {
    const playedAt = new Date().toISOString()
    const itemId = playlistId.toString()

    this.db.exec('BEGIN')
    try {
      this.markRecentItemInactiveStatement.run(ACTIVE_STATE.inactive, RECENT_RECORD_TYPE.playlist, itemId)
      const result = this.insertRecentItemStatement.run(
        RECENT_RECORD_TYPE.playlist,
        itemId,
        playedAt,
        ACTIVE_STATE.active,
      )
      this.db.exec('COMMIT')
      return {
        id: Number(result.lastInsertRowid),
        playlistId,
        playedAt,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  recordRecentAlbumPlayed(album: string): RecentAlbumPlayback {
    const playedAt = new Date().toISOString()

    this.db.exec('BEGIN')
    try {
      this.markRecentItemInactiveStatement.run(ACTIVE_STATE.inactive, RECENT_RECORD_TYPE.album, album)
      const result = this.insertRecentItemStatement.run(
        RECENT_RECORD_TYPE.album,
        album,
        playedAt,
        ACTIVE_STATE.active,
      )
      this.db.exec('COMMIT')
      return {
        id: Number(result.lastInsertRowid),
        album,
        playedAt,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  recordRecentArtistPlayed(artist: string): RecentArtistPlayback {
    const playedAt = new Date().toISOString()

    this.db.exec('BEGIN')
    try {
      this.markRecentItemInactiveStatement.run(ACTIVE_STATE.inactive, RECENT_RECORD_TYPE.artist, artist)
      const result = this.insertRecentItemStatement.run(
        RECENT_RECORD_TYPE.artist,
        artist,
        playedAt,
        ACTIVE_STATE.active,
      )
      this.db.exec('COMMIT')
      return {
        id: Number(result.lastInsertRowid),
        artist,
        playedAt,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private getSearchState(): SearchStateRow {
    const searchState = this.getSearchStateStatement.get() as SearchStateRow | undefined

    if (!searchState) {
      throw new Error('Search state row is missing.')
    }

    return searchState
  }

  private toRecentPlaylistPlayback(row: RecentRecordRow): RecentPlaylistPlayback {
    return {
      id: Number(row.id),
      playlistId: Number(row.itemId),
      playedAt: this.normalizeStoredDate(row.playedAt),
    }
  }

  private toRecentAlbumPlayback(row: RecentRecordRow): RecentAlbumPlayback {
    return {
      id: Number(row.id),
      album: row.itemId,
      playedAt: this.normalizeStoredDate(row.playedAt),
    }
  }

  private toRecentArtistPlayback(row: RecentRecordRow): RecentArtistPlayback {
    return {
      id: Number(row.id),
      artist: row.itemId,
      playedAt: this.normalizeStoredDate(row.playedAt),
    }
  }

  private normalizeStoredDate(value: unknown) {
    if (typeof value === 'string') {
      const normalized = value.trim()

      if (!normalized) {
        return ''
      }

      if (/^\d{15,}$/.test(normalized)) {
        return this.dotNetTicksToIso(normalized)
      }

      return normalized
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ''
      }

      if (value > 10_000_000_000_000) {
        return this.dotNetTicksToIso(Math.trunc(value).toString())
      }

      return new Date(value).toISOString()
    }

    return ''
  }

  private dotNetTicksToIso(value: string) {
    const ticks = BigInt(value)
    const unixEpochTicks = 621355968000000000n
    const milliseconds = Number((ticks - unixEpochTicks) / 10000n)
    return new Date(milliseconds).toISOString()
  }
}
