import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { nativeImage } from 'electron'
import { parseFile } from 'music-metadata'

import type {
  AppSettingsUpdate,
  LibraryCounts,
  LibraryPlaylist,
  LibrarySnapshot,
  LibrarySong,
  LyricsLine,
  LyricsRequestMode,
  LyricsSnapshot,
  LyricsSource,
  MusicLibrarySortCriterion,
  PlaylistSortCriterion,
  PlaybackMode,
  PlaybackSettingsUpdate,
  PreferenceEntityType,
  PreferenceItemSnapshot,
  PreferenceItemUpdate,
  PreferenceLevel,
  PreferenceSettingsSnapshot,
  PreferenceSettingsUpdate,
  PreferredLanguage,
  RecentLibrarySong,
  ScanLibraryResult,
  SearchHistoryEntry,
  SettingsSnapshot,
} from '../../src/shared/contracts.ts'
import { normalizeArtists } from '../../src/shared/artists.ts'
import { ACTIVE_STATE, AUDIO_EXTENSIONS, PLAYLIST_NAMES, SMPLAYER_DB_NAME } from './constants.ts'
import { initializeSchema } from './schema.ts'

const LYRICS_REQUEST_TIMEOUT_MS = 10_000
const RECENT_PLAYED_LIMIT = 1000

interface SettingsRow {
  Id: number
  RootPath: string
  MyFavorites: number
  NowPlaying: number
  ThemeColor: string
  NotificationSend: number
  NotificationDisplay: number
  AutoLyrics: number
  ShowLyricsInNotification: number
  VoiceAssistantPreferredLanguage: number
  NotificationLyricsSource: number
  SaveLyricsImmediately: number
  UseFilenameNotMusicName: number
  MusicLibraryCriterion: number
  LastMusicIndex: number
  Volume: number
  IsMuted: number
  Mode: number
  MusicProgress: number
  AutoPlay: number
  SaveMusicProgress: number
  ShowCount: number
  HideMultiSelectCommandBarAfterOperation: number
  QuitOnClose: number
  LastPage: string
  LastPlaylist: number
}

interface ScannedSong {
  path: string
  artworkPath: string
  title: string
  artist: string
  artists: string[]
  album: string
  duration: number
  dateAdded: string
}

interface PlaylistRow {
  id: number
  name: string
  songCount: number
  priority: number
  criterion: number
}

interface PlaylistItemRow {
  playlistId: number
  songId: number
}

interface StoredLibrarySong extends Omit<LibrarySong, 'mediaUrl' | 'artworkUrl' | 'artists'> {
  artworkPath: string
}

interface StoredRecentLibrarySong extends Omit<RecentLibrarySong, 'mediaUrl' | 'artworkUrl' | 'artists'> {
  artworkPath: string
}

interface SongArtistRow {
  songId: number
  name: string
}

interface SearchStateRow {
  LastQuery: string
}

interface SongPathRow {
  title: string
  artist: string
  album: string
  path: string
}

interface PreferenceSettingRow {
  Id: number
  Songs: number
  Artists: number
  Albums: number
  Playlists: number
  Folders: number
}

interface PreferenceItemRow {
  id: number
  type: number
  itemId: string
  itemName: string
  isEnabled: number
  level: number
  songName: string | null
  songTooltip: string | null
  artistValid: number
  albumValid: number
  playlistName: string | null
  folderName: string | null
  folderTooltip: string | null
}

export class SmplayerDataStore {
  private readonly db: DatabaseSync
  private readonly coverCachePath: string

  private readonly getSettingsStatement
  private readonly getPlaylistIdStatement
  private readonly getSearchStateStatement
  private readonly updateSearchStateStatement
  private readonly getSearchHistoryStatement
  private readonly deleteSearchHistoryEntryStatement
  private readonly deleteSearchHistoryByQueryStatement
  private readonly insertSearchHistoryStatement
  private readonly clearSearchHistoryStatement
  private readonly insertSettingsStatement
  private readonly updateSettingsPlaylistsStatement
  private readonly updateRootPathStatement
  private readonly updateAppSettingsStatement
  private readonly updateViewStateStatement
  private readonly updatePlaybackSettingsStatement
  private readonly updateSongDurationStatement
  private readonly insertPlaylistStatement
  private readonly updatePlaylistNameStatement
  private readonly updatePlaylistPriorityStatement
  private readonly updatePlaylistStateStatement
  private readonly updatePlaylistItemStateStatement
  private readonly insertPlaylistItemStatement
  private readonly markPlaylistItemsInactiveStatement
  private readonly markPlaylistItemsBySongInactiveStatement
  private readonly cleanupInvalidPlaylistItemsStatement
  private readonly markMusicInactiveStatement
  private readonly markSingleMusicInactiveStatement
  private readonly markSongArtistsInactiveStatement
  private readonly markFolderInactiveStatement
  private readonly markFileInactiveStatement
  private readonly markFileByPathInactiveStatement
  private readonly markSongPlayedStatement
  private readonly markRecentPlayedInactiveStatement
  private readonly clearRecentPlayedStatement
  private readonly cleanupInvalidRecentPlayedStatement
  private readonly insertRecentPlayedStatement
  private readonly upsertFolderStatement
  private readonly upsertMusicStatement
  private readonly upsertSongArtistStatement
  private readonly upsertFileStatement
  private readonly getPlaylistsStatement
  private readonly getCustomPlaylistIdsStatement
  private readonly getMaxCustomPlaylistPriorityStatement
  private readonly getPlaylistSongIdsStatement
  private readonly getPlaylistItemsStatement
  private readonly getSongsStatement
  private readonly getSongArtistsStatement
  private readonly getSongPathStatement
  private readonly getRecentSongsStatement
  private readonly getCountsStatement
  private readonly getActivePlaylistStatement
  private readonly getActivePlaylistSongCountStatement
  private readonly updatePlaybackRestoreStateStatement
  private readonly updateLastPlaylistStatement

