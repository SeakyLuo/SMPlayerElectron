import type { DatabaseSync } from 'node:sqlite'

function columnExists(db: DatabaseSync, tableName: string, columnName: string) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>

  return rows.some((row) => row.name === columnName)
}

function addColumnIfMissing(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  columnDefinition: string,
) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`)
  }
}

function renameColumnIfPresent(
  db: DatabaseSync,
  tableName: string,
  oldColumnName: string,
  newColumnName: string,
) {
  if (columnExists(db, tableName, oldColumnName) && !columnExists(db, tableName, newColumnName)) {
    db.exec(`ALTER TABLE ${tableName} RENAME COLUMN ${oldColumnName} TO ${newColumnName}`)
  }
}

export function initializeSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS Settings (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      RootPath TEXT DEFAULT '',
      LastMusicIndex INTEGER DEFAULT -1,
      Mode INTEGER DEFAULT 0,
      Volume REAL DEFAULT 50,
      IsNavigationCollapsed INTEGER DEFAULT 1,
      ThemeColor TEXT DEFAULT '#0078D7',
      NightMode INTEGER DEFAULT 2,
      NightModeStartTime TEXT DEFAULT '20:00',
      NightModeEndTime TEXT DEFAULT '06:00',
      NotificationSend INTEGER DEFAULT 0,
      NotificationDisplay INTEGER DEFAULT 1,
      LastPage TEXT DEFAULT '',
      LastPlaylist INTEGER DEFAULT 0,
      LocalViewMode INTEGER DEFAULT 0,
      MyFavorites INTEGER DEFAULT 0,
      NowPlaying INTEGER DEFAULT 0,
      MiniModeWithDropdown INTEGER DEFAULT 0,
      IsMuted INTEGER DEFAULT 0,
      AutoPlay INTEGER DEFAULT 0,
      AutoLyrics INTEGER DEFAULT 0,
      SaveMusicProgress INTEGER DEFAULT 0,
      MusicProgress REAL DEFAULT 0,
      MusicLibraryCriterion INTEGER DEFAULT 0,
      AlbumsCriterion INTEGER DEFAULT -1,
      HideMultiSelectCommandBarAfterOperation INTEGER DEFAULT 1,
      ShowCount INTEGER DEFAULT 1,
      ShowLyricsInNotification INTEGER DEFAULT 0,
      VoiceAssistantPreferredLanguage INTEGER DEFAULT 0,
      SearchArtistsCriterion INTEGER DEFAULT -1,
      SearchAlbumsCriterion INTEGER DEFAULT -1,
      SearchSongsCriterion INTEGER DEFAULT -1,
      SearchPlaylistsCriterion INTEGER DEFAULT -1,
      SearchFoldersCriterion INTEGER DEFAULT -1,
      LastReleaseNotesVersion TEXT DEFAULT '',
      RemotePlayPassword TEXT DEFAULT '',
      UseFilenameNotMusicName INTEGER DEFAULT 0,
      NotificationLyricsSource INTEGER DEFAULT 0,
      PlayerLyricsSource INTEGER DEFAULT 3,
      SaveLyricsImmediately INTEGER DEFAULT 0,
      PreserveInternetLyricsTimestamps INTEGER DEFAULT 1,
      QuitOnClose INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS Music (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Path TEXT NOT NULL,
      Name TEXT DEFAULT '',
      Artist TEXT DEFAULT '',
      Album TEXT DEFAULT '',
      ThumbnailPath TEXT DEFAULT '',
      Duration INTEGER DEFAULT 0,
      PlayCount INTEGER DEFAULT 0,
      DateAdded TEXT DEFAULT '',
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS MusicArtist (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      MusicId INTEGER NOT NULL,
      Name TEXT NOT NULL,
      Priority INTEGER DEFAULT 0,
      State INTEGER DEFAULT 1,
      FOREIGN KEY (MusicId) REFERENCES Music(Id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Folder (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Path TEXT NOT NULL,
      Criterion INTEGER DEFAULT 0,
      ParentId INTEGER DEFAULT 0,
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS File (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Path TEXT NOT NULL,
      ParentId INTEGER DEFAULT 0,
      FileId INTEGER DEFAULT 0,
      FileType INTEGER DEFAULT 0,
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS Playlist (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Criterion INTEGER DEFAULT -1,
      Priority INTEGER DEFAULT -1,
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS PlaylistItem (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      PlaylistId INTEGER NOT NULL,
      ItemId INTEGER NOT NULL,
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS PreferenceSetting (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Songs INTEGER DEFAULT 0,
      Artists INTEGER DEFAULT 0,
      Albums INTEGER DEFAULT 0,
      Playlists INTEGER DEFAULT 0,
      Folders INTEGER DEFAULT 0,
      RecentAddedId INTEGER DEFAULT 0,
      MyFavoritesId INTEGER DEFAULT 0,
      MostPlayedId INTEGER DEFAULT 0,
      LeastPlayedId INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS PreferenceItem (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Type INTEGER DEFAULT 0,
      ItemId TEXT DEFAULT '',
      ItemName TEXT DEFAULT '',
      IsEnabled INTEGER DEFAULT 0,
      Level INTEGER DEFAULT 0,
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS RecentRecord (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Type INTEGER DEFAULT 0,
      ItemId TEXT DEFAULT '',
      Time TEXT DEFAULT '',
      State INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS SearchState (
      Id INTEGER PRIMARY KEY CHECK (Id = 1),
      LastQuery TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS SearchHistory (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Query TEXT NOT NULL,
      SearchedAt TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS HiddenStorageItem (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Type TEXT NOT NULL,
      Path TEXT NOT NULL,
      State INTEGER DEFAULT 1
    );

    INSERT OR IGNORE INTO SearchState (Id, LastQuery)
    VALUES (1, '');

    CREATE UNIQUE INDEX IF NOT EXISTS idx_music_path ON Music(Path);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_music_artist_music_name
      ON MusicArtist(MusicId, Name COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_path ON Folder(Path);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_path ON File(Path);
    CREATE INDEX IF NOT EXISTS idx_playlist_name ON Playlist(Name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_search_history_query_nocase
      ON SearchHistory(Query COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_music_artist_name ON MusicArtist(Name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_music_artist_music ON MusicArtist(MusicId);
    CREATE INDEX IF NOT EXISTS idx_folder_parent ON Folder(ParentId);
    CREATE INDEX IF NOT EXISTS idx_file_parent ON File(ParentId);
    CREATE INDEX IF NOT EXISTS idx_playlist_item_playlist ON PlaylistItem(PlaylistId);
    CREATE INDEX IF NOT EXISTS idx_playlist_item_item ON PlaylistItem(ItemId);
    CREATE INDEX IF NOT EXISTS idx_recent_record_type ON RecentRecord(Type);
    CREATE INDEX IF NOT EXISTS idx_preference_item_type_item ON PreferenceItem(Type, ItemId);
    CREATE INDEX IF NOT EXISTS idx_search_history_time ON SearchHistory(SearchedAt);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_storage_item_type_path
      ON HiddenStorageItem(Type, Path);
  `)

  renameColumnIfPresent(db, 'Music', 'ArtworkPath', 'ThumbnailPath')
  addColumnIfMissing(db, 'Music', 'ThumbnailPath', `ThumbnailPath TEXT DEFAULT ''`)

  for (const [columnName, columnDefinition] of [
    ['LastReleaseNotesVersion', `LastReleaseNotesVersion TEXT DEFAULT ''`],
    ['RemotePlayPassword', `RemotePlayPassword TEXT DEFAULT ''`],
    ['UseFilenameNotMusicName', `UseFilenameNotMusicName INTEGER DEFAULT 0`],
    ['NotificationLyricsSource', `NotificationLyricsSource INTEGER DEFAULT 0`],
    ['PlayerLyricsSource', `PlayerLyricsSource INTEGER DEFAULT 3`],
    ['SaveLyricsImmediately', `SaveLyricsImmediately INTEGER DEFAULT 0`],
    ['PreserveInternetLyricsTimestamps', `PreserveInternetLyricsTimestamps INTEGER DEFAULT 1`],
    ['QuitOnClose', `QuitOnClose INTEGER DEFAULT 1`],
    ['NightMode', `NightMode INTEGER DEFAULT 2`],
    ['NightModeStartTime', `NightModeStartTime TEXT DEFAULT '20:00'`],
    ['NightModeEndTime', `NightModeEndTime TEXT DEFAULT '06:00'`],
    ['AlbumsCriterion', `AlbumsCriterion INTEGER DEFAULT -1`],
    ['SearchArtistsCriterion', `SearchArtistsCriterion INTEGER DEFAULT -1`],
    ['SearchAlbumsCriterion', `SearchAlbumsCriterion INTEGER DEFAULT -1`],
    ['SearchSongsCriterion', `SearchSongsCriterion INTEGER DEFAULT -1`],
    ['SearchPlaylistsCriterion', `SearchPlaylistsCriterion INTEGER DEFAULT -1`],
    ['SearchFoldersCriterion', `SearchFoldersCriterion INTEGER DEFAULT -1`],
  ]) {
    addColumnIfMissing(db, 'Settings', columnName, columnDefinition)
  }

  db.exec(`
    INSERT OR IGNORE INTO MusicArtist (MusicId, Name, Priority, State)
    SELECT Id, Artist, 0, State
    FROM Music
    WHERE NULLIF(TRIM(Artist), '') IS NOT NULL;

    INSERT OR IGNORE INTO SearchHistory (Query, SearchedAt)
    SELECT ItemId, Time
    FROM RecentRecord
    WHERE Type = 2
      AND State = 1
      AND NULLIF(TRIM(ItemId), '') IS NOT NULL;
  `)
}
