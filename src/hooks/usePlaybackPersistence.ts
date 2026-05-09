import { useCallback, useRef, type RefObject } from 'react'

import type { LibrarySnapshot, PlaybackMode, PlaybackSettingsUpdate } from '../shared/contracts'
import { currentIndex } from '../shared/mediaHelper'

interface PlaybackPersistenceOptions {
  snapshotRef: RefObject<LibrarySnapshot>
  currentTrackIdRef: RefObject<number | null>
  currentQueueIndexRef: RefObject<number | null>
  progressSecondsRef: RefObject<number>
  volumeRef: RefObject<number>
  isMutedRef: RefObject<boolean>
  modeRef: RefObject<PlaybackMode>
  getPlaybackSongIds: () => number[]
}

export function usePlaybackPersistence({
  snapshotRef,
  currentTrackIdRef,
  currentQueueIndexRef,
  progressSecondsRef,
  volumeRef,
  isMutedRef,
  modeRef,
  getPlaybackSongIds,
}: PlaybackPersistenceOptions) {
  const persistedDurationByTrackRef = useRef(new Map<number, number>())
  const settingsWriteQueueRef = useRef(Promise.resolve())

  const persistPlaybackSettings = useCallback(
    async (override: PlaybackSettingsUpdate = {}) => {
      if (!window.smplayer) {
        return
      }

      const lastMusicIndex =
        override.lastMusicIndex ?? currentIndex(getPlaybackSongIds(), currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
      const shouldSaveProgress = snapshotRef.current.settings.saveMusicProgress
      const nextMusicProgress = shouldSaveProgress
        ? override.musicProgress ?? progressSecondsRef.current
        : 0

      const update: PlaybackSettingsUpdate = {
        lastMusicIndex,
        volume: override.volume ?? volumeRef.current,
        isMuted: override.isMuted ?? isMutedRef.current,
        mode: override.mode ?? modeRef.current,
        musicProgress: nextMusicProgress,
      }

      settingsWriteQueueRef.current = settingsWriteQueueRef.current
        .catch(() => undefined)
        .then(() => window.smplayer?.savePlaybackSettings(update))
        .then(() => undefined)
      await settingsWriteQueueRef.current
    },
    [currentQueueIndexRef, currentTrackIdRef, getPlaybackSongIds, isMutedRef, modeRef, progressSecondsRef, snapshotRef, volumeRef],
  )

  const persistResolvedDuration = useCallback((trackId: number | null, duration: number) => {
    const nextDuration = Math.round(duration)

    if (!window.smplayer || trackId == null || !Number.isFinite(nextDuration) || nextDuration <= 0) {
      return
    }

    if (persistedDurationByTrackRef.current.get(trackId) === nextDuration) {
      return
    }

    persistedDurationByTrackRef.current.set(trackId, nextDuration)
    void window.smplayer.updateSongDuration(trackId, nextDuration)
  }, [])

  const markSongPlayed = useCallback(async (songId: number) => {
    if (window.smplayer) {
      await window.smplayer.markSongPlayed(songId)
    }
  }, [])

  return {
    persistPlaybackSettings,
    persistResolvedDuration,
    markSongPlayed,
  }
}
