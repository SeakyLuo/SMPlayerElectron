import { ipcMain, type BrowserWindow } from 'electron'

import type { WindowController } from '../window-controller'

interface WindowIpcOptions {
  getWindow: () => BrowserWindow
  windowController: WindowController
  appWindowBackgroundColor: string
  nightAppWindowBackgroundColor: string
  titleBarOverlayColor: string
  nightTitleBarOverlayColor: string
  defaultTitleBarSymbolColor: string
  immersiveTitleBarSymbolColor: string
}

export function registerWindowIpc(options: WindowIpcOptions) {
  ipcMain.handle('window:start-drag', () => {
    options.windowController.startDrag(options.getWindow())
  })
  ipcMain.handle('window:stop-drag', () => {
    options.windowController.stopDrag()
  })
  ipcMain.handle('window:set-controls-light', (_event, light: boolean) => {
    const window = options.getWindow()
    window.setBackgroundColor(light ? options.nightAppWindowBackgroundColor : options.appWindowBackgroundColor)
    if (process.platform === 'win32') {
      window.setTitleBarOverlay({
        color: light ? options.nightTitleBarOverlayColor : options.titleBarOverlayColor,
        symbolColor: light ? options.immersiveTitleBarSymbolColor : options.defaultTitleBarSymbolColor,
        height: 32,
      })
    }
  })
  ipcMain.handle('window:set-full-screen', (_event, fullScreen: boolean) => {
    const window = options.getWindow()
    options.windowController.stopDrag()
    if (fullScreen && options.windowController.getMiniMode()) {
      options.windowController.exitMiniMode(window)
    }
    window.setFullScreen(fullScreen)
    options.windowController.emitFullScreenChange(window)
  })
  ipcMain.handle('window:get-full-screen', () => {
    return options.getWindow().isFullScreen()
  })
  ipcMain.handle('window:set-mini-mode', (_event, miniMode: boolean) => {
    const window = options.getWindow()
    if (miniMode) {
      options.windowController.enterMiniMode(window)
      return
    }

    options.windowController.exitMiniMode(window)
  })
  ipcMain.handle('window:get-mini-mode', () => {
    return options.windowController.getMiniMode()
  })
}
