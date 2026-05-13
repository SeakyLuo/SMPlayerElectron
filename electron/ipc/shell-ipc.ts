import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { Notification, app, ipcMain, shell, type BrowserWindow } from 'electron'

import type { TrackNotificationPayload } from '../../src/shared/contracts'

interface ShellIpcOptions {
  getWindow: () => BrowserWindow | null
  recognizeWindowsSpeech: (language: string) => Promise<unknown>
  cancelWindowsSpeechRecognition: () => void
  showNotifications: () => boolean
  getTrackNotificationBody: (songId: number) => Promise<string>
}

const feedbackIssueUrl = 'https://github.com/SeakyLuo/SMPlayerEletron/issues'
const feedbackEmailAddress = 'luokiss9@qq.com'
const feedbackEmailSubject = 'Feedback about Simple Melody Player'

export function registerShellIpc(options: ShellIpcOptions) {
  ipcMain.handle('shell:reveal-item', async (_event, itemPath: string) => {
    await stat(itemPath)
    shell.showItemInFolder(itemPath)
  })
  ipcMain.handle('shell:create-local-folder', async (_event, rootPath: string, relativePath: string, name: string) => {
    await createLocalFolder(rootPath, relativePath, name)
  })
  ipcMain.handle('shell:send-feedback-email', () => sendFeedbackEmail())
  ipcMain.handle('shell:open-feedback-browser', () => openFeedbackInBrowser())
  ipcMain.handle('shell:open-voice-assistant-privacy-settings', () => openVoiceAssistantPrivacySettings())
  ipcMain.handle('voice:recognize', (_event, language: string) => options.recognizeWindowsSpeech(language))
  ipcMain.handle('voice:cancel-recognition', () => options.cancelWindowsSpeechRecognition())
  ipcMain.handle('shell:reveal-system-logs', () => revealSystemLogs())
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

async function createLocalFolder(rootPath: string, relativePath: string, name: string) {
  await mkdir(join(rootPath, relativePath, name), { recursive: true })
}

async function sendFeedbackEmail() {
  const mailtoUrl = new URL(`mailto:${feedbackEmailAddress}`)
  mailtoUrl.searchParams.set('subject', feedbackEmailSubject)
  await shell.openExternal(mailtoUrl.toString())
}

async function openFeedbackInBrowser() {
  await shell.openExternal(feedbackIssueUrl)
}

async function openVoiceAssistantPrivacySettings() {
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:privacy-speech')
    return
  }

  await shell.openExternal(process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    : 'https://support.microsoft.com/windows/manage-app-permissions-for-your-microphone-in-windows',
  )
}

async function revealSystemLogs() {
  const logsPath = join(app.getPath('userData'), 'Logs')
  await mkdir(logsPath, { recursive: true })
  shell.openPath(logsPath)
}
