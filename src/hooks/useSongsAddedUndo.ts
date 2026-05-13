import { useMemo } from 'react'

import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

export function useSongsAddedUndo(songs: LibrarySong[], t: Translator) {
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)

  const getSongsAddedMessage = (songIds: number[], target: string) =>
    songIds.length === 1
      ? t('notification.songAddedTo', { title: songsById.get(songIds[0]!)!.title, target })
      : t('notification.songsAddedTo', { count: songIds.length, target })

  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }

  return {
    addToNowPlayingWithUndo: (songIds: number[]) => {
      const insertedIndex = nowPlayingSongIds.length
      void replaceNowPlaying([...nowPlayingSongIds, ...songIds])
      showUndo(getSongsAddedMessage(songIds, t('common.nowPlaying')), () =>
        replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, songIds.length)),
      )
    },
    showAddToPlaylistUndo: (playlistId: number, songIds: number[], target: string) => {
      showUndo(getSongsAddedMessage(songIds, target), () => removeSongsFromPlaylist(playlistId, songIds))
    },
  }
}
