import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { Notification, ipcMain, shell, type BrowserWindow } from 'electron'

import type { TrackNotificationPayload } from '../../src/shared/contracts'

interface ShellIpcOptions {
  getWindow: () => BrowserWindow | null
  createLocalFolder: (rootPath: string, relativePath: string, name: string) => Promise<void>
  sendFeedbackEmail: () => Promise<void>
  openFeedbackInBrowser: () => Promise<void>
  openVoiceAssistantPrivacySettings: () => Promise<void>
  recognizeWindowsSpeech: (language: string) => Promise<unknown>
  cancelWindowsSpeechRecognition: () => void
  revealSystemLogs: () => Promise<void>
  showNotifications: () => boolean
  getTrackNotificationBody: (songId: number) => Promise<string>
}

export function registerShellIpc(options: ShellIpcOptions) {
  ipcMain.handle('shell:reveal-item', async (_event, itemPath: string) => {
    await stat(itemPath)
    shell.showItemInFolder(itemPath)
  })
  ipcMain.handle('shell:create-local-folder', async (_event, rootPath: string, relativePath: string, name: string) => {
    await options.createLocalFolder(rootPath, relativePath, name)
  })
  ipcMain.handle('shell:send-feedback-email', () => options.sendFeedbackEmail())
  ipcMain.handle('shell:open-feedback-browser', () => options.openFeedbackInBrowser())
  ipcMain.handle('shell:open-voice-assistant-privacy-settings', () => options.openVoiceAssistantPrivacySettings())
  ipcMain.handle('voice:recognize', (_event, language: string) => options.recognizeWindowsSpeech(language))
  ipcMain.handle('voice:cancel-recognition', () => options.cancelWindowsSpeechRecognition())
  ipcMain.handle('shell:reveal-system-logs', () => options.revealSystemLogs())
  ipcMain.handle('shell:show-track-notification', async (_event, track: TrackNotificationPayload) => {
    if (!Notification.isSupported()) {
      return
    }

    if (!options.showNotifications()) {
      return
    }

    const lyricsPreview = await options.getTrackNotificationBody(track.songId)
    const defaultBody = [track.artist, track.album].filter(Boolean).join(' - ') || 'Simple Melody Player'

    const notification = new Notification({
      title: track.title,
      body: lyricsPreview || defaultBody,
      silent: false,
    })

    notification.on('click', () => {
      const window = options.getWindow()
      if (!window) {
        return
      }

      if (window.isMinimized()) {
        window.restore()
      }
      window.show()
      window.focus()
    })

    notification.show()
  })
}

export async function createLocalFolder(rootPath: string, relativePath: string, name: string) {
  await mkdir(join(rootPath, relativePath, name), { recursive: true })
}
