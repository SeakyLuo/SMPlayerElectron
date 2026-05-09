import { useEffect, useRef } from 'react'

import { getDisplayArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'

export function useTrackNotification(currentTrack: LibrarySong | null) {
  const lastNotifiedTrackIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!currentTrack || !window.smplayer) {
      return
    }

    if (lastNotifiedTrackIdRef.current == null) {
      lastNotifiedTrackIdRef.current = currentTrack.id
      return
    }

    if (lastNotifiedTrackIdRef.current === currentTrack.id) {
      return
    }

    lastNotifiedTrackIdRef.current = currentTrack.id
    void window.smplayer.showTrackNotification({
      songId: currentTrack.id,
      title: currentTrack.title,
      artist: getDisplayArtists(currentTrack),
      album: currentTrack.album || 'Unknown album',
    })
  }, [currentTrack])
}
