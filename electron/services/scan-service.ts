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
const SMART_ARTIST_SPLIT_PATTERN = /\s*(?:\/|\uFF0F|;|\uFF1B|,|\uFF0C|\u3001|\|)\s*/u
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
  autoAddLyrics: (songs: ScannedSong[]) => Promise<void>
}

interface SongPathIdRow {
  id: number
  path: string
}

interface ExistingSongArtistSplitRow {
  songId: number
  path: string
  title: string
  artist: string
  album: string
  thumbnailPath: string
  duration: number
  dateAdded: string
}

interface ExistingSongArtistRow {
  songId: number
  name: string
}

interface ArtistUsage {
  name: string
  count: number
}

interface ArtistSplitPlan {
  autoSplits: Map<ScannedSong, string[]>
  suggestions: Map<ScannedSong, string[]>
}

export class ScanService {
  private readonly db: DatabaseSync
  private readonly thumbnailCachePath: string
  private readonly getSettings: () => SettingsRow
  private readonly setRootPath: (rootPath: string) => void
  private readonly getHiddenStorageItems: () => HiddenStorageItem[]
  private readonly cleanupSideEffects: (settings: SettingsRow) => void
  private readonly autoAddLyrics: (songs: ScannedSong[]) => Promise<void>

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
    this.autoAddLyrics = options.autoAddLyrics

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
    let artistSplitResult = {
      applied: [] as ArtistSplitResultItem[],
      suggestions: [] as ArtistSplitResultItem[],
      mergeSuggestions: [] as ArtistSplitResultItem[],
    }

