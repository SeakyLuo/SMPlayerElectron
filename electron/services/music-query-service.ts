import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type {
  LibraryCounts,
  LibraryShellSnapshot,
  LibraryFolder,
  LibraryPlaylist,
  LibrarySong,
  MyFavoritesSnapshot,
  NowPlayingSnapshot,
  RecentAlbumPlayback,
  RecentArtistPlayback,
  RecentLibrarySong,
  RecentPlaylistPlayback,
  SearchSnapshot,
  SettingsSnapshot,
} from '../../src/shared/contracts.ts'
import { normalizeArtists } from '../../src/shared/artists.ts'
import { ACTIVE_STATE, PLAYLIST_NAMES } from './constants.ts'
import type { HistoryService } from './history-service.ts'
import {
  toFolder,
  toPlaylist,
  toPlaylistItemRow,
  toSongArtistRow,
  type SongArtistRow,
} from './row-mappers.ts'
import type { NowPlayingService } from './now-playing-service.ts'
import type { PlaylistService } from './playlist-service.ts'
import {
  mapPlaylistSort,
  toSettingsSnapshot,
  type SettingsService,
} from './settings-service.ts'

const RECENT_PLAYED_LIMIT = 1000
const RECENT_RECORD_TYPE = {
  song: 0,
} as const

interface StoredLibrarySong extends Omit<LibrarySong, 'mediaUrl' | 'artworkUrl' | 'artists'> {
  thumbnailPath: string
}

interface StoredRecentLibrarySong extends Omit<RecentLibrarySong, 'mediaUrl' | 'artworkUrl' | 'artists'> {
  thumbnailPath: string
}

export class MusicQueryService {
  private readonly db: DatabaseSync
  private readonly settingsService: SettingsService
  private readonly historyService: HistoryService
  private readonly playlistService: PlaylistService
  private readonly nowPlayingService: NowPlayingService
  private readonly getSongsStatement
  private readonly getFoldersStatement
  private readonly getSongArtistsStatement
  private readonly getRecentSongsStatement
  private readonly getCountsStatement
  private readonly getActiveSongPathRowsStatement

