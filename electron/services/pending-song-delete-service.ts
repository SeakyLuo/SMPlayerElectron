import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { LocalItemService, DeletedLocalItemsState, DeletedSongState } from './local-item-service.ts'
import type { SongService } from './song-service.ts'
import { trashPathIfExists } from './local-file-actions.ts'

export interface PendingSongDelete {
  id: string
  songId: number
}

export interface PendingLocalItemsDelete {
  id: string
  songIds: number[]
  folderPaths: string[]
}

interface PendingSongDeleteRecord extends PendingSongDelete {
  type?: 'song'
  songPath: string
  createdAt: string
  deletedState: DeletedSongState
}

interface PendingLocalItemsDeleteRecord extends PendingLocalItemsDelete {
  type: 'local-items'
  targetPaths: string[]
  createdAt: string
  deletedState: DeletedLocalItemsState
}

type PendingDeleteRecord = PendingSongDeleteRecord | PendingLocalItemsDeleteRecord

export class PendingSongDeleteService {
  private readonly filePath: string
  private readonly songService: SongService
  private readonly localItemService: LocalItemService
  private records: PendingDeleteRecord[] = []
  private loaded = false

  constructor(userDataPath: string, songService: SongService, localItemService: LocalItemService) {
    this.filePath = join(userDataPath, 'pending-song-deletes.json')
    this.songService = songService
    this.localItemService = localItemService
  }

  async begin(songId: number): Promise<PendingSongDelete> {
    await this.load()

    const songPath = this.songService.getSongPath(songId)
    const record: PendingSongDeleteRecord = {
      id: randomUUID(),
      type: 'song',
      songId,
      songPath,
      createdAt: new Date().toISOString(),
      deletedState: this.localItemService.captureDeletedSongState(songId),
    }
    this.records = [record, ...this.records]
    await this.save()
    try {
      this.localItemService.deleteSong(songId)
    } catch (error) {
      this.records = this.records.filter((item) => item.id !== record.id)
      await this.save()
      throw error
    }
    return { id: record.id, songId: record.songId }
  }

  async beginLocalItems(songIds: number[], songPaths: string[], folderPaths: string[]): Promise<PendingLocalItemsDelete> {
    await this.load()

    const targetPaths = [
      ...songPaths.filter((songPath) => !folderPaths.some((folderPath) =>
        songPath.startsWith(`${folderPath}\\`) || songPath.startsWith(`${folderPath}/`),
      )),
      ...folderPaths,
    ]
    const record: PendingLocalItemsDeleteRecord = {
      id: randomUUID(),
      type: 'local-items',
      songIds,
      folderPaths,
      targetPaths,
      createdAt: new Date().toISOString(),
      deletedState: this.localItemService.captureDeletedLocalItemsState(songIds, songPaths, folderPaths),
    }
    this.records = [record, ...this.records]
    await this.save()
    try {
      this.localItemService.deleteLocalItems(songIds, folderPaths, songPaths)
    } catch (error) {
      this.records = this.records.filter((item) => item.id !== record.id)
      await this.save()
      throw error
    }

    return { id: record.id, songIds: record.songIds, folderPaths: record.folderPaths }
  }

  async undo(deleteId: string) {
    await this.load()
    const record = this.records.find((item) => item.id === deleteId)!
    if (record.type === 'local-items') {
      this.localItemService.restoreDeletedLocalItems(record.deletedState)
    } else {
      this.localItemService.restoreDeletedSong(record.songId, record.songPath, record.deletedState)
    }
    this.records = this.records.filter((item) => item.id !== deleteId)
    await this.save()
  }

  async commit(deleteId: string) {
    await this.load()
    const record = this.records.find((item) => item.id === deleteId)!
    await this.trashRecord(record)
    this.records = this.records.filter((item) => item.id !== deleteId)
    await this.save()
  }

  async commitAll() {
    await this.load()
    const records = this.records
    const inactiveRecords = records.filter((record) =>
      record.type === 'local-items'
        ? !this.localItemService.hasActiveDeletedLocalItems(record.deletedState)
        : !this.localItemService.isSongActive(record.songId),
    )

    for (const record of inactiveRecords) {
      await this.trashRecord(record)
    }

    this.records = []
    await this.save()
  }

  hasPending() {
    return this.records.length > 0
  }

  private async load() {
    if (this.loaded) {
      return
    }

    try {
      this.records = JSON.parse(await readFile(this.filePath, 'utf8')) as PendingSongDeleteRecord[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      this.records = []
    }
    this.loaded = true
  }

  private async save() {
    await writeFile(this.filePath, `${JSON.stringify(this.records)}\n`, 'utf8')
  }

  private async trashRecord(record: PendingDeleteRecord) {
    if (record.type === 'local-items') {
      for (const targetPath of record.targetPaths) {
        await trashPathIfExists(targetPath)
      }
      return
    }

    await trashPathIfExists(record.songPath)
  }
}
