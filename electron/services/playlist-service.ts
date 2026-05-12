import type { DatabaseSync } from 'node:sqlite'

import type { LibraryPlaylist, PlaylistSortCriterion } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE, PLAYLIST_NAMES } from './constants.ts'
import type { SettingsService } from './settings-service.ts'
import { toPlaylistSortValue } from './settings-service.ts'
import type { PlaylistItemRow, PlaylistRow } from './row-mappers.ts'

export class PlaylistService {
  private readonly db: DatabaseSync
  private readonly settingsService: SettingsService
  private readonly getPlaylistIdStatement
  private readonly insertPlaylistStatement
  private readonly updatePlaylistNameStatement
  private readonly updatePlaylistStateStatement
  private readonly updatePlaylistItemStateStatement
  private readonly insertPlaylistItemStatement
  private readonly markPlaylistItemsInactiveStatement
  private readonly markPlaylistItemsBySongInactiveStatement
  private readonly cleanupInvalidPlaylistItemsStatement
  private readonly getPlaylistsStatement
  private readonly getCustomPlaylistIdsStatement
  private readonly incrementCustomPlaylistPrioritiesStatement
  private readonly getPlaylistSongIdsStatement
  private readonly getPlaylistItemsStatement

  constructor(db: DatabaseSync, settingsService: SettingsService) {
    this.db = db
    this.settingsService = settingsService
    this.getPlaylistIdStatement = this.db.prepare(`
      SELECT Id
      FROM Playlist
      WHERE Name = ? AND State = 1
      LIMIT 1
    `)
    this.insertPlaylistStatement = this.db.prepare(`
      INSERT INTO Playlist (Name, Criterion, Priority, State)
      VALUES (?, -1, ?, ?)
    `)
    this.updatePlaylistNameStatement = this.db.prepare(`
      UPDATE Playlist
      SET Name = ?
      WHERE Id = ?
    `)
    this.updatePlaylistStateStatement = this.db.prepare(`
      UPDATE Playlist
      SET State = ?
      WHERE Id = ?
    `)
    this.updatePlaylistItemStateStatement = this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE PlaylistId = ? AND ItemId = ?
    `)
    this.insertPlaylistItemStatement = this.db.prepare(`
      INSERT INTO PlaylistItem (PlaylistId, ItemId, State)
      VALUES (?, ?, ?)
    `)
    this.markPlaylistItemsInactiveStatement = this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE PlaylistId = ?
    `)
    this.markPlaylistItemsBySongInactiveStatement = this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE ItemId = ?
    `)
    this.cleanupInvalidPlaylistItemsStatement = this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE State = ?
        AND (
          NOT EXISTS (
            SELECT 1
            FROM Playlist
            WHERE Playlist.Id = PlaylistItem.PlaylistId
              AND Playlist.State = ?
          )
          OR NOT EXISTS (
            SELECT 1
            FROM Music
            WHERE Music.Id = PlaylistItem.ItemId
              AND Music.State = ?
          )
        )
    `)
    this.getPlaylistsStatement = this.db.prepare(`
      SELECT
        Playlist.Id AS id,
        Playlist.Name AS name,
        Playlist.Criterion AS criterion,
        Playlist.Priority AS priority,
        COUNT(Music.Id) AS songCount
      FROM Playlist
      LEFT JOIN PlaylistItem
        ON PlaylistItem.PlaylistId = Playlist.Id
       AND PlaylistItem.State = ?
      LEFT JOIN Music
        ON Music.Id = PlaylistItem.ItemId
       AND Music.State = ?
      WHERE Playlist.State = ?
      GROUP BY Playlist.Id, Playlist.Name, Playlist.Criterion, Playlist.Priority
      ORDER BY
        CASE
          WHEN Playlist.Id = ? THEN 0
          WHEN Playlist.Id = ? THEN 1
          ELSE 2
        END,
        CASE WHEN Playlist.Priority < 0 THEN 2147483647 ELSE Playlist.Priority END,
        LOWER(Playlist.Name),
        Playlist.Id
    `)
    this.getCustomPlaylistIdsStatement = this.db.prepare(`
      SELECT Playlist.Id AS id
      FROM Playlist
      WHERE Playlist.State = ?
        AND Playlist.Id NOT IN (?, ?)
        AND Playlist.Name <> ?
      ORDER BY
        CASE WHEN Playlist.Priority < 0 THEN 2147483647 ELSE Playlist.Priority END,
        LOWER(Playlist.Name),
        Playlist.Id
    `)
    this.incrementCustomPlaylistPrioritiesStatement = this.db.prepare(`
      UPDATE Playlist
      SET Priority = Priority + 1
      WHERE State = ?
        AND Id NOT IN (?, ?)
        AND Name <> ?
    `)
    this.getPlaylistItemsStatement = this.db.prepare(`
      SELECT
        PlaylistItem.PlaylistId AS playlistId,
        PlaylistItem.ItemId AS songId
      FROM PlaylistItem
      INNER JOIN Playlist
        ON Playlist.Id = PlaylistItem.PlaylistId
      INNER JOIN Music
        ON Music.Id = PlaylistItem.ItemId
      WHERE PlaylistItem.State = ?
        AND Playlist.State = ?
        AND Music.State = ?
      ORDER BY PlaylistItem.Id
    `)
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

  getPlaylists(): PlaylistRow[] {
    const settings = this.settingsService.getSettings()
    return this.getPlaylistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      settings.MyFavorites,
      settings.NowPlaying,
    ) as unknown as PlaylistRow[]
  }

  getPlaylistItems(): PlaylistItemRow[] {
    return this.getPlaylistItemsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as PlaylistItemRow[]
  }

  createBuiltInPlaylist(name: string, priority: number): number {
    const result = this.insertPlaylistStatement.run(name, priority, ACTIVE_STATE.active)
    return Number(result.lastInsertRowid)
  }

  createPlaylist(name: string, songIds: number[] = []): LibraryPlaylist {
    const nextName = this.validatePlaylistName(name)
    const settings = this.settingsService.getSettings()

    this.db.exec('BEGIN')
    try {
      this.incrementCustomPlaylistPrioritiesStatement.run(
        ACTIVE_STATE.active,
        settings.MyFavorites,
        settings.NowPlaying,
        PLAYLIST_NAMES.nowPlaying,
      )
      const result = this.insertPlaylistStatement.run(nextName, 0, ACTIVE_STATE.active)
      const playlistId = Number(result.lastInsertRowid)
      this.setPlaylistSongsState(playlistId, songIds, true)
      this.db.exec('COMMIT')
      const playlistSongIds = [...new Set(songIds.map(Number))]
      return {
        id: playlistId,
        name: nextName,
        priority: 0,
        songCount: playlistSongIds.length,
        songIds: playlistSongIds,
        sortCriterion: 'title',
        isBuiltIn: false,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  deletePlaylist(playlistId: number) {
    const settings = this.settingsService.getSettings()

    if (playlistId === settings.MyFavorites || playlistId === settings.NowPlaying) {
      throw new Error('Built-in playlists cannot be deleted.')
    }

    this.db.exec('BEGIN')
    try {
      this.updatePlaylistStateStatement.run(ACTIVE_STATE.inactive, playlistId)
      this.markPlaylistItemsInactiveStatement.run(ACTIVE_STATE.inactive, playlistId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  restorePlaylist(playlist: LibraryPlaylist) {
    const settings = this.settingsService.getSettings()

    this.db.exec('BEGIN')
    try {
      const nextName = this.validatePlaylistName(playlist.name, playlist.id)
      this.db.prepare(`
        UPDATE Playlist
        SET Priority = Priority + 1
        WHERE State = ?
          AND Id NOT IN (?, ?, ?)
          AND Name <> ?
          AND Priority >= ?
      `).run(
        ACTIVE_STATE.active,
        settings.MyFavorites,
        settings.NowPlaying,
        playlist.id,
        PLAYLIST_NAMES.nowPlaying,
        playlist.priority,
      )
      this.updatePlaylistNameStatement.run(nextName, playlist.id)
      this.db.prepare(`
        UPDATE Playlist
        SET Criterion = ?,
            Priority = ?
        WHERE Id = ?
    `).run(toPlaylistSortValue(playlist.sortCriterion), playlist.priority, playlist.id)
      this.updatePlaylistStateStatement.run(ACTIVE_STATE.active, playlist.id)
      this.markPlaylistItemsInactiveStatement.run(ACTIVE_STATE.inactive, playlist.id)
      this.setPlaylistSongsState(playlist.id, playlist.songIds, true)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  setSongFavorite(songId: number, favorite: boolean) {
    const settings = this.settingsService.getSettings()
    this.setPlaylistSongState(settings.MyFavorites, songId, favorite)
  }

  setSongsFavorite(songIds: number[], favorite: boolean) {
    const settings = this.settingsService.getSettings()

    this.db.exec('BEGIN')
    try {
      this.setPlaylistSongsState(settings.MyFavorites, songIds, favorite)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  renamePlaylist(playlistId: number, name: string) {
    const settings = this.settingsService.getSettings()

    if (playlistId === settings.MyFavorites || playlistId === settings.NowPlaying) {
      throw new Error('Built-in playlists cannot be renamed.')
    }

    const nextName = this.validatePlaylistName(name, playlistId)
    this.updatePlaylistNameStatement.run(nextName, playlistId)
  }

  reorderPlaylists(playlistIds: number[]) {
    const settings = this.settingsService.getSettings()
    const currentPlaylistIds = (
      this.getCustomPlaylistIdsStatement.all(
        ACTIVE_STATE.active,
        settings.MyFavorites,
        settings.NowPlaying,
        PLAYLIST_NAMES.nowPlaying,
      ) as Array<{ id: number }>
    ).map((playlist) => Number(playlist.id))

    if (currentPlaylistIds.length <= 1) {
      return
    }

    if (
      currentPlaylistIds.length !== playlistIds.length ||
      currentPlaylistIds.some((playlistId) => !playlistIds.includes(playlistId))
    ) {
      throw new Error('Playlist reorder request is out of sync with the current playlist list.')
    }

    const firstChangedIndex = playlistIds.findIndex((playlistId, index) => playlistId !== currentPlaylistIds[index])
    if (firstChangedIndex < 0) {
      return
    }

    const lastChangedIndex =
      playlistIds.length - 1 - [...playlistIds].reverse().findIndex((playlistId, index) =>
        playlistId !== currentPlaylistIds[currentPlaylistIds.length - 1 - index],
      )
    const changedPlaylistIds = playlistIds.slice(firstChangedIndex, lastChangedIndex + 1)
    const priorityCases = changedPlaylistIds.map(() => 'WHEN ? THEN ?').join(' ')
    const playlistIdPlaceholders = changedPlaylistIds.map(() => '?').join(', ')
    const priorityCaseValues = changedPlaylistIds.flatMap((playlistId, index) => [
      playlistId,
      firstChangedIndex + index,
    ])

    this.db.prepare(`
      UPDATE Playlist
      SET Priority = CASE Id ${priorityCases} END
      WHERE Id IN (${playlistIdPlaceholders})
    `).run(...priorityCaseValues, ...changedPlaylistIds)
  }

  addSongToPlaylist(playlistId: number, songId: number) {
    this.setPlaylistSongState(playlistId, songId, true)
  }

  addSongsToPlaylist(playlistId: number, songIds: number[]) {
    this.db.exec('BEGIN')
    try {
      this.setPlaylistSongsState(playlistId, songIds, true)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeSongFromPlaylist(playlistId: number, songId: number) {
    this.setPlaylistSongState(playlistId, songId, false)
  }

  removeSongsFromPlaylist(playlistId: number, songIds: number[]) {
    this.db.exec('BEGIN')
    try {
      this.setPlaylistSongsState(playlistId, songIds, false)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  reorderPlaylistSongs(playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) {
    const currentSongIds = (
      this.getPlaylistSongIdsStatement.all(
        playlistId,
        ACTIVE_STATE.active,
        ACTIVE_STATE.active,
      ) as unknown as Array<{ songId: number }>
    ).map((item) => Number(item.songId))

    if (currentSongIds.length <= 1) {
      return
    }

    if (
      currentSongIds.length !== songIds.length ||
      currentSongIds.some((songId) => !songIds.includes(songId))
    ) {
      throw new Error('Playlist reorder request is out of sync with the current playlist.')
    }

    this.db.exec('BEGIN')
    try {
      this.markPlaylistItemsInactiveStatement.run(ACTIVE_STATE.inactive, playlistId)

      for (const songId of songIds) {
        this.insertPlaylistItemStatement.run(playlistId, songId, ACTIVE_STATE.active)
      }

      if (sortCriterion) {
        this.db.prepare(`
          UPDATE Playlist
          SET Criterion = ?
          WHERE Id = ?
        `).run(toPlaylistSortValue(sortCriterion), playlistId)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  markPlaylistItemsBySongInactive(songId: number) {
    this.markPlaylistItemsBySongInactiveStatement.run(ACTIVE_STATE.inactive, songId)
  }

  cleanupInvalidPlaylistItems() {
    this.cleanupInvalidPlaylistItemsStatement.run(
      ACTIVE_STATE.inactive,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    )
  }

  private validatePlaylistName(name: string, currentPlaylistId?: number) {
    const nextName = name.trim()

    if (!nextName) {
      throw new Error('Playlist name cannot be empty.')
    }

    const existing = this.getPlaylistIdStatement.get(nextName) as { Id: number } | undefined

    if (existing && existing.Id !== currentPlaylistId) {
      throw new Error(`Playlist "${nextName}" already exists.`)
    }

    return nextName
  }

  private setPlaylistSongState(playlistId: number, songId: number, isActive: boolean) {
    const nextState = isActive ? ACTIVE_STATE.active : ACTIVE_STATE.inactive
    const result = this.updatePlaylistItemStateStatement.run(nextState, playlistId, songId)

    if (isActive && result.changes === 0) {
      this.insertPlaylistItemStatement.run(playlistId, songId, ACTIVE_STATE.active)
    }
  }

  private setPlaylistSongsState(playlistId: number, songIds: number[], isActive: boolean) {
    const uniqueSongIds = [...new Set(songIds.map(Number))]
    if (uniqueSongIds.length === 0) {
      return
    }

    const placeholders = uniqueSongIds.map(() => '?').join(', ')
    const nextState = isActive ? ACTIVE_STATE.active : ACTIVE_STATE.inactive
    this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE PlaylistId = ?
        AND ItemId IN (${placeholders})
    `).run(nextState, playlistId, ...uniqueSongIds)

    if (isActive) {
      this.db.prepare(`
        INSERT INTO PlaylistItem (PlaylistId, ItemId, State)
        SELECT ?, Music.Id, ?
        FROM Music
        WHERE Music.Id IN (${placeholders})
          AND NOT EXISTS (
            SELECT 1
            FROM PlaylistItem
            WHERE PlaylistItem.PlaylistId = ?
              AND PlaylistItem.ItemId = Music.Id
          )
      `).run(playlistId, ACTIVE_STATE.active, ...uniqueSongIds, playlistId)
    }
  }
}
