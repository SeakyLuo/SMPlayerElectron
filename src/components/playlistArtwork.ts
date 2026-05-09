import { useEffect, useState } from 'react'

import type { LibrarySong } from '../shared/contracts'
import { primeSongArtwork, resolveSongArtwork } from '../hooks/useSongArtwork'

function getPlaylistArtworkSignature(songs: LibrarySong[]) {
  return songs.map((song) => `${song.id}:${song.artworkUrl}`).join('|')
}

export async function resolvePlaylistArtworkUrls(songs: LibrarySong[]) {
  const artworkUrls: string[] = []
  const songsByAlbum = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    if (song.artworkUrl) {
      primeSongArtwork(song.id, song.artworkUrl)
    }
    songsByAlbum.set(song.album, [...(songsByAlbum.get(song.album) ?? []), song])
  }

  for (const albumSongs of songsByAlbum.values()) {
    const songWithArtworkUrl = albumSongs.find((song) => song.artworkUrl)
    if (songWithArtworkUrl) {
      artworkUrls.push(songWithArtworkUrl.artworkUrl)
    }

    if (songWithArtworkUrl) {
      if (artworkUrls.length === 4) {
        return artworkUrls
      }
      continue
    }

    for (const song of albumSongs) {
      const artworkUrl = await resolveSongArtwork(song.id, song.artworkUrl)
      if (artworkUrl) {
        artworkUrls.push(artworkUrl)
        break
      }
    }

    if (artworkUrls.length === 4) {
      return artworkUrls
    }
  }

  return artworkUrls
}

export function getPlaylistArtworkDisplayUrls(artworkUrls: string[]) {
  return artworkUrls.length >= 3 ? artworkUrls.slice(0, 4) : artworkUrls.slice(0, 1)
}

export function usePlaylistArtwork(songs: LibrarySong[]) {
  const [artworkUrls, setArtworkUrls] = useState<string[]>([])
  const signature = getPlaylistArtworkSignature(songs)

  useEffect(() => {
    let isDisposed = false

    void resolvePlaylistArtworkUrls(songs).then((nextArtworkUrls) => {
      if (!isDisposed) {
        setArtworkUrls(nextArtworkUrls)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [signature, songs])

  return artworkUrls
}
