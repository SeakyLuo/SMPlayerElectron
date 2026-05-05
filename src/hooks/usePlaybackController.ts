import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { LibrarySnapshot, LibrarySong, PlaybackMode } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'

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
  setVolumeLevel: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeatMode: () => void
}

interface LoadTrackOptions {
  autoplay: boolean
  startAt: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getTrackIndex(songIds: number[], trackId: number | null) {
  if (trackId == null) {
    return -1
  }

  return songIds.findIndex((songId) => songId === trackId)
}

function getRandomIndex(length: number, currentIndex: number) {
  if (length <= 1) {
    return 0
  }

  let nextIndex = currentIndex
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * length)
  }

  return nextIndex
}

function areArraysEqual(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function normalizeQueueSongIds(songIds: number[], songs: LibrarySong[]) {
  const songIdsInLibrary = new Set(songs.map((song) => song.id))
  return songIds.filter((songId) => songIdsInLibrary.has(songId))
}

export function usePlaybackController(snapshot: LibrarySnapshot): PlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedTrackIdRef = useRef<number | null>(null)
  const pendingStartSecondsRef = useRef(0)
  const pendingAutoplayRef = useRef(false)
  const hydratedRef = useRef(false)
  const queueOverrideRef = useRef<number[] | null>(null)
  const queueSongIdsRef = useRef<number[]>([])
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
      areArraysEqual(queueOverrideRef.current, snapshotQueueSongIds)
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
        override.lastMusicIndex ?? getTrackIndex(getPlaybackSongIds(), currentTrackIdRef.current)
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
        lastMusicIndex: getTrackIndex(getPlaybackSongIds(), trackId),
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
      const currentIndex = getTrackIndex(playbackSongIds, currentTrackIdRef.current)
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

      if (modeRef.current === 'shuffle') {
        const nextIndex = getRandomIndex(playbackSongIds.length, Math.max(currentIndex, 0))
        await loadTrackRef.current(playbackSongIds[nextIndex], { autoplay: true, startAt: 0 })
        return
      }

      const nextIndex = currentIndex + 1
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
  }, [getPlaybackSongIds, persistPlaybackSettings])

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

    const currentIndex = getTrackIndex(playbackSongIds, currentTrackIdRef.current)
    const nextIndex =
      modeRef.current === 'shuffle'
        ? getRandomIndex(playbackSongIds.length, Math.max(currentIndex, 0))
        : (Math.max(currentIndex, 0) + 1) % playbackSongIds.length

    await loadTrackRef.current(playbackSongIds[nextIndex], { autoplay: true, startAt: 0 })
  }, [getPlaybackSongIds])

  const playPrevious = useCallback(async () => {
    const audio = audioRef.current
    const playbackSongIds = getPlaybackSongIds()

    if (!audio || playbackSongIds.length === 0) {
      return
    }

    if (audio.currentTime > 5) {
      audio.currentTime = 0
      setProgressSeconds(0)
      await persistPlaybackSettings({ musicProgress: 0 })
      return
    }

    const currentIndex = getTrackIndex(playbackSongIds, currentTrackIdRef.current)
    const previousIndex = currentIndex <= 0 ? playbackSongIds.length - 1 : currentIndex - 1

    await loadTrackRef.current(playbackSongIds[previousIndex], { autoplay: true, startAt: 0 })
  }, [getPlaybackSongIds, persistPlaybackSettings])

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

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [playNext, playPrevious, seekToRatio, togglePlayPause])

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
    setVolumeLevel,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
  }
}
