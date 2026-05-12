import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { parseFile } from 'music-metadata'

import type { SongArtworkSnapshot, SongArtworkSource } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE, AUDIO_EXTENSIONS } from './constants.ts'
import {
  getArtworkFormat,
  shouldRebuildShellThumbnail,
  writeArtworkCache,
  writeShellThumbnailCache,
} from './artwork-cache.ts'

interface SongArtworkRow {
  id: number
  path: string
  thumbnailPath: string
}

type SongArtworkWriter = (songPath: string, picture: { data: Buffer; format: string } | null) => Promise<void>

export class ArtworkService {
  private readonly db: DatabaseSync
  private readonly thumbnailCachePath: string
  private readonly writeSongArtwork: SongArtworkWriter

  constructor(db: DatabaseSync, thumbnailCachePath: string, writeSongArtwork: SongArtworkWriter) {
    this.db = db
    this.thumbnailCachePath = thumbnailCachePath
    this.writeSongArtwork = writeSongArtwork
  }

  async getSongArtworkSnapshot(songId: number): Promise<SongArtworkSnapshot> {
    const song = this.getSongArtworkRow(songId)
    const result = await this.resolveSongArtworkFile(song)

    return {
      songId,
      artworkUrl: result.fileUrl ? this.getSongArtworkUrl(songId, result.cacheKey) : '',
      source: result.source,
    }
  }

  async getSongArtworkSnapshots(songIds: number[]): Promise<SongArtworkSnapshot[]> {
    const uniqueSongIds = [...new Set(songIds)]
    if (uniqueSongIds.length === 0) {
      return []
    }

    const placeholders = uniqueSongIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT
        Id AS id,
        Path AS path,
        ThumbnailPath AS thumbnailPath
      FROM Music
      WHERE State = ?
        AND Id IN (${placeholders})
    `).all(ACTIVE_STATE.active, ...uniqueSongIds) as unknown as SongArtworkRow[]
    const rowsBySongId = new Map(rows.map((row) => [row.id, row]))

    return mapWithConcurrency(uniqueSongIds, 6, async (songId) => {
      const result = await this.resolveSongArtworkFile(rowsBySongId.get(songId)!)
      return {
        songId,
        artworkUrl: result.fileUrl ? this.getSongArtworkUrl(songId, result.cacheKey) : '',
        source: result.source,
      }
    })
  }

  setAlbumArtwork(albumName: string, thumbnailPath: string) {
    this.db.prepare(`
      UPDATE Music
      SET ThumbnailPath = ?
      WHERE Album = ?
        AND State = ?
    `).run(thumbnailPath, albumName, ACTIVE_STATE.active)
  }

  async saveAlbumArtwork(albumName: string, sourcePath: string) {
    const songs = this.db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE Album = ?
        AND State = ?
    `).all(albumName, ACTIVE_STATE.active) as Array<{ path: string }>
    const artwork = await readFile(sourcePath)
    const format = getArtworkFormat(sourcePath)

    for (const song of songs) {
      await this.writeSongArtwork(song.path, {
        data: artwork,
        format,
      })
    }

    const thumbnailPath = await writeArtworkCache(this.thumbnailCachePath, albumName, {
      data: artwork,
      format,
    })

