import type { DatabaseSync } from 'node:sqlite'

import type { LocalFolderSortCriterion } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'
import type { HiddenItemService } from './hidden-item-service.ts'
import type { HistoryService } from './history-service.ts'
import type { PlaylistService } from './playlist-service.ts'
import type { SongService } from './song-service.ts'
import { syncAlbums } from './album-sync.ts'

export interface SongMove {
  songId: number
  songPath: string
  targetPath: string
  replacedPath?: string
}

export interface DeletedSongState {
  playlistItemIds: number[]
  recentRecordIds: number[]
}

export interface DeletedLocalItemsState {
  musicIds: number[]
  musicArtistIds: number[]
  folderIds: number[]
  fileIds: number[]
  playlistItemIds: number[]
  recentRecordIds: number[]
  hiddenStorageItemIds: number[]
  preferenceItemIds: number[]
}

export class LocalItemStateService {
  private readonly db: DatabaseSync
  private readonly songService: SongService
  private readonly playlistService: PlaylistService
  private readonly historyService: HistoryService
  private readonly hiddenItemService: HiddenItemService

  private readonly markSingleMusicInactiveStatement
  private readonly markSongArtistsInactiveStatement
  private readonly markFileByPathInactiveStatement

  constructor(
    db: DatabaseSync,
    songService: SongService,
    playlistService: PlaylistService,
    historyService: HistoryService,
    hiddenItemService: HiddenItemService,
  ) {
    this.db = db
    this.songService = songService
    this.playlistService = playlistService
    this.historyService = historyService
    this.hiddenItemService = hiddenItemService
    this.markSingleMusicInactiveStatement = this.db.prepare('UPDATE Music SET State = ? WHERE Id = ?')
    this.markSongArtistsInactiveStatement = this.db.prepare(`
      UPDATE MusicArtist
      SET State = ?
      WHERE MusicId = ?
    `)
    this.markFileByPathInactiveStatement = this.db.prepare('UPDATE File SET State = ? WHERE Path = ?')
  }

