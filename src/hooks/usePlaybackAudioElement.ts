import { useEffect } from 'react'

import type { MusicData, PlaybackMode } from '../shared/contracts'
import type { PlaybackTransition } from './playbackStateMachine'

interface MutableRef<T> {
  current: T
}

interface PlaybackAudioElementOptions {
  audioRef: MutableRef<HTMLAudioElement | null>
  snapshotRef: MutableRef<MusicData>
  currentTrackIdRef: MutableRef<number | null>
  pendingStartSecondsRef: MutableRef<number>
  pendingAutoplayRef: MutableRef<boolean>
  volumeRef: MutableRef<number>
  isMutedRef: MutableRef<boolean>
  isUserSeekingRef: MutableRef<boolean>
  pendingSeekSecondsRef: MutableRef<number | null>
  durationSecondsRef: MutableRef<number>
  failedTrackIdsRef: MutableRef<Set<number>>
  transitionStatus: (transition: PlaybackTransition) => void
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
  finishCurrentTrack: () => Promise<void>
  clamp: (value: number, min: number, max: number) => number
}

export function usePlaybackAudioElement({
  audioRef,
  snapshotRef,
  currentTrackIdRef,
  pendingStartSecondsRef,
  pendingAutoplayRef,
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
}: PlaybackAudioElementOptions) {
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = clamp(volumeRef.current / 100, 0, 1)
    audio.muted = isMutedRef.current
    audioRef.current = audio

    const handleLoadStart = () => {
      if (pendingAutoplayRef.current) {
        transitionStatus({ type: 'play-requested' })
      }
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
        transitionStatus({ type: 'ready' })
      }
    }

    const handleTimeUpdate = () => {
      clearStalledTimer()
      updateProgressFromAudio()
    }

    const isAtPlaybackEnd = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : durationSecondsRef.current
      return duration > 0 && duration - audio.currentTime <= 0.5
    }

    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationFromPlayback(audio.duration)
        persistResolvedDuration(currentTrackIdRef.current, audio.duration)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      transitionStatus({ type: 'playing' })
      startProgressSync()
    }

    const handlePlaying = () => {
      clearStalledTimer()
      failedTrackIdsRef.current.clear()
      setIsPlaying(true)
      transitionStatus({ type: 'playing' })
      startProgressSync()
    }

    const handlePause = () => {
      setIsPlaying(false)
      stopProgressSync()
      clearStalledTimer()
      transitionStatus({ type: 'pause' })
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }

    const handleCanPlay = () => {
      clearStalledTimer()
      if (pendingAutoplayRef.current) {
        return
      }

      transitionStatus({
        type: 'can-play',
        paused: audio.paused,
        pendingAutoplay: pendingAutoplayRef.current,
      })
    }

    const handleWaiting = () => {
      if (!audio.paused) {
        if (isAtPlaybackEnd()) {
          void finishCurrentTrack()
          return
        }

        transitionStatus({ type: 'buffering' })
        armStalledTimer()
      }
    }

    const handleSeeking = () => {
      clearStalledTimer()
      if (!isUserSeekingRef.current) {
        transitionStatus({ type: 'seeking' })
      }
    }

    const handleSeeked = () => {
      clearStalledTimer()
      pendingSeekSecondsRef.current = null
      updateProgressFromAudio()
      if (!audio.paused) {
        transitionStatus({ type: 'playing' })
        startProgressSync()
        return
      }

      transitionStatus({ type: 'seeked', paused: true })
    }

    const handlePlaybackFailure = () => {
      stopProgressSync()
      transitionStatus({ type: 'buffering' })
      void recoverFromPlaybackFailure()
    }

    const handleEnded = async () => {
      await finishCurrentTrack()
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
    currentTrackIdRef,
    durationSecondsRef,
    failedTrackIdsRef,
    finishCurrentTrack,
    isMutedRef,
    isUserSeekingRef,
    pendingAutoplayRef,
    pendingSeekSecondsRef,
    pendingStartSecondsRef,
    persistPlaybackSettings,
    persistResolvedDuration,
    recoverFromPlaybackFailure,
    setDurationFromPlayback,
    setIsPlaying,
    setProgressFromPlayback,
    snapshotRef,
    startProgressSync,
    stopProgressSync,
    transitionStatus,
    updateProgressFromAudio,
    volumeRef,
  ])
}
