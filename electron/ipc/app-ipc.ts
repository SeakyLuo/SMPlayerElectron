import { app, ipcMain } from 'electron'

import type { AppInfo } from '../../src/shared/contracts'

interface AppIpcOptions {
  takePendingOpenSongIds: () => number[]
}

export function registerAppIpc(options: AppIpcOptions) {
  ipcMain.handle('app:get-info', () => getAppInfo())
  ipcMain.handle('app:take-pending-open-files', () => options.takePendingOpenSongIds())
}

function getAppInfo(): AppInfo {
  return {
    platform: process.platform,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
  }
}
