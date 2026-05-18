import { app, ipcMain } from 'electron'

import type { AppInfo, DesktopLyricsCommand, DesktopLyricsDisplayState, ExternalAppCommand } from '../../src/shared/contracts'
import { getSystemFonts } from '../services/system-font-service'

interface AppIpcOptions {
  takePendingOpenSongIds: () => number[]
  takePendingExternalCommands: () => ExternalAppCommand[]
  setTrayPlaybackState: (isPlaying: boolean) => void
  updateDesktopLyricsState: (state: DesktopLyricsDisplayState) => void | Promise<void>
  requestDesktopLyricsCommand: (command: DesktopLyricsCommand) => void
}

export function registerAppIpc(options: AppIpcOptions) {
  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('app:get-system-fonts', () => getSystemFonts())
  ipcMain.handle('app:take-pending-open-files', () => options.takePendingOpenSongIds())
  ipcMain.handle('app:take-pending-external-commands', () => options.takePendingExternalCommands())
  ipcMain.handle('app:set-tray-playback-state', (_event, isPlaying: boolean) => {
    options.setTrayPlaybackState(isPlaying)
  })
  ipcMain.handle('desktop-lyrics:update-state', (_event, state: DesktopLyricsDisplayState) =>
    options.updateDesktopLyricsState(state),
  )
  ipcMain.handle('desktop-lyrics:request-command', (_event, command: DesktopLyricsCommand) => {
    options.requestDesktopLyricsCommand(command)
  })
}

function getAppInfo(): AppInfo {
  return {
    platform: process.platform,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
  }
}
