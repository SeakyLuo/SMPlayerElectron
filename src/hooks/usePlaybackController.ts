import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { LibrarySnapshot, LibrarySong, PlaybackMode } from '../shared/contracts'
import {
  currentIndex,
  moveNext,
  movePrev,
  normalizeQueueSongIds,
  samePlaylist,
  shuffleOthers,
} from '../shared/mediaHelper'
import { getNextRecoverableTrackId } from '../shared/playbackRecovery'
import { createTranslator } from '../shared/i18n'
import { setPlaybackProgress, usePlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackAudioElement } from './usePlaybackAudioElement'
import { updateMediaSessionPosition, useMediaSession } from './useMediaSession'
import { usePlaybackPersistence } from './usePlaybackPersistence'
import { usePlaybackShortcuts } from './usePlaybackShortcuts'

interface PlaybackController {
  currentTrack: LibrarySong | null
  currentTrackId: number | null
  currentQueueIndex: number | null
  status: PlaybackStatus
  isPlaying: boolean
  progressSeconds: number
  durationSeconds: number
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playTrack: (trackId: number, queueSongIds?: number[], queueIndex?: number) => Promise<void>
  togglePlayPause: () => Promise<void>
  playNext: () => Promise<void>
  playPrevious: () => Promise<void>
  seekToRatio: (ratio: number) => void
  seekToSeconds: (seconds: number) => void
  beginSeek: () => void
  endSeek: () => void
  seekBySeconds: (offsetSeconds: number) => void
  setVolumeLevel: (volume: number) => void
  toggleMute: () => void
  setMuted: (muted: boolean) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  toggleRepeatOne: () => void
  cycleRepeatMode: () => void
}

interface LoadTrackOptions {
  autoplay: boolean
  startAt: number
  queueIndex?: number
}

type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'seeking'

