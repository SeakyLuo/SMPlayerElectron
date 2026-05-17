import {
  Menu,
  Tray,
  app,
  globalShortcut,
  nativeImage,
  type BrowserWindow,
  type JumpListCategory,
} from 'electron'
import { basename } from 'node:path'

import type { GlobalMediaCommand, PreferredLanguage, TrayCommand } from '../src/shared/contracts'
import { createTranslator } from '../src/shared/i18n'

const windowsJumpListRecentLimit = 10

interface TrayControllerOptions {
  getWindow: () => BrowserWindow | null
  getAppIconPath: () => string
  getPreferredLanguage: () => PreferredLanguage
  getRecentPlayedSongPaths: (limit: number) => string[]
  hideWindow: () => void
  showWindow: () => void
  openAppRoute: (route: string) => void
  sendTrayCommand: (command: TrayCommand) => void
  requestQuit: () => void
}

export class TrayController {
  private readonly options: TrayControllerOptions
  private tray: Tray | null = null
  private isPlaying = false

  constructor(options: TrayControllerOptions) {
    this.options = options
  }

  createTray() {
    if (this.tray) {
      return
    }

    this.tray = new Tray(this.getTrayIcon())
    this.tray.on('double-click', () => {
      this.toggleWindowVisibility()
    })
    this.tray.on('click', () => {
      this.toggleWindowVisibility()
    })

    this.updateMenu()
  }

  updateMenu() {
    if (!this.tray) {
      return
    }

    const window = this.options.getWindow()
    const isWindowVisible = Boolean(window?.isVisible())
    const t = createTranslator(this.options.getPreferredLanguage(), app.getLocale())
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isWindowVisible ? t('tray.hideWindow') : t('tray.showWindow'),
        click: () => {
          this.toggleWindowVisibility()
        },
      },
      { type: 'separator' },
      {
        label: this.isPlaying ? t('player.pause') : t('player.play'),
        click: () => {
          this.sendGlobalMediaCommand('play-pause')
        },
      },
      {
        label: t('player.previous'),
        click: () => {
          this.sendGlobalMediaCommand('previous')
        },
      },
      {
        label: t('player.next'),
        click: () => {
          this.sendGlobalMediaCommand('next')
        },
      },
      {
        label: t('nowPlaying.quickPlay'),
        click: () => {
          this.options.sendTrayCommand('quick-play')
        },
      },
      { type: 'separator' },
      {
        label: t('common.settings'),
        click: () => {
          this.options.openAppRoute('/settings')
        },
      },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => {
          this.options.requestQuit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
    this.tray.setToolTip(t('app.shell'))
  }

  setPlaybackState(isPlaying: boolean) {
    if (this.isPlaying === isPlaying) {
      return
    }

    this.isPlaying = isPlaying
    this.updateMenu()
  }

  updateWindowsJumpList() {
    if (process.platform !== 'win32') {
      return
    }

    const t = createTranslator(this.options.getPreferredLanguage(), app.getLocale())
    const recentSongPaths = this.options.getRecentPlayedSongPaths(windowsJumpListRecentLimit)
    app.clearRecentDocuments()
    for (const filePath of recentSongPaths) {
      app.addRecentDocument(filePath)
    }

    const categories: JumpListCategory[] = recentSongPaths.length > 0
      ? [{
          type: 'custom',
          name: t('common.recent'),
          items: recentSongPaths.map((filePath) => ({
            type: 'task',
            title: basename(filePath),
            description: filePath,
            program: process.execPath,
            args: quoteWindowsArgument(filePath),
            iconPath: this.options.getAppIconPath(),
            iconIndex: 0,
          })),
        }]
      : []

    app.setJumpList(categories)
  }

  sendGlobalMediaCommand(command: GlobalMediaCommand) {
    const window = this.options.getWindow()
    if (!window || window.webContents.isDestroyed()) {
      return
    }

    window.webContents.send('playback:global-media-command', command)
  }

  registerGlobalMediaShortcuts() {
    const shortcuts: Array<[string, GlobalMediaCommand]> = [
      ['MediaPlayPause', 'play-pause'],
      ['MediaNextTrack', 'next'],
      ['MediaPreviousTrack', 'previous'],
      ['MediaStop', 'stop'],
    ]

    for (const [accelerator, command] of shortcuts) {
      globalShortcut.register(accelerator, () => {
        this.sendGlobalMediaCommand(command)
      })
    }
  }

  unregisterGlobalMediaShortcuts() {
    globalShortcut.unregisterAll()
  }

  private toggleWindowVisibility() {
    const window = this.options.getWindow()
    if (window?.isVisible()) {
      this.options.hideWindow()
    } else {
      this.options.showWindow()
    }
  }

  private getTrayIcon() {
    const icon = nativeImage.createFromPath(this.options.getAppIconPath())

    if (process.platform === 'win32') {
      return icon.resize({ width: 16, height: 16 })
    }

    return icon.resize({ width: 18, height: 18 })
  }
}

function quoteWindowsArgument(value: string) {
  return `"${value}"`
}