    this.db.prepare(`
      UPDATE Music
      SET ThumbnailPath = ?
      WHERE Album = ?
        AND State = ?
    `).run(thumbnailPath, albumName, ACTIVE_STATE.active)
  }

  async deleteAlbumArtwork(albumName: string) {
    const songs = this.db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE Album = ?
        AND State = ?
    `).all(albumName, ACTIVE_STATE.active) as Array<{ path: string }>

    for (const song of songs) {
      await this.writeSongArtwork(song.path, null)
    }

    this.db.prepare(`
      UPDATE Music
      SET ThumbnailPath = ''
      WHERE Album = ?
        AND State = ?
    `).run(albumName, ACTIVE_STATE.active)
  }

  async prepareArtworkSource(sourcePath: string) {
    if (AUDIO_EXTENSIONS.has(extname(sourcePath).toLocaleLowerCase())) {
      const metadata = await parseFile(sourcePath, {
        duration: false,
        skipCovers: false,
      })
      const thumbnailPath = await writeArtworkCache(this.thumbnailCachePath, `${sourcePath}:selected-artwork`, metadata.common.picture?.[0])
      if (!thumbnailPath) {
        throw new Error('No album art found in the selected music file.')
      }

      return {
        sourcePath: thumbnailPath,
        artworkUrl: pathToFileURL(thumbnailPath).href,
      }
    }

    await stat(sourcePath)
    return {
      sourcePath,
      artworkUrl: pathToFileURL(sourcePath).href,
    }
  }

  async saveSongArtwork(songId: number, sourcePath: string) {
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

    const artwork = await readFile(sourcePath)
    const format = getArtworkFormat(sourcePath)

    await this.writeSongArtwork(song.path, {
      data: artwork,
      format,
    })

    const thumbnailPath = await writeArtworkCache(this.thumbnailCachePath, song.path, {
      data: artwork,
      format,
    })

    this.db.prepare(`
      UPDATE Music
      SET ThumbnailPath = ?
      WHERE Id = ?
        AND State = ?
    `).run(thumbnailPath, songId, ACTIVE_STATE.active)
  }

  async deleteSongArtwork(songId: number) {
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

    await this.writeSongArtwork(song.path, null)

    this.db.prepare(`
      UPDATE Music
      SET ThumbnailPath = ''
      WHERE Id = ?
        AND State = ?
    `).run(songId, ACTIVE_STATE.active)
  }

  async getSongArtworkFileUrl(songId: number) {
    const result = await this.resolveSongArtworkFile(this.getSongArtworkRow(songId))
    return result.fileUrl
  }

  private getSongArtworkRow(songId: number) {
    const song = this.db.prepare(`
      SELECT
        Id AS id,
        Path AS path,
        ThumbnailPath AS thumbnailPath
      FROM Music
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as SongArtworkRow | undefined

    if (!song) {
      throw new Error('Song not found.')
    }

    return song
  }

  private async resolveSongArtworkFile(song: SongArtworkRow): Promise<{ fileUrl: string; source: SongArtworkSource; cacheKey: string }> {
    if (song.thumbnailPath) {
      try {
        await stat(song.thumbnailPath)
        if (!shouldRebuildShellThumbnail(this.thumbnailCachePath, song.path, song.thumbnailPath)) {
          return { fileUrl: pathToFileURL(song.thumbnailPath).href, source: 'cached', cacheKey: song.thumbnailPath }
        }
      } catch {
        // Rebuild stale thumbnail cache entries below.
      }
    }

    try {
      const metadata = await parseFile(song.path, {
        duration: false,
        skipCovers: false,
      })
      const thumbnailPath = await writeArtworkCache(this.thumbnailCachePath, song.path, metadata.common.picture?.[0])

      if (thumbnailPath) {
        this.db.prepare(`
          UPDATE Music
          SET ThumbnailPath = ?
          WHERE Id = ?
            AND State = ?
        `).run(thumbnailPath, song.id, ACTIVE_STATE.active)

        return { fileUrl: pathToFileURL(thumbnailPath).href, source: 'embedded', cacheKey: thumbnailPath }
      }
    } catch {
      // Fall back to a shell thumbnail below.
    }

    try {
      const thumbnailPath = await writeShellThumbnailCache(this.thumbnailCachePath, song.path)

      if (!thumbnailPath) {
        return { fileUrl: '', source: 'none', cacheKey: '' }
      }

      this.db.prepare(`
        UPDATE Music
        SET ThumbnailPath = ?
        WHERE Id = ?
          AND State = ?
      `).run(thumbnailPath, song.id, ACTIVE_STATE.active)

      return { fileUrl: pathToFileURL(thumbnailPath).href, source: 'shell', cacheKey: thumbnailPath }
    } catch {
      return { fileUrl: '', source: 'none', cacheKey: '' }
    }
  }

  private getSongArtworkUrl(songId: number, cacheKey = '') {
    if (!cacheKey) {
      return `smplayer-artwork://song/${songId}`
    }

    const revision = createHash('sha1').update(cacheKey).digest('hex').slice(0, 12)
    return `smplayer-artwork://song/${songId}?v=${revision}`
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }

      results[index] = await worker(items[index]!)
    }
  }))

  return results
}
