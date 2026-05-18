import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { MusicData, LibrarySong, PlaybackMode, PlaybackRuntimeSettings, PlaybackSettingsUpdate } from '../shared/contracts'
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
import { setPlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useLibraryStore } from '../state/useLibraryStore'
import { transitionPlaybackStatus, type PlaybackStatus, type PlaybackTransition } from './playbackStateMachine'
import { usePlaybackAudioElement } from './usePlaybackAudioElement'
import { updateMediaSessionPosition, useMediaSession } from './useMediaSession'
import { usePlaybackPersistence } from './usePlaybackPersistence'
import {
  readInitialPlaybackSettings,
  useGlobalPlaybackCommands,
  usePlaybackRuntimeSettingsRestore,
} from './usePlaybackRuntimeCommands'
import { usePlaybackShortcuts } from './usePlaybackShortcuts'

export interface PlaybackController {
  currentTrack: LibrarySong | null
  currentTrackId: number | null
  currentQueueIndex: number | null
  status: PlaybackStatus
  isPlaying: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playTrack: (trackId: number, queueSongIds?: number[], queueIndex?: number) => Promise<void>
  togglePlayPause: () => Promise<void>
  stop: () => void
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

const PLAYBACK_STALL_TIMEOUT_MS = 8_000
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.05

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function usePlaybackController(snapshot: MusicData, ready: boolean): PlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedTrackIdRef = useRef<number | null>(null)
  const pendingStartSecondsRef = useRef(0)
  const pendingAutoplayRef = useRef(false)
  const loadingTrackIdRef = useRef<number | null>(null)
  const hydratedRef = useRef(false)
  const restoredPlaybackRef = useRef(false)
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
  const volumePersistenceTimerRef = useRef<number | null>(null)
  const pendingVolumePersistenceRef = useRef<PlaybackSettingsUpdate | null>(null)
  const failedTrackIdsRef = useRef(new Set<number>())
  const recoverFromPlaybackFailureRef = useRef<() => Promise<void>>(async () => {})
  const finishCurrentTrackRef = useRef<() => Promise<void>>(async () => {})
  const finishingTrackIdRef = useRef<number | null>(null)
  const loadTrackRef = useRef<(trackId: number, options: LoadTrackOptions) => Promise<void>>(
    async () => {},
  )

  const [initialPlaybackSettings] = useState(() => readInitialPlaybackSettings(snapshot))
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number | null>(null)
  const [status, setStatusState] = useState<PlaybackStatus>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(() => clamp(initialPlaybackSettings.volume, 0, 100))
  const [isMuted, setIsMuted] = useState(initialPlaybackSettings.isMuted)
  const [mode, setMode] = useState<PlaybackMode>(initialPlaybackSettings.mode)

  const snapshotRef = useRef(snapshot)
  const currentTrackIdRef = useRef(currentTrackId)
  const currentQueueIndexRef = useRef<number | null>(currentQueueIndex)
  const isPlayingRef = useRef(isPlaying)
  const progressSecondsRef = useRef(0)
  const durationSecondsRef = useRef(0)
  const volumeRef = useRef(volume)
  const isMutedRef = useRef(isMuted)
  const modeRef = useRef(mode)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const showPlaybackMessage = useUndoableNotificationStore((state) => state.showMessage)

  const snapshotQueueSongIds = useMemo(
    () => normalizeQueueSongIds(snapshot.nowPlaying.songIds, snapshot.songs),
    [snapshot.nowPlaying.songIds, snapshot.songs],
  )

  const transitionStatus = useCallback((transition: PlaybackTransition) => {
    const nextStatus = transitionPlaybackStatus(statusRef.current, transition)
    if (nextStatus === statusRef.current) {
      return
    }

    statusRef.current = nextStatus
    setStatusState(nextStatus)
  }, [])