  constructor(userDataPath: string) {
    this.db = new DatabaseSync(join(userDataPath, SMPLAYER_DB_NAME))
    this.coverCachePath = join(userDataPath, 'cover-cache')

    initializeSchema(this.db)

    this.getSettingsStatement = this.db.prepare(`
      SELECT
        Id,
        RootPath,
        MyFavorites,
        NowPlaying,
        ThemeColor,
        NotificationSend,
        NotificationDisplay,
        AutoLyrics,
        ShowLyricsInNotification,
        VoiceAssistantPreferredLanguage,
        NotificationLyricsSource,
        SaveLyricsImmediately,
        UseFilenameNotMusicName,
        MusicLibraryCriterion,
        LastMusicIndex,
        Volume,
        IsMuted,
        Mode,
        MusicProgress,
        AutoPlay,
        SaveMusicProgress,
        ShowCount,
        HideMultiSelectCommandBarAfterOperation,
        QuitOnClose,
        LastPage,
        LastPlaylist
      FROM Settings
      ORDER BY Id DESC
      LIMIT 1
    `)
    this.getPlaylistIdStatement = this.db.prepare(`
      SELECT Id
      FROM Playlist
      WHERE Name = ?
      LIMIT 1
    `)
    this.getSearchStateStatement = this.db.prepare(`
      SELECT LastQuery
      FROM SearchState
      WHERE Id = 1
    `)
    this.updateSearchStateStatement = this.db.prepare(`
      UPDATE SearchState
      SET LastQuery = ?
      WHERE Id = 1
    `)
    this.getSearchHistoryStatement = this.db.prepare(`
      SELECT
        Id AS id,
        Query AS query,
        SearchedAt AS searchedAt
      FROM SearchHistory
      ORDER BY datetime(SearchedAt) DESC, Id DESC
    `)
    this.deleteSearchHistoryEntryStatement = this.db.prepare(`
      DELETE FROM SearchHistory
      WHERE Id = ?
    `)
    this.deleteSearchHistoryByQueryStatement = this.db.prepare(`
      DELETE FROM SearchHistory
      WHERE Query = ? COLLATE NOCASE
    `)
    this.insertSearchHistoryStatement = this.db.prepare(`
      INSERT INTO SearchHistory (Query, SearchedAt)
      VALUES (?, ?)
    `)
    this.clearSearchHistoryStatement = this.db.prepare('DELETE FROM SearchHistory')
    this.insertSettingsStatement = this.db.prepare(`
      INSERT INTO Settings (RootPath, MyFavorites, NowPlaying)
      VALUES (?, ?, ?)
    `)
    this.updateSettingsPlaylistsStatement = this.db.prepare(`
      UPDATE Settings
      SET MyFavorites = ?, NowPlaying = ?
      WHERE Id = ?
    `)
    this.updateRootPathStatement = this.db.prepare(`
      UPDATE Settings
      SET RootPath = ?
      WHERE Id = ?
    `)
    this.updateAppSettingsStatement = this.db.prepare(`
      UPDATE Settings
      SET
        UseFilenameNotMusicName = ?,
        ShowCount = ?,
        ThemeColor = ?,
        NotificationDisplay = ?,
        NotificationSend = ?,
        AutoLyrics = ?,
        ShowLyricsInNotification = ?,
        VoiceAssistantPreferredLanguage = ?,
        NotificationLyricsSource = ?,
        SaveLyricsImmediately = ?,
        MusicLibraryCriterion = ?,
        AutoPlay = ?,
        SaveMusicProgress = ?,
        HideMultiSelectCommandBarAfterOperation = ?,
        QuitOnClose = ?,
        MusicProgress = ?
      WHERE Id = ?
    `)
    this.updateViewStateStatement = this.db.prepare(`
      UPDATE Settings
      SET
        LastPage = ?,
        LastPlaylist = ?
      WHERE Id = ?
    `)
    this.updatePlaybackSettingsStatement = this.db.prepare(`
      UPDATE Settings
      SET
        LastMusicIndex = ?,
        Volume = ?,
        IsMuted = ?,
        Mode = ?,
        MusicProgress = ?
      WHERE Id = ?
    `)
    this.updateSongDurationStatement = this.db.prepare(`
      UPDATE Music
      SET Duration = ?
      WHERE Id = ?
        AND State = ?
        AND (
          Duration <= 0
          OR ABS(Duration - ?) > 1
        )
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
    this.updatePlaylistPriorityStatement = this.db.prepare(`
      UPDATE Playlist
      SET Priority = ?
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
    this.markMusicInactiveStatement = this.db.prepare('UPDATE Music SET State = ?')
    this.markSingleMusicInactiveStatement = this.db.prepare('UPDATE Music SET State = ? WHERE Id = ?')
    this.markSongArtistsInactiveStatement = this.db.prepare(`
      UPDATE MusicArtist
      SET State = ?
      WHERE MusicId = ?
    `)
    this.markFolderInactiveStatement = this.db.prepare('UPDATE Folder SET State = ?')
    this.markFileInactiveStatement = this.db.prepare('UPDATE File SET State = ?')
    this.markFileByPathInactiveStatement = this.db.prepare('UPDATE File SET State = ? WHERE Path = ?')
    this.markSongPlayedStatement = this.db.prepare(`
      UPDATE Music
      SET PlayCount = PlayCount + 1
      WHERE Id = ?
    `)
    this.markRecentPlayedInactiveStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = 0 AND ItemId = ?
    `)
    this.clearRecentPlayedStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = 0
    `)
    this.cleanupInvalidRecentPlayedStatement = this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = 0
        AND State = ?
        AND NOT EXISTS (
          SELECT 1
          FROM Music
          WHERE Music.Id = CAST(RecentRecord.ItemId AS INTEGER)
            AND Music.State = ?
        )
    `)
    this.insertRecentPlayedStatement = this.db.prepare(`
      INSERT INTO RecentRecord (Type, ItemId, Time, State)
      VALUES (0, ?, ?, ?)
    `)
    this.upsertFolderStatement = this.db.prepare(`
      INSERT INTO Folder (Path, Criterion, ParentId, State)
      VALUES (?, 0, ?, ?)
      ON CONFLICT(Path) DO UPDATE SET
        ParentId = excluded.ParentId,
        State = excluded.State
      RETURNING Id
    `)
    this.upsertMusicStatement = this.db.prepare(`
      INSERT INTO Music (Path, Name, Artist, Album, ArtworkPath, Duration, PlayCount, DateAdded, State)
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
        ArtworkPath = excluded.ArtworkPath,
        Duration = excluded.Duration,
        State = excluded.State
      RETURNING Id
    `)
    this.upsertSongArtistStatement = this.db.prepare(`
      INSERT INTO MusicArtist (MusicId, Name, Priority, State)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET
        Priority = excluded.Priority,
        State = excluded.State
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
      GROUP BY Playlist.Id, Playlist.Name, Playlist.Criterion
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
      ORDER BY
        CASE WHEN Playlist.Priority < 0 THEN 2147483647 ELSE Playlist.Priority END,
        LOWER(Playlist.Name),
        Playlist.Id
    `)
    this.getMaxCustomPlaylistPriorityStatement = this.db.prepare(`
      SELECT MAX(Priority) AS priority
      FROM Playlist
      WHERE State = ?
        AND Id NOT IN (?, ?)
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
    this.getSongsStatement = this.db.prepare(`
      SELECT
        Music.Id AS id,
        Music.Path AS path,
        Music.ArtworkPath AS artworkPath,
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
    this.getSongPathStatement = this.db.prepare(`
      SELECT
        Music.Name AS title,
        Music.Artist AS artist,
        Music.Album AS album,
        Music.Path AS path
      FROM Music
      WHERE Music.Id = ?
        AND Music.State = ?
      LIMIT 1
    `)
    this.getRecentSongsStatement = this.db.prepare(`
      SELECT
        Music.Id AS id,
        Music.Path AS path,
        Music.ArtworkPath AS artworkPath,
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
      WHERE RecentRecord.Type = 0
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
    this.getActivePlaylistStatement = this.db.prepare(`
      SELECT Id AS id
      FROM Playlist
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `)
    this.getActivePlaylistSongCountStatement = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM PlaylistItem
      INNER JOIN Music
        ON Music.Id = PlaylistItem.ItemId
       AND Music.State = ?
      WHERE PlaylistItem.PlaylistId = ?
        AND PlaylistItem.State = ?
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

    this.initializeSettingsRows()
  }

  flush() {
    this.db.exec('PRAGMA wal_checkpoint(FULL)')
  }

  close() {
    this.flush()
    this.db.close()
  }

  getSettingsSnapshot(): SettingsSnapshot {
    const settings = this.getSettings()

    return {
      rootPath: settings.RootPath,
      useFilenameNotMusicName: Boolean(settings.UseFilenameNotMusicName),
      showCount: Boolean(settings.ShowCount),
      themeColor: settings.ThemeColor || '#5b87b6',
      notificationSend: this.mapNotificationSend(settings.NotificationSend),
      notificationDisplay: this.mapNotificationDisplay(settings.NotificationDisplay),
      showNotifications: this.mapNotificationSend(settings.NotificationSend) !== 'never',
      autoLyrics: Boolean(settings.AutoLyrics),
      showLyricsInNotification: Boolean(settings.ShowLyricsInNotification),
      notificationLyricsSource: this.mapLyricsRequestMode(settings.NotificationLyricsSource),
      saveLyricsImmediately: Boolean(settings.SaveLyricsImmediately),
      preferredLanguage: this.mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage),
      musicLibrarySort: this.mapMusicLibrarySort(settings.MusicLibraryCriterion),
      lastMusicIndex: settings.LastMusicIndex,
      volume: settings.Volume,
      isMuted: Boolean(settings.IsMuted),
      mode: this.mapMode(settings.Mode),
      musicProgress: settings.MusicProgress,
      autoPlay: Boolean(settings.AutoPlay),
      saveMusicProgress: Boolean(settings.SaveMusicProgress),
      hideMultiSelectCommandBarAfterOperation: Boolean(settings.HideMultiSelectCommandBarAfterOperation),
      quitOnClose: Boolean(settings.QuitOnClose),
      lastPage: settings.LastPage || '/songs',
      lastPlaylistId: settings.LastPlaylist,
    }
  }

