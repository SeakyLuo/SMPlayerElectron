import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname } from 'node:path'
import { networkInterfaces } from 'node:os'

import type { RemoteShareStatus } from '../../src/shared/contracts.ts'
import type { MusicQueryService } from './music-query-service.ts'
import type { RemoteStore } from './remote-store.ts'
import type { SongService } from './song-service.ts'

const DEFAULT_REMOTE_PORT = 8023

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createToken() {
  return randomBytes(32).toString('base64url')
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

function getLanAddresses(port: number) {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}`)
}

function getRemoteIp(request: IncomingMessage) {
  return request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {}
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function sendNotFound(response: ServerResponse) {
  sendJson(response, 404, { error: 'not-found' })
}

export class RemotePlayServer {
  private readonly remoteStore: RemoteStore
  private readonly musicQueryService: MusicQueryService
  private readonly songService: SongService
  private server: Server | null = null
  private port = DEFAULT_REMOTE_PORT

  constructor(
    remoteStore: RemoteStore,
    musicQueryService: MusicQueryService,
    songService: SongService,
  ) {
    this.remoteStore = remoteStore
    this.musicQueryService = musicQueryService
    this.songService = songService
  }

  getStatus(): RemoteShareStatus {
    const settings = this.remoteStore.getRemoteShareSettings()

    return {
      ...settings,
      running: this.server !== null,
      addresses: this.server ? getLanAddresses(this.port) : [],
    }
  }

  async start() {
    if (this.server) {
      return this.getStatus()
    }

    const settings = this.remoteStore.getRemoteShareSettings()
    this.port = settings.port
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, '0.0.0.0', () => {
        this.server!.off('error', reject)
        resolve()
      })
    })

    this.remoteStore.updateRemoteShareSettings({ shareEnabled: true })
    return this.getStatus()
  }

  async stop() {
    if (!this.server) {
      this.remoteStore.updateRemoteShareSettings({ shareEnabled: false })
      return this.getStatus()
    }

    const server = this.server
    this.server = null
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
    this.remoteStore.updateRemoteShareSettings({ shareEnabled: false })
    return this.getStatus()
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/server/info') {
      const settings = this.remoteStore.getRemoteShareSettings()
      sendJson(response, 200, {
        deviceId: settings.deviceId,
        deviceName: settings.deviceName,
        platform: process.platform,
        protocolVersion: 1,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      await this.handleLogin(request, response)
      return
    }

    if (!this.isAuthorized(request, url)) {
      sendJson(response, 401, { error: 'unauthorized' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/library/counts') {
      sendJson(response, 200, this.musicQueryService.getCounts())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/library/songs') {
      sendJson(response, 200, this.musicQueryService.getSongs())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/library/playlists') {
      sendJson(response, 200, this.musicQueryService.getPlaylists())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/library/favorites') {
      sendJson(response, 200, this.musicQueryService.getFavorites())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/library/now-playing') {
      sendJson(response, 200, this.musicQueryService.getNowPlaying())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/songs') {
      sendJson(response, 200, { songs: this.musicQueryService.getSongs() })
      return
    }

    const streamMatch = /^\/api\/stream\/(\d+)$/.exec(url.pathname)
    if (request.method === 'GET' && streamMatch) {
      await this.handleSongStream(request, response, Number(streamMatch[1]))
      return
    }

    sendNotFound(response)
  }

  private async handleLogin(request: IncomingMessage, response: ServerResponse) {
    const body = await readJsonBody(request)
    const settings = this.remoteStore.getRemoteShareSettings()
    const password = String(body.password ?? '')
    const deviceId = String(body.deviceId ?? '')
    const ip = getRemoteIp(request)

    if (this.remoteStore.isRemoteDeviceBlocked(deviceId, ip)) {
      sendJson(response, 403, { error: 'blocked' })
      return
    }

    if (password !== settings.password) {
      sendJson(response, 401, { error: 'wrong-password' })
      return
    }

    const token = createToken()
    const allowed = this.remoteStore.authorizeRemoteDevice({
      deviceId,
      deviceName: String(body.deviceName ?? ''),
      platform: String(body.platform ?? ''),
      browser: String(body.browser ?? ''),
      ip,
      tokenHash: hashToken(token),
    })

    if (!allowed) {
      sendJson(response, 403, { error: 'blocked' })
      return
    }

    sendJson(response, 200, {
      token,
      hostId: settings.deviceId,
      hostName: settings.deviceName,
    })
  }

  private isAuthorized(request: IncomingMessage, url: URL) {
    const authorization = request.headers.authorization ?? ''
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : url.searchParams.get('token') ?? ''

    return token ? this.remoteStore.touchAuthorizedDeviceByTokenHash(hashToken(token)) : false
  }

  private async handleSongStream(request: IncomingMessage, response: ServerResponse, songId: number) {
    const filePath = this.songService.getSongPath(songId)
    const fileStat = await stat(filePath)
    const range = request.headers.range
    const contentType = getContentType(filePath)

    if (!range) {
      response.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': fileStat.size,
        'Content-Type': contentType,
      })
      createReadStream(filePath).pipe(response)
      return
    }

    const [startText, endText] = range.replace('bytes=', '').split('-')
    const start = Number(startText)
    const end = endText ? Number(endText) : fileStat.size - 1

    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
      'Content-Type': contentType,
    })
    createReadStream(filePath, { start, end }).pipe(response)
  }
}
