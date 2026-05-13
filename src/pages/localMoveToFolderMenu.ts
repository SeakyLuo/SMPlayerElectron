import type { MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import {
  getParentPath,
  normalizePath,
  type FolderNode,
} from './localFolderModel'

function getAbsoluteParentPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

export function buildLocalMoveToFolderMenuItems({
  nodes,
  songsById,
  songIds,
  folderPaths,
  t,
  onMoveToFolder,
}: {
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  songIds: number[]
  folderPaths: string[]
  t: Translator
  onMoveToFolder: (folder: FolderNode) => void
}) {
  const nodesByAbsolutePath = new Map([...nodes.values()].map((folder) => [normalizePath(folder.path), folder]))
  const songParentPaths = new Set(songIds.map((songId) => normalizePath(getAbsoluteParentPath(songsById.get(songId)!.path))))
  const sourceFolders = folderPaths.map((folderPath) => nodesByAbsolutePath.get(normalizePath(folderPath))!)

  const isTargetFolder = (folder: FolderNode) => {
    const normalizedFolderPath = normalizePath(folder.path)
    if (songParentPaths.has(normalizedFolderPath)) {
      return false
    }

    return sourceFolders.every((sourceFolder) =>
      folder.relativePath !== sourceFolder.relativePath &&
      folder.relativePath !== getParentPath(sourceFolder.relativePath),
    )
  }

  const getFolderMenuText = (folder: FolderNode) => folder.name || t('local.libraryRoot')

  const toTargetItem = (folder: FolderNode): MenuFlyoutItem => ({
    key: `move-folder-${folder.relativePath || 'root'}-target`,
    text: getFolderMenuText(folder),
    onClick: () => {
      onMoveToFolder(folder)
    },
  })

  const toTreeItem = (folder: FolderNode): MenuFlyoutItem | null => {
    const childItems = folder.childPaths
      .map((childPath) => toTreeItem(nodes.get(childPath)!))
      .filter((item): item is MenuFlyoutItem => item != null)

    if (childItems.length === 0) {
      return isTargetFolder(folder) ? toTargetItem(folder) : null
    }

    return {
      key: `move-folder-${folder.relativePath || 'root'}`,
      text: getFolderMenuText(folder),
      submenu: isTargetFolder(folder)
        ? [
            toTargetItem(folder),
            { key: `move-folder-${folder.relativePath || 'root'}-separator`, text: '', separator: true },
            ...childItems,
          ]
        : childItems,
    }
  }

  const rootItem = toTreeItem(nodes.get('')!)
  if (!rootItem) {
    return []
  }

  return rootItem.submenu ?? [rootItem]
}
