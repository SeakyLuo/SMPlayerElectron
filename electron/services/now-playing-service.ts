import { readFileSync, writeFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'

import { ACTIVE_STATE } from './constants.ts'

export class NowPlayingService {
  private readonly db: DatabaseSync
  private readonly jsonPath: string
  private readonly getPlaylistSongIdsStatement

  constructor(db: DatabaseSync, jsonPath: string) {
    this.db = db
    this.jsonPath = jsonPath
    this.getPlaylistSongIdsStatement = this.db.prepare(`
      SELECT PlaylistItem.ItemId AS songId
      FROM PlaylistItem
      INNER JOIN Music
        ON Music.Id = PlaylistItem.ItemId
      WHERE PlaylistItem.PlaylistId = ?
        AND PlaylistItem.State = ?
        AND Music.State = ?
      ORDER BY PlaylistItem.Id
    `)
  }

  readSongIds(fallbackPlaylistId: number) {
    const pathRows = this.readPaths()

    if (pathRows.length > 0) {
      return this.readSongIdsFromPaths(pathRows)
    }

    if (fallbackPlaylistId <= 0) {
      return []
    }

    return (
      this.getPlaylistSongIdsStatement.all(
        fallbackPlaylistId,
        ACTIVE_STATE.active,
        ACTIVE_STATE.active,
      ) as unknown as Array<{ songId: number }>
    ).map((item) => Number(item.songId))
  }

  readSongIdsByPath() {
    const pathRows = this.readPaths()

    if (pathRows.length === 0) {
      return []
    }

    return this.readSongIdsFromPaths(pathRows)
  }

  private readSongIdsFromPaths(pathRows: string[]) {
    const placeholders = pathRows.map(() => '?').join(', ')
    const rows = this.db.prepare(`
      SELECT Id AS id, Path AS path
      FROM Music
      WHERE Path IN (${placeholders})
        AND State = ?
    `).all(...pathRows, ACTIVE_STATE.active) as Array<{ id: number; path: string }>
    const songIdsByPath = new Map(rows.map((song) => [song.path, Number(song.id)]))

    return pathRows.flatMap((songPath) => {
      const songId = songIdsByPath.get(songPath)
      return songId == null ? [] : [songId]
    })
  }

  writeSongIds(songIds: number[]) {
    const uniqueSongIds = songIds.map(Number)
    if (uniqueSongIds.length === 0) {
      writeFileSync(this.jsonPath, '[]', 'utf8')
      return
    }

    const placeholders = uniqueSongIds.map(() => '?').join(', ')
    const rows = this.db.prepare(`
      SELECT Id AS id, Path AS path
      FROM Music
      WHERE Id IN (${placeholders})
        AND State = ?
    `).all(...uniqueSongIds, ACTIVE_STATE.active) as Array<{ id: number; path: string }>
    const pathsById = new Map(rows.map((song) => [Number(song.id), song.path]))
    const songPaths = uniqueSongIds.flatMap((songId) => {
      const songPath = pathsById.get(songId)
      return songPath == null ? [] : [songPath]
    })

    writeFileSync(this.jsonPath, JSON.stringify(songPaths), 'utf8')
  }

  private readPaths() {
    try {
      const data = JSON.parse(readFileSync(this.jsonPath, 'utf8')) as string[]
      return data.filter((item) => typeof item === 'string' && item.length > 0)
    } catch {
      return []
    }
  }
}