  constructor(
    db: DatabaseSync,
    settingsService: SettingsService,
    historyService: HistoryService,
    playlistService: PlaylistService,
    nowPlayingService: NowPlayingService,
  ) {
    this.db = db
    this.settingsService = settingsService
    this.historyService = historyService
    this.playlistService = playlistService
    this.nowPlayingService = nowPlayingService
    this.getSongsStatement = this.db.prepare(`
      SELECT
        Music.Id AS id,
        Music.Path AS path,
        Music.ThumbnailPath AS thumbnailPath,
        Music.Name AS title,
        Music.Artist AS artist,
        Music.Album AS album,
        Music.Duration AS duration,
        Music.PlayCount AS playCount,
        CAST(Music.DateAdded AS TEXT) AS dateAdded,
        EXISTS(
          SELECT 1
          FROM PlaylistItem
          WHERE PlaylistId = ?
            AND ItemId = Music.Id
            AND State = ?
        ) AS favorite
      FROM Music
      WHERE Music.State = ?
      ORDER BY Music.Name COLLATE NOCASE, Music.Artist COLLATE NOCASE, Music.Id
    `)
    this.getFoldersStatement = this.db.prepare(`
      SELECT
        Id AS id,
        Path AS path,
        ParentId AS parentId,
        Criterion AS criterion
      FROM Folder
      WHERE State = ?
      ORDER BY Path COLLATE NOCASE
    `)
    this.getSongArtistsStatement = this.db.prepare(`
      SELECT
        MusicArtist.MusicId AS songId,
        MusicArtist.Name AS name
      FROM MusicArtist
      INNER JOIN Music
        ON Music.Id = MusicArtist.MusicId
       AND Music.State = ?
      WHERE MusicArtist.State = ?
      ORDER BY MusicArtist.Priority, MusicArtist.Id
    `)
    this.getRecentSongsStatement = this.db.prepare(`
      SELECT
        Music.Id AS id,
        Music.Path AS path,
        Music.ThumbnailPath AS thumbnailPath,
        Music.Name AS title,
        Music.Artist AS artist,
        Music.Album AS album,
        Music.Duration AS duration,
        Music.PlayCount AS playCount,
        CAST(Music.DateAdded AS TEXT) AS dateAdded,
        CAST(RecentRecord.Time AS TEXT) AS playedAt,
        EXISTS(
          SELECT 1
          FROM PlaylistItem
          WHERE PlaylistId = ?
            AND ItemId = Music.Id
            AND State = ?
        ) AS favorite
      FROM RecentRecord
      INNER JOIN Music
        ON Music.Id = CAST(RecentRecord.ItemId AS INTEGER)
      WHERE RecentRecord.Type = ${RECENT_RECORD_TYPE.song}
        AND RecentRecord.State = ?
        AND Music.State = ?
      ORDER BY RecentRecord.Id DESC
      LIMIT ?
    `)
    this.getCountsStatement = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM Music WHERE State = ?) AS songs,
        (
          SELECT COUNT(DISTINCT MusicArtist.Name COLLATE NOCASE)
          FROM MusicArtist
          INNER JOIN Music
            ON Music.Id = MusicArtist.MusicId
           AND Music.State = ?
          WHERE MusicArtist.State = ?
        ) AS artists,
        (SELECT COUNT(DISTINCT NULLIF(Album, '')) FROM Music WHERE State = ?) AS albums,
        (SELECT COUNT(*) FROM Folder WHERE State = ?) AS folders
    `)
    this.getActiveSongPathRowsStatement = this.db.prepare(`
      SELECT Id AS id, Path AS path
      FROM Music
      WHERE State = ?
    `)
  }

  getSettings(): SettingsSnapshot {
    return toSettingsSnapshot(this.settingsService.getSettings())
  }

  getShellSnapshot(): LibraryShellSnapshot {
    return {
      settings: this.getSettings(),
      counts: this.getCounts(),
      playlists: this.getPlaylists(),
      favorites: this.getFavorites(),
      nowPlaying: this.getNowPlaying(),
      search: this.getSearch(),
    }
  }

  getCounts(): LibraryCounts {
    const rawCounts = this.getCountsStatement.get(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as LibraryCounts | undefined

    return {
      songs: rawCounts?.songs ?? 0,
      artists: rawCounts?.artists ?? 0,
      albums: rawCounts?.albums ?? 0,
      folders: rawCounts?.folders ?? 0,
    }
  }

  getSongs(): LibrarySong[] {
    const settings = this.settingsService.getSettings()
    const artistsBySongId = this.getArtistsBySongId()
    const songs = this.getSongsStatement.all(
      settings.MyFavorites,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as StoredLibrarySong[]

    return songs.map((song) => this.toLibrarySong(song, artistsBySongId))
  }

  getFolders(): LibraryFolder[] {
    return (this.getFoldersStatement.all(ACTIVE_STATE.active) as unknown as LibraryFolder[])
      .map(toFolder)
  }

  getRecentSongs(): RecentLibrarySong[] {
    const settings = this.settingsService.getSettings()
    const artistsBySongId = this.getArtistsBySongId()
    const recentSongs = this.getRecentSongsStatement.all(
      settings.MyFavorites,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      RECENT_PLAYED_LIMIT,
    ) as unknown as StoredRecentLibrarySong[]

    return recentSongs.map((song) => ({
      ...this.toLibrarySong(song, artistsBySongId),
      playedAt: this.normalizeStoredDate(song.playedAt),
    }))
  }

  getRecentPlaylists(): RecentPlaylistPlayback[] {
    return this.historyService.getRecentPlaylists(RECENT_PLAYED_LIMIT)
  }

  getRecentAlbums(): RecentAlbumPlayback[] {
    return this.historyService.getRecentAlbums(RECENT_PLAYED_LIMIT)
  }

  getRecentArtists(): RecentArtistPlayback[] {
    return this.historyService.getRecentArtists(RECENT_PLAYED_LIMIT)
  }

  getPlaylists(): LibraryPlaylist[] {
    const settings = this.settingsService.getSettings()
    const playlists = this.playlistService.getPlaylists()
    const playlistSongIds = this.getPlaylistSongIdsByPlaylistId()

    return playlists
      .filter((playlist) => playlist.id !== settings.NowPlaying && playlist.name !== PLAYLIST_NAMES.nowPlaying)
      .map((playlist) => toPlaylist(
        playlist,
        playlistSongIds,
        settings.MyFavorites,
        mapPlaylistSort,
      ))
  }

  getFavorites(): MyFavoritesSnapshot {
    const settings = this.settingsService.getSettings()
    const playlists = this.playlistService.getPlaylists()
    const playlistsById = new Map(playlists.map((playlist) => [Number(playlist.id), playlist]))
    const playlistSongIds = this.getPlaylistSongIdsByPlaylistId()

    return {
      playlistId: settings.MyFavorites,
      songIds: playlistSongIds.get(settings.MyFavorites) ?? [],
      sortCriterion: mapPlaylistSort(playlistsById.get(settings.MyFavorites)!.criterion),
    }
  }

  getNowPlaying(): NowPlayingSnapshot {
    const settings = this.settingsService.getSettings()
    const songs = this.getActiveSongPathRowsStatement.all(ACTIVE_STATE.active) as unknown as Array<{
      id: number
      path: string
    }>

    return {
      playlistId: settings.NowPlaying,
      songIds: this.nowPlayingService.readSongIds(songs, settings.NowPlaying),
    }
  }

  getSearch(): SearchSnapshot {
    return this.historyService.getSearchSnapshot()
  }

  private getArtistsBySongId() {
    const songArtistRows = this.getSongArtistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as SongArtistRow[]
    const normalizedSongArtistRows = songArtistRows.map(toSongArtistRow)
    return this.groupSongArtists(normalizedSongArtistRows)
  }

  private getPlaylistSongIdsByPlaylistId() {
    const normalizedPlaylistItems = this.playlistService.getPlaylistItems().map(toPlaylistItemRow)
    const playlistSongIds = new Map<number, number[]>()

    for (const item of normalizedPlaylistItems) {
      const songIds = playlistSongIds.get(item.playlistId) ?? []
      songIds.push(Number(item.songId))
      playlistSongIds.set(item.playlistId, songIds)
    }

    return playlistSongIds
  }

  private groupSongArtists(rows: SongArtistRow[]) {
    const artistsBySongId = new Map<number, string[]>()

    for (const row of rows) {
      const artists = artistsBySongId.get(row.songId) ?? []
      artists.push(row.name)
      artistsBySongId.set(row.songId, artists)
    }

    return artistsBySongId
  }

  private toLibrarySong(
    song: StoredLibrarySong,
    artistsBySongId: Map<number, string[]>,
  ): LibrarySong {
    const artists = normalizeArtists(artistsBySongId.get(song.id) ?? [song.artist])

    return {
      id: song.id,
      path: song.path,
      mediaUrl: this.getSongMediaUrl(song.id),
      artworkUrl: this.getSongArtworkUrl(song.id, song.thumbnailPath),
      title: song.title,
      artist: song.artist,
      artists,
      album: song.album,
      duration: song.duration,
      playCount: song.playCount,
      dateAdded: this.normalizeStoredDate(song.dateAdded),
      favorite: Boolean(song.favorite),
    }
  }

  private getSongMediaUrl(songId: number) {
    return `smplayer-media://song/${songId}`
  }

  private getSongArtworkUrl(songId: number, cacheKey = '') {
    if (!cacheKey) {
      return `smplayer-artwork://song/${songId}`
    }

    const revision = createHash('sha1').update(cacheKey).digest('hex').slice(0, 12)
    return `smplayer-artwork://song/${songId}?v=${revision}`
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

    if (typeof value === 'bigint') {
      return this.dotNetTicksToIso(value.toString())
    }

    return ''
  }

  private dotNetTicksToIso(rawTicks: string) {
    try {
      const ticks = BigInt(rawTicks)
      const unixEpochTicks = 621_355_968_000_000_000n
      const milliseconds = (ticks - unixEpochTicks) / 10_000n

      if (
        milliseconds < BigInt(Number.MIN_SAFE_INTEGER) ||
        milliseconds > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return rawTicks
      }

      const date = new Date(Number(milliseconds))

      if (Number.isNaN(date.getTime())) {
        return rawTicks
      }

      return date.toISOString()
    } catch {
      return rawTicks
    }
  }
}