  getLibrarySnapshot(): LibrarySnapshot {
    const settings = this.getSettings()
    const searchState = this.getSearchState()
    const recentSearches = this.getSearchHistoryStatement.all() as unknown as SearchHistoryEntry[]
    const playlists = this.getPlaylistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      settings.MyFavorites,
      settings.NowPlaying,
    ) as unknown as PlaylistRow[]
    const playlistItems = this.getPlaylistItemsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as PlaylistItemRow[]
    const songArtistRows = this.getSongArtistsStatement.all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as SongArtistRow[]
    const songs = this.getSongsStatement.all(
      settings.MyFavorites,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as StoredLibrarySong[]
    const recentSongs = this.getRecentSongsStatement.all(
      settings.MyFavorites,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      RECENT_PLAYED_LIMIT,
    ) as unknown as StoredRecentLibrarySong[]
    const rawCounts = this.getCountsStatement.get(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as LibraryCounts | undefined
    const artistsBySongId = this.groupSongArtists(songArtistRows)
    const librarySongs = songs.map((song) => this.toLibrarySong(song, artistsBySongId))
    const recentLibrarySongs = recentSongs.map((song) => ({
      ...this.toLibrarySong(song, artistsBySongId),
      playedAt: this.normalizeStoredDate(song.playedAt),
    }))
    const playlistSongIds = new Map<number, number[]>()

    for (const item of playlistItems) {
      const songIds = playlistSongIds.get(item.playlistId) ?? []
      songIds.push(Number(item.songId))
      playlistSongIds.set(item.playlistId, songIds)
    }

    return {
      settings: {
        rootPath: settings.RootPath,
        useFilenameNotMusicName: Boolean(settings.UseFilenameNotMusicName),
        showCount: Boolean(settings.ShowCount),
        themeColor: settings.ThemeColor || '#5b87b6',
        notificationSend: this.mapNotificationSend(settings.NotificationSend),
        notificationDisplay: this.mapNotificationDisplay(settings.NotificationDisplay),
        showNotifications: this.mapNotificationSend(settings.NotificationSend) !== 'never',
        autoLyrics: Boolean(settings.AutoLyrics),
        showLyricsInNotification: Boolean(settings.ShowLyricsInNotification),
        notificationLyricsSource: this.mapLyricsRequestMode(settings.NotificationLyricsSource),
        saveLyricsImmediately: Boolean(settings.SaveLyricsImmediately),
        preferredLanguage: this.mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage),
        musicLibrarySort: this.mapMusicLibrarySort(settings.MusicLibraryCriterion),
        lastMusicIndex: settings.LastMusicIndex,
        volume: settings.Volume,
        isMuted: Boolean(settings.IsMuted),
        mode: this.mapMode(settings.Mode),
        musicProgress: settings.MusicProgress,
        autoPlay: Boolean(settings.AutoPlay),
        saveMusicProgress: Boolean(settings.SaveMusicProgress),
        hideMultiSelectCommandBarAfterOperation: Boolean(settings.HideMultiSelectCommandBarAfterOperation),
        quitOnClose: Boolean(settings.QuitOnClose),
        lastPage: settings.LastPage || '/songs',
        lastPlaylistId: settings.LastPlaylist,
      },
      counts: {
        songs: rawCounts?.songs ?? 0,
        artists: rawCounts?.artists ?? 0,
        albums: rawCounts?.albums ?? 0,
        folders: rawCounts?.folders ?? 0,
      },
      songs: librarySongs,
      recentSongs: recentLibrarySongs,
      nowPlaying: {
        playlistId: settings.NowPlaying,
        songIds: playlistSongIds.get(settings.NowPlaying) ?? [],
      },
      search: {
        lastQuery: searchState.LastQuery,
        recentSearches,
      },
      playlists: playlists
        .filter((playlist) => playlist.id !== settings.NowPlaying)
        .map((playlist): LibraryPlaylist => ({
          id: playlist.id,
          name: playlist.name,
          songCount: playlist.songCount,
          songIds: playlistSongIds.get(playlist.id) ?? [],
          sortCriterion: this.mapPlaylistSort(playlist.criterion),
          isBuiltIn: playlist.id === settings.MyFavorites,
        })),
    }
  }

  async getSongArtwork(songId: number) {
    const artworkUrl = await this.getSongArtworkFileUrl(songId)
    return artworkUrl ? this.getSongArtworkUrl(songId) : ''
  }

  setAlbumArtwork(albumName: string, artworkPath: string) {
    this.db.prepare(`
      UPDATE Music
      SET ArtworkPath = ?
      WHERE Album = ?
        AND State = ?
    `).run(artworkPath, albumName, ACTIVE_STATE.active)
  }

  getSongFileUrl(songId: number) {
    const song = this.db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as { path: string } | undefined

    if (!song) {
      throw new Error('Song not found.')
    }

    return pathToFileURL(song.path).href
  }

  getSongPath(songId: number) {
    const song = this.getSongPathStatement.get(
      songId,
      ACTIVE_STATE.active,
    ) as { path: string } | undefined

    if (!song) {
      throw new Error('Song not found.')
    }

    return song.path
  }

