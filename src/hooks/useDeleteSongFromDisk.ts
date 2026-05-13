import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

export function useDeleteSongFromDisk(t: Translator) {
  const deleteSongFromDisk = useLibraryStore((state) => state.deleteSongFromDisk)
  const undoDeleteSongFromDisk = useLibraryStore((state) => state.undoDeleteSongFromDisk)
  const commitDeleteSongFromDisk = useLibraryStore((state) => state.commitDeleteSongFromDisk)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)

  return async (song: LibrarySong) => {
    const pendingDelete = await deleteSongFromDisk(song.id)
    if (!pendingDelete) {
      return
    }

    showUndoableNotification(
      t('notification.deletedFromDisk', { title: song.title }),
      t('common.undo'),
      () => undoDeleteSongFromDisk(pendingDelete.id),
      5000,
      () => commitDeleteSongFromDisk(pendingDelete.id),
    )
  }
}
