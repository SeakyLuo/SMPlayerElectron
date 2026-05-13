import { readdir, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import type { LocalFolderSortCriterion } from '../../src/shared/contracts.ts'
import type { HiddenItemService } from './hidden-item-service.ts'
import type { HistoryService } from './history-service.ts'
import {
  LocalItemStateService,
  type DeletedLocalItemsState,
  type DeletedSongState,
  type SongMove,
} from './local-item-state-service.ts'
import type { PlaylistService } from './playlist-service.ts'
import type { SongService } from './song-service.ts'

export type MoveConflictAction = 'replace' | 'keep-both' | 'skip'
export type MoveConflictResolver = (sourcePath: string, targetPath: string) => Promise<MoveConflictAction>
export type MoveProgressReporter = (currentItem: string, progress: number, max: number) => void
export type { DeletedLocalItemsState, DeletedSongState }

export class LocalItemService {
  private readonly songService: SongService
  private readonly stateService: LocalItemStateService

  constructor(
    db: DatabaseSync,
    songService: SongService,
    playlistService: PlaylistService,
    historyService: HistoryService,
    hiddenItemService: HiddenItemService,
  ) {
    this.songService = songService
    this.stateService = new LocalItemStateService(
      db,
      songService,
      playlistService,
      historyService,
      hiddenItemService,
    )
  }

  deleteSong(songId: number) {
    this.stateService.deleteSong(songId)
  }

  captureDeletedSongState(songId: number) {
    return this.stateService.captureDeletedSongState(songId)
  }

  restoreDeletedSong(songId: number, songPath: string, deletedState: DeletedSongState) {
    this.stateService.restoreDeletedSong(songId, songPath, deletedState)
  }

  isSongActive(songId: number) {
    return this.stateService.isSongActive(songId)
  }

  hasActiveSongs(songIds: number[]) {
    return this.stateService.hasActiveSongs(songIds)
  }

  captureDeletedLocalItemsState(songIds: number[], songPaths: string[], folderPaths: string[]) {
    return this.stateService.captureDeletedLocalItemsState(songIds, songPaths, folderPaths)
  }

  restoreDeletedLocalItems(deletedState: DeletedLocalItemsState) {
    this.stateService.restoreDeletedLocalItems(deletedState)
  }

  hasActiveDeletedLocalItems(deletedState: DeletedLocalItemsState) {
    return this.stateService.hasActiveDeletedLocalItems(deletedState)
  }

  hideSong(songId: number) {
    this.stateService.hideSong(songId)
  }

  async moveSongToFolder(songId: number, folderPath: string, resolveConflict?: MoveConflictResolver) {
    await this.moveSongsToFolder([songId], folderPath, resolveConflict)
  }

  async moveSongsToFolder(songIds: number[], folderPath: string, resolveConflict?: MoveConflictResolver) {
    const targetFolderStats = await stat(folderPath)

    if (!targetFolderStats.isDirectory()) {
      throw new Error(`Target path is not a folder: ${folderPath}`)
    }

    const moves = await this.collectSongMoves(songIds, folderPath, resolveConflict)
    await this.moveSongFiles(moves)
    this.stateService.applySongMoves(moves, folderPath)
  }

  async moveLocalFolderToFolder(sourceFolderPath: string, targetFolderPath: string, resolveConflict?: MoveConflictResolver) {
    const sourcePath = sourceFolderPath.replace(/[\\/]+$/, '')
    const targetPath = targetFolderPath.replace(/[\\/]+$/, '')
    const sourceStats = await stat(sourcePath)
    const targetStats = await stat(targetPath)

    if (!sourceStats.isDirectory() || !targetStats.isDirectory()) {
      throw new Error('Source and target must be folders.')
    }

    if (sourcePath === targetPath || targetPath.startsWith(`${sourcePath}\\`) || targetPath.startsWith(`${sourcePath}/`)) {
      return
    }

    const nextPath = join(targetPath, basename(sourcePath))
    if (await this.pathExists(nextPath)) {
      const existingTargetStats = await stat(nextPath)
      if (!existingTargetStats.isDirectory()) {
        throw new Error(`Target path already exists and is not a folder: ${nextPath}`)
      }
      await this.mergeFolderIntoExistingTarget(sourcePath, nextPath, resolveConflict)
      return
    }

    await rename(sourcePath, nextPath)
    this.stateService.replaceMovedPathReferences(sourcePath, nextPath)
    this.stateService.updateMovedFolderParent(nextPath, targetPath)
  }

  async moveLocalItemsToFolder(
    songIds: number[],
    folderPaths: string[],
    targetFolderPath: string,
    resolveConflict?: MoveConflictResolver,
    reportProgress?: MoveProgressReporter,
  ) {
    const targetFolderStats = await stat(targetFolderPath)

    if (!targetFolderStats.isDirectory()) {
      throw new Error(`Target path is not a folder: ${targetFolderPath}`)
    }

    const moves = await this.collectSongMoves(songIds, targetFolderPath, resolveConflict)
    const max = moves.length + folderPaths.length
    let progress = 0

    if (max > 0) {
      reportProgress?.(moves[0]?.songPath ?? folderPaths[0]!, progress, max)
    }

    await this.moveSongFiles(moves, (currentItem) => {
      reportProgress?.(currentItem, progress, max)
    }, (currentItem) => {
      progress += 1
      reportProgress?.(currentItem, progress, max)
    })
    this.stateService.applySongMoves(moves, targetFolderPath)

    for (const folderPath of folderPaths) {
      reportProgress?.(folderPath, progress, max)
      await this.moveLocalFolderToFolder(folderPath, targetFolderPath, resolveConflict)
      progress += 1
      reportProgress?.(folderPath, progress, max)
    }
  }

  deleteSongs(songIds: number[], songPaths = this.songService.getSongPaths(songIds)) {
    this.stateService.deleteSongs(songIds, songPaths)
  }

  deleteLocalItems(songIds: number[], folderPaths: string[], songPaths = this.songService.getSongPaths(songIds)) {
    this.stateService.deleteLocalItems(songIds, folderPaths, songPaths)
  }

  updateLocalFolderSort(folderPath: string, sortCriterion: LocalFolderSortCriterion) {
    this.stateService.updateLocalFolderSort(folderPath, sortCriterion)
  }

  async renameLocalFolder(folderPath: string, name: string) {
    const nextPath = join(dirname(folderPath), name)
    await rename(folderPath, nextPath)
    this.stateService.replaceMovedPathReferences(folderPath, nextPath)
  }

  deleteLocalFolder(folderPath: string) {
    this.stateService.deleteLocalFolder(folderPath)
  }

  replaceRootPathReferences(originalPath: string, nextPath: string) {
    this.stateService.replaceRootPathReferences(originalPath, nextPath)
  }

  private async collectSongMoves(songIds: number[], folderPath: string, resolveConflict?: MoveConflictResolver) {
    const moves: SongMove[] = []
    for (const songId of songIds) {
      const songPath = this.songService.getSongPath(songId)
      if (dirname(songPath) !== folderPath) {
        const move = await this.resolveSongMove(songId, songPath, folderPath, resolveConflict)
        if (move) {
          moves.push(move)
        }
      }
    }

    return moves
  }

  private async resolveSongMove(
    songId: number,
    songPath: string,
    folderPath: string,
    resolveConflict?: MoveConflictResolver,
  ): Promise<SongMove | null> {
    let targetPath = join(folderPath, basename(songPath))
    try {
      await stat(targetPath)
      const conflictAction = resolveConflict ? await resolveConflict(songPath, targetPath) : 'keep-both'
      if (conflictAction === 'skip') {
        return null
      }
      if (conflictAction === 'keep-both') {
        targetPath = await this.getAvailableSiblingPath(targetPath)
      }
      return {
        songId,
        songPath,
        targetPath,
        replacedPath: conflictAction === 'replace' ? targetPath : undefined,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      return { songId, songPath, targetPath }
    }
  }

  private async moveSongFiles(
    moves: SongMove[],
    onBeforeMove?: (currentItem: string) => void,
    onAfterMove?: (currentItem: string) => void,
  ) {
    for (const move of moves) {
      onBeforeMove?.(move.songPath)
      await stat(move.songPath)
      if (move.replacedPath) {
        await unlink(move.replacedPath)
      }
      await rename(move.songPath, move.targetPath)
      onAfterMove?.(move.songPath)
    }
  }

  private async mergeFolderIntoExistingTarget(
    sourceFolderPath: string,
    targetFolderPath: string,
    resolveConflict?: MoveConflictResolver,
  ): Promise<boolean> {
    let movedAll = true
    const entries = await readdir(sourceFolderPath, { withFileTypes: true })

    for (const entry of entries) {
      const sourceEntryPath = join(sourceFolderPath, entry.name)
      const targetEntryPath = join(targetFolderPath, entry.name)

      if (entry.isDirectory()) {
        if (await this.pathExists(targetEntryPath)) {
          const targetEntryStats = await stat(targetEntryPath)
          if (!targetEntryStats.isDirectory()) {
            throw new Error(`Target path already exists and is not a folder: ${targetEntryPath}`)
          }
          movedAll = await this.mergeFolderIntoExistingTarget(sourceEntryPath, targetEntryPath, resolveConflict) && movedAll
        } else {
          await rename(sourceEntryPath, targetEntryPath)
          this.stateService.replaceMovedPathReferences(sourceEntryPath, targetEntryPath)
          this.stateService.updateMovedFolderParent(targetEntryPath, targetFolderPath)
        }
        continue
      }

      if (entry.isFile()) {
        movedAll = await this.moveFilePathToFolder(sourceEntryPath, targetFolderPath, resolveConflict) && movedAll
        continue
      }

      movedAll = false
    }

    const remainingEntries = await readdir(sourceFolderPath)
    if (remainingEntries.length === 0) {
      await rmdir(sourceFolderPath)
      this.stateService.markLocalFolderInactive(sourceFolderPath)
      return movedAll
    }

    return false
  }

  private async moveFilePathToFolder(
    sourceFilePath: string,
    targetFolderPath: string,
    resolveConflict?: MoveConflictResolver,
  ) {
    let targetFilePath = join(targetFolderPath, basename(sourceFilePath))
    let replacedPath: string | undefined

    if (await this.pathExists(targetFilePath)) {
      const conflictAction = resolveConflict ? await resolveConflict(sourceFilePath, targetFilePath) : 'keep-both'
      if (conflictAction === 'skip') {
        return false
      }
      if (conflictAction === 'keep-both') {
        targetFilePath = await this.getAvailableSiblingPath(targetFilePath)
      } else {
        replacedPath = targetFilePath
      }
    }

    if (replacedPath) {
      await unlink(replacedPath)
    }
    await rename(sourceFilePath, targetFilePath)
    this.stateService.updateMovedFileReference(sourceFilePath, targetFilePath, targetFolderPath, replacedPath)
    return true
  }

  private async getAvailableSiblingPath(targetPath: string) {
    const extension = extname(targetPath)
    const basePath = targetPath.slice(0, targetPath.length - extension.length)
    let index = 1
    let nextPath = `${basePath} (${index})${extension}`

    while (await this.pathExists(nextPath)) {
      index += 1
      nextPath = `${basePath} (${index})${extension}`
    }

    return nextPath
  }

  private async pathExists(targetPath: string) {
    try {
      await stat(targetPath)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw error
    }
  }
}
