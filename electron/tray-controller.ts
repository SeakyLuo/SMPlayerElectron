import {
  Menu,
  Tray,
  app,
  globalShortcut,
  nativeImage,
  shell,
  type BrowserWindow,
  type JumpListCategory,
} from 'electron'

import type { GlobalMediaCommand, PreferredLanguage } from '../src/shared/contracts'
import { createTranslator } from '../src/shared/i18n'

const windowsJumpListRecentLimit = 10
const appDisplayName = 'Simple Melody Player'

interface TrayControllerOptions {
  getWindow: () => BrowserWindow | null
  getAppIconPath: () => string
  getRootPath: () => string
  getPreferredLanguage: () => PreferredLanguage
  getRecentPlayedSongPaths: (limit: number) => string[]
  hideWindow: () => void
  showWindow: () => void
  openAppRoute: (route: string) => void
  sendTrayCommand: (command: 'scan-library') => void
  requestQuit: () => void
}

export class TrayController {
  private readonly options: TrayControllerOptions
  private tray: Tray | null = null

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
    const rootPath = this.options.getRootPath()
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isWindowVisible ? 'Hide window' : 'Show window',
        click: () => {
          this.toggleWindowVisibility()
        },
      },
      { type: 'separator' },
      {
        label: 'Play/Pause',
        click: () => {
          this.sendGlobalMediaCommand('play-pause')
        },
      },
      {
        label: 'Previous',
        click: () => {
          this.sendGlobalMediaCommand('previous')
        },
      },
      {
        label: 'Next',
        click: () => {
          this.sendGlobalMediaCommand('next')
        },
      },
      {
        label: 'Stop',
        click: () => {
          this.sendGlobalMediaCommand('stop')
        },
      },
      { type: 'separator' },
      {
        label: 'Open library folder',
        enabled: Boolean(rootPath),
        click: () => {
          void shell.openPath(rootPath)
        },
      },
      {
        label: 'Scan library',
        enabled: Boolean(rootPath),
        click: () => {
          this.options.sendTrayCommand('scan-library')
        },
      },
      {
        label: 'Settings',
        click: () => {
          this.options.openAppRoute('/settings')
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.options.requestQuit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
    this.tray.setToolTip(appDisplayName)
  }

  updateWindowsJumpList() {
    if (process.platform !== 'win32') {
      return
    }

    const t = createTranslator(this.options.getPreferredLanguage(), app.getLocale())
    const canUseRecentFileCategory = app.isPackaged &&
      !process.env.PORTABLE_EXECUTABLE_DIR &&
      !process.env.PORTABLE_EXECUTABLE_FILE
    const recentFileItems = canUseRecentFileCategory
      ? this.options.getRecentPlayedSongPaths(windowsJumpListRecentLimit).map((filePath) => ({
          type: 'file' as const,
          path: filePath,
        }))
      : []
    const categories: JumpListCategory[] = [
      ...(recentFileItems.length > 0
        ? [{
            type: 'custom' as const,
            name: t('common.recent'),
            items: recentFileItems,
          }]
        : []),
      {
        type: 'tasks',
        items: [{
          type: 'task',
          title: t('app.shell'),
          description: t('app.shell'),
          program: process.execPath,
          args: '--smplayer-show-window',
          iconPath: this.options.getAppIconPath(),
          iconIndex: 0,
        }],
      },
    ]

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
