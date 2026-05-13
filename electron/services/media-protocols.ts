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
    const fileUrl = getLibraryService().songService.getSongFileUrl(songId)
    const response = await net.fetch(fileUrl, {
      headers: request.headers,
      bypassCustomProtocolHandlers: true,
    })
    const headers = new Headers(response.headers)
    headers.set('access-control-allow-origin', '*')

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
