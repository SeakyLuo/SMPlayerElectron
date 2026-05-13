import type { DatabaseSync } from 'node:sqlite'

export function syncAlbums(db: DatabaseSync) {
  db.exec(`
    DROP TABLE IF EXISTS temp_album_sync;

    CREATE TEMP TABLE temp_album_sync (
      Name TEXT NOT NULL,
      Artist TEXT DEFAULT '',
      ArtworkPath TEXT DEFAULT ''
    );

    INSERT INTO temp_album_sync (Name, Artist, ArtworkPath)
    SELECT
      album_groups.Name,
      COALESCE((
        SELECT Music.Artist
        FROM Music
        WHERE Music.State = 1
          AND TRIM(Music.Album) = album_groups.Name
          AND NULLIF(TRIM(Music.Artist), '') IS NOT NULL
        GROUP BY Music.Artist COLLATE NOCASE
        ORDER BY COUNT(*) DESC, Music.Artist COLLATE NOCASE
        LIMIT 1
      ), ''),
      COALESCE((
        SELECT Music.ThumbnailPath
        FROM Music
        WHERE Music.State = 1
          AND TRIM(Music.Album) = album_groups.Name
          AND NULLIF(TRIM(Music.ThumbnailPath), '') IS NOT NULL
        ORDER BY Music.Id
        LIMIT 1
      ), '')
    FROM (
      SELECT TRIM(Music.Album) AS Name
      FROM Music
      WHERE Music.State = 1
        AND NULLIF(TRIM(Music.Album), '') IS NOT NULL
      GROUP BY TRIM(Music.Album) COLLATE NOCASE
    ) AS album_groups;

    UPDATE Album
    SET State = 0;

    INSERT OR IGNORE INTO Album (Name, Artist, ArtworkPath, State)
    SELECT Name, Artist, ArtworkPath, 1
    FROM temp_album_sync;

    UPDATE Album
    SET
      Artist = COALESCE((
        SELECT temp_album_sync.Artist
        FROM temp_album_sync
        WHERE temp_album_sync.Name = Album.Name COLLATE NOCASE
        LIMIT 1
      ), Artist),
      ArtworkPath = COALESCE((
        SELECT temp_album_sync.ArtworkPath
        FROM temp_album_sync
        WHERE temp_album_sync.Name = Album.Name COLLATE NOCASE
        LIMIT 1
      ), ArtworkPath),
      State = 1
    WHERE EXISTS (
      SELECT 1
      FROM temp_album_sync
      WHERE temp_album_sync.Name = Album.Name COLLATE NOCASE
    );

    UPDATE Music
    SET AlbumId = COALESCE((
      SELECT Album.Id
      FROM Album
      WHERE Album.State = 1
        AND Album.Name = TRIM(Music.Album) COLLATE NOCASE
      LIMIT 1
    ), 0);

    DROP TABLE IF EXISTS temp_album_sync;
  `)
}
