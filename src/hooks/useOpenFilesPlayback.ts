import { useEffect, useState } from 'react'

import type { LibrarySong } from '../shared/contracts'

interface OpenFilesPlaybackOptions {
  songs: LibrarySong[]
  refresh: () => Promise<void>
  playTrack: (trackId: number) => Promise<void>
}

export function useOpenFilesPlayback({ songs, refresh, playTrack }: OpenFilesPlaybackOptions) {
  const [openFileSongIds, setOpenFileSongIds] = useState<number[]>([])

  useEffect(() => {
    if (!window.smplayer) {
      return
    }

    const playOpenedSongs = (songIds: number[]) => {
      if (songIds.length === 0) {
        return
      }

      setOpenFileSongIds(songIds)
      void refresh()
    }

    void window.smplayer.takePendingOpenFiles().then(playOpenedSongs)
    return window.smplayer.onOpenFiles(playOpenedSongs)
  }, [refresh])

  useEffect(() => {
    const firstSongId = openFileSongIds[0]

    if (firstSongId == null || !songs.some((song) => song.id === firstSongId)) {
      return
    }

    setOpenFileSongIds([])
    void playTrack(firstSongId)
  }, [openFileSongIds, playTrack, songs])
}