    this.db.exec('BEGIN')
    try {
      this.markMusicInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)
      this.markFolderInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)
      this.markFileInactiveStatement.run(ACTIVE_STATE.inactive, ACTIVE_STATE.hidden, ACTIVE_STATE.parentHidden)

      const nonEmptyFolders = this.filterNonEmptyFolders(rootPath, folders, audioFiles)
      const folderIds = this.upsertScannedFolders(rootPath, nonEmptyFolders)
      artistSplitResult = this.upsertScannedSongs(scannedSongs, folderIds, Boolean(settings.SmartMultiArtistRecognition))
      syncAlbums(this.db)
      this.cleanupSideEffects(settings)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    await pruneThumbnailCache(this.thumbnailCachePath, this.getActiveThumbnailPaths())

    return {
      rootPath,
      songCount: audioFiles.length,
      folderCount: folders.length,
      elapsedMs: Date.now() - startedAt,
      filesAdded: [],
      filesRemoved: [],
      filesMoved: [],
      artistSplitsApplied: artistSplitResult.applied,
      artistSplitSuggestions: artistSplitResult.suggestions,
      artistMergeSuggestions: artistSplitResult.mergeSuggestions,
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

  analyzeExistingArtistSplits(): ScanLibraryResult {
    const settings = this.getSettings()
    if (!settings.SmartMultiArtistRecognition) {
      return this.createArtistSplitAnalysisResult([], [], [])
    }

    const { songs, songIds } = this.getExistingArtistSplitSongs()
    const artistSplitPlan = this.buildArtistSplitPlan(songs)
    const directSplits: ArtistSplitResultItem[] = []
    const possibleSplits: ArtistSplitResultItem[] = []
    const mergeSuggestions: ArtistSplitResultItem[] = []
    const artistMergePlan = this.buildArtistMergePlan(songs, artistSplitPlan, false)

    for (const song of songs) {
      const mergeArtists = artistMergePlan.get(song)
      if (mergeArtists) {
        mergeSuggestions.push(this.toArtistSplitResultItem(songIds.get(song)!, song, mergeArtists))
        continue
      }

      const directArtists = artistSplitPlan.autoSplits.get(song)
      if (directArtists) {
        directSplits.push(this.toArtistSplitResultItem(songIds.get(song)!, song, directArtists))
        continue
      }

      const possibleArtists = artistSplitPlan.suggestions.get(song)
      if (possibleArtists) {
        possibleSplits.push(this.toArtistSplitResultItem(songIds.get(song)!, song, possibleArtists))
      }
    }

    return this.createArtistSplitAnalysisResult(directSplits, possibleSplits, mergeSuggestions)
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

    const previousSongRows = (this.db.prepare(`
      SELECT Id AS id, Path AS path
      FROM Music
      WHERE State = ?
        AND REPLACE(Path, ?, ?) LIKE ?
    `).all(ACTIVE_STATE.active, '\\', '/', normalizedScanFolderPattern) as unknown as SongPathIdRow[])
    const previousSongPaths = previousSongRows.map((row) => row.path)
    const previousSongPathKeys = new Set(previousSongPaths.map((songPath) => this.getPathComparisonKey(songPath)))
    const scannedSongPathKeys = new Set(audioFiles.map((songPath) => this.getPathComparisonKey(songPath)))
    const newAudioFiles = audioFiles.filter((songPath) => !previousSongPathKeys.has(this.getPathComparisonKey(songPath)))
    const removedSongRows = previousSongRows.filter((row) => !scannedSongPathKeys.has(this.getPathComparisonKey(row.path)))
    const existingSongPathKeys = this.getExistingSongPathKeys(newAudioFiles)
    const scannedSongs = await this.readSongs(newAudioFiles, Boolean(settings.UseFilenameNotMusicName), options?.isCanceled)
    const updateResult = this.buildFolderUpdateResult(previousSongPaths, audioFiles)
    const nonEmptyFolders = this.filterNonEmptyFolders(rootPath, folders, audioFiles)
    let autoLyricsSongs: ScannedSong[] = []

    this.emitProgress(options, {
      stage: 'updating',
      progress: options?.progressMax ?? Math.max(checkedFolderCount, 1),
      canCancel: false,
    })
    this.throwIfCanceled(options?.isCanceled)

    this.db.exec('BEGIN')
    try {
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
      this.deactivateSongsInsideTransaction(removedSongRows)

      const folderIds = this.upsertScannedFolders(rootPath, nonEmptyFolders)
      const artistSplitResult = this.upsertScannedSongs(
        scannedSongs,
        folderIds,
        Boolean(settings.SmartMultiArtistRecognition),
        existingSongPathKeys,
      )
      syncAlbums(this.db)
      this.cleanupSideEffects(settings)
      updateResult.artistSplitsApplied = artistSplitResult.applied
      updateResult.artistSplitSuggestions = artistSplitResult.suggestions
      updateResult.artistMergeSuggestions = artistSplitResult.mergeSuggestions
      autoLyricsSongs = artistSplitResult.addedSongs
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    if (settings.AutoLyrics && autoLyricsSongs.length > 0) {
      await this.autoAddLyrics(autoLyricsSongs)
    }

    await pruneThumbnailCache(this.thumbnailCachePath, this.getActiveThumbnailPaths())

    return {
      rootPath,
      songCount: audioFiles.length,
      folderCount: folders.length,
      elapsedMs: Date.now() - startedAt,
      filesAdded: updateResult.filesAdded,
      filesRemoved: updateResult.filesRemoved,
      filesMoved: updateResult.filesMoved,
      artistSplitsApplied: updateResult.artistSplitsApplied,
      artistSplitSuggestions: updateResult.artistSplitSuggestions,
      artistMergeSuggestions: updateResult.artistMergeSuggestions,
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
    existingSongPathKeys = new Set<string>(),
  ) {
    const artistSplitPlan = smartMultiArtistRecognition
      ? this.buildArtistSplitPlan(scannedSongs)
      : { autoSplits: new Map<ScannedSong, string[]>(), suggestions: new Map<ScannedSong, string[]>() }
    const artistMergePlan = smartMultiArtistRecognition
      ? this.buildArtistMergePlan(scannedSongs, artistSplitPlan)
      : new Map<ScannedSong, string[]>()
    const applied: ArtistSplitResultItem[] = []
    const suggestions: ArtistSplitResultItem[] = []
    const mergeSuggestions: ArtistSplitResultItem[] = []
    const addedSongs: ScannedSong[] = []

    for (const song of scannedSongs) {
      const isNewSong = !existingSongPathKeys.has(this.getPathComparisonKey(song.path))
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
      if (isNewSong) {
        addedSongs.push(song)
      }
      const mergeArtists = artistMergePlan.get(song)
      const splitArtists = mergeArtists ? undefined : artistSplitPlan.autoSplits.get(song)
      const artists = splitArtists ?? (song.artist ? [song.artist] : [])

      this.songArtistSync.sync(musicRow.Id, artists)
      if (splitArtists && splitArtists.length > 1) {
        applied.push(this.toArtistSplitResultItem(musicRow.Id, song, splitArtists))
      }
      if (mergeArtists) {
        mergeSuggestions.push(this.toArtistSplitResultItem(musicRow.Id, song, mergeArtists))
      }
      const suggestedArtists = mergeArtists ? undefined : artistSplitPlan.suggestions.get(song)
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
      mergeSuggestions,
      addedSongs,
    }
  }

  private getExistingSongPathKeys(songPaths: string[]) {
    if (songPaths.length === 0) {
      return new Set<string>()
    }

    const placeholders = songPaths.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE Path IN (${placeholders})
    `).all(...songPaths) as unknown as Array<{ path: string }>

    return new Set(rows.map((row) => this.getPathComparisonKey(row.path)))
  }

  private getExistingArtistSplitSongs() {
    const rows = this.db.prepare(`
      SELECT
        Id AS songId,
        Path AS path,
        Name AS title,
        Artist AS artist,
        Album AS album,
        ThumbnailPath AS thumbnailPath,
        Duration AS duration,
        CAST(DateAdded AS TEXT) AS dateAdded
      FROM Music
      WHERE State = ?
      ORDER BY Id
    `).all(ACTIVE_STATE.active) as unknown as ExistingSongArtistSplitRow[]
    const artistRows = this.db.prepare(`
      SELECT MusicId AS songId, Name AS name
      FROM MusicArtist
      WHERE State = ?
      ORDER BY MusicId, Priority, Id
    `).all(ACTIVE_STATE.active) as unknown as ExistingSongArtistRow[]
    const artistsBySongId = new Map<number, string[]>()

    for (const row of artistRows) {
      const artists = artistsBySongId.get(row.songId) ?? []
      artists.push(row.name)
      artistsBySongId.set(row.songId, artists)
    }

    const songs: ScannedSong[] = []
    const songIds = new Map<ScannedSong, number>()

    for (const row of rows) {
      const currentArtists = (artistsBySongId.get(row.songId) ?? [])
        .map((artist) => artist.trim())
        .filter(Boolean)
      if (currentArtists.length > 1 || !row.artist) {
        continue
      }

      const song = {
        path: row.path,
        thumbnailPath: row.thumbnailPath,
        title: row.title,
        artist: row.artist,
        artists: currentArtists,
        album: row.album,
        duration: row.duration,
        dateAdded: row.dateAdded,
      }
      songs.push(song)
      songIds.set(song, row.songId)
    }

    return { songs, songIds }
  }

  private createArtistSplitAnalysisResult(
    directSplits: ArtistSplitResultItem[],
    possibleSplits: ArtistSplitResultItem[],
    mergeSuggestions: ArtistSplitResultItem[],
  ): ScanLibraryResult {
    return {
      rootPath: '',
      songCount: 0,
      folderCount: 0,
      elapsedMs: 0,
      filesAdded: [],
      filesRemoved: [],
      filesMoved: [],
      artistSplitsApplied: directSplits,
      artistSplitSuggestions: possibleSplits,
      artistMergeSuggestions: mergeSuggestions,
    }
  }

  private deactivateSongsInsideTransaction(songRows: SongPathIdRow[]) {
    if (songRows.length === 0) {
      return
    }

    const songIds = songRows.map((row) => row.id)
    const songPaths = songRows.map((row) => row.path)
    const songPlaceholders = songIds.map(() => '?').join(',')
    const pathPlaceholders = songPaths.map(() => '?').join(',')

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
    this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = 0
        AND ItemId IN (${songPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songIds.map(String))
    this.db.prepare(`
      UPDATE PreferenceItem
      SET State = ?
      WHERE Type = 0
        AND ItemId IN (${songPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songIds.map(String))
    this.db.prepare(`
      UPDATE File
      SET State = ?
      WHERE Path IN (${pathPlaceholders})
    `).run(ACTIVE_STATE.inactive, ...songPaths)
  }

  private filterNonEmptyFolders(rootPath: string, folders: string[], audioFiles: string[]) {
    const folderByKey = new Map(folders.map((folderPath) => [this.getPathComparisonKey(folderPath), folderPath]))
    const nonEmptyFolderKeys = new Set<string>()
    const rootKey = this.getPathComparisonKey(rootPath)

    if (folderByKey.has(rootKey)) {
      nonEmptyFolderKeys.add(rootKey)
    }

    for (const audioFile of audioFiles) {
      let currentFolder = dirname(audioFile)
      for (;;) {
        const currentKey = this.getPathComparisonKey(currentFolder)
        if (folderByKey.has(currentKey)) {
          nonEmptyFolderKeys.add(currentKey)
        }
        if (currentKey === rootKey) {
          break
        }

        const parentFolder = dirname(currentFolder)
        if (parentFolder === currentFolder) {
          break
        }
        currentFolder = parentFolder
      }
    }

    return folders.filter((folderPath) => nonEmptyFolderKeys.has(this.getPathComparisonKey(folderPath)))
  }

  private getActiveThumbnailPaths() {
    const rows = this.db.prepare(`
      SELECT ThumbnailPath AS thumbnailPath
      FROM Music
      WHERE State = ?
        AND NULLIF(ThumbnailPath, '') IS NOT NULL
    `).all(ACTIVE_STATE.active) as Array<{ thumbnailPath: string }>

    return rows.map((row) => row.thumbnailPath)
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
      artistMergeSuggestions: [] as ArtistSplitResultItem[],
    }
  }

  private buildArtistSplitPlan(scannedSongs: ScannedSong[]): ArtistSplitPlan {
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

  private buildArtistMergePlan(
    scannedSongs: ScannedSong[],
    artistSplitPlan: ArtistSplitPlan,
    includeScannedSongs = true,
  ) {
    const artistUsage = this.getArtistUsage(scannedSongs, includeScannedSongs)
    const mergeSuggestions = new Map<ScannedSong, string[]>()

    for (const song of scannedSongs) {
      const sourceArtists = this.getArtistMergeSourceArtists(song, artistSplitPlan)
      const mergedArtists = this.getMergedArtists(sourceArtists, artistUsage)

      if (this.haveArtistNamesChanged(sourceArtists, mergedArtists)) {
        mergeSuggestions.set(song, mergedArtists)
      }
    }

    return mergeSuggestions
  }

  private getArtistUsage(scannedSongs: ScannedSong[], includeScannedSongs: boolean) {
    const usage = new Map<string, ArtistUsage>()
    const rows = this.db.prepare(`
      SELECT MusicArtist.Name AS name, COUNT(DISTINCT MusicArtist.MusicId) AS count
      FROM MusicArtist
      INNER JOIN Music
        ON Music.Id = MusicArtist.MusicId
       AND Music.State = ?
      WHERE MusicArtist.State = ?
      GROUP BY MusicArtist.Name COLLATE NOCASE
    `).all(ACTIVE_STATE.active, ACTIVE_STATE.active) as unknown as Array<{ name: string; count: number }>

    for (const row of rows) {
      if (this.splitSmartArtistCandidate(row.name).length === 1) {
        this.addArtistUsage(usage, row.name, row.count)
      }
    }
    if (includeScannedSongs) {
      for (const song of scannedSongs) {
        for (const artist of this.getScannedSongArtistUnits(song)) {
          this.addArtistUsage(usage, artist, 1)
        }
      }
    }

    return usage
  }

  private getScannedSongArtistUnits(song: ScannedSong) {
    if (song.artists.length > 1) {
      return song.artists
    }

    const splitArtists = this.splitSmartArtistCandidate(song.artist)
    return splitArtists.length > 1 ? splitArtists : (song.artist ? [song.artist] : [])
  }

  private addArtistUsage(usage: Map<string, ArtistUsage>, artist: string, count: number) {
    const normalizedArtists = normalizeArtists([artist])
    for (const normalizedArtist of normalizedArtists) {
      const key = this.getArtistKey(normalizedArtist)
      const current = usage.get(key)
      usage.set(key, {
        name: current && current.name.length >= normalizedArtist.length ? current.name : normalizedArtist,
        count: (current?.count ?? 0) + count,
      })
    }
  }

  private getArtistMergeSourceArtists(song: ScannedSong, artistSplitPlan: ArtistSplitPlan) {
    const splitArtists = artistSplitPlan.autoSplits.get(song) ?? artistSplitPlan.suggestions.get(song)
    return splitArtists ?? this.getScannedSongArtistUnits(song)
  }

  private getMergedArtists(artists: string[], artistUsage: Map<string, ArtistUsage>) {
    const artistGroups: string[][] = []

    for (const artist of artists) {
      const matchingGroup = artistGroups.find((group) =>
        group.some((groupArtist) => this.isContainedArtistPair(groupArtist, artist)),
      )
      if (matchingGroup) {
        matchingGroup.push(artist)
      } else {
        artistGroups.push([artist])
      }
    }

    const mergedArtists = artistGroups.map((group) =>
      this.pickPreferredArtistName(this.expandArtistMergeCandidates(group, artistUsage), artistUsage),
    )

    return normalizeArtists(mergedArtists)
  }

  private expandArtistMergeCandidates(artists: string[], artistUsage: Map<string, ArtistUsage>) {
    const candidates = new Map<string, string>()

    for (const artist of artists) {
      candidates.set(this.getArtistKey(artist), artist)
      for (const usage of artistUsage.values()) {
        if (this.isContainedArtistPair(artist, usage.name)) {
          candidates.set(this.getArtistKey(usage.name), usage.name)
        }
      }
    }

    return [...candidates.values()]
  }

  private pickPreferredArtistName(artists: string[], artistUsage: Map<string, ArtistUsage>) {
    return artists
      .slice()
      .sort((left, right) => {
        const leftUsage = artistUsage.get(this.getArtistKey(left))
        const rightUsage = artistUsage.get(this.getArtistKey(right))
        const countDiff = (rightUsage?.count ?? 0) - (leftUsage?.count ?? 0)
        if (countDiff !== 0) {
          return countDiff
        }

        return right.length - left.length
      })[0]!
  }

  private isContainedArtistPair(left: string, right: string) {
    const leftName = this.getArtistContainmentText(left)
    const rightName = this.getArtistContainmentText(right)

    return left.trim() !== right.trim() &&
      leftName.length > 0 &&
      rightName.length > 0 && (
        leftName === rightName ||
        this.containsArtistName(leftName, rightName) ||
        this.containsArtistName(rightName, leftName)
      )
  }

  private getArtistContainmentText(artist: string) {
    const bracketPairs = new Map([
      ['(', ')'],
      ['\uFF08', '\uFF09'],
      ['[', ']'],
      ['\u3010', '\u3011'],
      ['{', '}'],
      ['\u300C', '\u300D'],
      ['\u300E', '\u300F'],
    ])
    const expectedClosers: string[] = []
    let text = ''

    for (const char of artist.trim()) {
      const closer = bracketPairs.get(char)
      if (closer) {
        expectedClosers.push(closer)
        continue
      }

      if (expectedClosers.length > 0) {
        if (char === expectedClosers.at(-1)) {
          expectedClosers.pop()
        }
        continue
      }

      text += char
    }

    return text.replace(/\s+/g, ' ').trim()
  }

  private containsArtistName(containerName: string, containedName: string) {
    let index = containerName.indexOf(containedName)

    while (index >= 0) {
      const before = index > 0 ? containerName[index - 1]! : ''
      const afterIndex = index + containedName.length
      const after = afterIndex < containerName.length ? containerName[afterIndex]! : ''

      if (
        this.isArtistNameBoundary(containedName[0]!, before) &&
        this.isArtistNameBoundary(containedName[containedName.length - 1]!, after)
      ) {
        return true
      }

      index = containerName.indexOf(containedName, index + 1)
    }

    return false
  }

  private isArtistNameBoundary(edge: string, adjacent: string) {
    return !adjacent || !this.isArtistNameWordChar(edge) || !this.isArtistNameWordChar(adjacent)
  }

  private isArtistNameWordChar(value: string) {
    return /[\p{L}\p{N}]/u.test(value)
  }

  private haveArtistNamesChanged(left: string[], right: string[]) {
    const leftKeys = normalizeArtists(left).map((artist) => this.getArtistKey(artist))
    const rightKeys = normalizeArtists(right).map((artist) => this.getArtistKey(artist))

    return leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])
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
