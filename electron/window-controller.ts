import { screen, type BrowserWindow, type Rectangle } from 'electron'

const defaultWindowMinimumSize = { width: 506, height: 740 }
const miniModeWindowSize = { width: 360, height: 360 }

export class WindowController {
  private windowDragInterval: NodeJS.Timeout | null = null
  private isMiniMode = false
  private boundsBeforeMiniMode: Rectangle | null = null
  private wasMaximizedBeforeMiniMode = false

  getDefaultMinimumSize() {
    return defaultWindowMinimumSize
  }

  startDrag(window: BrowserWindow) {
    if (window.isDestroyed() || window.isMaximized()) {
      return
    }

    this.stopDrag()
    const startCursor = screen.getCursorScreenPoint()
    const startBounds = window.getBounds()

    this.windowDragInterval = setInterval(() => {
      if (window.isDestroyed()) {
        this.stopDrag()
        return
      }

      const cursor = screen.getCursorScreenPoint()
      window.setBounds({
        ...startBounds,
        x: Math.round(startBounds.x + cursor.x - startCursor.x),
        y: Math.round(startBounds.y + cursor.y - startCursor.y),
      })
    }, 16)
  }

  stopDrag() {
    if (this.windowDragInterval) {
      clearInterval(this.windowDragInterval)
      this.windowDragInterval = null
    }
  }

  emitFullScreenChange(window: BrowserWindow) {
    if (window.isDestroyed()) {
      return
    }

    window.webContents.send('window:full-screen-change', window.isFullScreen())
  }

  emitMiniModeChange(window: BrowserWindow) {
    if (window.isDestroyed()) {
      return
    }

    window.webContents.send('window:mini-mode-change', this.isMiniMode)
  }

  enterMiniMode(window: BrowserWindow) {
    this.stopDrag()

    if (!this.isMiniMode) {
      this.wasMaximizedBeforeMiniMode = window.isMaximized()
      if (this.wasMaximizedBeforeMiniMode) {
        window.unmaximize()
      }
      this.boundsBeforeMiniMode = window.getBounds()
    }

    if (window.isFullScreen()) {
      window.setFullScreen(false)
      this.emitFullScreenChange(window)
    }

    const currentBounds = window.getBounds()
    const workArea = screen.getDisplayMatching(currentBounds).workArea
    const x = Math.max(
      workArea.x,
      Math.min(currentBounds.x + currentBounds.width - miniModeWindowSize.width, workArea.x + workArea.width - miniModeWindowSize.width),
    )
    const y = Math.max(
      workArea.y,
      Math.min(currentBounds.y, workArea.y + workArea.height - miniModeWindowSize.height),
    )

    this.isMiniMode = true
    window.setMinimumSize(miniModeWindowSize.width, miniModeWindowSize.height)
    window.setBounds({ x, y, ...miniModeWindowSize }, true)
    window.setResizable(true)
    window.setMaximizable(false)
    window.setAlwaysOnTop(true, 'floating')
    this.emitMiniModeChange(window)
  }

  exitMiniMode(window: BrowserWindow) {
    this.stopDrag()
    this.isMiniMode = false
    window.setAlwaysOnTop(false)
    window.setResizable(true)
    window.setMaximizable(true)
    window.setMinimumSize(defaultWindowMinimumSize.width, defaultWindowMinimumSize.height)

    if (this.boundsBeforeMiniMode) {
      window.setBounds(this.boundsBeforeMiniMode, true)
    }
    if (this.wasMaximizedBeforeMiniMode) {
      window.maximize()
    }

    this.boundsBeforeMiniMode = null
    this.wasMaximizedBeforeMiniMode = false
    this.emitMiniModeChange(window)
  }

  getMiniMode() {
    return this.isMiniMode
  }
}
