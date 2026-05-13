import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { normalizeArtists } from '../../src/shared/artists.ts'
import type { ArtistSplitResultItem, HiddenStorageItem, ScanLibraryProgress, ScanLibraryResult } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE, AUDIO_EXTENSIONS } from './constants.ts'
import { pruneThumbnailCache } from './artwork-cache.ts'
import { readAudioMetadataBatch, type ScannedSong } from './audio-metadata-reader.ts'
import type { SettingsRow } from './settings-service.ts'
import { syncAlbums } from './album-sync.ts'
import { SongArtistSync } from './song-artist-sync.ts'

const METADATA_SCAN_CONCURRENCY = 6
const SMART_ARTIST_SPLIT_PATTERN = /\s*(?:\/|\uFF0F|;|\uFF1B|\u3001|\|)\s*/u
export const SCAN_CANCELED_ERROR_MESSAGE = 'Scan canceled'

export interface FolderScanOptions {
  operationId?: string
  progressMax?: number
  isCanceled?: () => boolean
  onProgress?: (progress: ScanLibraryProgress) => void
}

interface ScanServiceOptions {
  thumbnailCachePath: string
  getSettings: () => SettingsRow
  setRootPath: (rootPath: string) => void
  getHiddenStorageItems: () => HiddenStorageItem[]
  cleanupSideEffects: (settings: SettingsRow) => void
}

export class ScanService {
  private readonly db: DatabaseSync
  private readonly thumbnailCachePath: string
  private readonly getSettings: () => SettingsRow
  private readonly setRootPath: (rootPath: string) => void
  private readonly getHiddenStorageItems: () => HiddenStorageItem[]
  private readonly cleanupSideEffects: (settings: SettingsRow) => void

  private readonly markMusicInactiveStatement
  private readonly markFolderInactiveStatement
  private readonly markFileInactiveStatement
  private readonly upsertFolderStatement
  private readonly upsertMusicStatement
  private readonly upsertFileStatement
  private readonly songArtistSync

  constructor(db: DatabaseSync, options: ScanServiceOptions) {
    this.db = db
    this.thumbnailCachePath = options.thumbnailCachePath
    this.getSettings = options.getSettings
    this.setRootPath = options.setRootPath
    this.getHiddenStorageItems = options.getHiddenStorageItems
    this.cleanupSideEffects = options.cleanupSideEffects

    this.markMusicInactiveStatement = this.db.prepare('UPDATE Music SET State = ? WHERE State NOT IN (?, ?)')
    this.markFolderInactiveStatement = this.db.prepare('UPDATE Folder SET State = ? WHERE State NOT IN (?, ?)')
    this.markFileInactiveStatement = this.db.prepare('UPDATE File SET State = ? WHERE State NOT IN (?, ?)')
    this.upsertFolderStatement = this.db.prepare(`
      INSERT INTO Folder (Path, Criterion, ParentId, State)
      VALUES (?, 0, ?, ?)
      ON CONFLICT(Path) DO UPDATE SET
        ParentId = excluded.ParentId,
        State = excluded.State
      RETURNING Id
    `)
    this.upsertMusicStatement = this.db.prepare(`
      INSERT INTO Music (Path, Name, Artist, Album, ThumbnailPath, Duration, PlayCount, DateAdded, State)
      VALUES (
        ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT PlayCount FROM Music WHERE Path = ?), 0),
        COALESCE((SELECT DateAdded FROM Music WHERE Path = ?), ?),
        ?
      )
      ON CONFLICT(Path) DO UPDATE SET
        Name = excluded.Name,
        Artist = excluded.Artist,
        Album = excluded.Album,
        ThumbnailPath = excluded.ThumbnailPath,
        Duration = excluded.Duration,
        State = excluded.State
      RETURNING Id
    `)
    this.upsertFileStatement = this.db.prepare(`
      INSERT INTO File (Path, ParentId, FileId, FileType, State)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(Path) DO UPDATE SET
        ParentId = excluded.ParentId,
        FileId = excluded.FileId,
        State = excluded.State
      RETURNING Id
    `)
    this.songArtistSync = new SongArtistSync(this.db)
  }

