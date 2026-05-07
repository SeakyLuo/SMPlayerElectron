import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { LibrarySnapshot, LibrarySong, PlaybackMode } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
import {
  currentIndex,
  moveNext,
  movePrev,
  normalizeQueueSongIds,
  samePlaylist,
  shuffleOthers,
} from '../shared/mediaHelper'

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function usePlaybackController(snapshot: LibrarySnapshot): PlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedTrackIdRef = useRef<number | null>(null)
  const pendingStartSecondsRef = useRef(0)
  const pendingAutoplayRef = useRef(false)
  const hydratedRef = useRef(false)
  const queueOverrideRef = useRef<number[] | null>(null)
  const queueSongIdsRef = useRef<number[]>([])
  const persistedDurationByTrackRef = useRef(new Map<number, number>())
  const wasPlayingBeforeSeekRef = useRef(false)
  const isUserSeekingRef = useRef(false)
  const statusRef = useRef<PlaybackStatus>('idle')
  const stalledTimerRef = useRef<number | null>(null)
  const progressAnimationFrameRef = useRef<number | null>(null)
  const failedTrackIdsRef = useRef(new Set<number>())
  const loadTrackRef = useRef<(trackId: number, options: LoadTrackOptions) => Promise<void>>(
    async () => {},
  )

  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number | null>(null)
  const [status, setStatusState] = useState<PlaybackStatus>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [volume, setVolume] = useState(72)
  const [isMuted, setIsMuted] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('once')

  const snapshotRef = useRef(snapshot)
  const currentTrackIdRef = useRef(currentTrackId)
  const currentQueueIndexRef = useRef<number | null>(currentQueueIndex)
  const isPlayingRef = useRef(isPlaying)
  const progressSecondsRef = useRef(progressSeconds)
  const durationSecondsRef = useRef(durationSeconds)
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
    progressSecondsRef.current = progressSeconds
    durationSecondsRef.current = durationSeconds
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
    durationSeconds,
    isMuted,
    isPlaying,
    mode,
    progressSeconds,
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

  const persistPlaybackSettings = useCallback(
    async (
      override: Partial<{
        lastMusicIndex: number
        volume: number
        isMuted: boolean
        mode: PlaybackMode
        musicProgress: number
      }> = {},
    ) => {
      if (!window.smplayer) {
        return
      }

      const lastMusicIndex =
        override.lastMusicIndex ?? currentIndex(getPlaybackSongIds(), currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
      const shouldSaveProgress = snapshotRef.current.settings.saveMusicProgress
      const nextMusicProgress = shouldSaveProgress
        ? override.musicProgress ?? progressSecondsRef.current
        : 0

      await window.smplayer.savePlaybackSettings({
        lastMusicIndex,
        volume: override.volume ?? volumeRef.current,
        isMuted: override.isMuted ?? isMutedRef.current,
        mode: override.mode ?? modeRef.current,
        musicProgress: nextMusicProgress,
      })
    },
    [getPlaybackSongIds],
  )

  const persistResolvedDuration = useCallback((duration: number) => {
    const trackId = currentTrackIdRef.current
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

  const clearStalledTimer = useCallback(() => {
    if (stalledTimerRef.current != null) {
      window.clearTimeout(stalledTimerRef.current)
      stalledTimerRef.current = null
    }
  }, [])

  const cancelProgressAnimation = useCallback(() => {
    if (progressAnimationFrameRef.current != null) {
      window.cancelAnimationFrame(progressAnimationFrameRef.current)
      progressAnimationFrameRef.current = null
    }
  }, [])

  const updateProgressFromAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio || isUserSeekingRef.current) {
      return
    }

    setProgressSeconds(audio.currentTime)
  }, [])

  const startProgressAnimation = useCallback(() => {
    cancelProgressAnimation()

    const tick = () => {
      updateProgressFromAudio()
      const audio = audioRef.current
      if (audio && !audio.paused && !audio.ended) {
        progressAnimationFrameRef.current = window.requestAnimationFrame(tick)
      }
    }

    progressAnimationFrameRef.current = window.requestAnimationFrame(tick)
  }, [cancelProgressAnimation, updateProgressFromAudio])

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
        setStatus('paused')
        await persistPlaybackSettings({ musicProgress: audio?.currentTime ?? progressSecondsRef.current })
        return
      }

      const playbackSongIds = getPlaybackSongIds()
      if (playbackSongIds.length === 0) {
        setStatus('idle')
        return
      }

      const activeIndex = currentIndex(playbackSongIds, activeTrackId, currentQueueIndexRef.current ?? -1)
      const shouldWrap = modeRef.current === 'repeat' || modeRef.current === 'shuffle'
      const orderedSongIds = shouldWrap
        ? [...playbackSongIds.slice(activeIndex + 1), ...playbackSongIds.slice(0, activeIndex + 1)]
        : playbackSongIds.slice(activeIndex + 1)
      const nextTrackId = orderedSongIds.find((songId) => !failedTrackIdsRef.current.has(songId))

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
      setProgressSeconds(options.startAt)
      setDurationSeconds(track.duration)
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
  }, [clearStalledTimer, getPlaybackSongIds, persistPlaybackSettings, recoverFromPlaybackFailure, setStatus])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = clamp(volumeRef.current / 100, 0, 1)
    audio.muted = isMutedRef.current
    audioRef.current = audio

    const handleLoadStart = () => {
      setStatus('loading')
    }

    const handleLoadedMetadata = async () => {
      const activeTrack =
        snapshotRef.current.songs.find((song) => song.id === currentTrackIdRef.current) ?? null
      const nextDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : activeTrack?.duration ?? 0

      setDurationSeconds(nextDuration)
      persistResolvedDuration(nextDuration)

      if (pendingStartSecondsRef.current > 0) {
        audio.currentTime = clamp(
          pendingStartSecondsRef.current,
          0,
          nextDuration || pendingStartSecondsRef.current,
        )
        setProgressSeconds(audio.currentTime)
        pendingStartSecondsRef.current = 0
      }

      const shouldAutoplay = pendingAutoplayRef.current
      pendingAutoplayRef.current = false

      if (shouldAutoplay) {
        try {
          await audio.play()
        } catch {
          await recoverFromPlaybackFailure()
        }
      } else {
        setStatus('ready')
      }
    }

    const handleTimeUpdate = () => {
      clearStalledTimer()
      updateProgressFromAudio()
    }

    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSeconds(audio.duration)
        persistResolvedDuration(audio.duration)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      setStatus('playing')
      startProgressAnimation()
    }

    const handlePlaying = () => {
      clearStalledTimer()
      failedTrackIdsRef.current.clear()
      setIsPlaying(true)
      setStatus('playing')
      startProgressAnimation()
    }

    const handlePause = () => {
      setIsPlaying(false)
      cancelProgressAnimation()
      clearStalledTimer()
      if (statusRef.current !== 'loading' && statusRef.current !== 'seeking' && statusRef.current !== 'buffering') {
        setStatus('paused')
      }
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }

    const handleCanPlay = () => {
      clearStalledTimer()
      if (pendingAutoplayRef.current) {
        return
      }

      setStatus(audio.paused ? 'ready' : 'playing')
    }

    const handleWaiting = () => {
      if (!audio.paused) {
        setStatus('buffering')
        armStalledTimer()
      }
    }

    const handleSeeking = () => {
      clearStalledTimer()
      if (!isUserSeekingRef.current) {
        setStatus('seeking')
      }
    }

    const handleSeeked = () => {
      clearStalledTimer()
      updateProgressFromAudio()
      if (!audio.paused) {
        setStatus('playing')
        startProgressAnimation()
        return
      }

      setStatus('paused')
    }

    const handlePlaybackFailure = () => {
      cancelProgressAnimation()
      setStatus('buffering')
      void recoverFromPlaybackFailure()
    }

    const handleEnded = async () => {
      clearStalledTimer()
      const playbackSongIds = getPlaybackSongIds()
      const activeIndex = currentIndex(playbackSongIds, currentTrackIdRef.current, currentQueueIndexRef.current ?? -1)
      const activeTrack =
        currentTrackIdRef.current == null
          ? null
          : snapshotRef.current.songs.find((song) => song.id === currentTrackIdRef.current) ?? null

      if (activeTrack && window.smplayer) {
        await window.smplayer.markSongPlayed(activeTrack.id)
      }

      if (playbackSongIds.length === 0) {
        setIsPlaying(false)
        setStatus('idle')
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
      setStatus('paused')
      setProgressSeconds(durationSecondsRef.current)
      await persistPlaybackSettings({ musicProgress: durationSecondsRef.current })
    }

    const handleBeforeUnload = () => {
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }

    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('stalled', handleWaiting)
    audio.addEventListener('seeking', handleSeeking)
    audio.addEventListener('seeked', handleSeeked)
    audio.addEventListener('error', handlePlaybackFailure)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      clearStalledTimer()
      cancelProgressAnimation()
      audio.pause()
      audio.src = ''
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('stalled', handleWaiting)
      audio.removeEventListener('seeking', handleSeeking)
      audio.removeEventListener('seeked', handleSeeked)
      audio.removeEventListener('error', handlePlaybackFailure)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audioRef.current = null
    }
  }, [
    armStalledTimer,
    cancelProgressAnimation,
    clearStalledTimer,
    getPlaybackSongIds,
    persistPlaybackSettings,
    persistResolvedDuration,
    recoverFromPlaybackFailure,
    setStatus,
    startProgressAnimation,
    updateProgressFromAudio,
  ])

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
        setProgressSeconds(0)
        setDurationSeconds(0)
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

    await loadTrackRef.current(trackId, { autoplay: true, queueIndex, startAt: 0 })
  }, [])

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
      const safeDuration = durationSecondsRef.current
      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(ratio, 0, 1) * safeDuration
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings, setStatus],
  )

  const seekToSeconds = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      const safeDuration = durationSecondsRef.current
      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(seconds, 0, safeDuration)
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings, setStatus],
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
    updateProgressFromAudio()

    if (audio.seeking) {
      return
    }

    if (wasPlayingBeforeSeekRef.current && !audio.paused) {
      setStatus('playing')
      startProgressAnimation()
      return
    }

    setStatus(audio.paused ? 'paused' : 'playing')
  }, [setStatus, startProgressAnimation, updateProgressFromAudio])

  const seekBySeconds = useCallback(
    (offsetSeconds: number) => {
      const audio = audioRef.current
      const safeDuration = durationSecondsRef.current

      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(audio.currentTime + offsetSeconds, 0, safeDuration)
      setStatus('seeking')
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings, setStatus],
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
      void window.smplayer?.replaceNowPlaying(queueOverrideRef.current)
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

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: getDisplayArtists(currentTrack),
      album: currentTrack.album || 'Unknown album',
      artwork: currentTrack.artworkUrl
        ? [
            { src: currentTrack.artworkUrl, sizes: '96x96', type: 'image/png' },
            { src: currentTrack.artworkUrl, sizes: '128x128', type: 'image/png' },
            { src: currentTrack.artworkUrl, sizes: '192x192', type: 'image/png' },
            { src: currentTrack.artworkUrl, sizes: '256x256', type: 'image/png' },
            { src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    })
  }, [currentTrack])

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') {
      return
    }

    if (!currentTrack || durationSeconds <= 0) {
      navigator.mediaSession.setPositionState()
      return
    }

    navigator.mediaSession.setPositionState({
      duration: durationSeconds,
      playbackRate: 1,
      position: clamp(progressSeconds, 0, durationSeconds),
    })
  }, [currentTrack, durationSeconds, progressSeconds])

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    navigator.mediaSession.setActionHandler('play', () => {
      void togglePlayPause()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      void togglePlayPause()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void playPrevious()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void playNext()
    })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime !== 'number' || durationSecondsRef.current <= 0) {
        return
      }

      const ratio = details.seekTime / durationSecondsRef.current
      seekToRatio(ratio)
    })
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      seekBySeconds(-(details.seekOffset ?? 10))
    })
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      seekBySeconds(details.seekOffset ?? 10)
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
    }
  }, [playNext, playPrevious, seekBySeconds, seekToRatio, togglePlayPause])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isEditableTarget) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void togglePlayPause()
        return
      }

      if (event.altKey || event.metaKey) {
        return
      }

      if (event.ctrlKey && event.key === 'ArrowRight') {
        event.preventDefault()
        void playNext()
        return
      }

      if (event.ctrlKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        void playPrevious()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        seekBySeconds(event.shiftKey ? 30 : 5)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        seekBySeconds(event.shiftKey ? -30 : -5)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [playNext, playPrevious, seekBySeconds, togglePlayPause])

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
