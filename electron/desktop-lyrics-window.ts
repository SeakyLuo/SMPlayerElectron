import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type {
  DesktopLyricsBounds,
  DesktopLyricsCommand,
  DesktopLyricsDisplayState,
  SettingsSnapshot,
} from '../src/shared/contracts'
import { createTranslator } from '../src/shared/i18n'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultBounds = { width: 760, height: 118 }

interface DesktopLyricsWindowControllerOptions {
  getSettings: () => SettingsSnapshot
  getAppIconPath: () => string
  saveBounds: (bounds: DesktopLyricsBounds) => void
  sendCommand: (command: DesktopLyricsCommand) => void
}

export class DesktopLyricsWindowController {
  private readonly options: DesktopLyricsWindowControllerOptions
  private window: BrowserWindow | null = null
  private state: DesktopLyricsDisplayState | null = null

  constructor(options: DesktopLyricsWindowControllerOptions) {
    this.options = options
  }

  async updateState(state: DesktopLyricsDisplayState) {
    this.state = state
    if (!this.options.getSettings().desktopLyricsEnabled || !state.visible) {
      this.hide()
      return
    }

    await this.ensureWindow()
    this.applyLockedState(state.locked)
    this.window!.webContents.send('desktop-lyrics:state', state)
    if (!this.window!.isVisible()) {
      this.window!.showInactive()
    }
  }

  requestCommand(command: DesktopLyricsCommand) {
    this.options.sendCommand(command)
  }

  hide() {
    this.window?.hide()
  }

  close() {
    this.window?.close()
    this.window = null
  }

  private async ensureWindow() {
    if (this.window) {
      return
    }

    const settings = this.options.getSettings()
    const t = createTranslator(settings.preferredLanguage, app.getLocale())
    const window = new BrowserWindow({
      ...resolveInitialBounds(settings.desktopLyricsBounds),
      minWidth: 420,
      minHeight: 86,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      autoHideMenuBar: true,
      backgroundColor: '#00000000',
      title: t('settings.desktopLyrics'),
      icon: this.options.getAppIconPath(),
      webPreferences: {
        contextIsolation: true,
        preload: join(__dirname, 'preload.mjs'),
        additionalArguments: [
          '--smplayer-desktop-lyrics=1',
        ],
      },
    })

    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window = window

    window.on('moved', () => this.saveCurrentBounds())
    window.on('resized', () => this.saveCurrentBounds())
    window.on('closed', () => {
      this.window = null
    })
    window.webContents.once('did-finish-load', () => {
      if (this.state) {
        window.webContents.send('desktop-lyrics:state', this.state)
      }
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL)
      devServerUrl.searchParams.set('desktopLyrics', '1')
      await window.loadURL(devServerUrl.toString())
      return
    }

    const indexUrl = pathToFileURL(join(__dirname, '../dist/index.html'))
    indexUrl.searchParams.set('desktopLyrics', '1')
    await window.loadURL(indexUrl.toString())
  }

  private applyLockedState(locked: boolean) {
    const window = this.window!
    window.setResizable(!locked)
    window.setMovable(!locked)
    window.setIgnoreMouseEvents(false)
  }

  private saveCurrentBounds() {
    const window = this.window
    if (!window) {
      return
    }

    this.options.saveBounds(window.getBounds())
  }
}

function resolveInitialBounds(rawBounds: string): Rectangle {
  const display = screen.getPrimaryDisplay().workArea
  const parsedBounds = parseBounds(rawBounds)
  if (parsedBounds) {
    return parsedBounds
  }

  return {
    width: defaultBounds.width,
    height: defaultBounds.height,
    x: Math.round(display.x + (display.width - defaultBounds.width) / 2),
    y: Math.round(display.y + display.height - defaultBounds.height - 120),
  }
}

function parseBounds(rawBounds: string): Rectangle | null {
  if (!rawBounds) {
    return null
  }

  const value = JSON.parse(rawBounds) as Partial<DesktopLyricsBounds>
  if (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  ) {
    return {
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    }
  }

  return null
}
