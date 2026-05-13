import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

export function useDeleteLocalItems(t: Translator) {
  const deleteLocalItems = useLibraryStore((state) => state.deleteLocalItems)
  const undoDeleteSongFromDisk = useLibraryStore((state) => state.undoDeleteSongFromDisk)
  const commitDeleteSongFromDisk = useLibraryStore((state) => state.commitDeleteSongFromDisk)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)

  return async (songIds: number[], folderPaths: string[]) => {
    const pendingDelete = await deleteLocalItems(songIds, folderPaths)
    if (!pendingDelete) {
      return
    }

    showUndoableNotification(
      t('notification.deletedLocalItems', { count: songIds.length + folderPaths.length }),
      t('common.undo'),
      () => undoDeleteSongFromDisk(pendingDelete.id),
      5000,
      () => commitDeleteSongFromDisk(pendingDelete.id),
    )
  }
}
