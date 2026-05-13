import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { parseFile } from 'music-metadata'

const ACTIVE_STATE = {
  inactive: 0,
  active: 1,
}

const defaultDbPaths = [
  String.raw`C:\Users\luoki\AppData\Roaming\smplayer\SMPlayerSettings.db`,
  String.raw`C:\Users\luoki\AppData\Local\Packages\23778SeakyTheLoner.SMPlayer_gn05p9xsngvjy\LocalState\SMPlayerSettings.db`,
]

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const dbPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'))

for (const dbPath of dbPaths.length > 0 ? dbPaths : defaultDbPaths) {
  if (!existsSync(dbPath)) {
    continue
  }

  await syncDatabase(dbPath)
}

async function syncDatabase(dbPath) {
  const db = new DatabaseSync(dbPath)
  const songs = db.prepare(`
    SELECT Id AS id, Name AS title, Artist AS artist, Path AS path
    FROM Music
    WHERE State = ?
    ORDER BY Id
  `).all(ACTIVE_STATE.active)

  const changes = []
  let readCount = 0
  let missingCount = 0
  let failedCount = 0

  for (const song of songs) {
    if (!existsSync(song.path)) {
      missingCount += 1
      continue
    }

    try {
      const metadata = await parseFile(song.path, {
        duration: false,
        skipCovers: true,
      })
      readCount += 1

      const nextArtist = normalizeArtists(
        normalizeArtistTagValues(metadata.common.artists ?? [], metadata.common.artist),
      ).join(', ')

      if (nextArtist && nextArtist !== song.artist) {
        changes.push({
          id: song.id,
          title: song.title,
          path: song.path,
          previousArtist: song.artist,
          nextArtist,
        })
      }
    } catch {
      failedCount += 1
    }
  }

  if (!dryRun && changes.length > 0) {
    applyArtistChanges(db, changes)
    syncAlbums(db)
  }

  const multiArtistRows = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT MusicId
      FROM MusicArtist
      WHERE State = ?
      GROUP BY MusicId
      HAVING COUNT(*) > 1
    )
  `).get(ACTIVE_STATE.active).count

  console.log(JSON.stringify({
    dbPath,
    dryRun,
    songs: songs.length,
    read: readCount,
    missing: missingCount,
    failed: failedCount,
    changed: changes.length,
    activeMultiArtistRows: multiArtistRows,
    sampleChanges: changes.slice(0, 20),
  }, null, 2))

  db.close()
}

function applyArtistChanges(db, changes) {
  const updateMusic = db.prepare('UPDATE Music SET Artist = ? WHERE Id = ?')
  const markArtistsInactive = db.prepare('UPDATE MusicArtist SET State = ? WHERE MusicId = ?')
  const insertArtist = db.prepare(`
    INSERT OR IGNORE INTO MusicArtist (MusicId, Name, Priority, State)
    VALUES (?, ?, 0, ?)
  `)
  const activateArtist = db.prepare(`
    UPDATE MusicArtist
    SET Priority = 0,
        State = ?
    WHERE MusicId = ?
      AND Name = ? COLLATE NOCASE
  `)

  db.exec('BEGIN')
  try {
    for (const change of changes) {
      updateMusic.run(change.nextArtist, change.id)
      markArtistsInactive.run(ACTIVE_STATE.inactive, change.id)
      insertArtist.run(change.id, change.nextArtist, ACTIVE_STATE.active)
      activateArtist.run(ACTIVE_STATE.active, change.id, change.nextArtist)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function syncAlbums(db) {
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

function normalizeArtistTagValues(artistValues, artistValue) {
  const artist = normalizeArtistDisplayText(normalizeTagText(artistValue))
  const artists = artistValues.map((value) => normalizeArtistDisplayText(normalizeTagText(value))).filter(Boolean)

  if (artist && isSlashArtistSplit(artist, artists)) {
    return [artist]
  }

  if (artist && isParentheticalAliasCoveredByArtists(artist, artists)) {
    return artists
  }

  return [...artists, artist]
}

function normalizeArtists(values) {
  const seen = new Set()
  const artists = []

  for (const value of values) {
    for (const artist of splitArtistValue(value)) {
      const key = artist.toLocaleLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      artists.push(artist)
    }
  }

  return artists
}

function normalizeTagText(value) {
  return String(value ?? '').trim()
}

function normalizeArtistDisplayText(value) {
  const parts = value
    .split(/\s*(?:,|\uFF0C)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 2) {
    return value
  }

  for (const part of parts) {
    if (!part.includes('/')) {
      continue
    }

    const slashParts = part
      .split('/')
      .map((item) => item.trim().toLocaleLowerCase())
      .filter(Boolean)
    const slashPartSet = new Set(slashParts)
    const otherParts = parts.filter((item) => item !== part)

    if (slashParts.length > 1 && otherParts.length > 0 && otherParts.every((item) => slashPartSet.has(item.toLocaleLowerCase()))) {
      return part
    }
  }

  return value
}

function splitArtistValue(value) {
  return String(value ?? '')
    .split(/\s*(?:;|\uFF1B|\u3001|\|)\s*/u)
    .map((artist) => artist.trim())
    .filter(Boolean)
}

function isSlashArtistSplit(artist, artists) {
  if (!artist.includes('/') || artists.length === 0) {
    return false
  }

  const slashParts = artist
    .split('/')
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean)
  const artistSet = new Set(artists.map((value) => value.toLocaleLowerCase()))

  return slashParts.length > 1 && artists.every((value) =>
    value === artist || slashParts.includes(value.toLocaleLowerCase()),
  ) && slashParts.every((part) => artistSet.has(part) || artistSet.has(artist.toLocaleLowerCase()))
}

function isParentheticalAliasCoveredByArtists(artist, artists) {
  if (artists.length === 0) {
    return false
  }

  const baseName = artist.replace(/\s*\([^)]*\)\s*$/u, '').trim()
  if (!baseName || baseName === artist) {
    return false
  }

  return artists.some((value) => value.toLocaleLowerCase() === baseName.toLocaleLowerCase())
}
