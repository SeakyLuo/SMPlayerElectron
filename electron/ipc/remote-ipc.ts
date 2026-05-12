import { ipcMain } from 'electron'

import type {
  LibraryPlaylist,
  LibrarySong,
  MyFavoritesSnapshot,
  NowPlayingSnapshot,
  RemoteHostConnectRequest,
  RemoteMusicData,
} from '../../src/shared/contracts'
import type { DataService } from '../services/data-service'
import type { RemotePlayServer } from '../services/remote-play-server'

interface RemoteIpcOptions {
  getLibraryService: () => DataService
  getRemotePlayServer: () => RemotePlayServer
}

export function registerRemoteIpc(options: RemoteIpcOptions) {
  const getRemoteStore = () => options.getLibraryService().remoteStore

  ipcMain.handle('remote-share:get-status', () => options.getRemotePlayServer().getStatus())
  ipcMain.handle('remote-share:update-settings', async (_event, update) => {
    const remotePlayServer = options.getRemotePlayServer()
    const wasRunning = remotePlayServer.getStatus().running
    if (wasRunning) {
      await remotePlayServer.stop()
    }
    getRemoteStore().updateRemoteShareSettings(update)
    if (update.shareEnabled || (wasRunning && update.shareEnabled !== false)) {
      await remotePlayServer.start()
    }
    return remotePlayServer.getStatus()
  })
  ipcMain.handle('remote-share:start', () => options.getRemotePlayServer().start())
  ipcMain.handle('remote-share:stop', () => options.getRemotePlayServer().stop())
  ipcMain.handle('authorized-devices:list', () => getRemoteStore().getAuthorizedDevices())
  ipcMain.handle('authorized-devices:update', (_event, deviceId: number, update) =>
    getRemoteStore().updateAuthorizedDevice(deviceId, update),
  )
  ipcMain.handle('authorized-devices:delete', (_event, deviceId: number) =>
    getRemoteStore().deleteAuthorizedDevice(deviceId),
  )
  ipcMain.handle('remote-hosts:list', () => getRemoteStore().getRemoteHosts())
  ipcMain.handle('remote-hosts:connect', (_event, request: RemoteHostConnectRequest) =>
    connectRemoteHost(options.getLibraryService(), request),
  )
  ipcMain.handle('remote-hosts:get-library', (_event, hostId: number) =>
    getRemoteHostLibrary(options.getLibraryService(), hostId),
  )
  ipcMain.handle('remote-hosts:delete', (_event, hostId: number) =>
    getRemoteStore().deleteRemoteHost(hostId),
  )
}

function normalizeRemoteBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL(/^https?:\/\//i.test(trimmedBaseUrl) ? trimmedBaseUrl : `http://${trimmedBaseUrl}`)
  return url.toString().replace(/\/$/, '')
}

async function readRemoteJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Remote request failed: ${response.status}`)
  }

  return await response.json() as T
}

async function connectRemoteHost(libraryService: DataService, request: RemoteHostConnectRequest) {
  const baseUrl = normalizeRemoteBaseUrl(request.baseUrl)
  const info = await readRemoteJson<{
    deviceId: string
    deviceName: string
    platform?: string
  }>(`${baseUrl}/api/server/info`)
  const localDevice = libraryService.remoteStore.getRemoteShareSettings()
  const login = await readRemoteJson<{
    token: string
    hostId: string
    hostName: string
  }>(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: request.password,
      deviceId: localDevice.deviceId,
      deviceName: localDevice.deviceName,
      platform: process.platform,
      browser: 'Simple Melody Player',
    }),
  })
  const counts = await readRemoteJson<{
    songs: number
  }>(`${baseUrl}/api/library/counts`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  const host = libraryService.remoteStore.saveRemoteHost({
    hostId: login.hostId || info.deviceId,
    name: login.hostName || info.deviceName,
    baseUrl,
    platform: info.platform ?? '',
    token: login.token,
  })

  return {
    host,
    songCount: counts.songs,
  }
}

async function getRemoteHostLibrary(libraryService: DataService, hostId: number): Promise<RemoteMusicData> {
  const connection = libraryService.remoteStore.getRemoteHostConnection(hostId)
  const headers = { Authorization: `Bearer ${connection.token}` }
  const [songs, playlists, favorites, nowPlaying] = await Promise.all([
    readRemoteJson<LibrarySong[]>(`${connection.host.baseUrl}/api/library/songs`, { headers }),
    readRemoteJson<LibraryPlaylist[]>(`${connection.host.baseUrl}/api/library/playlists`, { headers }),
    readRemoteJson<MyFavoritesSnapshot>(`${connection.host.baseUrl}/api/library/favorites`, { headers }),
    readRemoteJson<NowPlayingSnapshot>(`${connection.host.baseUrl}/api/library/now-playing`, { headers }),
  ])

  return {
    host: connection.host,
    songs: songs.map((song) => ({
      ...song,
      mediaUrl: `${connection.host.baseUrl}/api/stream/${song.id}?token=${encodeURIComponent(connection.token)}`,
      artworkUrl: '',
    })),
    playlists,
    favorites,
    nowPlaying,
  }
}
