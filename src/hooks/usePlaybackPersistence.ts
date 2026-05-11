import { useCallback, useRef, type RefObject } from 'react'

import type { LibrarySnapshot, PlaybackSettingsUpdate } from '../shared/contracts'
import { currentIndex } from '../shared/mediaHelper'

interface PlaybackPersistenceOptions {
  snapshotRef: RefObject<LibrarySnapshot>
  currentTrackIdRef: RefObject<number | null>
  currentQueueIndexRef: RefObject<number | null>
  progressSecondsRef: RefObject<number>
  getPlaybackSongIds: () => number[]
}

export function usePlaybackPersistence({
  snapshotRef,
  currentTrackIdRef,
  currentQueueIndexRef,
  progressSecondsRef,
  getPlaybackSongIds,
}: PlaybackPersistenceOptions) {
  const persistedDurationByTrackRef = useRef(new Map<number, number>())
  const settingsWriteQueueRef = useRef(Promise.resolve())

  const persistPlaybackSettings = useCallback(
    async (override: PlaybackSettingsUpdate = {}) => {
      if (!window.smplayer) {
        return
      }

      const update: PlaybackSettingsUpdate = {
      }
      if ('musicProgress' in override || 'lastMusicIndex' in override) {
        update.lastMusicIndex =
          override.lastMusicIndex ?? currentIndex(getPlaybackSongIds(), currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
      }
      if ('musicProgress' in override) {
        update.musicProgress = snapshotRef.current.settings.saveMusicProgress
          ? override.musicProgress ?? progressSecondsRef.current
          : 0
      }
      if ('volume' in override) {
        update.volume = override.volume
      }
      if ('isMuted' in override) {
        update.isMuted = override.isMuted
      }
      if ('mode' in override) {
        update.mode = override.mode
      }

      const shouldPersistImmediately = 'volume' in update || 'isMuted' in update || 'mode' in update
      const hasPlaybackPositionUpdate = 'lastMusicIndex' in update || 'musicProgress' in update
      if (shouldPersistImmediately && !hasPlaybackPositionUpdate) {
        window.smplayer.savePlaybackSettingsImmediate(update)
        return
      }

      settingsWriteQueueRef.current = settingsWriteQueueRef.current
        .catch(() => undefined)
        .then(() => window.smplayer?.savePlaybackSettings(update))
        .then(() => undefined)
      await settingsWriteQueueRef.current
    },
    [currentQueueIndexRef, currentTrackIdRef, getPlaybackSongIds, progressSecondsRef, snapshotRef],
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
