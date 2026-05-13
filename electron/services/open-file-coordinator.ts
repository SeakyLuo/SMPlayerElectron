import { existsSync } from 'node:fs'
import { extname } from 'node:path'

import type { BrowserWindow } from 'electron'

import { AUDIO_EXTENSIONS } from './constants'
import type { DataService } from './data-service'

interface ExternalAudioFileOpenerOptions {
  getLibraryService: () => DataService | null
  getWindow: () => BrowserWindow | null
  showWindow: () => void
}

export class OpenFileCoordinator {
  private pendingFilePaths: string[] = []
  private pendingSongIds: number[] = []

  enqueueFilePaths(filePaths: string[]) {
    this.pendingFilePaths = [...this.pendingFilePaths, ...filePaths]
  }

  enqueueSongIds(songIds: number[]) {
    this.pendingSongIds = [...this.pendingSongIds, ...songIds]
  }

  takeFilePaths() {
    const filePaths = this.pendingFilePaths
    this.pendingFilePaths = []
    return filePaths
  }

  takeSongIds() {
    const songIds = this.pendingSongIds
    this.pendingSongIds = []
    return songIds
  }
}

export class ExternalAudioFileOpener {
  private readonly coordinator = new OpenFileCoordinator()
  private readonly options: ExternalAudioFileOpenerOptions

  constructor(options: ExternalAudioFileOpenerOptions) {
    this.options = options
  }

  takePendingSongIds() {
    return this.coordinator.takeSongIds()
  }

  async openPendingFromArgv(argv: string[]) {
    await this.openFromShell([...this.coordinator.takeFilePaths(), ...argv])
  }

  async openFromShell(filePaths: string[]) {
    const audioFilePaths = getAudioFilePathsFromArgs(filePaths)

    if (audioFilePaths.length === 0) {
      return
    }

    const libraryService = this.options.getLibraryService()
    if (!libraryService) {
      this.coordinator.enqueueFilePaths(audioFilePaths)
      return
    }

    const songIds = await libraryService.externalAudioService.addNextAndPlay(audioFilePaths)
    this.coordinator.enqueueSongIds(songIds)
    this.options.getWindow()?.webContents.send('app:open-files', songIds)
    this.options.showWindow()
  }
}

function getAudioFilePathsFromArgs(args: string[]) {
  return args.filter((arg) =>
    AUDIO_EXTENSIONS.has(extname(arg).toLocaleLowerCase()) && existsSync(arg),
  )
}