  const applyPlaybackRuntimeSettings = useCallback((settings: PlaybackRuntimeSettings) => {
    const nextVolume = clamp(settings.volume, 0, 100)
    volumeRef.current = nextVolume
    isMutedRef.current = settings.isMuted
    modeRef.current = settings.mode

    const audio = audioRef.current
    if (audio) {
      audio.volume = nextVolume / 100
      audio.muted = settings.isMuted
    }

    setVolume(nextVolume)
    setIsMuted(settings.isMuted)
    setMode(settings.mode)
  }, [])

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    currentTrackIdRef.current = currentTrackId
    currentQueueIndexRef.current = currentQueueIndex
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
    volume,
  ])

  usePlaybackRuntimeSettingsRestore(() => {
    applyPlaybackRuntimeSettings(readInitialPlaybackSettings(snapshotRef.current))
  })

  useEffect(() => {
    if (currentTrackId == null) {
      return
    }

    const playbackSongIds = queueOverrideRef.current ?? snapshotQueueSongIds
    const nextQueueIndex = currentIndex(playbackSongIds, currentTrackId, currentQueueIndex ?? -1)
    const nextCurrentQueueIndex = nextQueueIndex > -1 ? nextQueueIndex : null
    if (nextCurrentQueueIndex === currentQueueIndex) {
      return
    }

    currentQueueIndexRef.current = nextCurrentQueueIndex
    setCurrentQueueIndex(nextCurrentQueueIndex)
  }, [currentQueueIndex, currentTrackId, snapshotQueueSongIds])

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
    getPlaybackSongIds,
  })

  const flushVolumePersistence = useCallback(() => {
    const update = pendingVolumePersistenceRef.current
    if (!update) {
      return
    }

    pendingVolumePersistenceRef.current = null
    if (volumePersistenceTimerRef.current != null) {
      window.clearTimeout(volumePersistenceTimerRef.current)
      volumePersistenceTimerRef.current = null
    }
    void persistPlaybackSettings(update)
  }, [persistPlaybackSettings])

  const scheduleVolumePersistence = useCallback((update: PlaybackSettingsUpdate) => {
    pendingVolumePersistenceRef.current = update
    if (volumePersistenceTimerRef.current != null) {
      window.clearTimeout(volumePersistenceTimerRef.current)
    }

    volumePersistenceTimerRef.current = window.setTimeout(() => {
      flushVolumePersistence()
    }, 180)
  }, [flushVolumePersistence])

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
    if (!audio || isUserSeekingRef.current || loadingTrackIdRef.current != null) {
      return
    }

    if (pendingStartSecondsRef.current > 0 && audio.currentTime < pendingStartSecondsRef.current - 0.25) {
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
        return
      }

      stalledProgressStartedAtRef.current ??= Date.now()
      if (Date.now() - stalledProgressStartedAtRef.current >= PLAYBACK_STALL_TIMEOUT_MS) {
        stalledProgressStartedAtRef.current = null
        const t = createTranslator(snapshotRef.current.settings.preferredLanguage)
        showPlaybackMessage(t('notification.playbackStalled'), 4000)
        transitionStatus({ type: 'buffering' })
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationSecondsRef.current
        if (duration > 0 && duration - audio.currentTime <= 0.5) {
          void finishCurrentTrackRef.current()
        } else {
          void recoverFromPlaybackFailureRef.current()
        }
      }
    }, 500)
  }, [showPlaybackMessage, stopProgressSync, transitionStatus, updateProgressFromAudio])

  const finishCurrentTrack = useCallback(
    async () => {
      clearStalledTimer()
      stopProgressSync()

      const playbackSongIds = getPlaybackSongIds()
      const activeTrackId = currentTrackIdRef.current
      if (activeTrackId != null && finishingTrackIdRef.current === activeTrackId) {
        return
      }

      finishingTrackIdRef.current = activeTrackId
      try {
        const activeIndex = currentIndex(playbackSongIds, activeTrackId, currentQueueIndexRef.current ?? -1)
        const activeTrack =
          activeTrackId == null
            ? null
            : snapshotRef.current.songs.find((song) => song.id === activeTrackId) ?? null

        if (activeTrack) {
          await markSongPlayed(activeTrack.id)
        }

        if (playbackSongIds.length === 0) {
          setIsPlaying(false)
          transitionStatus({ type: 'idle' })
          return
        }

        if (modeRef.current === 'repeat-one' && activeTrack) {
          await loadTrackRef.current(activeTrack.id, { autoplay: true, queueIndex: activeIndex, startAt: 0 })
          return
        }

        const nextIndex = activeIndex + 1
        if (nextIndex < playbackSongIds.length) {
          await loadTrackRef.current(playbackSongIds[nextIndex], { autoplay: true, queueIndex: nextIndex, startAt: 0 })
          return
        }

        if (modeRef.current === 'repeat' || modeRef.current === 'shuffle') {
          await loadTrackRef.current(playbackSongIds[0], { autoplay: true, queueIndex: 0, startAt: 0 })
          return
        }

        setIsPlaying(false)
        transitionStatus({ type: 'paused' })
        setProgressFromPlayback(durationSecondsRef.current)
        await persistPlaybackSettings({ musicProgress: durationSecondsRef.current })
      } finally {
        if (finishingTrackIdRef.current === activeTrackId) {
          finishingTrackIdRef.current = null
        }
      }
    },
    [
      clearStalledTimer,
      getPlaybackSongIds,
      markSongPlayed,
      persistPlaybackSettings,
      setProgressFromPlayback,
      transitionStatus,
      stopProgressSync,
    ],
  )
  finishCurrentTrackRef.current = finishCurrentTrack

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
        failedTrackIdsRef.current.add(activeTrackId)
      }

      if (modeRef.current === 'repeat-one') {
        transitionStatus({ type: 'paused' })
        loadingTrackIdRef.current = null
        await persistPlaybackSettings({ musicProgress: audio?.currentTime ?? progressSecondsRef.current })
        return
      }

      const playbackSongIds = getPlaybackSongIds()
      if (playbackSongIds.length === 0) {
        transitionStatus({ type: 'idle' })
        loadingTrackIdRef.current = null
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
        transitionStatus({ type: 'paused' })
        loadingTrackIdRef.current = null
        await persistPlaybackSettings({ musicProgress: 0 })
        return
      }

      const nextIndex = currentIndex(playbackSongIds, nextTrackId)
      await loadTrackRef.current(nextTrackId, { autoplay: true, queueIndex: nextIndex, startAt: 0 })
    },
    [clearStalledTimer, getPlaybackSongIds, persistPlaybackSettings, transitionStatus],
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
      if (options.startAt <= 0) {
        setProgressFromPlayback(0)
      }
      setDurationFromPlayback(track.duration)
      transitionStatus({ type: 'load-track', autoplay: options.autoplay })
      pendingStartSecondsRef.current = options.startAt
      pendingAutoplayRef.current = options.autoplay
      audio.autoplay = options.autoplay

      if (loadedTrackIdRef.current !== trackId) {
        clearStalledTimer()
        loadingTrackIdRef.current = trackId
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
  }, [clearStalledTimer, getPlaybackSongIds, persistPlaybackSettings, recoverFromPlaybackFailure, setDurationFromPlayback, setProgressFromPlayback, transitionStatus])

  usePlaybackAudioElement({
    audioRef,
    snapshotRef,
    currentTrackIdRef,
    pendingStartSecondsRef,
    pendingAutoplayRef,
    loadingTrackIdRef,
    volumeRef,
    isMutedRef,
    isUserSeekingRef,
    pendingSeekSecondsRef,
    durationSecondsRef,
    failedTrackIdsRef,
    transitionStatus,
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
    finishCurrentTrack,
    clamp,
  })

  useEffect(() => () => {
    flushVolumePersistence()
  }, [flushVolumePersistence])

  useEffect(() => {
    if (!ready) {
      return
    }

    if (!hydratedRef.current) {
      hydratedRef.current = true
      applyPlaybackRuntimeSettings(snapshot.settings)
    }

    const audio = audioRef.current
    if (!audio) {
      return
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
        transitionStatus({ type: 'idle' })
      })
      restoredPlaybackRef.current = true
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

    const shouldAutoplayRestoredTrack = restoredPlaybackRef.current
      ? isPlayingRef.current
      : snapshot.settings.autoPlay
    restoredPlaybackRef.current = true

    void loadTrackRef.current(restoredTrackId, {
      autoplay: shouldAutoplayRestoredTrack,
      queueIndex: restoredIndex,
      startAt:
        snapshot.settings.saveMusicProgress &&
        (currentTrackIdRef.current == null || restoredTrackId === currentTrackIdRef.current)
          ? snapshot.settings.musicProgress
          : 0,
    })
  }, [ready, snapshot, snapshotQueueSongIds, transitionStatus, setDurationFromPlayback, setProgressFromPlayback, applyPlaybackRuntimeSettings])

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

      try {
        await audio.play()
      } catch {
        await recoverFromPlaybackFailure()
      }
      return
    }

    await loadTrackRef.current(trackId, { autoplay: true, queueIndex, startAt: 0 })
  }, [getPlaybackSongIds, persistPlaybackSettings, recoverFromPlaybackFailure, transitionStatus])

  const playCurrent = useCallback(async () => {
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

    if (!audio.paused) {
      transitionStatus({ type: 'playing' })
      startProgressSync()
      return
    }

    try {
      await audio.play()
    } catch {
      await recoverFromPlaybackFailure()
    }
  }, [getPlaybackSongIds, recoverFromPlaybackFailure, startProgressSync, transitionStatus])

  const pauseCurrent = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.pause()
    }
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }
  }, [persistPlaybackSettings])

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || audio.paused) {
      await playCurrent()
      return
    }

    pauseCurrent()
  }, [pauseCurrent, playCurrent])

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
      transitionStatus({ type: 'seeking' })
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, transitionStatus],
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
      transitionStatus({ type: 'seeking' })
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, transitionStatus],
  )

  const beginSeek = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    wasPlayingBeforeSeekRef.current = !audio.paused
    isUserSeekingRef.current = true
    transitionStatus({ type: 'seeking' })
  }, [transitionStatus])

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
      transitionStatus({ type: 'playing' })
      startProgressSync()
      return
    }

    transitionStatus({ type: 'seeked', paused: audio.paused })
  }, [startProgressSync, transitionStatus, updateProgressFromAudio])

  const seekBySeconds = useCallback(
    (offsetSeconds: number) => {
      const audio = audioRef.current
      const safeDuration = getSeekableDuration()

      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(audio.currentTime + offsetSeconds, 0, safeDuration)
      pendingSeekSecondsRef.current = nextTime
      transitionStatus({ type: 'seeking' })
      audio.currentTime = nextTime
      setProgressFromPlayback(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [getSeekableDuration, persistPlaybackSettings, setProgressFromPlayback, transitionStatus],
  )

  const setVolumeLevel = useCallback(
    (nextVolume: number) => {
      const audio = audioRef.current
      const normalizedVolume = clamp(nextVolume, 0, 100)
      let nextMuted: boolean | undefined

      volumeRef.current = normalizedVolume
      setVolume(normalizedVolume)

      if (audio) {
        audio.volume = normalizedVolume / 100
        if (normalizedVolume > 0 && audio.muted) {
          audio.muted = false
          isMutedRef.current = false
          setIsMuted(false)
          nextMuted = false
        }
      }

      scheduleVolumePersistence(nextMuted === undefined
        ? { volume: normalizedVolume }
        : { volume: normalizedVolume, isMuted: nextMuted })
    },
    [scheduleVolumePersistence],
  )

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const nextMuted = !audio.muted
    audio.muted = nextMuted
    isMutedRef.current = nextMuted
    setIsMuted(nextMuted)
    void persistPlaybackSettings({ isMuted: nextMuted })
  }, [persistPlaybackSettings])

  const setMuted = useCallback((muted: boolean) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.muted = muted
    isMutedRef.current = muted
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
      void replaceNowPlaying(queueOverrideRef.current)
    }
    modeRef.current = nextMode
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [getPlaybackSongIds, persistPlaybackSettings, replaceNowPlaying])

  const toggleRepeat = useCallback(() => {
    const nextMode = modeRef.current === 'repeat' ? 'once' : 'repeat'
    modeRef.current = nextMode
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [persistPlaybackSettings])

  const toggleRepeatOne = useCallback(() => {
    const nextMode = modeRef.current === 'repeat-one' ? 'once' : 'repeat-one'
    modeRef.current = nextMode
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

    modeRef.current = nextMode
    setMode(nextMode)
    void persistPlaybackSettings({ mode: nextMode })
  }, [persistPlaybackSettings])

  const getDurationSeconds = useCallback(() => durationSecondsRef.current, [])

  useMediaSession({
    currentTrack,
    unknownAlbum: createTranslator(snapshot.settings.preferredLanguage)('common.albumUnknown'),
    unknownArtist: createTranslator(snapshot.settings.preferredLanguage)('common.artistUnknown'),
    artistSeparator: createTranslator(snapshot.settings.preferredLanguage)('common.artistSeparator'),
    isPlaying,
    onPlay: () => {
      void playCurrent()
    },
    onPause: () => {
      pauseCurrent()
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
    onToggleShuffle: toggleShuffle,
    onToggleRepeat: toggleRepeat,
    onToggleRepeatOne: toggleRepeatOne,
  })

  useGlobalPlaybackCommands({
    onTogglePlayPause: () => {
      void togglePlayPause()
    },
    onPlayNext: () => {
      void playNext()
    },
    onPlayPrevious: () => {
      void playPrevious()
    },
    onStop: stop,
  })

  return {
    currentTrack,
    currentTrackId,
    currentQueueIndex,
    status,
    isPlaying,
    volume,
    isMuted,
    mode,
    playTrack,
    togglePlayPause,
    stop,
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
