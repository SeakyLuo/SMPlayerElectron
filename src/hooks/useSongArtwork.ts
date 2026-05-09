import { useEffect, useState } from 'react'

const artworkUrlCache = new Map<number, string>()
const artworkRequestCache = new Map<number, Promise<string>>()

function versionArtworkUrl(artworkUrl: string, version: number) {
  if (!artworkUrl || version === 0) {
    return artworkUrl
  }

  return `${artworkUrl}${artworkUrl.includes('?') ? '&' : '?'}v=${version}`
}

export function primeSongArtwork(songId: number, artworkUrl: string) {
  if (artworkUrl) {
    artworkUrlCache.set(songId, artworkUrl)
  }
}

export async function resolveSongArtwork(songId: number, artworkUrl = '', force = false) {
  if (artworkUrl) {
    primeSongArtwork(songId, artworkUrl)
    return artworkUrl
  }

  if (!force && artworkUrlCache.has(songId)) {
    return artworkUrlCache.get(songId)!
  }

  if (!force && artworkRequestCache.has(songId)) {
    return artworkRequestCache.get(songId)!
  }

  const request = window.smplayer!.getSongArtwork(songId)
    .then((nextArtworkUrl) => {
      artworkUrlCache.set(songId, nextArtworkUrl)
      artworkRequestCache.delete(songId)
      return nextArtworkUrl
    })
    .catch((error) => {
      artworkRequestCache.delete(songId)
      throw error
    })

  artworkRequestCache.set(songId, request)
  return request
}

export function useSongArtwork(songId: number | null | undefined, artworkUrl = '') {
  const [resolvedArtworkUrl, setResolvedArtworkUrl] = useState(artworkUrl)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (songId == null) {
      setResolvedArtworkUrl('')
      setVersion(0)
      return
    }

    let isDisposed = false
    setVersion(0)

    void resolveSongArtwork(songId, artworkUrl).then((nextArtworkUrl) => {
      if (!isDisposed) {
        setResolvedArtworkUrl(nextArtworkUrl)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [artworkUrl, songId])

  const refreshArtwork = () => {
    if (songId == null) {
      return
    }

    void resolveSongArtwork(songId, '', true).then((nextArtworkUrl) => {
      setResolvedArtworkUrl(nextArtworkUrl)
      setVersion((current) => current + 1)
    })
  }

  return {
    artworkUrl: versionArtworkUrl(resolvedArtworkUrl, version),
    baseArtworkUrl: resolvedArtworkUrl,
    refreshArtwork,
  }
}
