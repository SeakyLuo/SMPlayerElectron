import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { parseFile } from 'music-metadata'

import type { ArtistSplitResultItem, SongPropertiesSnapshot, SongPropertiesUpdate } from '../../src/shared/contracts.ts'
import { normalizeArtists } from '../../src/shared/artists.ts'
import { ACTIVE_STATE } from './constants.ts'
import type { Id3TagService } from './id3-tag-service.ts'
import type { SongArtistRow } from './row-mappers.ts'
import { normalizeArtistTagValues, normalizeTagText } from './tag-text.ts'
import { syncAlbums } from './album-sync.ts'
import { SongArtistSync } from './song-artist-sync.ts'

export class SongService {
  private readonly db: DatabaseSync
  private readonly id3TagService: Id3TagService
  private readonly getSongPathStatement
  private readonly updateSongPlayCountStatement
  private readonly updateSongDurationStatement
  private readonly songArtistSync

  constructor(db: DatabaseSync, id3TagService: Id3TagService) {
    this.db = db
    this.id3TagService = id3TagService
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
    this.updateSongPlayCountStatement = this.db.prepare(`
      UPDATE Music
      SET PlayCount = ?
      WHERE Id = ?
        AND State = ?
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
    this.songArtistSync = new SongArtistSync(this.db)
  }

  async getSongProperties(songId: number): Promise<SongPropertiesSnapshot> {
    const song = this.db.prepare(`
      SELECT
        Id AS id,
        Path AS path,
        Name AS title,
        Artist AS artist,
        Album AS album,
        Duration AS duration,
        PlayCount AS playCount
      FROM Music
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as {
      id: number
      path: string
      title: string
      artist: string
      album: string
      duration: number
      playCount: number
    }
    const artistRows = this.db.prepare(`
      SELECT MusicArtist.MusicId AS songId, MusicArtist.Name AS name
      FROM MusicArtist
      INNER JOIN Music
        ON Music.Id = MusicArtist.MusicId
      WHERE MusicId = ?
        AND MusicArtist.State = ?
      ORDER BY MusicArtist.Priority, MusicArtist.Id
    `).all(songId, ACTIVE_STATE.active) as unknown as SongArtistRow[]
    const artists = normalizeArtists(
      artistRows.filter((row) => row.songId === songId).map((row) => row.name),
    )

    const fileStats = await stat(song.path)
    const fileType = extname(song.path).replace('.', '').toLocaleUpperCase()

    try {
      const metadata = await parseFile(song.path, {
        duration: true,
        skipCovers: true,
      })
      const common = metadata.common as typeof metadata.common & {
        subtitle?: string
        publisher?: string
      }

      return {
        songId,
        path: song.path,
        title: normalizeTagText(common.title) || song.title,
        subtitle: normalizeTagText(common.subtitle),
        artist: normalizeArtists(normalizeArtistTagValues(common.artists ?? [], common.artist)).join(', ') || song.artist,
        artists: artists.length > 0 ? artists : normalizeArtists([song.artist]),
        album: normalizeTagText(common.album) || song.album,
        albumArtist: normalizeTagText(common.albumartist),
        publisher: normalizeTagText(common.publisher),
        trackNumber: common.track.no ?? 0,
        year: common.year ?? 0,
        genre: (common.genre ?? []).map(normalizeTagText).join(', '),
        composers: (common.composer ?? []).map(normalizeTagText).join(', '),
        duration: this.resolveDurationSeconds(metadata.format, 0) || song.duration,
        bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate) : 0,
        fileSize: fileStats.size,
        dateCreated: fileStats.birthtime.toISOString(),
        dateModified: fileStats.mtime.toISOString(),
        fileType,
        playCount: song.playCount,
      }
    } catch {
      return {
        songId,
        path: song.path,
        title: song.title,
        subtitle: '',
        artist: song.artist,
        artists: artists.length > 0 ? artists : normalizeArtists([song.artist]),
        album: song.album,
        albumArtist: '',
        publisher: '',
        trackNumber: 0,
        year: 0,
        genre: '',
        composers: '',
        duration: song.duration,
        bitrate: 0,
        fileSize: fileStats.size,
        dateCreated: fileStats.birthtime.toISOString(),
        dateModified: fileStats.mtime.toISOString(),
        fileType,
        playCount: song.playCount,
      }
    }
  }

  async updateSongProperties(songId: number, update: SongPropertiesUpdate) {
    const song = this.getSongPathStatement.get(
      songId,
      ACTIVE_STATE.active,
    ) as { path: string } | undefined
    if (!song) {
      throw new Error('Song not found.')
    }
    const title = update.title.trim()
    const artists = normalizeArtists(update.artists ?? [update.artist]).slice(0, 6)
    const artist = artists.join(', ')
    const album = update.album.trim()

    await this.id3TagService.writeSongTagProperties(song.path, {
      title,
      subtitle: update.subtitle?.trim() ?? '',
      artist,
      album,
      albumArtist: update.albumArtist?.trim() ?? '',
      publisher: update.publisher?.trim() ?? '',
      trackNumber: update.trackNumber ?? 0,
      year: update.year ?? 0,
      genre: update.genre?.trim() ?? '',
      composers: update.composers?.trim() ?? '',
    })

    this.db.exec('BEGIN')
    try {
      this.db.prepare(`
        UPDATE Music
        SET Name = ?, Artist = ?, Album = ?, PlayCount = ?
        WHERE Id = ?
          AND State = ?
      `).run(
        title,
        artist,
        album,
        update.playCount ?? 0,
        songId,
        ACTIVE_STATE.active,
      )
      this.songArtistSync.sync(songId, artists)
      syncAlbums(this.db)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateSongPlayCount(songId: number, playCount: number) {
    this.updateSongPlayCountStatement.run(playCount, songId, ACTIVE_STATE.active)
  }

  applyArtistSplits(splits: ArtistSplitResultItem[]) {
    this.db.exec('BEGIN')
    try {
      this.songArtistSync.syncMany(splits)
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

  getSongFileUrl(songId: number) {
    return pathToFileURL(this.getSongPath(songId)).href
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

  getSongPaths(songIds: number[]) {
    if (songIds.length === 0) {
      return []
    }

    const placeholders = songIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE Id IN (${placeholders})
        AND State = ?
    `).all(...songIds, ACTIVE_STATE.active) as unknown as Array<{ path: string }>

    return rows.map((row) => row.path)
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
}
