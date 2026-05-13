import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { dialog, shell, type BrowserWindow, type MessageBoxOptions } from 'electron'

export async function trashPathIfExists(targetPath: string) {
  try {
    await stat(targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }

  await shell.trashItem(targetPath)
}

export function createMoveConflictResolver(getWindow: () => BrowserWindow | null) {
  return async (sourcePath: string, targetPath: string) => {
    const window = getWindow()
    const dialogOptions: MessageBoxOptions = {
      type: 'question',
      buttons: ['Replace', 'Keep Both', 'Skip'],
      defaultId: 1,
      cancelId: 2,
      message: `A file named "${basename(targetPath)}" already exists in the target folder.`,
      detail: sourcePath,
    }
    const result = window
      ? await dialog.showMessageBox(window, dialogOptions)
      : await dialog.showMessageBox(dialogOptions)

    return result.response === 0 ? 'replace' : result.response === 1 ? 'keep-both' : 'skip'
  }
}
