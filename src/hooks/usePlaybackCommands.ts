import { useMemo } from 'react'

import type { PlaybackMode } from '../shared/contracts'
import {
  addNextAndPlay as buildAddNextAndPlayQueue,
  moveToMusicOrPlay as buildMoveToMusicOrPlayQueue,
  playNext as buildPlayNextQueue,
  setMusicAndPlayFromPlaylist,
} from '../shared/mediaHelper'
import { createTranslator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

interface PlaybackCommandRuntime {
  playTrack: (trackId: number, queueSongIds?: number[], queueIndex?: number) => Promise<void>
  currentTrackId: number | null
  currentQueueIndex: number | null
  mode: PlaybackMode
}

export interface PlaybackCommands {
  playTrackInQueue: (trackId: number, queueSongIds: number[], queueIndex?: number) => Promise<void>
  playTrack: (trackId: number, queueSongIds?: number[], queueIndex?: number) => Promise<void>
  playNext: (songId: number, queueIndex?: number) => Promise<void>
  addNextAndPlay: (songId: number) => Promise<void>
  moveToMusicOrPlay: (songId: number, queueIndex?: number) => Promise<void>
  setMusicAndPlay: (songIds: number[]) => Promise<void>
  playOrAddNext: (songId: number) => Promise<void>
}

function sameSongIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((songId, index) => songId === right[index])
}

export function usePlaybackCommands(runtime: PlaybackCommandRuntime): PlaybackCommands {
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const { currentQueueIndex, currentTrackId, mode, playTrack: playRuntimeTrack } = runtime

  return useMemo(() => {
    const playTrackInQueue = async (trackId: number, queueSongIds: number[], queueIndex = -1) => {
      const nextQueue = setMusicAndPlayFromPlaylist(
        nowPlayingSongIds,
        queueSongIds,
        trackId,
        mode === 'shuffle',
        queueIndex,
      )

      await replaceNowPlaying(nextQueue.songIds)
      if (nextQueue.trackId != null) {
        await playRuntimeTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
      }
    }

    const playTrack = async (trackId: number, queueSongIds?: number[], queueIndex = -1) => {
      await playRuntimeTrack(trackId, queueSongIds, queueIndex)
    }

    const playNext = async (songId: number, queueIndex = -1) => {
      const previousSongIds = nowPlayingSongIds
      const nextSongIds = buildPlayNextQueue(
        nowPlayingSongIds,
        songId,
        currentTrackId,
        queueIndex,
        currentQueueIndex ?? -1,
      )
      if (sameSongIds(previousSongIds, nextSongIds)) {
        return
      }

      await replaceNowPlaying(nextSongIds)

      const snapshot = useLibraryStore.getState().snapshot
      const t = createTranslator(snapshot.settings.preferredLanguage)
      const song = snapshot.songs.find((item) => item.id === songId)!
      showUndoableNotification(t('notification.playNext', { title: song.title }), t('common.undo'), () =>
        replaceNowPlaying(previousSongIds),
      )
    }

    const addNextAndPlay = async (songId: number) => {
      const nextQueue = buildAddNextAndPlayQueue(
        nowPlayingSongIds,
        songId,
        currentTrackId,
        currentQueueIndex ?? -1,
      )

      await replaceNowPlaying(nextQueue.songIds)
      if (nextQueue.trackId != null) {
        await playRuntimeTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
      }
    }

    const moveToMusicOrPlay = async (songId: number, queueIndex = -1) => {
      const nextQueue = buildMoveToMusicOrPlayQueue(
        nowPlayingSongIds,
        songId,
        queueIndex,
        currentTrackId,
        currentQueueIndex ?? -1,
      )

      await replaceNowPlaying(nextQueue.songIds)
      if (nextQueue.trackId != null) {
        await playRuntimeTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
      }
    }

    const setMusicAndPlay = async (songIds: number[]) => {
      await replaceNowPlaying(songIds)
      if (songIds[0] != null) {
        await playRuntimeTrack(songIds[0], songIds, 0)
      }
    }

    const playOrAddNext = async (songId: number) => {
      if (nowPlayingSongIds.includes(songId)) {
        await playRuntimeTrack(songId, nowPlayingSongIds)
        return
      }

      await addNextAndPlay(songId)
    }

    return {
      playTrackInQueue,
      playTrack,
      playNext,
      addNextAndPlay,
      moveToMusicOrPlay,
      setMusicAndPlay,
      playOrAddNext,
    }
  }, [
    nowPlayingSongIds,
    currentQueueIndex,
    currentTrackId,
    mode,
    playRuntimeTrack,
    replaceNowPlaying,
    showUndoableNotification,
  ])
}
