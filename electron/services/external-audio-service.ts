import { extname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import type { PlaybackSettingsUpdate } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE, AUDIO_EXTENSIONS } from './constants.ts'
import { readAudioMetadataBatch } from './audio-metadata-reader.ts'
import type { NowPlayingService } from './now-playing-service.ts'
import type { SettingsRow, SettingsService } from './settings-service.ts'

const METADATA_IMPORT_CONCURRENCY = 6

export class ExternalAudioService {
  private readonly db: DatabaseSync
  private readonly settingsService: SettingsService
  private readonly nowPlayingService: NowPlayingService
  private readonly thumbnailCachePath: string
  private readonly savePlaybackSettings: (update: PlaybackSettingsUpdate) => void

  private readonly upsertMusicStatement
  private readonly markSongArtistsInactiveStatement
  private readonly upsertSongArtistStatement

  constructor(
    db: DatabaseSync,
    settingsService: SettingsService,
    nowPlayingService: NowPlayingService,
    thumbnailCachePath: string,
    savePlaybackSettings: (update: PlaybackSettingsUpdate) => void,
  ) {
    this.db = db
    this.settingsService = settingsService
    this.nowPlayingService = nowPlayingService
    this.thumbnailCachePath = thumbnailCachePath
    this.savePlaybackSettings = savePlaybackSettings
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
    this.markSongArtistsInactiveStatement = this.db.prepare(`
      UPDATE MusicArtist
      SET State = ?
      WHERE MusicId = ?
    `)
    this.upsertSongArtistStatement = this.db.prepare(`
      INSERT INTO MusicArtist (MusicId, Name, Priority, State)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET
        Priority = excluded.Priority,
        State = excluded.State
    `)
  }

  async addNextAndPlay(filePaths: string[]) {
    const settings = this.settingsService.getSettings()
    const useFilenameNotMusicName = Boolean(settings.UseFilenameNotMusicName)
    const audioFiles = filePaths.filter((filePath) => AUDIO_EXTENSIONS.has(extname(filePath).toLocaleLowerCase()))
    const scannedSongs = await readAudioMetadataBatch(
      this.thumbnailCachePath,
      audioFiles,
      useFilenameNotMusicName,
      { concurrency: METADATA_IMPORT_CONCURRENCY },
    )
    const openedSongIds: number[] = []

    this.db.exec('BEGIN')
    try {
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

        this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.inactive, musicRow.Id)
        song.artists.forEach((artist, index) => {
          this.upsertSongArtistStatement.run(
            musicRow.Id,
            artist,
            index,
            ACTIVE_STATE.active,
          )
        })
        openedSongIds.push(musicRow.Id)
      }

      this.insertAfterCurrentSong(openedSongIds, settings)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    return openedSongIds
  }

  private insertAfterCurrentSong(openedSongIds: number[], settings: SettingsRow) {
    const currentQueue = this.nowPlayingService.readSongIdsByPath()
    const openedSongIdSet = new Set(openedSongIds)
    const queueWithoutOpenedSongs = currentQueue.filter((songId) => !openedSongIdSet.has(songId))
    const currentIndex = Math.min(
      Math.max(settings.LastMusicIndex, -1),
      queueWithoutOpenedSongs.length - 1,
    )
    const insertIndex = currentIndex + 1
    const nextQueue = [
      ...queueWithoutOpenedSongs.slice(0, insertIndex),
      ...openedSongIds,
      ...queueWithoutOpenedSongs.slice(insertIndex),
    ]

    this.nowPlayingService.writeSongIds(nextQueue)
    this.savePlaybackSettings({
      lastMusicIndex: insertIndex,
      musicProgress: 0,
    })
  }
}
