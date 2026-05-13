import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { ACTIVE_STATE, PLAYLIST_NAMES, SMPLAYER_DB_NAME } from './constants.ts'
import { initializeSchema } from './schema.ts'
import { RemoteStore } from './remote-store.ts'
import { PreferenceService } from './preference-service.ts'
import { HistoryService } from './history-service.ts'
import { NowPlayingService } from './now-playing-service.ts'
import { PlaylistService } from './playlist-service.ts'
import { ArtworkService } from './artwork-service.ts'
import { Id3TagService } from './id3-tag-service.ts'
import { SongService } from './song-service.ts'
import { MusicQueryService } from './music-query-service.ts'
import { LyricsService } from './lyrics-service.ts'
import { SettingsService, type SettingsRow } from './settings-service.ts'
import { ScanService } from './scan-service.ts'
import { HiddenItemService } from './hidden-item-service.ts'
import { LocalItemService } from './local-item-service.ts'
import { ExternalAudioService } from './external-audio-service.ts'
import { PendingSongDeleteService } from './pending-song-delete-service.ts'

const NOW_PLAYING_JSON_FILENAME = 'NowPlaying.json'
export class DataService {
  private readonly db: DatabaseSync
  readonly remoteStore: RemoteStore
  readonly preferenceService: PreferenceService
  readonly historyService: HistoryService
  readonly settingsService: SettingsService
  readonly nowPlayingService: NowPlayingService
  readonly playlistService: PlaylistService
  readonly artworkService: ArtworkService
  readonly id3TagService: Id3TagService
  readonly songService: SongService
  readonly musicQueryService: MusicQueryService
  readonly lyricsService: LyricsService
  readonly scanService: ScanService
  readonly hiddenItemService: HiddenItemService
  readonly localItemService: LocalItemService
  readonly externalAudioService: ExternalAudioService
  readonly pendingSongDeleteService: PendingSongDeleteService
  private readonly thumbnailCachePath: string

  private readonly getActivePlaylistStatement
  private readonly updatePlaybackRestoreStateStatement
  private readonly updateLastPlaylistStatement

  constructor(userDataPath: string) {
    this.db = new DatabaseSync(join(userDataPath, SMPLAYER_DB_NAME))
    initializeSchema(this.db)

    this.remoteStore = new RemoteStore(this.db)
    this.preferenceService = new PreferenceService(this.db)
    this.historyService = new HistoryService(this.db)
    this.settingsService = new SettingsService(this.db)
    this.hiddenItemService = new HiddenItemService(this.db)
    this.nowPlayingService = new NowPlayingService(this.db, join(userDataPath, NOW_PLAYING_JSON_FILENAME))
    this.playlistService = new PlaylistService(this.db, this.settingsService)
    this.id3TagService = new Id3TagService()
    this.thumbnailCachePath = join(userDataPath, 'cover-cache')
    this.artworkService = new ArtworkService(this.db, this.thumbnailCachePath, (songPath, picture) =>
      this.id3TagService.writeSongArtwork(songPath, picture),
    )

    this.songService = new SongService(this.db, this.id3TagService)
    this.localItemService = new LocalItemService(
      this.db,
      this.songService,
      this.playlistService,
      this.historyService,
      this.hiddenItemService,
    )
    this.pendingSongDeleteService = new PendingSongDeleteService(userDataPath, this.songService, this.localItemService)
    this.externalAudioService = new ExternalAudioService(
      this.db,
      this.settingsService,
      this.nowPlayingService,
      this.thumbnailCachePath,
      (update) => this.settingsService.savePlaybackSettings(update),
    )
    this.getActivePlaylistStatement = this.db.prepare(`
      SELECT Id AS id
      FROM Playlist
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `)
    this.updatePlaybackRestoreStateStatement = this.db.prepare(`
      UPDATE Settings
      SET LastMusicIndex = ?,
          MusicProgress = ?
      WHERE Id = ?
    `)
    this.updateLastPlaylistStatement = this.db.prepare(`
      UPDATE Settings
      SET LastPlaylist = ?
      WHERE Id = ?
    `)
    this.musicQueryService = new MusicQueryService(
      this.db,
      this.settingsService,
      this.historyService,
      this.playlistService,
      this.nowPlayingService,
    )
    this.lyricsService = new LyricsService(
      this.db,
      this.id3TagService,
      this.settingsService,
      this.songService,
    )
    this.scanService = new ScanService(this.db, {
      thumbnailCachePath: this.thumbnailCachePath,
      getSettings: () => this.settingsService.getSettings(),
      setRootPath: (rootPath) => this.settingsService.setRootPath(rootPath),
      getHiddenStorageItems: () => this.hiddenItemService.getItems(),
      cleanupSideEffects: (settings) => this.cleanupScanSideEffects(settings),
    })

    this.initializeSettingsRows()
  }

  flush() {
    this.db.exec('PRAGMA wal_checkpoint(FULL)')
  }

  close() {
    this.flush()
    this.db.close()
  }

  private initializeSettingsRows() {
    this.settingsService.initializeSettingsRows(() => this.playlistService.createBuiltInPlaylist(PLAYLIST_NAMES.myFavorites, 0))
  }

  private cleanupScanSideEffects(settings: SettingsRow) {
    this.playlistService.cleanupInvalidPlaylistItems()
    this.historyService.cleanupInvalidRecentPlayed()

    if (settings.LastPlaylist > 0) {
      const activePlaylist = this.getActivePlaylistStatement.get(
        settings.LastPlaylist,
        ACTIVE_STATE.active,
      ) as { id: number } | undefined

      if (!activePlaylist) {
        this.updateLastPlaylistStatement.run(settings.MyFavorites, settings.Id)
      }
    }

    const queueCount = this.nowPlayingService.readSongIdsByPath().length
    const nextLastMusicIndex =
      queueCount === 0
        ? -1
        : Math.min(Math.max(settings.LastMusicIndex, -1), queueCount - 1)
    const nextMusicProgress =
      Number.isFinite(settings.MusicProgress) && settings.MusicProgress > 0
        ? settings.MusicProgress
        : 0

    if (
      nextLastMusicIndex !== settings.LastMusicIndex ||
      nextMusicProgress !== settings.MusicProgress
    ) {
      this.updatePlaybackRestoreStateStatement.run(
        nextLastMusicIndex,
        nextMusicProgress,
        settings.Id,
      )
    }
  }

}
