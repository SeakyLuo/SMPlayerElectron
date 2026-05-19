import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

import { net, protocol } from 'electron'

import type { DataService } from './data-service'

export function registerMediaProtocolSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'smplayer-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
    {
      scheme: 'smplayer-artwork',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ])
}

export function registerMediaProtocols(getLibraryService: () => DataService) {
  protocol.handle('smplayer-media', async (request) => {
    const songId = getProtocolSongId(request.url)
    const filePath = getLibraryService().songService.getSongPath(songId)
    const response = await net.fetch(pathToFileURL(filePath).toString(), {
      headers: request.headers,
    })
    const headers = new Headers(response.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('content-type', headers.get('content-type') || getContentType(filePath))

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  })

  protocol.handle('smplayer-artwork', async (request) => {
    const songId = getProtocolSongId(request.url)
    const artworkUrl = await getLibraryService().artworkService.getSongArtworkFileUrl(songId)
    if (!artworkUrl) {
      return new Response(null, { status: 404 })
    }

    const response = await net.fetch(artworkUrl, {
      headers: request.headers,
    })
    const headers = new Headers(response.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('cache-control', 'public, max-age=31536000, immutable')

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  })
}

function getProtocolSongId(url: string) {
  const parsedUrl = new URL(url)
  const songId = Number(parsedUrl.pathname.slice(1))

  if (!Number.isInteger(songId) || parsedUrl.hostname !== 'song') {
    throw new Error('Invalid media URL.')
  }

  return songId
}

function getContentType(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.aac':
      return 'audio/aac'
    case '.aiff':
      return 'audio/aiff'
    case '.alac':
      return 'audio/mp4'
    case '.ape':
      return 'audio/ape'
    case '.flac':
      return 'audio/flac'
    case '.m4a':
    case '.mp4':
      return 'audio/mp4'
    case '.ogg':
    case '.oga':
    case '.opus':
      return 'audio/ogg'
    case '.wav':
      return 'audio/wav'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.mp3':
    default:
      return 'audio/mpeg'
  }
}
