import { useEffect } from 'react'

import { getDisplayArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'

interface MediaSessionOptions {
  currentTrack: LibrarySong | null
  unknownAlbum: string
  unknownArtist: string
  artistSeparator: string
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onPlayNext: () => void
  onPlayPrevious: () => void
  onSeekToRatio: (ratio: number) => void
  onSeekBySeconds: (offsetSeconds: number) => void
  getDurationSeconds: () => number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function updateMediaSessionPosition(durationSeconds: number, progressSeconds: number) {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') {
    return
  }

  if (durationSeconds <= 0) {
    navigator.mediaSession.setPositionState()
    return
  }

  navigator.mediaSession.setPositionState({
    duration: durationSeconds,
    playbackRate: 1,
    position: clamp(progressSeconds, 0, durationSeconds),
  })
}

export function useMediaSession({
  currentTrack,
  unknownAlbum,
  unknownArtist,
  artistSeparator,
  isPlaying,
  onPlay,
  onPause,
  onPlayNext,
  onPlayPrevious,
  onSeekToRatio,
  onSeekBySeconds,
  getDurationSeconds,
}: MediaSessionOptions) {
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
      artist: getDisplayArtists(currentTrack, unknownArtist, artistSeparator),
      album: currentTrack.album || unknownAlbum,
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
  }, [currentTrack, unknownAlbum, unknownArtist, artistSeparator])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    navigator.mediaSession.setActionHandler('play', onPlay)
    navigator.mediaSession.setActionHandler('pause', onPause)
    navigator.mediaSession.setActionHandler('previoustrack', onPlayPrevious)
    navigator.mediaSession.setActionHandler('nexttrack', onPlayNext)
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const durationSeconds = getDurationSeconds()
      if (typeof details.seekTime !== 'number' || durationSeconds <= 0) {
        return
      }

      onSeekToRatio(details.seekTime / durationSeconds)
    })
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      onSeekBySeconds(-(details.seekOffset ?? 10))
    })
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      onSeekBySeconds(details.seekOffset ?? 10)
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
  }, [getDurationSeconds, onPause, onPlay, onPlayNext, onPlayPrevious, onSeekBySeconds, onSeekToRatio])
}
