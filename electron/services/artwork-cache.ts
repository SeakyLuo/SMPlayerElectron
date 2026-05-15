import { createHash } from 'node:crypto'
import { readFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { nativeImage } from 'electron'

const SHELL_THUMBNAIL_SIZE = 1024
const SHELL_THUMBNAIL_CACHE_VERSION = `shell-thumbnail-${SHELL_THUMBNAIL_SIZE}`

interface IPictureLike {
  data: Uint8Array
  format?: string | null
  type?: string | null
}

// Magic-byte sniffing — much more reliable than checking the picture's
// declared mime type, because ID3v2 link-frames (mime "-->") carry a URL
// string in `data`, and broken APIC frames sometimes carry leftover frame
// header bytes. Only data that begins with a recognised image header is
// safe to write to the artwork cache.
export function isLikelyImage(data: Uint8Array | undefined | null) {
  if (!data || data.length < 12) {
    return false
  }
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return true
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) {
    return true
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) {
    return true
  }
  // GIF87a / GIF89a
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    return true
  }
  // BMP: "BM"
  if (data[0] === 0x42 && data[1] === 0x4d) {
    return true
  }
  return false
}

function detectImageMimeFromBytes(data: Uint8Array): string | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    data.length >= 12
    && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return 'image/gif'
  }
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) {
    return 'image/bmp'
  }
  return undefined
}

// ID3v2 APIC pictures can include non-cover artwork (artist/conductor/leaflet
// photos) and even external link frames (mime "-->" with the data being a URL
// string). Naively taking metadata.common.picture[0] sometimes yields one of
// those non-renderable frames, so the resulting cache file is invalid and the
// thumbnail tile shows the empty fallback. UWP relies on the Windows shell
// thumbnail pipeline which always prefers the front cover; we mirror that by
// scoring picture entries with a small priority list AND require the bytes
// to actually look like an image (magic-byte sniff).
export function selectBestPicture(pictures?: readonly IPictureLike[] | null) {
  if (!pictures || pictures.length === 0) {
    return undefined
  }

  const candidates = pictures.filter((picture) => isLikelyImage(picture?.data))

  if (candidates.length === 0) {
    return undefined
  }

  const score = (picture: IPictureLike) => {
    const type = (picture.type ?? '').toLowerCase()
    if (type === 'cover (front)') return 0
    if (type === '' || type === 'other') return 1
    if (type === 'cover (back)') return 2
    if (type === 'leaflet page') return 3
    if (type === 'media (e.g. label side of cd)') return 4
    if (type.startsWith('illustration')) return 5
    return 10
  }

  const best = [...candidates].sort((left, right) => score(left) - score(right))[0]
  // Re-derive the actual mime from the bytes so writeArtworkCache picks the
  // right extension even when the declared format is wrong (commonly seen on
  // ID3v2.3 frames where the mime header is "image/jpg" but the bytes are PNG).
  return {
    ...best,
    format: detectImageMimeFromBytes(best.data) ?? best.format ?? undefined,
  }
}

export async function writeArtworkCache(
  thumbnailCachePath: string,
  _filePath: string,
  picture?: IPictureLike,
) {
  if (!picture?.data || picture.data.length === 0) {
    return ''
  }

  const extension = getArtworkExtension(picture.format)
  const artworkHash = createHash('sha1').update(picture.data).digest('hex')
  const thumbnailPath = join(thumbnailCachePath, `${artworkHash}.${extension}`)

  await mkdir(thumbnailCachePath, { recursive: true })
  await writeFile(thumbnailPath, picture.data)

  return thumbnailPath
}

// UWP MusicView thumbnails ultimately fall back to "folder artwork" — Windows
// scans the song's directory for cover.jpg / folder.jpg / AlbumArt*.jpg /
// front.jpg etc. Electron's nativeImage.createThumbnailFromPath uses
// IShellItemImageFactory which is supposed to do the same, but in practice it
// can return an empty image for MP3s without an embedded picture even when
// the directory contains a usable folder image (most often when the cover
// file's name does not match the well-known set Windows looks at). To match
// UWP behaviour we run a manual sibling scan as a last resort.
const FOLDER_ARTWORK_BASENAMES = [
  'cover',
  'folder',
  'front',
  'album',
  'albumart',
  'albumart_{00000000-0000-0000-0000-000000000000}_large',
  'albumart_{00000000-0000-0000-0000-000000000000}_small',
  'albumartlarge',
  'albumartsmall',
]
const FOLDER_ARTWORK_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']

async function findSiblingFolderArtwork(filePath: string) {
  const dir = dirname(filePath)
  let entries: string[]
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true })
    entries = dirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  } catch {
    return ''
  }

  const lookup = new Map<string, string>()
  for (const name of entries) {
    lookup.set(name.toLowerCase(), name)
  }

  for (const base of FOLDER_ARTWORK_BASENAMES) {
    for (const ext of FOLDER_ARTWORK_EXTENSIONS) {
      const candidate = lookup.get(`${base}${ext}`)
      if (candidate) {
        return join(dir, candidate)
      }
    }
  }
  return ''
}

export async function writeShellThumbnailCache(thumbnailCachePath: string, filePath: string) {
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
      width: SHELL_THUMBNAIL_SIZE,
      height: SHELL_THUMBNAIL_SIZE,
    })

    if (!thumbnail.isEmpty()) {
      const thumbnailPath = getShellThumbnailCachePath(thumbnailCachePath, filePath)

      await mkdir(thumbnailCachePath, { recursive: true })
      await writeFile(thumbnailPath, thumbnail.toPNG())

      return thumbnailPath
    }
  } catch {
    // fall through to the sibling folder-art scan below
  }

  const siblingArtwork = await findSiblingFolderArtwork(filePath)
  if (siblingArtwork) {
    try {
      const data = await readFile(siblingArtwork)
      if (!isLikelyImage(data)) {
        return ''
      }
      const thumbnailPath = getShellThumbnailCachePath(thumbnailCachePath, filePath)

      await mkdir(thumbnailCachePath, { recursive: true })
      await writeFile(thumbnailPath, data)

      return thumbnailPath
    } catch {
      return ''
    }
  }

  return ''
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

export function getArtworkExtension(format?: string | null) {
  if (format === 'image/png') {
    return 'png'
  }

  if (format === 'image/webp') {
    return 'webp'
  }

  if (format === 'image/gif') {
    return 'gif'
  }

  return 'jpg'
}

export function getShellThumbnailCachePath(thumbnailCachePath: string, filePath: string) {
  const thumbnailHash = createHash('sha1').update(`${filePath}:${SHELL_THUMBNAIL_CACHE_VERSION}`).digest('hex')
  return join(thumbnailCachePath, `${thumbnailHash}.png`)
}

export function getLegacyShellThumbnailCachePath(thumbnailCachePath: string, filePath: string) {
  const thumbnailHash = createHash('sha1').update(`${filePath}:shell-thumbnail`).digest('hex')
  return join(thumbnailCachePath, `${thumbnailHash}.png`)
}
