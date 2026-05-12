import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import { parseFile } from 'music-metadata'

import { normalizeArtists } from '../../src/shared/artists.ts'
import {
  writeArtworkCache,
  writeShellThumbnailCache,
} from './artwork-cache.ts'

export interface ScannedSong {
  path: string
  thumbnailPath: string
  title: string
  artist: string
  artists: string[]
  album: string
  duration: number
  dateAdded: string
}

interface ReadAudioMetadataBatchOptions {
  concurrency: number
  isCanceled?: () => boolean
  canceledMessage?: string
}

export async function readAudioMetadata(
  thumbnailCachePath: string,
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
    const embeddedThumbnailPath = await writeArtworkCache(thumbnailCachePath, filePath, metadata.common.picture?.[0])
    const thumbnailPath = embeddedThumbnailPath || await writeShellThumbnailCache(thumbnailCachePath, filePath)
    const artists = normalizeArtists([
      ...(metadata.common.artists ?? []),
      metadata.common.artist,
    ])

    return {
      path: filePath,
      thumbnailPath,
      title: useFilenameNotMusicName ? filename : metadata.common.title?.trim() || filename,
      artist: artists.join(', '),
      artists,
      album: metadata.common.album?.trim() || '',
      duration: resolveDurationSeconds(metadata.format, fileStats.size),
      dateAdded,
    }
  } catch {
    const thumbnailPath = await writeShellThumbnailCache(thumbnailCachePath, filePath)
    return {
      path: filePath,
      thumbnailPath,
      title: filename,
      artist: '',
      artists: [],
      album: '',
      duration: 0,
      dateAdded,
    }
  }
}

export async function readAudioMetadataBatch(
  thumbnailCachePath: string,
  audioFiles: string[],
  useFilenameNotMusicName: boolean,
  options: ReadAudioMetadataBatchOptions,
) {
  const songs = new Array<ScannedSong>(audioFiles.length)
  let nextIndex = 0
  const workerCount = Math.min(options.concurrency, audioFiles.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    for (;;) {
      throwIfCanceled(options.isCanceled, options.canceledMessage)
      const index = nextIndex
      nextIndex += 1
      if (index >= audioFiles.length) {
        return
      }

      songs[index] = await readAudioMetadata(thumbnailCachePath, audioFiles[index]!, useFilenameNotMusicName)
      throwIfCanceled(options.isCanceled, options.canceledMessage)
    }
  }))

  return songs
}

function throwIfCanceled(isCanceled?: () => boolean, canceledMessage = 'Canceled') {
  if (isCanceled?.()) {
    throw new Error(canceledMessage)
  }
}

function resolveDurationSeconds(
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