  deleteSong(songId: number) {
    const songPath = this.songService.getSongPath(songId)

    this.db.exec('BEGIN')
    try {
      this.markSingleMusicInactiveStatement.run(ACTIVE_STATE.inactive, songId)
      this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.inactive, songId)
      this.playlistService.markPlaylistItemsBySongInactive(songId)
      this.historyService.removeRecentPlayed([songId])
      this.markFileByPathInactiveStatement.run(ACTIVE_STATE.inactive, songPath)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  captureDeletedSongState(songId: number): DeletedSongState {
    const playlistItemIds = (this.db.prepare(`
      SELECT Id AS id
      FROM PlaylistItem
      WHERE ItemId = ?
        AND State = ?
    `).all(songId, ACTIVE_STATE.active) as unknown as Array<{ id: number }>).map((row) => row.id)
    const recentRecordIds = (this.db.prepare(`
      SELECT Id AS id
      FROM RecentRecord
      WHERE Type = 0
        AND ItemId = ?
        AND State = ?
    `).all(songId.toString(), ACTIVE_STATE.active) as unknown as Array<{ id: number }>).map((row) => row.id)

    return { playlistItemIds, recentRecordIds }
  }

  isSongActive(songId: number) {
    const row = this.db.prepare(`
      SELECT Id AS id
      FROM Music
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as { id: number } | undefined

    return row !== undefined
  }

  restoreDeletedSong(songId: number, songPath: string, deletedState: DeletedSongState) {
    this.db.exec('BEGIN')
    try {
      this.markSingleMusicInactiveStatement.run(ACTIVE_STATE.active, songId)
      this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.active, songId)
      this.markFileByPathInactiveStatement.run(ACTIVE_STATE.active, songPath)
      this.restoreRows('PlaylistItem', deletedState.playlistItemIds)
      this.restoreRows('RecentRecord', deletedState.recentRecordIds)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  captureDeletedLocalItemsState(songIds: number[], songPaths: string[], folderPaths: string[]): DeletedLocalItemsState {
    const pathClauses = [
      ...songPaths.map(() => 'Path = ?'),
      ...folderPaths.flatMap(() => ['Path = ?', 'Path LIKE ?', 'Path LIKE ?']),
    ]
    const pathValues = [
      ...songPaths,
      ...folderPaths.flatMap((folderPath) => [folderPath, `${folderPath}\\%`, `${folderPath}/%`]),
    ]
    const songIdClause = songIds.length > 0 ? `Id IN (${songIds.map(() => '?').join(',')})` : ''
    const musicWhere = [
      songIdClause,
      pathClauses.length > 0 ? `(${pathClauses.join(' OR ')})` : '',
    ].filter(Boolean).join(' OR ')
    const musicIds = this.selectIds('Music', `State = ? AND (${musicWhere})`, [
      ACTIVE_STATE.active,
      ...songIds,
      ...pathValues,
    ])
    const folderWhere = folderPaths.flatMap(() => ['Path = ?', 'Path LIKE ?', 'Path LIKE ?']).join(' OR ')
    const folderIds = folderPaths.length > 0
      ? this.selectIds('Folder', `State = ? AND (${folderWhere})`, [
          ACTIVE_STATE.active,
          ...folderPaths.flatMap((folderPath) => [folderPath, `${folderPath}\\%`, `${folderPath}/%`]),
        ])
      : []
    const fileIds = pathClauses.length > 0
      ? this.selectIds('File', `State = ? AND (${pathClauses.join(' OR ')})`, [ACTIVE_STATE.active, ...pathValues])
      : []
    const musicPlaceholders = musicIds.map(() => '?').join(',')
    const folderPlaceholders = folderIds.map(() => '?').join(',')

    return {
      musicIds,
      musicArtistIds: musicIds.length > 0
        ? this.selectIds('MusicArtist', `State = ? AND MusicId IN (${musicPlaceholders})`, [ACTIVE_STATE.active, ...musicIds])
        : [],
      folderIds,
      fileIds,
      playlistItemIds: musicIds.length > 0
        ? this.selectIds('PlaylistItem', `State = ? AND ItemId IN (${musicPlaceholders})`, [ACTIVE_STATE.active, ...musicIds])
        : [],
      recentRecordIds: musicIds.length > 0
        ? this.selectIds('RecentRecord', `State = ? AND Type = 0 AND ItemId IN (${musicPlaceholders})`, [
            ACTIVE_STATE.active,
            ...musicIds.map(String),
          ])
        : [],
      hiddenStorageItemIds: pathClauses.length > 0
        ? this.selectIds('HiddenStorageItem', `State = ? AND (${pathClauses.join(' OR ')})`, [ACTIVE_STATE.active, ...pathValues])
        : [],
      preferenceItemIds: folderIds.length > 0
        ? this.selectIds('PreferenceItem', `State = ? AND Type = ? AND ItemId IN (${folderPlaceholders})`, [
            ACTIVE_STATE.active,
            4,
            ...folderIds.map(String),
          ])
        : [],
    }
  }

  restoreDeletedLocalItems(deletedState: DeletedLocalItemsState) {
    this.db.exec('BEGIN')
    try {
      this.restoreRows('Music', deletedState.musicIds)
      this.restoreRows('MusicArtist', deletedState.musicArtistIds)
      this.restoreRows('Folder', deletedState.folderIds)
      this.restoreRows('File', deletedState.fileIds)
      this.restoreRows('PlaylistItem', deletedState.playlistItemIds)
      this.restoreRows('RecentRecord', deletedState.recentRecordIds)
      this.restoreRows('HiddenStorageItem', deletedState.hiddenStorageItemIds)
      this.restoreRows('PreferenceItem', deletedState.preferenceItemIds)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  hasActiveSongs(songIds: number[]) {
    if (songIds.length === 0) {
      return false
    }

    const placeholders = songIds.map(() => '?').join(',')
    const row = this.db.prepare(`
      SELECT Id AS id
      FROM Music
      WHERE Id IN (${placeholders})
        AND State = ?
      LIMIT 1
    `).get(...songIds, ACTIVE_STATE.active) as { id: number } | undefined

    return row !== undefined
  }

  hasActiveDeletedLocalItems(deletedState: DeletedLocalItemsState) {
    return this.hasActiveRows('Music', deletedState.musicIds) || this.hasActiveRows('Folder', deletedState.folderIds)
  }

  hideSong(songId: number) {
    const songPath = this.songService.getSongPath(songId)

    this.db.exec('BEGIN')
    try {
      this.markSingleMusicInactiveStatement.run(ACTIVE_STATE.hidden, songId)
      this.markFileByPathInactiveStatement.run(ACTIVE_STATE.hidden, songPath)
      this.hiddenItemService.upsert('file', songPath)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  applySongMoves(moves: SongMove[], folderPath: string) {
    this.db.exec('BEGIN')
    try {
      const targetFolder = this.db.prepare(`
        SELECT Id AS id
        FROM Folder
        WHERE Path = ?
          AND State = ?
        LIMIT 1
      `).get(folderPath, ACTIVE_STATE.active) as { id: number } | undefined

      const updateMusic = this.db.prepare(`
        UPDATE Music
        SET Path = ?
        WHERE Id = ?
          AND State = ?
      `)
      const updateFile = this.db.prepare(`
        UPDATE File
        SET Path = ?, ParentId = ?
        WHERE Path = ?
      `)

      for (const move of moves) {
        if (move.replacedPath) {
          this.deleteSongAtPathInsideTransaction(move.replacedPath, move.songId)
        }
        updateMusic.run(move.targetPath, move.songId, ACTIVE_STATE.active)
        updateFile.run(move.targetPath, targetFolder?.id ?? 0, move.songPath)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  deleteSongs(songIds: number[], songPaths = this.songService.getSongPaths(songIds)) {
    this.db.exec('BEGIN')
    try {
      this.deleteSongsInsideTransaction(songIds, songPaths)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  deleteLocalItems(songIds: number[], folderPaths: string[], songPaths = this.songService.getSongPaths(songIds)) {
    this.db.exec('BEGIN')
    try {
      this.deleteSongsInsideTransaction(songIds, songPaths)
      for (const folderPath of folderPaths) {
        this.deleteLocalFolderInsideTransaction(folderPath)
      }
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateLocalFolderSort(folderPath: string, sortCriterion: LocalFolderSortCriterion) {
    this.db.prepare(`
      UPDATE Folder
      SET Criterion = ?
      WHERE Path = ?
        AND State = ?
    `).run(this.toLocalFolderSortValue(sortCriterion), folderPath, ACTIVE_STATE.active)
  }

  deleteLocalFolder(folderPath: string) {
    this.db.exec('BEGIN')
    try {
      this.deleteLocalFolderInsideTransaction(folderPath)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  replaceRootPathReferences(originalPath: string, nextPath: string) {
    if (originalPath === nextPath || !originalPath) {
      return
    }

    this.replacePathReferences(originalPath, nextPath)
  }

  replaceMovedPathReferences(originalPath: string, nextPath: string) {
    this.replacePathReferences(originalPath, nextPath)
  }

  markLocalFolderInactive(folderPath: string) {
    this.db.prepare(`
      UPDATE Folder
      SET State = ?
      WHERE Path = ?
    `).run(ACTIVE_STATE.inactive, folderPath)
    this.db.prepare(`
      UPDATE HiddenStorageItem
      SET State = ?
      WHERE Type = 'folder'
        AND Path = ?
    `).run(ACTIVE_STATE.inactive, folderPath)
  }

  updateMovedFileReference(
    sourceFilePath: string,
    targetFilePath: string,
    targetFolderPath: string,
    replacedPath?: string,
  ) {
    this.db.exec('BEGIN')
    try {
      const sourceSong = this.db.prepare(`
        SELECT Id AS id
        FROM Music
        WHERE Path = ?
          AND State = ?
        LIMIT 1
      `).get(sourceFilePath, ACTIVE_STATE.active) as { id: number } | undefined

      if (replacedPath) {
        this.deleteSongAtPathInsideTransaction(replacedPath, sourceSong?.id ?? 0)
      }

      const targetFolderId = this.getActiveFolderId(targetFolderPath) ?? 0
      if (sourceSong) {
        this.db.prepare(`
          UPDATE Music
          SET Path = ?
          WHERE Id = ?
            AND State = ?
        `).run(targetFilePath, sourceSong.id, ACTIVE_STATE.active)
      }
      this.db.prepare(`
        UPDATE File
        SET Path = ?, ParentId = ?
        WHERE Path = ?
      `).run(targetFilePath, targetFolderId, sourceFilePath)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateMovedFolderParent(folderPath: string, parentPath: string) {
    this.db.prepare(`
      UPDATE Folder
      SET ParentId = ?
      WHERE Path = ?
        AND State = ?
    `).run(this.getActiveFolderId(parentPath) ?? 0, folderPath, ACTIVE_STATE.active)
  }

  private deleteSongInsideTransaction(songId: number) {
    const songPath = this.songService.getSongPath(songId)
    this.markSingleMusicInactiveStatement.run(ACTIVE_STATE.inactive, songId)
    this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.inactive, songId)
    this.playlistService.markPlaylistItemsBySongInactive(songId)
    this.historyService.removeRecentPlayed([songId])
    this.markFileByPathInactiveStatement.run(ACTIVE_STATE.inactive, songPath)
    this.db.prepare(`
      UPDATE HiddenStorageItem
      SET State = ?
      WHERE Type = 'file'
        AND Path = ?
    `).run(ACTIVE_STATE.inactive, songPath)
  }

  private deleteSongsInsideTransaction(songIds: number[], songPaths: string[]) {
    if (songIds.length === 0) {
      return
    }

    const songPlaceholders = songIds.map(() => '?').join(',')

    this.db.prepare(`
      UPDATE Music
      SET State = ?
      WHERE Id IN (${songPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songIds)
    this.db.prepare(`
      UPDATE MusicArtist
      SET State = ?
      WHERE MusicId IN (${songPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songIds)
    this.db.prepare(`
      UPDATE PlaylistItem
      SET State = ?
      WHERE ItemId IN (${songPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songIds)
    this.historyService.removeRecentPlayed(songIds)
    if (songPaths.length > 0) {
      const pathPlaceholders = songPaths.map(() => '?').join(',')
      this.db.prepare(`
        UPDATE File
        SET State = ?
        WHERE Path IN (${pathPlaceholders})
      `).run(ACTIVE_STATE.inactive, ...songPaths)
      this.db.prepare(`
        UPDATE HiddenStorageItem
        SET State = ?
        WHERE Type = 'file'
          AND Path IN (${pathPlaceholders})
      `).run(ACTIVE_STATE.inactive, ...songPaths)
    }
  }

  private deleteSongAtPathInsideTransaction(songPath: string, exceptSongId: number) {
    const song = this.db.prepare(`
      SELECT Id AS id
      FROM Music
      WHERE Path = ?
        AND Id <> ?
        AND State = ?
      LIMIT 1
    `).get(songPath, exceptSongId, ACTIVE_STATE.active) as { id: number } | undefined

    if (song) {
      this.deleteSongInsideTransaction(song.id)
      return
    }

    this.markFileByPathInactiveStatement.run(ACTIVE_STATE.inactive, songPath)
  }

  private deleteLocalFolderInsideTransaction(folderPath: string) {
    this.db.prepare(`
      UPDATE PreferenceItem
      SET State = ?
      WHERE Type = ?
        AND ItemId IN (
          SELECT CAST(Id AS TEXT)
          FROM Folder
          WHERE Path = ?
             OR Path LIKE ?
             OR Path LIKE ?
        )
    `).run(ACTIVE_STATE.inactive, 4, folderPath, `${folderPath}\\%`, `${folderPath}/%`)
    this.db.prepare(`
      UPDATE Folder
      SET State = ?
      WHERE Path = ?
         OR Path LIKE ?
         OR Path LIKE ?
    `).run(ACTIVE_STATE.inactive, folderPath, `${folderPath}\\%`, `${folderPath}/%`)
    this.db.prepare(`
      UPDATE Music
      SET State = ?
      WHERE Path LIKE ?
         OR Path LIKE ?
    `).run(ACTIVE_STATE.inactive, `${folderPath}\\%`, `${folderPath}/%`)
    this.db.prepare(`
      UPDATE File
      SET State = ?
      WHERE Path LIKE ?
         OR Path LIKE ?
    `).run(ACTIVE_STATE.inactive, `${folderPath}\\%`, `${folderPath}/%`)
    this.db.prepare(`
      UPDATE HiddenStorageItem
      SET State = ?
      WHERE Path = ?
         OR Path LIKE ?
         OR Path LIKE ?
    `).run(ACTIVE_STATE.inactive, folderPath, `${folderPath}\\%`, `${folderPath}/%`)
  }

  private selectIds(tableName: 'Music' | 'MusicArtist' | 'Folder' | 'File' | 'PlaylistItem' | 'RecentRecord' | 'HiddenStorageItem' | 'PreferenceItem', where: string, values: Array<string | number>) {
    return (this.db.prepare(`
      SELECT Id AS id
      FROM ${tableName}
      WHERE ${where}
    `).all(...values) as unknown as Array<{ id: number }>).map((row) => row.id)
  }

  private hasActiveRows(tableName: 'Music' | 'Folder', rowIds: number[]) {
    if (rowIds.length === 0) {
      return false
    }

    const placeholders = rowIds.map(() => '?').join(',')
    const row = this.db.prepare(`
      SELECT Id AS id
      FROM ${tableName}
      WHERE Id IN (${placeholders})
        AND State = ?
      LIMIT 1
    `).get(...rowIds, ACTIVE_STATE.active) as { id: number } | undefined

    return row !== undefined
  }

  private restoreRows(tableName: 'Music' | 'MusicArtist' | 'Folder' | 'File' | 'PlaylistItem' | 'RecentRecord' | 'HiddenStorageItem' | 'PreferenceItem', rowIds: number[]) {
    if (rowIds.length === 0) {
      return
    }

    const placeholders = rowIds.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE ${tableName}
      SET State = ?
      WHERE Id IN (${placeholders})
    `).run(ACTIVE_STATE.active, ...rowIds)
  }

  private replacePathReferences(originalPath: string, nextPath: string) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare(`
        UPDATE Settings
        SET RootPath = replace(RootPath, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE OR REPLACE Music
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE OR REPLACE Folder
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE OR REPLACE File
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE OR REPLACE HiddenStorageItem
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private getActiveFolderId(folderPath: string) {
    const folder = this.db.prepare(`
      SELECT Id AS id
      FROM Folder
      WHERE Path = ?
        AND State = ?
      LIMIT 1
    `).get(folderPath, ACTIVE_STATE.active) as { id: number } | undefined
    return folder?.id
  }

  private toLocalFolderSortValue(criterion: LocalFolderSortCriterion) {
    return {
      title: 0,
      artist: 1,
      album: 2,
      reverse: 7,
    }[criterion]
  }
}
