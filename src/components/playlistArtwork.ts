import { useEffect, useState } from 'react'

import type { LibrarySong } from '../shared/contracts'
import { resolveSongArtworks } from '../hooks/useSongArtwork'

const playlistArtworkUrlsCache = new Map<string, string[]>()

function getPlaylistArtworkSignature(songs: LibrarySong[]) {
  return songs.map((song) => `${song.id}:${song.artworkUrl}`).join('|')
}

export async function resolvePlaylistArtworkUrls(songs: LibrarySong[]) {
  const artworkUrls: string[] = []
  const songsByAlbum = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    const albumSongs = songsByAlbum.get(song.album)
    if (albumSongs) {
      albumSongs.push(song)
    } else {
      songsByAlbum.set(song.album, [song])
    }
  }

  for (const albumSongs of songsByAlbum.values()) {
    const artworkBySongId = await resolveSongArtworks(albumSongs.map((song) => song.id))
    const songWithArtwork = albumSongs.find((song) => artworkBySongId.get(song.id))
    if (songWithArtwork) {
      artworkUrls.push(artworkBySongId.get(songWithArtwork.id)!)
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
  const signature = getPlaylistArtworkSignature(songs)
  const [artworkUrls, setArtworkUrls] = useState<string[]>(() => playlistArtworkUrlsCache.get(signature) ?? [])

  useEffect(() => {
    let isDisposed = false
    const cachedArtworkUrls = playlistArtworkUrlsCache.get(signature)
    if (cachedArtworkUrls) {
      setArtworkUrls(cachedArtworkUrls)
      return () => {
        isDisposed = true
      }
    }

    setArtworkUrls([])
    void resolvePlaylistArtworkUrls(songs).then((nextArtworkUrls) => {
      if (!isDisposed) {
        playlistArtworkUrlsCache.set(signature, nextArtworkUrls)
        setArtworkUrls(nextArtworkUrls)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [signature, songs])

  return artworkUrls
}