  deleteSong(songId: number) {
    const songPath = this.getSongPath(songId)

    this.db.exec('BEGIN')
    try {
      this.markSingleMusicInactiveStatement.run(ACTIVE_STATE.inactive, songId)
      this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.inactive, songId)
      this.markPlaylistItemsBySongInactiveStatement.run(ACTIVE_STATE.inactive, songId)
      this.markRecentPlayedInactiveStatement.run(ACTIVE_STATE.inactive, songId.toString())
      this.markFileByPathInactiveStatement.run(ACTIVE_STATE.inactive, songPath)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async getSongArtworkFileUrl(songId: number) {
    const song = this.db.prepare(`
      SELECT
        Path AS path,
        ArtworkPath AS artworkPath
      FROM Music
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as { path: string; artworkPath: string } | undefined

    if (!song) {
      throw new Error('Song not found.')
    }

    if (song.artworkPath) {
      try {
        await stat(song.artworkPath)
        return pathToFileURL(song.artworkPath).href
      } catch {
        // Rebuild stale artwork cache entries below.
      }
    }

    try {
      const artworkPath =
        (await this.writeShellThumbnailCache(song.path)) ||
        (await this.writeEmbeddedArtworkCache(song.path))

      if (!artworkPath) {
        return ''
      }

      this.db.prepare(`
        UPDATE Music
        SET ArtworkPath = ?
        WHERE Id = ?
          AND State = ?
      `).run(artworkPath, songId, ACTIVE_STATE.active)

      return pathToFileURL(artworkPath).href
    } catch {
      return ''
    }
  }

  getPreferenceSettings(): PreferenceSettingsSnapshot {
    const setting = this.getPreferenceSetting()
    const items = this.db.prepare(`
      SELECT
        PreferenceItem.Id AS id,
        PreferenceItem.Type AS type,
        PreferenceItem.ItemId AS itemId,
        PreferenceItem.ItemName AS itemName,
        PreferenceItem.IsEnabled AS isEnabled,
        PreferenceItem.Level AS level,
        Music.Name AS songName,
        Music.Path AS songTooltip,
        EXISTS(
          SELECT 1
          FROM MusicArtist
          WHERE MusicArtist.Name = PreferenceItem.ItemId
            AND MusicArtist.State = ?
        ) AS artistValid,
        EXISTS(
          SELECT 1
          FROM Music
          WHERE Music.Album = PreferenceItem.ItemId
            AND Music.State = ?
        ) AS albumValid,
        Playlist.Name AS playlistName,
        Folder.Path AS folderName,
        Folder.Path AS folderTooltip
      FROM PreferenceItem
      LEFT JOIN Music
        ON PreferenceItem.Type = 0
       AND Music.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Music.State = ?
      LEFT JOIN Playlist
        ON PreferenceItem.Type = 3
       AND Playlist.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Playlist.State = ?
      LEFT JOIN Folder
        ON PreferenceItem.Type = 4
       AND Folder.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Folder.State = ?
      WHERE PreferenceItem.State = ?
      ORDER BY PreferenceItem.Id DESC
    `).all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as PreferenceItemRow[]
    const mappedItems = items.map((item) => this.toPreferenceItemSnapshot(item))

    return {
      enabled: {
        songs: Boolean(setting.Songs),
        artists: Boolean(setting.Artists),
        albums: Boolean(setting.Albums),
        playlists: Boolean(setting.Playlists),
        folders: Boolean(setting.Folders),
      },
      songs: mappedItems.filter((item) => item.type === 'song'),
      artists: mappedItems.filter((item) => item.type === 'artist'),
      albums: mappedItems.filter((item) => item.type === 'album'),
      playlists: mappedItems.filter((item) => item.type === 'playlist'),
      folders: mappedItems.filter((item) => item.type === 'folder'),
      others: mappedItems.filter((item) =>
        item.type === 'recent-added' ||
        item.type === 'my-favorites' ||
        item.type === 'most-played' ||
        item.type === 'least-played',
      ),
    }
  }

  updatePreferenceSettings(update: PreferenceSettingsUpdate) {
    const setting = this.getPreferenceSetting()
    this.db.prepare(`
      UPDATE PreferenceSetting
      SET Songs = ?, Artists = ?, Albums = ?, Playlists = ?, Folders = ?
      WHERE Id = ?
    `).run(
      Number(update.songs ?? Boolean(setting.Songs)),
      Number(update.artists ?? Boolean(setting.Artists)),
      Number(update.albums ?? Boolean(setting.Albums)),
      Number(update.playlists ?? Boolean(setting.Playlists)),
      Number(update.folders ?? Boolean(setting.Folders)),
      setting.Id,
    )
  }

  addPreferenceItem(type: PreferenceEntityType, itemId: string, name: string, level: PreferenceLevel = 'normal') {
    this.getPreferenceSetting()
    const entityValue = this.toPreferenceEntityValue(type)
    const levelValue = this.toPreferenceLevelValue(level)
    const result = this.db.prepare(`
      UPDATE PreferenceItem
      SET ItemName = ?, IsEnabled = 1, Level = ?
      WHERE Type = ?
        AND ItemId = ?
        AND State = ?
    `).run(
      name,
      levelValue,
      entityValue,
      itemId,
      ACTIVE_STATE.active,
    )

    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO PreferenceItem (Type, ItemId, ItemName, IsEnabled, Level, State)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(
        entityValue,
        itemId,
        name,
        levelValue,
        ACTIVE_STATE.active,
      )
    }
  }

  updatePreferenceItem(itemId: number, update: PreferenceItemUpdate) {
    const item = this.db.prepare(`
      SELECT IsEnabled AS isEnabled, Level AS level
      FROM PreferenceItem
      WHERE Id = ? AND State = ?
    `).get(itemId, ACTIVE_STATE.active) as unknown as Pick<PreferenceItemRow, 'isEnabled' | 'level'>
    this.db.prepare(`
      UPDATE PreferenceItem
      SET IsEnabled = ?, Level = ?
      WHERE Id = ?
    `).run(
      Number(update.isEnabled ?? Boolean(item.isEnabled)),
      this.toPreferenceLevelValue(update.level ?? this.mapPreferenceLevel(item.level)),
      itemId,
    )
  }

  removePreferenceItem(itemId: number) {
    this.db.prepare('UPDATE PreferenceItem SET State = ? WHERE Id = ?').run(ACTIVE_STATE.inactive, itemId)
  }

  clearInvalidPreferenceItems(type: PreferenceEntityType) {
    const entityType = this.toPreferenceEntityValue(type)
    switch (type) {
      case 'song':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Music
              WHERE Music.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Music.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'artist':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM MusicArtist
              WHERE MusicArtist.Name = PreferenceItem.ItemId
                AND MusicArtist.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'album':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Music
              WHERE Music.Album = PreferenceItem.ItemId
                AND Music.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'playlist':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Playlist
              WHERE Playlist.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Playlist.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'folder':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Folder
              WHERE Folder.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Folder.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'recent-added':
      case 'my-favorites':
      case 'most-played':
      case 'least-played':
        return
    }
  }

  setRootPath(rootPath: string) {
    const settings = this.getSettings()
    this.updateRootPathStatement.run(rootPath, settings.Id)
  }

  replaceRootPathReferences(originalPath: string, nextPath: string) {
    if (originalPath === nextPath || !originalPath) {
      return
    }

    this.db.exec('BEGIN')
    try {
      this.db.prepare(`
        UPDATE Settings
        SET RootPath = replace(RootPath, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE Music
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE Folder
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.prepare(`
        UPDATE File
        SET Path = replace(Path, ?, ?)
      `).run(originalPath, nextPath)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateSettings(update: AppSettingsUpdate) {
    const settings = this.getSettings()
    const nextSaveMusicProgress =
      update.saveMusicProgress ?? Boolean(settings.SaveMusicProgress)
    const nextNotificationSend =
      update.notificationSend ??
      (update.showNotifications === undefined
        ? this.mapNotificationSend(settings.NotificationSend)
        : update.showNotifications
          ? 'music-changed'
          : 'never')

    this.updateAppSettingsStatement.run(
      Number(update.useFilenameNotMusicName ?? Boolean(settings.UseFilenameNotMusicName)),
      Number(update.showCount ?? Boolean(settings.ShowCount)),
      update.themeColor ?? settings.ThemeColor ?? '#5b87b6',
      this.toNotificationDisplayValue(
        update.notificationDisplay ?? this.mapNotificationDisplay(settings.NotificationDisplay),
      ),
      this.toNotificationSendValue(nextNotificationSend),
      Number(update.autoLyrics ?? Boolean(settings.AutoLyrics)),
      Number(update.showLyricsInNotification ?? Boolean(settings.ShowLyricsInNotification)),
      this.toPreferredLanguageValue(
        update.preferredLanguage ?? this.mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage),
      ),
      this.toLyricsRequestModeValue(
        update.notificationLyricsSource ?? this.mapLyricsRequestMode(settings.NotificationLyricsSource),
      ),
      Number(update.saveLyricsImmediately ?? Boolean(settings.SaveLyricsImmediately)),
      this.toMusicLibrarySortValue(
        update.musicLibrarySort ?? this.mapMusicLibrarySort(settings.MusicLibraryCriterion),
      ),
      Number(update.autoPlay ?? Boolean(settings.AutoPlay)),
      Number(nextSaveMusicProgress),
      Number(
        update.hideMultiSelectCommandBarAfterOperation ??
          Boolean(settings.HideMultiSelectCommandBarAfterOperation),
      ),
      Number(update.quitOnClose ?? Boolean(settings.QuitOnClose)),
      nextSaveMusicProgress ? settings.MusicProgress : 0,
      settings.Id,
    )
  }

  saveViewState(update: { lastPage?: string; lastPlaylistId?: number }) {
    const settings = this.getSettings()

    this.updateViewStateStatement.run(
      update.lastPage ?? settings.LastPage,
      update.lastPlaylistId ?? settings.LastPlaylist,
      settings.Id,
    )
  }

  savePlaybackSettings(update: PlaybackSettingsUpdate) {
    const settings = this.getSettings()

    this.updatePlaybackSettingsStatement.run(
      update.lastMusicIndex ?? settings.LastMusicIndex,
      update.volume ?? settings.Volume,
      Number(update.isMuted ?? Boolean(settings.IsMuted)),
      this.toModeValue(update.mode ?? this.mapMode(settings.Mode)),
      update.musicProgress ?? settings.MusicProgress,
      settings.Id,
    )
  }

  createPlaylist(name: string, songIds: number[] = []) {
    const nextName = this.validatePlaylistName(name)
    const settings = this.getSettings()
    const maxPriorityRow = this.getMaxCustomPlaylistPriorityStatement.get(
      ACTIVE_STATE.active,
      settings.MyFavorites,
      settings.NowPlaying,
    ) as { priority: number | null } | undefined
    const nextPriority = (maxPriorityRow?.priority ?? -1) + 1

    this.db.exec('BEGIN')
    try {
      const result = this.insertPlaylistStatement.run(nextName, nextPriority, ACTIVE_STATE.active)
      const playlistId = Number(result.lastInsertRowid)
      for (const songId of new Set(songIds.map(Number))) {
        this.setPlaylistSongState(playlistId, songId, true)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  deletePlaylist(playlistId: number) {
    const settings = this.getSettings()

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

  setSongFavorite(songId: number, favorite: boolean) {
    const settings = this.getSettings()
    this.setPlaylistSongState(settings.MyFavorites, songId, favorite)
  }

  renamePlaylist(playlistId: number, name: string) {
    const settings = this.getSettings()

    if (playlistId === settings.MyFavorites || playlistId === settings.NowPlaying) {
      throw new Error('Built-in playlists cannot be renamed.')
    }

    const nextName = this.validatePlaylistName(name, playlistId)
    this.updatePlaylistNameStatement.run(nextName, playlistId)
  }

  reorderPlaylists(playlistIds: number[]) {
    const settings = this.getSettings()
    const currentPlaylistIds = (
      this.getCustomPlaylistIdsStatement.all(
        ACTIVE_STATE.active,
        settings.MyFavorites,
        settings.NowPlaying,
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

    this.db.exec('BEGIN')
    try {
      for (const [index, playlistId] of playlistIds.entries()) {
        this.updatePlaylistPriorityStatement.run(index, playlistId)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  addSongToPlaylist(playlistId: number, songId: number) {
    this.setPlaylistSongState(playlistId, songId, true)
  }

  addSongsToPlaylist(playlistId: number, songIds: number[]) {
    const uniqueSongIds = [...new Set(songIds.map(Number))]

    this.db.exec('BEGIN')
    try {
      for (const songId of uniqueSongIds) {
        this.setPlaylistSongState(playlistId, songId, true)
      }

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
    const uniqueSongIds = [...new Set(songIds.map(Number))]

    this.db.exec('BEGIN')
    try {
      for (const songId of uniqueSongIds) {
        this.setPlaylistSongState(playlistId, songId, false)
      }

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
        `).run(this.toPlaylistSortValue(sortCriterion), playlistId)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  replaceNowPlaying(songIds: number[]) {
    const settings = this.getSettings()

    this.db.exec('BEGIN')
    try {
      this.markPlaylistItemsInactiveStatement.run(ACTIVE_STATE.inactive, settings.NowPlaying)

      for (const songId of songIds) {
        this.insertPlaylistItemStatement.run(settings.NowPlaying, songId, ACTIVE_STATE.active)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeSongFromNowPlaying(songId: number) {
    const settings = this.getSettings()
    this.setPlaylistSongState(settings.NowPlaying, songId, false)
  }

  clearNowPlaying() {
    const settings = this.getSettings()
    this.markPlaylistItemsInactiveStatement.run(ACTIVE_STATE.inactive, settings.NowPlaying)
  }

  saveSearchQuery(query: string) {
    this.updateSearchStateStatement.run(query.trim())
  }

  addRecentSearch(query: string) {
    const nextQuery = query.trim()
    this.saveSearchQuery(nextQuery)

    if (!nextQuery) {
      return
    }

    this.db.exec('BEGIN')
    try {
      this.deleteSearchHistoryByQueryStatement.run(nextQuery)
      this.insertSearchHistoryStatement.run(nextQuery, new Date().toISOString())
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeRecentSearch(entryId: number) {
    this.deleteSearchHistoryEntryStatement.run(entryId)
  }

  removeRecentSearches(entryIds: number[]) {
    const placeholders = entryIds.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM SearchHistory WHERE Id IN (${placeholders})`).run(...entryIds)
  }

  clearRecentSearches() {
    this.clearSearchHistoryStatement.run()
  }

  removeRecentPlayed(songIds: number[]) {
    const placeholders = songIds.map(() => '?').join(',')
    this.db.prepare(`
      UPDATE RecentRecord
      SET State = ?
      WHERE Type = 0
        AND ItemId IN (${placeholders})
    `).run(ACTIVE_STATE.inactive, ...songIds.map((songId) => songId.toString()))
  }

  clearRecentPlayed() {
    this.clearRecentPlayedStatement.run(ACTIVE_STATE.inactive)
  }

  async getLyrics(songId: number, mode: LyricsRequestMode = 'auto'): Promise<LyricsSnapshot> {
    const song = this.getSongPathStatement.get(
      songId,
      ACTIVE_STATE.active,
    ) as SongPathRow | undefined

    if (!song) {
      return this.createLyricsSnapshot('', 'none')
    }

    const settings = this.getSettings()
    const sidecarLyrics = await this.getSidecarLyrics(song.path)

    if (mode === 'embedded') {
      const embeddedLyrics = await this.getEmbeddedLyrics(song.path)
      return this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')
    }

    if (mode !== 'internet' && sidecarLyrics) {
      return sidecarLyrics
    }

    if (mode === 'internet') {
      const internetLyrics = await this.searchInternetLyrics(song)
      const snapshot = this.createLyricsSnapshot(internetLyrics, internetLyrics ? 'internet' : 'none')
      await this.maybePersistFetchedLyrics(song.path, snapshot, settings)
      return snapshot
    }

    if (mode === 'auto' && settings.AutoLyrics) {
      const internetLyrics = await this.searchInternetLyrics(song)
      if (internetLyrics) {
        const snapshot = this.createLyricsSnapshot(internetLyrics, 'internet')
        await this.maybePersistFetchedLyrics(song.path, snapshot, settings)
        return snapshot
      }
    }

    const embeddedLyrics = await this.getEmbeddedLyrics(song.path)
    return this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')
  }

  async saveInternetLyricsToFile(songId: number) {
    const song = this.getSongPathStatement.get(
      songId,
      ACTIVE_STATE.active,
    ) as SongPathRow | undefined

    if (!song) {
      return { status: 'failed' as const }
    }

    const existingLyrics = await this.getExistingLyrics(song.path)
    if (existingLyrics.rawText.trim()) {
      return { status: 'skipped' as const }
    }

    const internetLyrics = await this.searchInternetLyrics(song)
    if (!internetLyrics.trim()) {
      return { status: 'missing' as const }
    }

    await this.writeEmbeddedLyrics(song.path, internetLyrics)

    return { status: 'saved' as const }
  }

  private async getExistingLyrics(songPath: string) {
    const sidecarLyrics = await this.getSidecarLyrics(songPath)
    if (sidecarLyrics) {
      return sidecarLyrics
    }

    const embeddedLyrics = await this.getEmbeddedLyrics(songPath)
    return this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')
  }

  async getTrackNotificationBody(songId: number): Promise<string> {
    const settings = this.getSettings()

    if (!settings.ShowLyricsInNotification) {
      return ''
    }

    try {
      const lyrics = await this.getLyrics(
        songId,
        this.mapLyricsRequestMode(settings.NotificationLyricsSource),
      )
      return this.getLyricsPreviewLine(lyrics)
    } catch {
      return ''
    }
  }

  markSongPlayed(songId: number) {
    this.db.exec('BEGIN')
    try {
      this.markSongPlayedStatement.run(songId)
      this.markRecentPlayedInactiveStatement.run(ACTIVE_STATE.inactive, songId.toString())
      this.insertRecentPlayedStatement.run(
        songId.toString(),
        new Date().toISOString(),
        ACTIVE_STATE.active,
      )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateSongDuration(songId: number, duration: number) {
    const nextDuration = Math.round(duration)

    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      return
    }

    this.updateSongDurationStatement.run(
      nextDuration,
      songId,
      ACTIVE_STATE.active,
      nextDuration,
    )
  }

  async scanLibrary(requestedRootPath?: string): Promise<ScanLibraryResult> {
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

    await mkdir(this.coverCachePath, { recursive: true })
    await this.walkLibrary(rootPath, folders, audioFiles)

    const scannedSongs: ScannedSong[] = []
    const useFilenameNotMusicName = Boolean(settings.UseFilenameNotMusicName)

    for (const filePath of audioFiles) {
      scannedSongs.push(await this.readSong(filePath, useFilenameNotMusicName))
    }

    this.db.exec('BEGIN')
    try {
      this.markMusicInactiveStatement.run(ACTIVE_STATE.inactive)
      this.markFolderInactiveStatement.run(ACTIVE_STATE.inactive)
      this.markFileInactiveStatement.run(ACTIVE_STATE.inactive)

      const folderIds = new Map<string, number>()
      const sortedFolders = folders
        .slice()
        .sort((left, right) => left.split(/[/\\]+/).length - right.split(/[/\\]+/).length)

      for (const folderPath of sortedFolders) {
        const parentId =
          folderPath === rootPath ? 0 : (folderIds.get(dirname(folderPath)) ?? 0)
        const row = this.upsertFolderStatement.get(
          folderPath,
          parentId,
          ACTIVE_STATE.active,
        ) as { Id: number }
        folderIds.set(folderPath, row.Id)
      }

      for (const song of scannedSongs) {
        const musicRow = this.upsertMusicStatement.get(
          song.path,
          song.title,
          song.artist,
          song.album,
          song.artworkPath,
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

        this.upsertFileStatement.get(
          song.path,
          folderIds.get(dirname(song.path)) ?? 0,
          musicRow.Id,
          ACTIVE_STATE.active,
        )
      }

      this.cleanupScanSideEffects(settings)

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    await this.pruneCoverCache(scannedSongs.map((song) => song.artworkPath))

    return {
      rootPath,
      songCount: scannedSongs.length,
      folderCount: folders.length,
      elapsedMs: Date.now() - startedAt,
    }
  }

  private initializeSettingsRows() {
    const settings = this.getSettingsStatement.get() as SettingsRow | undefined

    if (!settings) {
      const myFavoritesId = this.createBuiltInPlaylist(PLAYLIST_NAMES.myFavorites, 0)
      const nowPlayingId = this.createBuiltInPlaylist(PLAYLIST_NAMES.nowPlaying, 1)
      this.insertSettingsStatement.run('', myFavoritesId, nowPlayingId)
      return
    }

    if (settings.NowPlaying <= 0) {
      const nowPlayingId = this.createBuiltInPlaylist(PLAYLIST_NAMES.nowPlaying, 1)
      this.updateSettingsPlaylistsStatement.run(settings.MyFavorites, nowPlayingId, settings.Id)
    }
  }

  private createBuiltInPlaylist(name: string, priority: number): number {
    const result = this.insertPlaylistStatement.run(name, priority, ACTIVE_STATE.active)
    return Number(result.lastInsertRowid)
  }

  private getSettings(): SettingsRow {
    const settings = this.getSettingsStatement.get() as SettingsRow | undefined

    if (!settings) {
      throw new Error('Settings row has not been initialized.')
    }

    return settings
  }

  private getSearchState(): SearchStateRow {
    const searchState = this.getSearchStateStatement.get() as SearchStateRow | undefined

    if (!searchState) {
      throw new Error('Search state row has not been initialized.')
    }

    return searchState
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
      artworkUrl: this.getSongArtworkUrl(song.id),
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

  private getSongArtworkUrl(songId: number) {
    return `smplayer-artwork://song/${songId}`
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

  private mapMode(modeValue: number): PlaybackMode {
    switch (modeValue) {
      case 1:
        return 'repeat'
      case 2:
        return 'repeat-one'
      case 3:
        return 'shuffle'
      default:
        return 'once'
    }
  }

  private mapLyricsRequestMode(modeValue: number): LyricsRequestMode {
    switch (modeValue) {
      case 1:
        return 'local'
      case 2:
        return 'embedded'
      default:
        return 'internet'
    }
  }

  private toLyricsRequestModeValue(mode: LyricsRequestMode) {
    switch (mode) {
      case 'local':
        return 1
      case 'embedded':
        return 2
      default:
        return 0
    }
  }

  private mapPreferredLanguage(languageValue: number): PreferredLanguage {
    switch (languageValue) {
      case 1:
        return 'en-US'
      case 2:
        return 'zh-CN'
      default:
        return 'system'
    }
  }

  private toPreferredLanguageValue(language: PreferredLanguage) {
    switch (language) {
      case 'zh-CN':
        return 2
      case 'en-US':
        return 1
      default:
        return 0
    }
  }

  private mapMusicLibrarySort(criterionValue: number): MusicLibrarySortCriterion {
    switch (criterionValue) {
      case 1:
        return 'artist'
      case 2:
        return 'album'
      case 3:
        return 'duration'
      case 4:
        return 'play-count'
      case 5:
        return 'date-added'
      default:
        return 'title'
    }
  }

  private mapPlaylistSort(criterionValue: number): PlaylistSortCriterion {
    return this.mapMusicLibrarySort(criterionValue)
  }

  private toMusicLibrarySortValue(criterion: MusicLibrarySortCriterion) {
    switch (criterion) {
      case 'artist':
        return 1
      case 'album':
        return 2
      case 'duration':
        return 3
      case 'play-count':
        return 4
      case 'date-added':
        return 5
      default:
        return 0
    }
  }

  private toPlaylistSortValue(criterion: PlaylistSortCriterion) {
    return this.toMusicLibrarySortValue(criterion)
  }

  private toModeValue(mode: PlaybackMode) {
    switch (mode) {
      case 'repeat':
        return 1
      case 'repeat-one':
        return 2
      case 'shuffle':
        return 3
      default:
        return 0
    }
  }

  private mapNotificationSend(modeValue: number) {
    return modeValue === 1 ? 'never' : 'music-changed'
  }

  private toNotificationSendValue(mode: 'music-changed' | 'never') {
    return mode === 'never' ? 1 : 0
  }

  private mapNotificationDisplay(modeValue: number) {
    switch (modeValue) {
      case 0:
        return 'reminder'
      case 2:
        return 'quick'
      default:
        return 'normal'
    }
  }

  private toNotificationDisplayValue(mode: 'reminder' | 'normal' | 'quick') {
    switch (mode) {
      case 'reminder':
        return 0
      case 'quick':
        return 2
      default:
        return 1
    }
  }

  private async walkLibrary(
    currentPath: string,
    folders: string[],
    audioFiles: string[],
  ): Promise<void> {
    folders.push(currentPath)

    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const fullPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        await this.walkLibrary(fullPath, folders, audioFiles)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        audioFiles.push(fullPath)
      }
    }
  }

  private async readSong(
    filePath: string,
    useFilenameNotMusicName: boolean,
  ): Promise<ScannedSong> {
    const fileStats = await stat(filePath)
    const filename = basename(filePath, extname(filePath))
    const dateAdded = fileStats.birthtime.toISOString()

    try {
      const metadata = await parseFile(filePath, {
        duration: true,
        skipCovers: false,
      })
      const artists = normalizeArtists([
        ...(metadata.common.artists ?? []),
        metadata.common.artist,
      ])

      return {
        path: filePath,
        artworkPath:
          (await this.writeShellThumbnailCache(filePath)) ||
          (await this.writeArtworkCache(filePath, metadata.common.picture?.[0])),
        title: useFilenameNotMusicName ? filename : metadata.common.title?.trim() || filename,
        artist: artists.join(', '),
        artists,
        album: metadata.common.album?.trim() || '',
        duration: this.resolveDurationSeconds(metadata.format, fileStats.size),
        dateAdded,
      }
    } catch {
      return {
        path: filePath,
        artworkPath: '',
        title: filename,
        artist: '',
        artists: [],
        album: '',
        duration: 0,
        dateAdded,
      }
    }
  }

  private resolveDurationSeconds(
    format: { duration?: number; bitrate?: number },
    fileSize: number,
  ) {
    if (Number.isFinite(format.duration) && (format.duration ?? 0) > 0) {
      return Math.round(format.duration ?? 0)
    }

    if (Number.isFinite(format.bitrate) && (format.bitrate ?? 0) > 0 && fileSize > 0) {
      return Math.round((fileSize * 8) / (format.bitrate ?? 1))
    }

    return 0
  }

  private async writeArtworkCache(
    filePath: string,
    picture?: { data: Uint8Array; format?: string },
  ) {
    if (!picture?.data || picture.data.length === 0) {
      return ''
    }

    const extension = this.getArtworkExtension(picture.format)
    const artworkHash = createHash('sha1').update(filePath).digest('hex')
    const artworkPath = join(this.coverCachePath, `${artworkHash}.${extension}`)

    await mkdir(this.coverCachePath, { recursive: true })
    await writeFile(artworkPath, picture.data)

    return artworkPath
  }

  private async writeEmbeddedArtworkCache(filePath: string) {
    const metadata = await parseFile(filePath, {
      duration: false,
      skipCovers: false,
    })

    return this.writeArtworkCache(filePath, metadata.common.picture?.[0])
  }

  private async writeShellThumbnailCache(filePath: string) {
    try {
      const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
        width: 100,
        height: 100,
      })

      if (thumbnail.isEmpty()) {
        return ''
      }

      const artworkHash = createHash('sha1').update(`${filePath}:shell-thumbnail`).digest('hex')
      const artworkPath = join(this.coverCachePath, `${artworkHash}.png`)

      await mkdir(this.coverCachePath, { recursive: true })
      await writeFile(artworkPath, thumbnail.toPNG())

      return artworkPath
    } catch {
      return ''
    }
  }

  private async maybePersistFetchedLyrics(
    songPath: string,
    lyrics: LyricsSnapshot,
    settings: SettingsRow,
  ) {
    if (!settings.SaveLyricsImmediately || lyrics.source !== 'internet' || !lyrics.rawText.trim()) {
      return
    }

    try {
      await this.writeEmbeddedLyrics(songPath, lyrics.rawText)
    } catch {
      // Ignore tag write failures so playback and lyric loading stay non-blocking.
    }
  }

  private async writeEmbeddedLyrics(songPath: string, rawLyrics: string) {
    if (extname(songPath).toLocaleLowerCase() !== '.mp3') {
      throw new Error('Embedded lyrics writing is currently supported for MP3 files.')
    }

    const fileBuffer = await readFile(songPath)
    const existingTag = this.readId3Tag(fileBuffer)
    const audioBuffer = fileBuffer.subarray(existingTag.endOffset)
    const tagVersion = existingTag.version === 4 ? 4 : 3
    const preservedFrames = existingTag.frames.filter(
      (frame) => frame.id !== 'USLT' && frame.id !== 'SYLT',
    )
    const lyricsFrame = this.createId3Frame(tagVersion, 'USLT', Buffer.concat([
      Buffer.from([3]),
      Buffer.from('eng', 'ascii'),
      Buffer.from([0]),
      Buffer.from(rawLyrics, 'utf8'),
    ]))
    const tagBody = Buffer.concat([...preservedFrames.map((frame) => frame.raw), lyricsFrame])
    const padding = Buffer.alloc(2048)
    const header = Buffer.alloc(10)

    header.write('ID3', 0, 'ascii')
    header[3] = tagVersion
    header[4] = 0
    header[5] = 0
    this.writeSynchsafeSize(header, 6, tagBody.length + padding.length)

    await writeFile(songPath, Buffer.concat([header, tagBody, padding, audioBuffer]))
  }

  private readId3Tag(fileBuffer: Buffer) {
    if (fileBuffer.subarray(0, 3).toString('ascii') !== 'ID3') {
      return {
        version: 3,
        endOffset: 0,
        frames: [] as Array<{ id: string; raw: Buffer }>,
      }
    }

    const tagSize = this.readSynchsafeSize(fileBuffer, 6)
    const endOffset = 10 + tagSize
    const version = fileBuffer[3]
    const frames: Array<{ id: string; raw: Buffer }> = []
    let offset = 10

    while (offset + 10 <= endOffset) {
      const frameHeader = fileBuffer.subarray(offset, offset + 10)
      const id = frameHeader.subarray(0, 4).toString('ascii')

      if (!/^[A-Z0-9]{4}$/.test(id)) {
        break
      }

      const frameSize =
        version === 4
          ? this.readSynchsafeSize(frameHeader, 4)
          : frameHeader.readUInt32BE(4)

      if (frameSize <= 0 || offset + 10 + frameSize > endOffset) {
        break
      }

      frames.push({
        id,
        raw: fileBuffer.subarray(offset, offset + 10 + frameSize),
      })
      offset += 10 + frameSize
    }

    return {
      version,
      endOffset,
      frames,
    }
  }

  private createId3Frame(version: number, id: string, payload: Buffer) {
    const frame = Buffer.alloc(10 + payload.length)
    frame.write(id, 0, 'ascii')
    if (version === 4) {
      this.writeSynchsafeSize(frame, 4, payload.length)
    } else {
      frame.writeUInt32BE(payload.length, 4)
    }
    payload.copy(frame, 10)

    return frame
  }

  private readSynchsafeSize(buffer: Buffer, offset: number) {
    return (
      (buffer[offset] << 21) |
      (buffer[offset + 1] << 14) |
      (buffer[offset + 2] << 7) |
      buffer[offset + 3]
    )
  }

  private writeSynchsafeSize(buffer: Buffer, offset: number, size: number) {
    buffer[offset] = (size >> 21) & 0x7f
    buffer[offset + 1] = (size >> 14) & 0x7f
    buffer[offset + 2] = (size >> 7) & 0x7f
    buffer[offset + 3] = size & 0x7f
  }

  private getLyricsPreviewLine(lyrics: LyricsSnapshot) {
    return lyrics.lines.find((line) => line.text.trim())?.text.trim() ?? ''
  }

  private cleanupScanSideEffects(settings: SettingsRow) {
    this.cleanupInvalidPlaylistItemsStatement.run(
      ACTIVE_STATE.inactive,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    )
    this.cleanupInvalidRecentPlayedStatement.run(
      ACTIVE_STATE.inactive,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    )

    if (settings.LastPlaylist > 0) {
      const activePlaylist = this.getActivePlaylistStatement.get(
        settings.LastPlaylist,
        ACTIVE_STATE.active,
      ) as { id: number } | undefined

      if (!activePlaylist) {
        this.updateLastPlaylistStatement.run(settings.MyFavorites, settings.Id)
      }
    }

    const queueRow = this.getActivePlaylistSongCountStatement.get(
      ACTIVE_STATE.active,
      settings.NowPlaying,
      ACTIVE_STATE.active,
    ) as { count: number } | undefined
    const queueCount = Number(queueRow?.count ?? 0)
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

  private async pruneCoverCache(activeArtworkPaths: string[]) {
    const activeArtworkPathSet = new Set(activeArtworkPaths.filter(Boolean))

    try {
      const cacheEntries = await readdir(this.coverCachePath, { withFileTypes: true })

      await Promise.all(
        cacheEntries.map(async (entry) => {
          if (!entry.isFile()) {
            return
          }

          const cachedArtworkPath = join(this.coverCachePath, entry.name)
          if (activeArtworkPathSet.has(cachedArtworkPath)) {
            return
          }

          try {
            await unlink(cachedArtworkPath)
          } catch {
            // Ignore cache cleanup failures so the library scan itself stays successful.
          }
        }),
      )
    } catch {
      // Ignore cache cleanup failures so the library scan itself stays successful.
    }
  }

  private getArtworkExtension(format?: string) {
    const normalizedFormat = (format ?? 'image/jpeg').toLowerCase()

    if (normalizedFormat.includes('png')) {
      return 'png'
    }

    if (normalizedFormat.includes('webp')) {
      return 'webp'
    }

    if (normalizedFormat.includes('gif')) {
      return 'gif'
    }

    return 'jpg'
  }

  private async readTextIfExists(filePath: string) {
    try {
      return await readFile(filePath, 'utf8')
    } catch {
      return ''
    }
  }

  private createLyricsSnapshot(rawText: string, source: LyricsSource): LyricsSnapshot {
    const normalizedText = rawText.replace(/^\uFEFF/, '').trim()
    const lines = this.parseLyricsLines(normalizedText)

    return {
      source,
      isSynced: lines.some((line) => line.timestampMs != null),
      rawText: normalizedText,
      lines,
    }
  }

  private parseLyricsLines(rawText: string): LyricsLine[] {
    if (!rawText) {
      return []
    }

    const metadataRegex = /^\[(ti|ar|al|by|offset):/i
    const offsetRegex = /^\[offset:([+-]?\d+)\]$/i
    const timestampRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
    let offsetMs = 0
    let lineId = 0
    const parsedLines: LyricsLine[] = []

    for (const rawLine of rawText.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) {
        continue
      }

      const offsetMatch = line.match(offsetRegex)
      if (offsetMatch) {
        offsetMs = Number(offsetMatch[1] ?? 0)
        continue
      }

      if (metadataRegex.test(line)) {
        continue
      }

      const matches = [...line.matchAll(timestampRegex)]
      if (matches.length === 0) {
        parsedLines.push({
          id: lineId++,
          timestampMs: null,
          text: line,
        })
        continue
      }

      const text = line.replace(timestampRegex, '').trim()
      if (!text) {
        continue
      }

      for (const match of matches) {
        const minutes = Number(match[1] ?? 0)
        const seconds = Number(match[2] ?? 0)
        const fraction = (match[3] ?? '').padEnd(3, '0').slice(0, 3)
        const timestampMs = Math.max(
          0,
          minutes * 60_000 + seconds * 1000 + Number(fraction) + offsetMs,
        )

        parsedLines.push({
          id: lineId++,
          timestampMs,
          text,
        })
      }
    }

    return parsedLines.sort((left, right) => {
      if (left.timestampMs == null && right.timestampMs == null) {
        return left.id - right.id
      }

      if (left.timestampMs == null) {
        return -1
      }

      if (right.timestampMs == null) {
        return 1
      }

      return left.timestampMs - right.timestampMs || left.id - right.id
    })
  }

  private toLyricsTimestamp(timestampMs: number) {
    const minutes = Math.floor(timestampMs / 60_000)
    const seconds = Math.floor((timestampMs % 60_000) / 1000)
    const centiseconds = Math.floor((timestampMs % 1000) / 10)

    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }

  private async getSidecarLyrics(songPath: string): Promise<LyricsSnapshot | null> {
    const basePath = songPath.slice(0, songPath.length - extname(songPath).length)
    const sidecarLrc = await this.readTextIfExists(`${basePath}.lrc`)
    if (sidecarLrc.trim()) {
      return this.createLyricsSnapshot(sidecarLrc, 'lrc-file')
    }

    const sidecarText = await this.readTextIfExists(`${basePath}.txt`)
    if (sidecarText.trim()) {
      return this.createLyricsSnapshot(sidecarText, 'text-file')
    }

    return null
  }

  private async getEmbeddedLyrics(songPath: string) {
    try {
      const metadata = await parseFile(songPath, {
        duration: false,
        skipCovers: true,
      })
      const embeddedLyricsTag = metadata.common.lyrics?.find(
        (lyrics) =>
          typeof lyrics.text === 'string'
            ? lyrics.text.trim()
            : lyrics.syncText.some((line) => line.text.trim()),
      )

      return (
        typeof embeddedLyricsTag?.text === 'string'
          ? embeddedLyricsTag.text
          : embeddedLyricsTag?.syncText
              .map((line) => {
                if (typeof line.timestamp === 'number') {
                  return `[${this.toLyricsTimestamp(line.timestamp)}]${line.text}`
                }

                return line.text
              })
              .join('\n') ?? ''
      ).trim()
    } catch {
      return ''
    }
  }

  private async searchInternetLyrics(song: SongPathRow) {
    const songMid = await this.getSongMid(song)
    if (!songMid) {
      return ''
    }

    try {
      const response = await this.fetchJson(
        `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(songMid)}&format=json&nobase64=1`,
      ) as { lyric?: string }
      const lyrics = this.decodeHtmlEntities(response.lyric ?? '').trim()

      if (!lyrics || lyrics.includes('此歌曲为没有填词的纯音乐')) {
        return ''
      }

      return lyrics
    } catch {
      return ''
    }
  }

  private async getSongMid(song: SongPathRow) {
    const attempts = this.buildLyricsSearchAttempts(song)

    for (const attempt of attempts) {
      const songMid = await this.searchSongMidByKeyword(attempt.keyword, attempt.title, attempt.artist)
      if (songMid) {
        return songMid
      }
    }

    return ''
  }

  private buildLyricsSearchAttempts(song: SongPathRow) {
    const simplifiedTitle = this.removeBraces(song.title)
    const simplifiedArtist = this.removeBraces(song.artist)
    const attempts = [
      { keyword: `${song.title} ${song.artist}`.trim(), title: song.title, artist: song.artist },
      { keyword: song.title, title: song.title, artist: song.artist },
      { keyword: `${simplifiedTitle} ${song.artist}`.trim(), title: simplifiedTitle, artist: song.artist },
      { keyword: `${song.title} ${simplifiedArtist}`.trim(), title: song.title, artist: simplifiedArtist },
      { keyword: `${simplifiedTitle} ${simplifiedArtist}`.trim(), title: simplifiedTitle, artist: simplifiedArtist },
      { keyword: simplifiedTitle, title: simplifiedTitle, artist: simplifiedArtist },
    ]

    return attempts.filter(
      (attempt, index, allAttempts) =>
        attempt.keyword &&
        allAttempts.findIndex(
          (candidate) =>
            candidate.keyword === attempt.keyword &&
            candidate.title === attempt.title &&
            candidate.artist === attempt.artist,
        ) === index,
    )
  }

  private async searchSongMidByKeyword(keyword: string, title: string, artist: string) {
    try {
      const response = await this.fetchJson(
        `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&key=${encodeURIComponent(keyword)}`,
      ) as {
        data?: {
          song?: {
            itemlist?: Array<{
              mid?: string
              name?: string
              singer?: string
            }>
          }
        }
      }
      const items = response.data?.song?.itemlist ?? []
      let bestMatch: { mid?: string; name?: string; singer?: string } | null = null
      let bestScore = -1

      for (const item of items) {
        const score =
          this.evaluateLyricsMatch(title, item.name ?? '') * 2 +
          this.evaluateLyricsMatch(artist, item.singer ?? '')

        if (score > bestScore) {
          bestScore = score
          bestMatch = item
        }
      }

      return bestScore > 0 ? bestMatch?.mid ?? '' : ''
    } catch {
      return ''
    }
  }

  private async fetchJson(url: string) {
    const acceptLanguage = this.getPreferredLanguageHeader()
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, LYRICS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'accept-language': acceptLanguage,
          referer: 'https://y.qq.com/portal/player.html',
          'user-agent': 'Mozilla/5.0',
        },
      })

      if (!response.ok) {
        throw new Error(`Lyrics request failed: ${response.status}`)
      }

      return response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  private getPreferredLanguageHeader() {
    const preferredLanguage = this.mapPreferredLanguage(
      this.getSettings().VoiceAssistantPreferredLanguage,
    )

    if (preferredLanguage !== 'system') {
      return preferredLanguage
    }

    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'
  }

  private getPreferenceSetting() {
    let setting = this.db.prepare(`
      SELECT Id, Songs, Artists, Albums, Playlists, Folders
      FROM PreferenceSetting
      ORDER BY Id DESC
      LIMIT 1
    `).get() as unknown as PreferenceSettingRow | undefined

    if (!setting) {
      this.db.prepare(`
        INSERT INTO PreferenceSetting (Songs, Artists, Albums, Playlists, Folders)
        VALUES (0, 0, 0, 0, 0)
      `).run()
      setting = this.db.prepare(`
        SELECT Id, Songs, Artists, Albums, Playlists, Folders
        FROM PreferenceSetting
        ORDER BY Id DESC
        LIMIT 1
      `).get() as unknown as PreferenceSettingRow
    }

    this.ensureBuiltinPreferenceItems()
    return setting
  }

  private ensureBuiltinPreferenceItems() {
    this.db.prepare(`
      INSERT INTO PreferenceItem (Type, ItemId, ItemName, IsEnabled, Level, State)
      SELECT Builtins.Type, Builtins.ItemId, Builtins.ItemName, 0, 1, ?
      FROM (
        SELECT 5 AS Type, '5' AS ItemId, 'Recent Added' AS ItemName
        UNION ALL SELECT 6, '6', 'My Favorites'
        UNION ALL SELECT 7, '7', 'Most Played'
        UNION ALL SELECT 8, '8', 'Least Played'
      ) AS Builtins
      WHERE NOT EXISTS (
        SELECT 1
        FROM PreferenceItem
        WHERE PreferenceItem.Type = Builtins.Type
          AND PreferenceItem.State = ?
      )
    `).run(ACTIVE_STATE.active, ACTIVE_STATE.active)
  }

  private toPreferenceItemSnapshot(item: PreferenceItemRow): PreferenceItemSnapshot {
    const type = this.mapPreferenceEntityType(item.type)
    const resolved = this.resolvePreferenceItem(item, type)

    return {
      id: item.id,
      type,
      itemId: item.itemId,
      name: resolved.name,
      tooltip: resolved.tooltip,
      isEnabled: Boolean(item.isEnabled),
      level: this.mapPreferenceLevel(item.level),
      isValid: resolved.isValid,
      canRemove: item.type < 5,
    }
  }

  private resolvePreferenceItem(item: PreferenceItemRow, type: PreferenceEntityType) {
    switch (type) {
      case 'song':
        return item.songName
          ? { name: item.songName, tooltip: item.songTooltip!, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'artist':
        return { name: item.itemId, tooltip: item.itemId, isValid: Boolean(item.artistValid) }
      case 'album':
        return { name: item.itemName || item.itemId, tooltip: item.itemId, isValid: Boolean(item.albumValid) }
      case 'playlist':
        return item.playlistName
          ? { name: item.playlistName, tooltip: item.playlistName, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'folder':
        return item.folderName
          ? { name: basename(item.folderName), tooltip: item.folderTooltip!, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'recent-added':
        return { name: 'Recent Added', tooltip: 'Recent Added', isValid: true }
      case 'my-favorites':
        return { name: 'My Favorites', tooltip: 'My Favorites', isValid: true }
      case 'most-played':
        return { name: 'Most Played', tooltip: 'Most Played', isValid: true }
      case 'least-played':
        return { name: 'Least Played', tooltip: 'Least Played', isValid: true }
    }
  }

  private mapPreferenceEntityType(type: number): PreferenceEntityType {
    return [
      'song',
      'artist',
      'album',
      'playlist',
      'folder',
      'recent-added',
      'my-favorites',
      'most-played',
      'least-played',
    ][type] as PreferenceEntityType
  }

  private toPreferenceEntityValue(type: PreferenceEntityType) {
    return {
      'song': 0,
      'artist': 1,
      'album': 2,
      'playlist': 3,
      'folder': 4,
      'recent-added': 5,
      'my-favorites': 6,
      'most-played': 7,
      'least-played': 8,
    }[type]
  }

  private mapPreferenceLevel(level: number): PreferenceLevel {
    switch (level) {
      case 0:
        return 'do-not-appear'
      case -1:
        return 'dislike'
      case 2:
        return 'high'
      case 3:
        return 'higher'
      case 4:
        return 'very-high'
      default:
        return 'normal'
    }
  }

  private toPreferenceLevelValue(level: PreferenceLevel) {
    return {
      'do-not-appear': 0,
      'dislike': -1,
      'normal': 1,
      'high': 2,
      'higher': 3,
      'very-high': 4,
    }[level]
  }

  private evaluateLyricsMatch(target: string, candidate: string) {
    const normalizedTarget = this.normalizeLyricsLookupText(target)
    const normalizedCandidate = this.normalizeLyricsLookupText(candidate)

    if (!normalizedTarget) {
      return normalizedCandidate ? 20 : 0
    }

    if (normalizedTarget === normalizedCandidate) {
      return 100
    }

    if (normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate)) {
      return 70
    }

    const targetTokens = normalizedTarget.split(/\s+/).filter(Boolean)
    const candidateTokens = normalizedCandidate.split(/\s+/).filter(Boolean)
    let score = 0

    for (const token of targetTokens) {
      if (candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken))) {
        score += 20
      }
    }

    return score
  }

  private normalizeLyricsLookupText(value: string) {
    return this.removeBraces(value)
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private removeBraces(value: string) {
    return value
      .replace(/\([^)]*\)/g, ' ')
      .replace(/（[^）]*）/g, ' ')
      .replace(/\[[^\]]*]/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
      .replace(/\\n/g, '\n')
  }
}
