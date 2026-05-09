import { useEffect, useRef, useState } from 'react'

const artworkUrlCache = new Map<number, string>()
const artworkRequestCache = new Map<number, Promise<string>>()
const resolvedArtworkSongIds = new Set<number>()

function isGeneratedSongArtworkUrl(artworkUrl: string) {
  return artworkUrl.startsWith('smplayer-artwork://')
}

function isVersionedSongArtworkUrl(artworkUrl: string) {
  return isGeneratedSongArtworkUrl(artworkUrl) && artworkUrl.includes('?v=')
}

function canPrimeArtworkUrl(artworkUrl: string) {
  return artworkUrl !== '' && (!isGeneratedSongArtworkUrl(artworkUrl) || isVersionedSongArtworkUrl(artworkUrl))
}

function canUseArtworkUrl(songId: number, artworkUrl: string) {
  return artworkUrl !== '' && (!isGeneratedSongArtworkUrl(artworkUrl) || isVersionedSongArtworkUrl(artworkUrl) || resolvedArtworkSongIds.has(songId))
}

function versionArtworkUrl(artworkUrl: string, version: number) {
  if (!artworkUrl || version === 0) {
    return artworkUrl
  }

  return `${artworkUrl}${artworkUrl.includes('?') ? '&' : '?'}v=${version}`
}

export function primeSongArtwork(songId: number, artworkUrl: string) {
  if (canPrimeArtworkUrl(artworkUrl)) {
    artworkUrlCache.set(songId, artworkUrl)
    resolvedArtworkSongIds.add(songId)
  }
}

export async function resolveSongArtwork(songId: number, artworkUrl = '', force = false) {
  if (!force && canUseArtworkUrl(songId, artworkUrl)) {
    primeSongArtwork(songId, artworkUrl)
    return artworkUrl
  }

  if (!force && artworkUrlCache.has(songId)) {
    const cachedArtworkUrl = artworkUrlCache.get(songId)!
    if (!isGeneratedSongArtworkUrl(cachedArtworkUrl) || resolvedArtworkSongIds.has(songId)) {
      return cachedArtworkUrl
    }
  }

  if (!force && artworkRequestCache.has(songId)) {
    return artworkRequestCache.get(songId)!
  }

  const request = window.smplayer!.getSongArtworkSnapshot(songId)
    .then((snapshot) => {
      artworkUrlCache.set(songId, snapshot.artworkUrl)
      resolvedArtworkSongIds.add(songId)
      artworkRequestCache.delete(songId)
      return snapshot.artworkUrl
    })
    .catch((error) => {
      artworkRequestCache.delete(songId)
      throw error
    })

  artworkRequestCache.set(songId, request)
  return request
}

export async function resolveSongArtworks(songIds: number[], force = false) {
  const uniqueSongIds = [...new Set(songIds)]
  const missingSongIds = force
    ? uniqueSongIds
    : uniqueSongIds.filter((songId) => {
        if (!artworkUrlCache.has(songId)) {
          return true
        }
        return isGeneratedSongArtworkUrl(artworkUrlCache.get(songId)!) && !resolvedArtworkSongIds.has(songId)
      })

  if (missingSongIds.length > 0) {
    const pendingRequests: Promise<string>[] = []
    for (const songId of missingSongIds) {
      const request = artworkRequestCache.get(songId)
      if (request) {
        pendingRequests.push(request)
      }
    }
    const requestSongIds = missingSongIds.filter((songId) => !artworkRequestCache.has(songId))

    if (requestSongIds.length > 0) {
      const batchRequest = window.smplayer!.getSongArtworkSnapshots(requestSongIds)
        .then((snapshots) => {
          const snapshotsBySongId = new Map(snapshots.map((snapshot) => [snapshot.songId, snapshot.artworkUrl]))
          for (const songId of requestSongIds) {
            artworkUrlCache.set(songId, snapshotsBySongId.get(songId) ?? '')
            resolvedArtworkSongIds.add(songId)
            artworkRequestCache.delete(songId)
          }
        })
        .catch((error) => {
          for (const songId of requestSongIds) {
            artworkRequestCache.delete(songId)
          }
          throw error
        })

      for (const songId of requestSongIds) {
        artworkRequestCache.set(songId, batchRequest.then(() => artworkUrlCache.get(songId) ?? ''))
      }
      await batchRequest
    }

    if (pendingRequests.length > 0) {
      await Promise.all(pendingRequests)
    }
  }

  return new Map(uniqueSongIds.map((songId) => [songId, artworkUrlCache.get(songId) ?? '']))
}

export function useSongArtwork(songId: number | null | undefined, artworkUrl = '') {
  const [resolvedArtworkUrl, setResolvedArtworkUrl] = useState(() =>
    songId == null || !canUseArtworkUrl(songId, artworkUrl) ? '' : artworkUrl,
  )
  const [version, setVersion] = useState(0)
  const refreshedSongIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (songId == null) {
      setResolvedArtworkUrl('')
      setVersion(0)
      return
    }

    let isDisposed = false
    setVersion(0)
    refreshedSongIdRef.current = null
    setResolvedArtworkUrl(canUseArtworkUrl(songId, artworkUrl) ? artworkUrl : '')

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
    if (refreshedSongIdRef.current === songId) {
      return
    }

    refreshedSongIdRef.current = songId
    void resolveSongArtwork(songId, '', true).then((nextArtworkUrl) => {
      setResolvedArtworkUrl(nextArtworkUrl)
      if (nextArtworkUrl && nextArtworkUrl !== resolvedArtworkUrl) {
        setVersion((current) => current + 1)
      }
    })
  }

  return {
    artworkUrl: versionArtworkUrl(resolvedArtworkUrl, version),
    baseArtworkUrl: resolvedArtworkUrl,
    refreshArtwork,
  }
}
