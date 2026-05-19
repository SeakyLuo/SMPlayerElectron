import { ipcMain } from 'electron'

import type { MpvPlaybackLoadRequest } from '../../src/shared/mpvPlayback'
import type { MpvPlayerService } from '../services/mpv-player-service'

interface PlaybackIpcOptions {
  getMpvPlayerService: () => MpvPlayerService
}

export function registerPlaybackIpc(options: PlaybackIpcOptions) {
  const getMpvPlayerService = options.getMpvPlayerService

  ipcMain.handle('playback:mpv-load-song', (_event, request: MpvPlaybackLoadRequest) =>
    getMpvPlayerService().loadSong(request),
  )
  ipcMain.handle('playback:mpv-play', () => getMpvPlayerService().play())
  ipcMain.handle('playback:mpv-pause', () => getMpvPlayerService().pause())
  ipcMain.handle('playback:mpv-seek', (_event, seconds: number) =>
    getMpvPlayerService().seek(seconds),
  )
  ipcMain.handle('playback:mpv-set-volume', (_event, volume: number) =>
    getMpvPlayerService().setVolume(volume),
  )
  ipcMain.handle('playback:mpv-set-muted', (_event, muted: boolean) =>
    getMpvPlayerService().setMuted(muted),
  )
  ipcMain.handle('playback:mpv-stop', () => getMpvPlayerService().stop())
  ipcMain.handle('playback:mpv-state', () => getMpvPlayerService().getState())
}
