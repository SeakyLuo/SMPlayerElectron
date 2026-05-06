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
  isPlaying: boolean
  progressSeconds: number
  durationSeconds: number
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playTrack: (trackId: number, queueSongIds?: number[]) => Promise<void>
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
  toggleShuffle: () => void
  toggleRepeat: () => void
  toggleRepeatOne: () => void
  cycleRepeatMode: () => void
}

interface LoadTrackOptions {
  autoplay: boolean
  startAt: number
}

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
  const loadTrackRef = useRef<(trackId: number, options: LoadTrackOptions) => Promise<void>>(
    async () => {},
  )

  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [volume, setVolume] = useState(72)
  const [isMuted, setIsMuted] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('once')

  const snapshotRef = useRef(snapshot)
  const currentTrackIdRef = useRef(currentTrackId)
  const isPlayingRef = useRef(isPlaying)
  const progressSecondsRef = useRef(progressSeconds)
  const durationSecondsRef = useRef(durationSeconds)
  const volumeRef = useRef(volume)
  const isMutedRef = useRef(isMuted)
  const modeRef = useRef(mode)

  const snapshotQueueSongIds = normalizeQueueSongIds(snapshot.nowPlaying.songIds, snapshot.songs)

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    currentTrackIdRef.current = currentTrackId
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
    durationSeconds,
    isMuted,
    isPlaying,
    mode,
    progressSeconds,
    snapshot,
    snapshotQueueSongIds,
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
        override.lastMusicIndex ?? currentIndex(getPlaybackSongIds(), currentTrackIdRef.current)
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

  useLayoutEffect(() => {
    loadTrackRef.current = async (trackId: number, options: LoadTrackOptions) => {
      const audio = audioRef.current
      const track = snapshotRef.current.songs.find((song) => song.id === trackId)

      if (!audio || !track) {
        return
      }

      currentTrackIdRef.current = trackId
      setCurrentTrackId(trackId)
      setProgressSeconds(options.startAt)
      setDurationSeconds(track.duration)
      pendingStartSecondsRef.current = options.startAt
      pendingAutoplayRef.current = options.autoplay

      if (loadedTrackIdRef.current !== trackId) {
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
            setIsPlaying(false)
          }
        } else {
          audio.pause()
        }
      }

      await persistPlaybackSettings({
        lastMusicIndex: currentIndex(getPlaybackSongIds(), trackId),
        musicProgress: options.startAt,
      })
    }
  }, [getPlaybackSongIds, persistPlaybackSettings])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = clamp(volumeRef.current / 100, 0, 1)
    audio.muted = isMutedRef.current
    audioRef.current = audio

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

      if (pendingAutoplayRef.current) {
        try {
          await audio.play()
        } catch {
          setIsPlaying(false)
        }
      }

      pendingAutoplayRef.current = false
    }

    const handleTimeUpdate = () => {
      setProgressSeconds(audio.currentTime)
    }

    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSeconds(audio.duration)
        persistResolvedDuration(audio.duration)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
    }

    const handlePause = () => {
      setIsPlaying(false)
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }

    const handleEnded = async () => {
      const playbackSongIds = getPlaybackSongIds()
      const activeIndex = currentIndex(playbackSongIds, currentTrackIdRef.current)
      const activeTrack =
        currentTrackIdRef.current == null
          ? null
          : snapshotRef.current.songs.find((song) => song.id === currentTrackIdRef.current) ?? null

      if (activeTrack && window.smplayer) {
        await window.smplayer.markSongPlayed(activeTrack.id)
      }

      if (playbackSongIds.length === 0) {
        setIsPlaying(false)
        return
      }

      if (modeRef.current === 'repeat-one' && activeTrack) {
        await loadTrackRef.current(activeTrack.id, { autoplay: true, startAt: 0 })
        return
      }

      const nextIndex = activeIndex + 1
      if (nextIndex < playbackSongIds.length) {
        await loadTrackRef.current(playbackSongIds[nextIndex], { autoplay: true, startAt: 0 })
        return
      }

      if (modeRef.current === 'repeat') {
        await loadTrackRef.current(playbackSongIds[0], { autoplay: true, startAt: 0 })
        return
      }

      setIsPlaying(false)
      setProgressSeconds(durationSecondsRef.current)
      await persistPlaybackSettings({ musicProgress: durationSecondsRef.current })
    }

    const handleBeforeUnload = () => {
      void persistPlaybackSettings({ musicProgress: audio.currentTime })
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      audio.pause()
      audio.src = ''
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audioRef.current = null
    }
  }, [getPlaybackSongIds, persistPlaybackSettings, persistResolvedDuration])

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
      startTransition(() => {
        setCurrentTrackId(null)
        setProgressSeconds(0)
        setDurationSeconds(0)
      })
      return
    }

    if (
      currentTrackIdRef.current != null &&
      playbackSongIds.includes(currentTrackIdRef.current) &&
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
      startAt:
        snapshot.settings.saveMusicProgress &&
        (currentTrackIdRef.current == null || restoredTrackId === currentTrackIdRef.current)
          ? snapshot.settings.musicProgress
          : 0,
    })
  }, [snapshot, snapshotQueueSongIds])

  const playTrack = useCallback(async (trackId: number, queueSongIds?: number[]) => {
    if (queueSongIds) {
      queueOverrideRef.current = normalizeQueueSongIds(queueSongIds, snapshotRef.current.songs)
      queueSongIdsRef.current = queueOverrideRef.current
    }

    await loadTrackRef.current(trackId, { autoplay: true, startAt: 0 })
  }, [])

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (!currentTrackIdRef.current) {
      const firstTrackId = getPlaybackSongIds()[0]
      if (firstTrackId != null) {
        await loadTrackRef.current(firstTrackId, { autoplay: true, startAt: 0 })
      }
      return
    }

    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setIsPlaying(false)
      }
    } else {
      audio.pause()
    }
  }, [getPlaybackSongIds])

  const playNext = useCallback(async () => {
    const playbackSongIds = getPlaybackSongIds()
    if (playbackSongIds.length === 0) {
      return
    }

    const nextTrackId = moveNext(playbackSongIds, currentTrackIdRef.current, modeRef.current)
    if (nextTrackId != null) {
      await loadTrackRef.current(nextTrackId, { autoplay: true, startAt: 0 })
    }
  }, [getPlaybackSongIds])

  const playPrevious = useCallback(async () => {
    const audio = audioRef.current
    const playbackSongIds = getPlaybackSongIds()

    if (!audio || playbackSongIds.length === 0) {
      return
    }

    const previousTrackId = movePrev(playbackSongIds, currentTrackIdRef.current, modeRef.current)
    if (previousTrackId != null) {
      await loadTrackRef.current(previousTrackId, { autoplay: true, startAt: 0 })
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
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings],
  )

  const seekToSeconds = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      const safeDuration = durationSecondsRef.current
      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(seconds, 0, safeDuration)
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings],
  )

  const beginSeek = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    wasPlayingBeforeSeekRef.current = !audio.paused
    audio.pause()
  }, [])

  const endSeek = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !wasPlayingBeforeSeekRef.current) {
      return
    }

    void audio.play().catch(() => {
      setIsPlaying(false)
    })
  }, [])

  const seekBySeconds = useCallback(
    (offsetSeconds: number) => {
      const audio = audioRef.current
      const safeDuration = durationSecondsRef.current

      if (!audio || safeDuration <= 0) {
        return
      }

      const nextTime = clamp(audio.currentTime + offsetSeconds, 0, safeDuration)
      audio.currentTime = nextTime
      setProgressSeconds(nextTime)
      void persistPlaybackSettings({ musicProgress: nextTime })
    },
    [persistPlaybackSettings],
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

  const toggleShuffle = useCallback(() => {
    const nextMode = modeRef.current === 'shuffle' ? 'once' : 'shuffle'
    if (nextMode === 'shuffle') {
      queueOverrideRef.current = shuffleOthers(getPlaybackSongIds(), currentTrackIdRef.current)
      queueSongIdsRef.current = queueOverrideRef.current
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
    })
  }, [currentTrack])

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
    toggleShuffle,
    toggleRepeat,
    toggleRepeatOne,
    cycleRepeatMode,
  }
}
