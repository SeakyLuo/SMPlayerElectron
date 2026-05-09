import { createHash } from 'node:crypto'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { nativeImage } from 'electron'

const SHELL_THUMBNAIL_SIZE = 1024
const SHELL_THUMBNAIL_CACHE_VERSION = `shell-thumbnail-${SHELL_THUMBNAIL_SIZE}`

export async function writeArtworkCache(
  thumbnailCachePath: string,
  filePath: string,
  picture?: { data: Uint8Array; format?: string },
) {
  if (!picture?.data || picture.data.length === 0) {
    return ''
  }

  const extension = getArtworkExtension(picture.format)
  const artworkHash = createHash('sha1').update(filePath).digest('hex')
  const thumbnailPath = join(thumbnailCachePath, `${artworkHash}.${extension}`)

  await mkdir(thumbnailCachePath, { recursive: true })
  await writeFile(thumbnailPath, picture.data)

  return thumbnailPath
}

export async function writeShellThumbnailCache(thumbnailCachePath: string, filePath: string) {
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
      width: SHELL_THUMBNAIL_SIZE,
      height: SHELL_THUMBNAIL_SIZE,
    })

    if (thumbnail.isEmpty()) {
      return ''
    }

    const thumbnailPath = getShellThumbnailCachePath(thumbnailCachePath, filePath)

    await mkdir(thumbnailCachePath, { recursive: true })
    await writeFile(thumbnailPath, thumbnail.toPNG())

    return thumbnailPath
  } catch {
    return ''
  }
}

export function shouldRebuildShellThumbnail(thumbnailCachePath: string, filePath: string, thumbnailPath: string) {
  const cachedFilename = basename(thumbnailPath)
  return cachedFilename === basename(getLegacyShellThumbnailCachePath(thumbnailCachePath, filePath))
}

export async function pruneThumbnailCache(thumbnailCachePath: string, activeThumbnailPaths: string[]) {
  const activeThumbnailPathSet = new Set(activeThumbnailPaths.filter(Boolean))

  try {
    const cacheEntries = await readdir(thumbnailCachePath, { withFileTypes: true })

    await Promise.all(
      cacheEntries.map(async (entry) => {
        if (!entry.isFile()) {
          return
        }

        const cachedThumbnailPath = join(thumbnailCachePath, entry.name)
        if (activeThumbnailPathSet.has(cachedThumbnailPath)) {
          return
        }

        try {
          await unlink(cachedThumbnailPath)
        } catch {
          // Ignore cache cleanup failures so the library scan itself stays successful.
        }
      }),
    )
  } catch {
    // Ignore cache cleanup failures so the library scan itself stays successful.
  }
}

export function getArtworkFormat(filePath: string) {
  switch (extname(filePath).toLocaleLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/jpeg'
  }
}

function getArtworkExtension(format?: string) {
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

function getShellThumbnailCachePath(thumbnailCachePath: string, filePath: string) {
  const thumbnailHash = createHash('sha1').update(`${filePath}:${SHELL_THUMBNAIL_CACHE_VERSION}`).digest('hex')
  return join(thumbnailCachePath, `${thumbnailHash}.png`)
}

function getLegacyShellThumbnailCachePath(thumbnailCachePath: string, filePath: string) {
  const thumbnailHash = createHash('sha1').update(`${filePath}:shell-thumbnail`).digest('hex')
  return join(thumbnailCachePath, `${thumbnailHash}.png`)
}