const PLAYBACK_STALL_TIMEOUT_MS = 8_000
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.05

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function usePlaybackController(snapshot: LibrarySnapshot): PlaybackController {
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedTrackIdRef = useRef<number | null>(null)
  const pendingStartSecondsRef = useRef(0)
  const pendingAutoplayRef = useRef(false)
  const hydratedRef = useRef(false)
  const queueOverrideRef = useRef<number[] | null>(null)
  const queueSongIdsRef = useRef<number[]>([])
  const wasPlayingBeforeSeekRef = useRef(false)
  const isUserSeekingRef = useRef(false)
  const pendingSeekSecondsRef = useRef<number | null>(null)
  const statusRef = useRef<PlaybackStatus>('idle')
  const stalledTimerRef = useRef<number | null>(null)
  const progressSyncTimerRef = useRef<number | null>(null)
  const stalledProgressStartedAtRef = useRef<number | null>(null)
  const stalledProgressSecondsRef = useRef(0)
  const failedTrackIdsRef = useRef(new Set<number>())
  const retriedTrackIdsRef = useRef(new Set<number>())
  const recoverFromPlaybackFailureRef = useRef<() => Promise<void>>(async () => {})
  const loadTrackRef = useRef<(trackId: number, options: LoadTrackOptions) => Promise<void>>(
    async () => {},
  )

  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number | null>(null)
  const [status, setStatusState] = useState<PlaybackStatus>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(72)
  const [isMuted, setIsMuted] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('once')

  const snapshotRef = useRef(snapshot)
  const currentTrackIdRef = useRef(currentTrackId)
  const currentQueueIndexRef = useRef<number | null>(currentQueueIndex)
  const isPlayingRef = useRef(isPlaying)
  const progressSecondsRef = useRef(0)
  const durationSecondsRef = useRef(0)
  const volumeRef = useRef(volume)
  const isMutedRef = useRef(isMuted)
  const modeRef = useRef(mode)

  const snapshotQueueSongIds = normalizeQueueSongIds(snapshot.nowPlaying.songIds, snapshot.songs)

  const setStatus = useCallback((nextStatus: PlaybackStatus) => {
    statusRef.current = nextStatus
    setStatusState(nextStatus)
  }, [])

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    currentTrackIdRef.current = currentTrackId
    currentQueueIndexRef.current = currentQueueIndex
    statusRef.current = status
    isPlayingRef.current = isPlaying
    volumeRef.current = volume
    isMutedRef.current = isMuted
    modeRef.current = mode

      if (
      queueOverrideRef.current &&
      samePlaylist(queueOverrideRef.current, snapshotQueueSongIds)
    ) {
      queueOverrideRef.current = null
    }

    queueSongIdsRef.current = queueOverrideRef.current ?? snapshotQueueSongIds
  }, [
    currentTrackId,
    currentQueueIndex,
    isMuted,
    isPlaying,
    mode,
    snapshot,
    snapshotQueueSongIds,
    status,
    volume,
  ])

  const currentTrack =
    currentTrackId == null
      ? null
      : snapshot.songs.find((song) => song.id === currentTrackId) ?? null

  const getPlaybackSongIds = useCallback(() => queueSongIdsRef.current, [])
  const getSeekableDuration = useCallback(() => {
    const audio = audioRef.current
    const audioDuration = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
    const trackDuration =
      currentTrackIdRef.current == null
        ? 0
        : snapshotRef.current.songs.find((song) => song.id === currentTrackIdRef.current)?.duration ?? 0

    return durationSecondsRef.current || audioDuration || trackDuration
  }, [])
  const { persistPlaybackSettings, persistResolvedDuration, markSongPlayed } = usePlaybackPersistence({
    snapshotRef,
    currentTrackIdRef,
    currentQueueIndexRef,
    progressSecondsRef,
    volumeRef,
    isMutedRef,
    modeRef,
    getPlaybackSongIds,
  })

  const clearStalledTimer = useCallback(() => {
    if (stalledTimerRef.current != null) {
      window.clearTimeout(stalledTimerRef.current)
      stalledTimerRef.current = null
    }
  }, [])

  const stopProgressSync = useCallback(() => {
    if (progressSyncTimerRef.current != null) {
      window.clearInterval(progressSyncTimerRef.current)
      progressSyncTimerRef.current = null
    }
  }, [])

  const updateProgressFromAudio = useCallback((force = false) => {
    const audio = audioRef.current
    if (!audio || isUserSeekingRef.current) {
      return
    }

    const nextProgressSeconds = audio.currentTime
    if (pendingSeekSecondsRef.current != null && Math.abs(nextProgressSeconds - pendingSeekSecondsRef.current) > 0.25) {
      return
    }

    pendingSeekSecondsRef.current = null
    if (!force && Math.abs(nextProgressSeconds - progressSecondsRef.current) < 0.2) {
      return
    }

    progressSecondsRef.current = nextProgressSeconds
    setPlaybackProgress({ progressSeconds: nextProgressSeconds })
    updateMediaSessionPosition(durationSecondsRef.current, nextProgressSeconds)
  }, [])

  const setProgressFromPlayback = useCallback((nextProgressSeconds: number) => {
    progressSecondsRef.current = nextProgressSeconds
    setPlaybackProgress({ progressSeconds: nextProgressSeconds })
    updateMediaSessionPosition(durationSecondsRef.current, nextProgressSeconds)
  }, [])

  const setDurationFromPlayback = useCallback((nextDurationSeconds: number) => {
    durationSecondsRef.current = nextDurationSeconds
    setPlaybackProgress({ durationSeconds: nextDurationSeconds })
    updateMediaSessionPosition(nextDurationSeconds, progressSecondsRef.current)
  }, [])

  const startProgressSync = useCallback(() => {
    stopProgressSync()
    updateProgressFromAudio(true)
    stalledProgressStartedAtRef.current = null
    stalledProgressSecondsRef.current = audioRef.current?.currentTime ?? 0
    progressSyncTimerRef.current = window.setInterval(() => {
      updateProgressFromAudio()
      const audio = audioRef.current
      if (!audio || audio.paused || audio.ended || isUserSeekingRef.current) {
        stalledProgressStartedAtRef.current = null
        stalledProgressSecondsRef.current = audio?.currentTime ?? 0
        return
      }

      const nextProgressSeconds = audio.currentTime
      if (Math.abs(nextProgressSeconds - stalledProgressSecondsRef.current) > PLAYBACK_PROGRESS_EPSILON_SECONDS) {
        stalledProgressSecondsRef.current = nextProgressSeconds
        stalledProgressStartedAtRef.current = null
        if (currentTrackIdRef.current != null) {
          retriedTrackIdsRef.current.delete(currentTrackIdRef.current)
        }
        return
      }

      stalledProgressStartedAtRef.current ??= Date.now()
      if (Date.now() - stalledProgressStartedAtRef.current >= PLAYBACK_STALL_TIMEOUT_MS) {
        stalledProgressStartedAtRef.current = null
        const t = createTranslator(snapshotRef.current.settings.preferredLanguage)
        useUndoableNotificationStore.getState().show(
          t('notification.playbackStalled'),
          t('common.close'),
          () => {},
          4000,
        )
        setStatus('buffering')
        void recoverFromPlaybackFailureRef.current()
      }
    }, 500)
  }, [setStatus, stopProgressSync, updateProgressFromAudio])

  const recoverFromPlaybackFailure = useCallback(
    async () => {
      clearStalledTimer()

      const audio = audioRef.current
      const activeTrackId = currentTrackIdRef.current

      if (audio) {
        audio.pause()
      }

      setIsPlaying(false)

      if (activeTrackId != null) {
        const retryProgressSeconds = audio?.currentTime ?? progressSecondsRef.current
        if (!retriedTrackIdsRef.current.has(activeTrackId)) {
          retriedTrackIdsRef.current.add(activeTrackId)
          loadedTrackIdRef.current = null
          await loadTrackRef.current(activeTrackId, {
            autoplay: true,
            queueIndex: currentQueueIndexRef.current ?? -1,
            startAt: retryProgressSeconds,
          })
          return
        }

        failedTrackIdsRef.current.add(activeTrackId)
      }

      if (modeRef.current === 'repeat-one') {
        setStatus('paused')
        await persistPlaybackSettings({ musicProgress: audio?.currentTime ?? progressSecondsRef.current })
        return
      }

      const playbackSongIds = getPlaybackSongIds()
      if (playbackSongIds.length === 0) {
        setStatus('idle')
        return
      }

      const nextTrackId = getNextRecoverableTrackId({
        playbackSongIds,
        activeTrackId,
        activeQueueIndex: currentQueueIndexRef.current ?? -1,
        mode: modeRef.current,
        failedTrackIds: failedTrackIdsRef.current,
      })

      if (nextTrackId == null) {
        setStatus('paused')
        await persistPlaybackSettings({ musicProgress: 0 })
        return
      }

      const nextIndex = currentIndex(playbackSongIds, nextTrackId)
      await loadTrackRef.current(nextTrackId, { autoplay: true, queueIndex: nextIndex, startAt: 0 })
    },
    [clearStalledTimer, getPlaybackSongIds, persistPlaybackSettings, setStatus],
  )
  recoverFromPlaybackFailureRef.current = recoverFromPlaybackFailure

  const armStalledTimer = useCallback(() => {
    clearStalledTimer()
    stalledTimerRef.current = window.setTimeout(() => {
      void recoverFromPlaybackFailure()
    }, 12000)
  }, [clearStalledTimer, recoverFromPlaybackFailure])

  useLayoutEffect(() => {
    loadTrackRef.current = async (trackId: number, options: LoadTrackOptions) => {
      const audio = audioRef.current
      const track = snapshotRef.current.songs.find((song) => song.id === trackId)

      if (!audio || !track) {
        return
      }

      const queueIndex = currentIndex(getPlaybackSongIds(), trackId, options.queueIndex ?? -1)
      currentTrackIdRef.current = trackId
      currentQueueIndexRef.current = queueIndex > -1 ? queueIndex : null
      setCurrentTrackId(trackId)
      setCurrentQueueIndex(queueIndex > -1 ? queueIndex : null)
      setProgressFromPlayback(options.startAt)
      setDurationFromPlayback(track.duration)
      setStatus(options.autoplay ? 'loading' : 'ready')
      pendingStartSecondsRef.current = options.startAt
      pendingAutoplayRef.current = options.autoplay

      if (loadedTrackIdRef.current !== trackId) {
        clearStalledTimer()
        loadedTrackIdRef.current = trackId
        audio.src = track.mediaUrl
        audio.load()
        if (!options.autoplay) {
          audio.pause()
        }
      } else {
        audio.currentTime = options.startAt
        if (options.autoplay) {
          try {
            await audio.play()
          } catch {
            await recoverFromPlaybackFailure()
          }
        } else {
          audio.pause()
        }
      }

      await persistPlaybackSettings({
        lastMusicIndex: queueIndex,
        musicProgress: options.startAt,
      })
    }
  }, [clearStalledTimer, getPlaybackSongIds, persistPlaybackSettings, recoverFromPlaybackFailure, setDurationFromPlayback, setProgressFromPlayback, setStatus])

  usePlaybackAudioElement({
    audioRef,
    snapshotRef,
    currentTrackIdRef,
    currentQueueIndexRef,
    pendingStartSecondsRef,
    pendingAutoplayRef,
    volumeRef,
    isMutedRef,
    modeRef,
    statusRef,
    isUserSeekingRef,
    pendingSeekSecondsRef,
    durationSecondsRef,
    failedTrackIdsRef,
    loadTrackRef,
    getPlaybackSongIds,
    setStatus,
    setIsPlaying,
    clearStalledTimer,
    armStalledTimer,
    stopProgressSync,
    startProgressSync,
    updateProgressFromAudio,
    setProgressFromPlayback,
    setDurationFromPlayback,
    persistPlaybackSettings,
    persistResolvedDuration,
    recoverFromPlaybackFailure,
    markSongPlayed,
    clamp,
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const nextVolume = clamp(snapshot.settings.volume, 0, 100)

    if (!hydratedRef.current) {
      hydratedRef.current = true
      audio.volume = nextVolume / 100
      audio.muted = snapshot.settings.isMuted
      startTransition(() => {
        setVolume(nextVolume)
        setIsMuted(snapshot.settings.isMuted)
        setMode(snapshot.settings.mode)
      })
    }

    const playbackSongIds = snapshotQueueSongIds

    if (snapshot.songs.length === 0 || playbackSongIds.length === 0) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      loadedTrackIdRef.current = null
      currentTrackIdRef.current = null
      currentQueueIndexRef.current = null
      startTransition(() => {
        setCurrentTrackId(null)
        setCurrentQueueIndex(null)
        setProgressFromPlayback(0)
        setDurationFromPlayback(0)
        setStatus('idle')
      })
      return
    }

    if (
      currentTrackIdRef.current != null &&
      currentIndex(playbackSongIds, currentTrackIdRef.current, currentQueueIndexRef.current ?? -1) > -1 &&
      snapshot.songs.some((song) => song.id === currentTrackIdRef.current)
    ) {
      return
    }

    const restoredIndex = clamp(
      snapshot.settings.lastMusicIndex,
      0,
      Math.max(playbackSongIds.length - 1, 0),
    )
    const restoredTrackId = playbackSongIds[restoredIndex]

    if (restoredTrackId == null) {
      return
    }

    void loadTrackRef.current(restoredTrackId, {
      autoplay: isPlayingRef.current || snapshot.settings.autoPlay,
      queueIndex: restoredIndex,
      startAt:
        snapshot.settings.saveMusicProgress &&
        (currentTrackIdRef.current == null || restoredTrackId === currentTrackIdRef.current)
          ? snapshot.settings.musicProgress
          : 0,
    })
  }, [snapshot, snapshotQueueSongIds])

  const playTrack = useCallback(async (trackId: number, queueSongIds?: number[], queueIndex = -1) => {
    if (queueSongIds) {
      queueOverrideRef.current = normalizeQueueSongIds(queueSongIds, snapshotRef.current.songs)
      queueSongIdsRef.current = queueOverrideRef.current
    }

    const audio = audioRef.current
    if (audio && loadedTrackIdRef.current === trackId && currentTrackIdRef.current === trackId) {
      const nextQueueIndex = currentIndex(getPlaybackSongIds(), trackId, queueIndex)
      currentQueueIndexRef.current = nextQueueIndex > -1 ? nextQueueIndex : null
      setCurrentQueueIndex(nextQueueIndex > -1 ? nextQueueIndex : null)
      await persistPlaybackSettings({
        lastMusicIndex: nextQueueIndex,
        musicProgress: audio.currentTime,
      })

      if (!audio.paused) {
        setStatus('playing')
        startProgressSync()
        return
      }

      setStatus('loading')
      try {
        await audio.play()
      } catch {
        await recoverFromPlaybackFailure()
      }
      return
    }

    await loadTrackRef.current(trackId, { autoplay: true, queueIndex, startAt: 0 })
  }, [getPlaybackSongIds, persistPlaybackSettings, recoverFromPlaybackFailure, setStatus, startProgressSync])

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (!currentTrackIdRef.current) {
      const firstTrackId = getPlaybackSongIds()[0]
      if (firstTrackId != null) {
        await loadTrackRef.current(firstTrackId, { autoplay: true, queueIndex: 0, startAt: 0 })
      }
      return
    }

    if (audio.paused) {
      setStatus('loading')
      try {
        await audio.play()
      } catch {
        await recoverFromPlaybackFailure()
      }
    } else {
      audio.pause()
    }
  }, [getPlaybackSongIds, recoverFromPlaybackFailure, setStatus])

  const playNext = useCallback(async () => {
    const playbackSongIds = getPlaybackSongIds()
    if (playbackSongIds.length === 0) {
      return
    }

    const activeIndex = currentIndex(playbackSongIds, currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
    const nextTrackId = moveNext(playbackSongIds, currentTrackIdRef.current, modeRef.current, currentQueueIndexRef.current ?? -1)
    if (nextTrackId != null) {
      const nextIndex = activeIndex + 1 < playbackSongIds.length ? activeIndex + 1 : 0
      await loadTrackRef.current(nextTrackId, { autoplay: true, queueIndex: nextIndex, startAt: 0 })
    }
  }, [getPlaybackSongIds])

  const playPrevious = useCallback(async () => {
    const audio = audioRef.current
    const playbackSongIds = getPlaybackSongIds()

    if (!audio || playbackSongIds.length === 0) {
      return
    }

    const activeIndex = currentIndex(playbackSongIds, currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
    const previousTrackId = movePrev(playbackSongIds, currentTrackIdRef.current, modeRef.current, currentQueueIndexRef.current ?? -1)
    if (previousTrackId != null) {
      const previousIndex = activeIndex - 1 >= 0 ? activeIndex - 1 : playbackSongIds.length - 1
      await loadTrackRef.current(previousTrackId, { autoplay: true, queueIndex: previousIndex, startAt: 0 })
    }
  }, [getPlaybackSongIds])

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current
      const safeDuration = getSeekableDuration()
      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(ratio, 0, 1) * safeDuration
      pendingSeekSecondsRef.current = nextTime
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, setStatus],
  )

  const seekToSeconds = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      const safeDuration = getSeekableDuration()
      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(seconds, 0, safeDuration)
      pendingSeekSecondsRef.current = nextTime
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, setStatus],
  )

  const beginSeek = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    wasPlayingBeforeSeekRef.current = !audio.paused
    isUserSeekingRef.current = true
    setStatus('seeking')
  }, [setStatus])

  const endSeek = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    isUserSeekingRef.current = false

    if (audio.seeking) {
      return
    }

    pendingSeekSecondsRef.current = null
    updateProgressFromAudio()

    if (wasPlayingBeforeSeekRef.current && !audio.paused) {
      setStatus('playing')
      startProgressSync()
      return
    }

    setStatus(audio.paused ? 'paused' : 'playing')
  }, [setStatus, startProgressSync, updateProgressFromAudio])

  const seekBySeconds = useCallback(
    (offsetSeconds: number) => {
      const audio = audioRef.current
      const safeDuration = getSeekableDuration()

      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(audio.currentTime + offsetSeconds, 0, safeDuration)
      pendingSeekSecondsRef.current = nextTime
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, setStatus],
  )

  const setVolumeLevel = useCallback(
    (nextVolume: number) => {
      const audio = audioRef.current
      const normalizedVolume = clamp(nextVolume, 0, 100)

      setVolume(normalizedVolume)

      if (audio) {
        audio.volume = normalizedVolume / 100
        if (normalizedVolume > 0 && audio.muted) {
          audio.muted = false
          setIsMuted(false)
          void persistPlaybackSettings({ volume: normalizedVolume, isMuted: false })
          return
        }
      }

      void persistPlaybackSettings({ volume: normalizedVolume })
    },
    [persistPlaybackSettings],
  )

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const nextMuted = !audio.muted
    audio.muted = nextMuted
    setIsMuted(nextMuted)
    void persistPlaybackSettings({ isMuted: nextMuted })
  }, [persistPlaybackSettings])

  const setMuted = useCallback((muted: boolean) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.muted = muted
    setIsMuted(muted)
    void persistPlaybackSettings({ isMuted: muted })
  }, [persistPlaybackSettings])

  const toggleShuffle = useCallback(() => {
    const nextMode = modeRef.current === 'shuffle' ? 'once' : 'shuffle'
    if (nextMode === 'shuffle') {
      queueOverrideRef.current = shuffleOthers(getPlaybackSongIds(), currentTrackIdRef.current)
      queueSongIdsRef.current = queueOverrideRef.current
      const shuffledCurrentIndex = currentIndex(queueOverrideRef.current, currentTrackIdRef.current)
      currentQueueIndexRef.current = shuffledCurrentIndex > -1 ? shuffledCurrentIndex : null
      setCurrentQueueIndex(shuffledCurrentIndex > -1 ? shuffledCurrentIndex : null)
      void useLibraryStore.getState().replaceNowPlaying(queueOverrideRef.current)
    }
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [getPlaybackSongIds, persistPlaybackSettings])

  const toggleRepeat = useCallback(() => {
    const nextMode = modeRef.current === 'repeat' ? 'once' : 'repeat'
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [persistPlaybackSettings])

  const toggleRepeatOne = useCallback(() => {
    const nextMode = modeRef.current === 'repeat-one' ? 'once' : 'repeat-one'
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [persistPlaybackSettings])

  const cycleRepeatMode = useCallback(() => {
    let nextMode: PlaybackMode

    if (modeRef.current === 'shuffle') {
      nextMode = 'repeat'
    } else if (modeRef.current === 'once') {
      nextMode = 'repeat'
    } else if (modeRef.current === 'repeat') {
      nextMode = 'repeat-one'
    } else {
      nextMode = 'once'
    }

    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [persistPlaybackSettings])

  const getDurationSeconds = useCallback(() => durationSecondsRef.current, [])

  useMediaSession({
    currentTrack,
    isPlaying,
    onTogglePlayPause: () => {
      void togglePlayPause()
    },
    onPlayNext: () => {
      void playNext()
    },
    onPlayPrevious: () => {
      void playPrevious()
    },
    onSeekToRatio: seekToRatio,
    onSeekBySeconds: seekBySeconds,
    getDurationSeconds,
  })

  usePlaybackShortcuts({
    onTogglePlayPause: () => {
      void togglePlayPause()
    },
    onPlayNext: () => {
      void playNext()
    },
    onPlayPrevious: () => {
      void playPrevious()
    },
    onSeekBySeconds: seekBySeconds,
  })

  useEffect(() => {
    if (!window.smplayer) {
      return
    }

    return window.smplayer.onGlobalMediaCommand((command) => {
      if (command === 'play-pause') {
        void togglePlayPause()
        return
      }

      if (command === 'next') {
        void playNext()
        return
      }

      if (command === 'previous') {
        void playPrevious()
        return
      }

      const audio = audioRef.current
      if (audio) {
        audio.pause()
        void persistPlaybackSettings({ musicProgress: audio.currentTime })
      }
    })
  }, [persistPlaybackSettings, playNext, playPrevious, togglePlayPause])

  return {
    currentTrack,
    currentTrackId,
    currentQueueIndex,
    status,
    isPlaying,
    progressSeconds,
    durationSeconds,
    volume,
    isMuted,
    mode,
    playTrack,
    togglePlayPause,
    playNext,
    playPrevious,
    seekToRatio,
    seekToSeconds,
    beginSeek,
    endSeek,
    seekBySeconds,
    setVolumeLevel,
    toggleMute,
    setMuted,
    toggleShuffle,
    toggleRepeat,
    toggleRepeatOne,
    cycleRepeatMode,
  }
}
