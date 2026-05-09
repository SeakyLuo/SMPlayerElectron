import { useEffect } from 'react'

import type { LibrarySnapshot, PlaybackMode } from '../shared/contracts'
import { currentIndex } from '../shared/mediaHelper'

type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'seeking'

interface LoadTrackOptions {
  autoplay: boolean
  startAt: number
  queueIndex?: number
}

interface MutableRef<T> {
  current: T
}

interface PlaybackAudioElementOptions {
  audioRef: MutableRef<HTMLAudioElement | null>
  snapshotRef: MutableRef<LibrarySnapshot>
  currentTrackIdRef: MutableRef<number | null>
  currentQueueIndexRef: MutableRef<number | null>
  pendingStartSecondsRef: MutableRef<number>
  pendingAutoplayRef: MutableRef<boolean>
  volumeRef: MutableRef<number>
  isMutedRef: MutableRef<boolean>
  modeRef: MutableRef<PlaybackMode>
  statusRef: MutableRef<PlaybackStatus>
  isUserSeekingRef: MutableRef<boolean>
  pendingSeekSecondsRef: MutableRef<number | null>
  durationSecondsRef: MutableRef<number>
  failedTrackIdsRef: MutableRef<Set<number>>
  loadTrackRef: MutableRef<(trackId: number, options: LoadTrackOptions) => Promise<void>>
  getPlaybackSongIds: () => number[]
  setStatus: (status: PlaybackStatus) => void
  setIsPlaying: (isPlaying: boolean) => void
  clearStalledTimer: () => void
  armStalledTimer: () => void
  stopProgressSync: () => void
  startProgressSync: () => void
  updateProgressFromAudio: (force?: boolean) => void
  setProgressFromPlayback: (progressSeconds: number) => void
  setDurationFromPlayback: (durationSeconds: number) => void
  persistPlaybackSettings: (override?: Partial<{
    lastMusicIndex: number
    volume: number
    isMuted: boolean
    mode: PlaybackMode
    musicProgress: number
  }>) => Promise<void>
  persistResolvedDuration: (trackId: number | null, duration: number) => void
  recoverFromPlaybackFailure: () => Promise<void>
  markSongPlayed: (songId: number) => Promise<void>
  clamp: (value: number, min: number, max: number) => number
}

export function usePlaybackAudioElement({
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
}: PlaybackAudioElementOptions) {
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
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

      setDurationFromPlayback(nextDuration)
      persistResolvedDuration(currentTrackIdRef.current, nextDuration)

      if (pendingStartSecondsRef.current > 0) {
        audio.currentTime = clamp(
          pendingStartSecondsRef.current,
          0,
          nextDuration || pendingStartSecondsRef.current,
        )
        setProgressFromPlayback(audio.currentTime)
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
        setDurationFromPlayback(audio.duration)
        persistResolvedDuration(currentTrackIdRef.current, audio.duration)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      setStatus('playing')
      startProgressSync()
    }

    const handlePlaying = () => {
      clearStalledTimer()
      failedTrackIdsRef.current.clear()
      setIsPlaying(true)
      setStatus('playing')
      startProgressSync()
    }

    const handlePause = () => {
      setIsPlaying(false)
      stopProgressSync()
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
      pendingSeekSecondsRef.current = null
      updateProgressFromAudio()
      if (!audio.paused) {
        setStatus('playing')
        startProgressSync()
        return
      }

      setStatus('paused')
    }

    const handlePlaybackFailure = () => {
      stopProgressSync()
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

      if (activeTrack) {
        await markSongPlayed(activeTrack.id)
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
      setProgressFromPlayback(durationSecondsRef.current)
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
      stopProgressSync()
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
    audioRef,
    clearStalledTimer,
    clamp,
    currentQueueIndexRef,
    currentTrackIdRef,
    durationSecondsRef,
    failedTrackIdsRef,
    getPlaybackSongIds,
    isMutedRef,
    isUserSeekingRef,
    loadTrackRef,
    markSongPlayed,
    modeRef,
    pendingAutoplayRef,
    pendingSeekSecondsRef,
    pendingStartSecondsRef,
    persistPlaybackSettings,
    persistResolvedDuration,
    recoverFromPlaybackFailure,
    setDurationFromPlayback,
    setIsPlaying,
    setProgressFromPlayback,
    setStatus,
    snapshotRef,
    startProgressSync,
    statusRef,
    stopProgressSync,
    updateProgressFromAudio,
    volumeRef,
  ])
}