  async scanAll(requestedRootPath?: string): Promise<ScanLibraryResult> {
    const settings = this.getSettings()
    const rootPath = requestedRootPath ?? settings.RootPath

    if (!rootPath) {
      throw new Error('No music library folder selected.')
    }

    const rootStats = await stat(rootPath)
    if (!rootStats.isDirectory()) {
      throw new Error(`Selected music library is not a directory: ${rootPath}`)
    }

    this.setRootPath(rootPath)

    const startedAt = Date.now()
    const folders: string[] = []
    const audioFiles: string[] = []
    const { hiddenFolderPaths, hiddenFilePaths } = this.getHiddenStoragePaths()

    await mkdir(this.thumbnailCachePath, { recursive: true })
    await this.walk(rootPath, folders, audioFiles, hiddenFolderPaths, hiddenFilePaths)

    const scannedSongs = await this.readSongs(audioFiles, Boolean(settings.UseFilenameNotMusicName))
    let artistSplitResult = { applied: [] as ArtistSplitResultItem[], suggestions: [] as ArtistSplitResultItem[] }

    this.db.exec('BEGIN')
    try {
      this.markMusicInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)
      this.markFolderInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)
      this.markFileInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)

      const folderIds = this.upsertScannedFolders(rootPath, folders)
      artistSplitResult = this.upsertScannedSongs(scannedSongs, folderIds, Boolean(settings.SmartMultiArtistRecognition))
      syncAlbums(this.db)
      this.cleanupSideEffects(settings)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    await pruneThumbnailCache(this.thumbnailCachePath, scannedSongs.map((song) => song.thumbnailPath))

    return {
      rootPath,
      songCount: scannedSongs.length,
      folderCount: folders.length,
      elapsedMs: Date.now() - startedAt,
      filesAdded: [],
      filesRemoved: [],
      filesMoved: [],
      artistSplitsApplied: artistSplitResult.applied,
      artistSplitSuggestions: artistSplitResult.suggestions,
    }
  }

  async prepareFolderScan(folderPath: string) {
    const scanFolderPath = await this.validateFolderForScan(folderPath)
    const hiddenFolderPaths = this.getHiddenStorageItems()
      .filter((item) => item.type === 'folder')
      .map((item) => item.path)
    const folderCount = await this.countScannableFolders(scanFolderPath, hiddenFolderPaths)

    return {
      progressMax: folderCount + 1,
    }
  }

  async validateFolderForScan(folderPath: string) {
    const scanFolderPath = normalize(folderPath)
    const folderStats = await this.statFolderForScan(scanFolderPath)

    if (!folderStats.isDirectory()) {
      throw new Error(`Folder not found: ${scanFolderPath}`)
    }

    return scanFolderPath
  }

  async scanFolder(folderPath: string, options?: FolderScanOptions): Promise<ScanLibraryResult> {
    const settings = this.getSettings()
    const rootPath = settings.RootPath
    const scanFolderPath = await this.validateFolderForScan(folderPath)
    const normalizedScanFolderPath = this.getNormalizedPathForSql(scanFolderPath)
    const normalizedScanFolderPattern = `${normalizedScanFolderPath}/%`

    const startedAt = Date.now()
    const folders: string[] = []
    const audioFiles: string[] = []
    const { hiddenFolderPaths, hiddenFilePaths } = this.getHiddenStoragePaths()

    await mkdir(this.thumbnailCachePath, { recursive: true })
    let checkedFolderCount = 0
    await this.walk(scanFolderPath, folders, audioFiles, hiddenFolderPaths, hiddenFilePaths, {
      isCanceled: options?.isCanceled,
      onFolder: (currentFolderPath) => {
        checkedFolderCount += 1
        this.emitProgress(options, {
          stage: 'checking',
          progress: checkedFolderCount,
          folderName: basename(currentFolderPath),
          canCancel: true,
        })
      },
    })

    const scannedSongs = await this.readSongs(audioFiles, Boolean(settings.UseFilenameNotMusicName), options?.isCanceled)

    const previousSongPaths = (this.db.prepare(`
      SELECT Path
      FROM Music
      WHERE State = ?
        AND REPLACE(Path, ?, ?) LIKE ?
    `).all(ACTIVE_STATE.active, '\\', '/', normalizedScanFolderPattern) as Array<{ Path: string }>).map((row) => row.Path)
    const updateResult = this.buildFolderUpdateResult(previousSongPaths, scannedSongs.map((song) => song.path))

    this.emitProgress(options, {
      stage: 'updating',
      progress: options?.progressMax ?? Math.max(checkedFolderCount, 1),
      canCancel: false,
    })
    this.throwIfCanceled(options?.isCanceled)

    this.db.exec('BEGIN')
    try {
      this.db.prepare(`
        UPDATE Music
        SET State = ?
        WHERE State NOT IN (?, ?)
          AND REPLACE(Path, ?, ?) LIKE ?
      `).run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden, '\\', '/', normalizedScanFolderPattern)
      this.db.prepare(`
        UPDATE Folder
        SET State = ?
        WHERE State NOT IN (?, ?)
          AND (REPLACE(Path, ?, ?) = ? OR REPLACE(Path, ?, ?) LIKE ?)
      `).run(
        ACTIVE_STATE.inactive,
        ACTIVE_STATE.hidden,
        ACTIVE_STATE.parentHidden,
        '\\',
        '/',
        normalizedScanFolderPath,
        '\\',
        '/',
        normalizedScanFolderPattern,
      )
      this.db.prepare(`
        UPDATE File
        SET State = ?
        WHERE State NOT IN (?, ?)
          AND REPLACE(Path, ?, ?) LIKE ?
      `).run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden, '\\', '/', normalizedScanFolderPattern)

      const folderIds = this.upsertScannedFolders(rootPath, folders)
      const artistSplitResult = this.upsertScannedSongs(scannedSongs, folderIds, Boolean(settings.SmartMultiArtistRecognition))
      syncAlbums(this.db)
      this.cleanupSideEffects(settings)
      updateResult.artistSplitsApplied = artistSplitResult.applied
      updateResult.artistSplitSuggestions = artistSplitResult.suggestions
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    await pruneThumbnailCache(this.thumbnailCachePath, scannedSongs.map((song) => song.thumbnailPath))

    return {
      rootPath,
      songCount: scannedSongs.length,
      folderCount: folders.length,
      elapsedMs: Date.now() - startedAt,
      filesAdded: updateResult.filesAdded,
      filesRemoved: updateResult.filesRemoved,
      filesMoved: updateResult.filesMoved,
      artistSplitsApplied: updateResult.artistSplitsApplied,
      artistSplitSuggestions: updateResult.artistSplitSuggestions,
    }
  }

  private getHiddenStoragePaths() {
    const hiddenStorageItems = this.getHiddenStorageItems()
    return {
      hiddenFolderPaths: hiddenStorageItems
        .filter((item) => item.type === 'folder')
        .map((item) => item.path),
      hiddenFilePaths: new Set(
        hiddenStorageItems
          .filter((item) => item.type === 'file')
          .map((item) => item.path),
      ),
    }
  }

  private upsertScannedFolders(rootPath: string, folders: string[]) {
    const folderIds = new Map<string, number>()
    const sortedFolders = folders
      .slice()
      .sort((left, right) => left.split(/[/\\]+/).length - right.split(/[/\\]+/).length)

    for (const folderPath of sortedFolders) {
      const parentId = this.getPathComparisonKey(folderPath) === this.getPathComparisonKey(rootPath)
        ? 0
        : (folderIds.get(dirname(folderPath)) ?? this.getActiveFolderId(dirname(folderPath)) ?? 0)
      const row = this.upsertFolderStatement.get(
        folderPath,
        parentId,
        ACTIVE_STATE.active,
      ) as { Id: number }
      folderIds.set(folderPath, row.Id)
    }

    return folderIds
  }

  private upsertScannedSongs(
    scannedSongs: ScannedSong[],
    folderIds: Map<string, number>,
    smartMultiArtistRecognition: boolean,
  ) {
    const artistSplitPlan = smartMultiArtistRecognition
      ? this.buildArtistSplitPlan(scannedSongs)
      : { autoSplits: new Map<ScannedSong, string[]>(), suggestions: new Map<ScannedSong, string[]>() }
    const applied: ArtistSplitResultItem[] = []
    const suggestions: ArtistSplitResultItem[] = []

    for (const song of scannedSongs) {
      const musicRow = this.upsertMusicStatement.get(
        song.path,
        song.title,
        song.artist,
        song.album,
        song.thumbnailPath,
        song.duration,
        song.path,
        song.path,
        song.dateAdded,
        ACTIVE_STATE.active,
      ) as { Id: number }
      const splitArtists = artistSplitPlan.autoSplits.get(song)
      const artists = splitArtists ?? (song.artist ? [song.artist] : [])

      this.songArtistSync.sync(musicRow.Id, artists)
      if (splitArtists && splitArtists.length > 1) {
        applied.push(this.toArtistSplitResultItem(musicRow.Id, song, splitArtists))
      }
      const suggestedArtists = artistSplitPlan.suggestions.get(song)
      if (suggestedArtists) {
        suggestions.push(this.toArtistSplitResultItem(musicRow.Id, song, suggestedArtists))
      }

      this.upsertFileStatement.get(
        song.path,
        folderIds.get(dirname(song.path)) ?? this.getActiveFolderId(dirname(song.path)) ?? 0,
        musicRow.Id,
        ACTIVE_STATE.active,
      )
    }

    return {
      applied,
      suggestions,
    }
  }

  private buildFolderUpdateResult(previousSongPaths: string[], scannedSongPaths: string[]) {
    const previousPaths = new Set(previousSongPaths.map((songPath) => this.getPathComparisonKey(songPath)))
    const scannedPaths = new Set(scannedSongPaths.map((songPath) => this.getPathComparisonKey(songPath)))
    const filesAdded = scannedSongPaths.filter((songPath) => !previousPaths.has(this.getPathComparisonKey(songPath)))
    const filesRemoved = previousSongPaths.filter((songPath) => !scannedPaths.has(this.getPathComparisonKey(songPath)))
    const filesMoved: string[] = []

    for (const addedPath of filesAdded.slice()) {
      const fileName = basename(addedPath).toLocaleLowerCase()
      const matchingRemovedCount = filesRemoved.filter((removedPath) => basename(removedPath).toLocaleLowerCase() === fileName).length
      const matchingAddedCount = filesAdded.filter((candidatePath) => basename(candidatePath).toLocaleLowerCase() === fileName).length

      if (matchingRemovedCount === 1 && matchingAddedCount === 1) {
        filesMoved.push(addedPath)
      }
    }

    return {
      filesAdded: filesAdded.filter((songPath) => !filesMoved.includes(songPath)),
      filesRemoved: filesRemoved.filter((songPath) =>
        !filesMoved.some((movedPath) => basename(movedPath).toLocaleLowerCase() === basename(songPath).toLocaleLowerCase())),
      filesMoved,
      artistSplitsApplied: [] as ArtistSplitResultItem[],
      artistSplitSuggestions: [] as ArtistSplitResultItem[],
    }
  }

  private buildArtistSplitPlan(scannedSongs: ScannedSong[]) {
    const knownArtists = this.getKnownArtists()
    const autoSplits = new Map<ScannedSong, string[]>()
    const candidates: Array<{ song: ScannedSong; artists: string[] }> = []

    for (const song of scannedSongs) {
      if (song.artists.length > 1) {
        autoSplits.set(song, song.artists)
        for (const artist of song.artists) {
          knownArtists.add(this.getArtistKey(artist))
        }
        continue
      }

      const artists = this.splitSmartArtistCandidate(song.artist)
      if (artists.length > 1) {
        candidates.push({ song, artists })
      } else if (song.artist) {
        knownArtists.add(this.getArtistKey(song.artist))
      }
    }

    const recurringPartKeys = this.getRecurringCandidatePartKeys(candidates)
    const unresolvedCandidates = new Set(candidates)
    let changed = true
    while (changed) {
      changed = false
      for (const candidate of unresolvedCandidates) {
        if (!candidate.artists.some((artist) =>
          knownArtists.has(this.getArtistKey(artist)) ||
          recurringPartKeys.has(this.getArtistKey(artist)),
        )) {
          continue
        }

        autoSplits.set(candidate.song, candidate.artists)
        for (const artist of candidate.artists) {
          knownArtists.add(this.getArtistKey(artist))
        }
        unresolvedCandidates.delete(candidate)
        changed = true
      }
    }

    return {
      autoSplits,
      suggestions: new Map([...unresolvedCandidates].map((candidate) => [candidate.song, candidate.artists])),
    }
  }

  private getKnownArtists() {
    const rows = this.db.prepare(`
      SELECT MusicArtist.Name AS name
      FROM MusicArtist
      INNER JOIN Music
        ON Music.Id = MusicArtist.MusicId
       AND Music.State = ?
      WHERE MusicArtist.State = ?
    `).all(ACTIVE_STATE.active, ACTIVE_STATE.active) as Array<{ name: string }>
    return new Set(rows.flatMap((row) => normalizeArtists([row.name]).map((artist) => this.getArtistKey(artist))))
  }

  private splitSmartArtistCandidate(artist: string) {
    return normalizeArtists(
      artist
        .split(SMART_ARTIST_SPLIT_PATTERN)
        .map((part) => part.trim()),
    )
  }

  private getRecurringCandidatePartKeys(candidates: Array<{ song: ScannedSong; artists: string[] }>) {
    const candidateKeysByPartKey = new Map<string, Set<string>>()
    for (const candidate of candidates) {
      const candidateKey = this.getArtistKey(candidate.song.artist)
      for (const artist of candidate.artists) {
        const partKey = this.getArtistKey(artist)
        const candidateKeys = candidateKeysByPartKey.get(partKey) ?? new Set<string>()
        candidateKeys.add(candidateKey)
        candidateKeysByPartKey.set(partKey, candidateKeys)
      }
    }

    return new Set(
      [...candidateKeysByPartKey.entries()]
        .filter(([, candidateKeys]) => candidateKeys.size > 1)
        .map(([partKey]) => partKey),
    )
  }

  private toArtistSplitResultItem(songId: number, song: ScannedSong, artists: string[]): ArtistSplitResultItem {
    return {
      songId,
      path: song.path,
      title: song.title,
      artist: song.artist,
      artists,
    }
  }

  private getArtistKey(artist: string) {
    return artist.trim().toLocaleLowerCase()
  }

  private async statFolderForScan(folderPath: string) {
    try {
      return await stat(folderPath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Folder not found: ${folderPath}`)
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(`Cannot access folder: ${folderPath}`)
      }
      throw error
    }
  }

  private async countScannableFolders(currentPath: string, hiddenFolderPaths: string[]): Promise<number> {
    let count = 0
    const entries = await this.readFolderEntries(currentPath)

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.endsWith('.logicx')) {
        continue
      }

      const fullPath = join(currentPath, entry.name)
      if (!this.isHiddenFolderPath(fullPath, hiddenFolderPaths)) {
        count += 1 + await this.countScannableFolders(fullPath, hiddenFolderPaths)
      }
    }

    return count
  }

  private async readFolderEntries(folderPath: string) {
    try {
      return await readdir(folderPath, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Folder not found: ${folderPath}`)
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(`Cannot access folder: ${folderPath}`)
      }
      throw error
    }
  }

  private isHiddenFolderPath(folderPath: string, hiddenFolderPaths: string[]) {
    return hiddenFolderPaths.some((hiddenFolderPath) =>
      folderPath === hiddenFolderPath ||
      folderPath.startsWith(`${hiddenFolderPath}\\`) ||
      folderPath.startsWith(`${hiddenFolderPath}/`),
    )
  }

  private throwIfCanceled(isCanceled?: () => boolean) {
    if (isCanceled?.()) {
      throw new Error(SCAN_CANCELED_ERROR_MESSAGE)
    }
  }

  private emitProgress(
    options: FolderScanOptions | undefined,
    progress: Omit<ScanLibraryProgress, 'operationId' | 'max'>,
  ) {
    if (!options?.operationId || !options.onProgress) {
      return
    }

    const max = Math.max(options.progressMax ?? progress.progress, progress.progress, 1)
    options.onProgress({
      ...progress,
      operationId: options.operationId,
      progress: Math.min(progress.progress, max),
      max,
    })
  }

  private getNormalizedPathForSql(filePath: string) {
    return filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  }

  private getPathComparisonKey(filePath: string) {
    return this.getNormalizedPathForSql(filePath).toLocaleLowerCase()
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

  private async walk(
    currentPath: string,
    folders: string[],
    audioFiles: string[],
    hiddenFolderPaths: string[],
    hiddenFilePaths: Set<string>,
    options?: {
      isCanceled?: () => boolean
      onFolder?: (folderPath: string) => void
    },
  ): Promise<void> {
    this.throwIfCanceled(options?.isCanceled)
    folders.push(currentPath)
    options?.onFolder?.(currentPath)

    const entries = await this.readFolderEntries(currentPath)

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const fullPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (entry.name.endsWith('.logicx')) {
          continue
        }

        if (!this.isHiddenFolderPath(fullPath, hiddenFolderPaths)) {
          await this.walk(fullPath, folders, audioFiles, hiddenFolderPaths, hiddenFilePaths, options)
        }
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !hiddenFilePaths.has(fullPath)) {
        audioFiles.push(fullPath)
      }
    }
  }

  private async readSongs(audioFiles: string[], useFilenameNotMusicName: boolean, isCanceled?: () => boolean) {
    return readAudioMetadataBatch(this.thumbnailCachePath, audioFiles, useFilenameNotMusicName, {
      concurrency: METADATA_SCAN_CONCURRENCY,
      isCanceled,
      canceledMessage: SCAN_CANCELED_ERROR_MESSAGE,
    })
  }
}
