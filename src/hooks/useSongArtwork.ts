import { useEffect, useState } from 'react'

const artworkUrlCache = new Map<number, string>()
const artworkRequestCache = new Map<number, Promise<string>>()
const artworkBatchSongIds = new Set<number>()
const artworkBatchResolvers = new Map<number, Array<{
  resolve: (artworkUrl: string) => void
  reject: (error: unknown) => void
}>>()
let artworkBatchTimer = 0

function isGeneratedSongArtworkUrl(artworkUrl: string) {
  return artworkUrl.startsWith('smplayer-artwork://')
}

function canPrimeArtworkUrl(artworkUrl: string) {
  return artworkUrl !== ''
}

function canUseArtworkUrl(songId: number, artworkUrl: string) {
  return artworkUrl !== '' && (!isGeneratedSongArtworkUrl(artworkUrl) || artworkUrlCache.get(songId) === artworkUrl)
}

function getUsableArtworkUrl(songId: number, artworkUrl: string) {
  if (artworkUrl && !isGeneratedSongArtworkUrl(artworkUrl)) {
    return artworkUrl
  }

  if (artworkUrlCache.has(songId)) {
    return artworkUrlCache.get(songId)!
  }

  return ''
}

function requestBatchedArtworkSnapshot(songId: number) {
  const request = new Promise<string>((resolve, reject) => {
    artworkBatchSongIds.add(songId)
    const resolvers = artworkBatchResolvers.get(songId)
    if (resolvers) {
      resolvers.push({ resolve, reject })
    } else {
      artworkBatchResolvers.set(songId, [{ resolve, reject }])
    }

    if (artworkBatchTimer === 0) {
      artworkBatchTimer = window.setTimeout(flushArtworkBatch, 0)
    }
  })

  return request
}

function flushArtworkBatch() {
  artworkBatchTimer = 0
  const requestSongIds = [...artworkBatchSongIds]
  artworkBatchSongIds.clear()

  void window.smplayer!.getSongArtworkSnapshots(requestSongIds)
    .then((snapshots) => {
      const snapshotsBySongId = new Map(snapshots.map((snapshot) => [snapshot.songId, snapshot.artworkUrl]))
      for (const songId of requestSongIds) {
        const artworkUrl = snapshotsBySongId.get(songId) ?? ''
        artworkUrlCache.set(songId, artworkUrl)
        artworkRequestCache.delete(songId)
        const resolvers = artworkBatchResolvers.get(songId)!
        artworkBatchResolvers.delete(songId)
        for (const resolver of resolvers) {
          resolver.resolve(artworkUrl)
        }
      }
    })
    .catch((error) => {
      for (const songId of requestSongIds) {
        artworkRequestCache.delete(songId)
        const resolvers = artworkBatchResolvers.get(songId)!
        artworkBatchResolvers.delete(songId)
        for (const resolver of resolvers) {
          resolver.reject(error)
        }
      }
    })
}

export function primeSongArtwork(songId: number, artworkUrl: string) {
  if (canPrimeArtworkUrl(artworkUrl)) {
    artworkUrlCache.set(songId, artworkUrl)
  }
}

export async function resolveSongArtwork(songId: number, artworkUrl = '', force = false) {
  if (!force && canUseArtworkUrl(songId, artworkUrl)) {
    primeSongArtwork(songId, artworkUrl)
    return artworkUrl
  }

  if (!force && artworkUrlCache.has(songId)) {
    return artworkUrlCache.get(songId)!
  }

  if (!force && artworkRequestCache.has(songId)) {
    return artworkRequestCache.get(songId)!
  }

  const request = requestBatchedArtworkSnapshot(songId)

  artworkRequestCache.set(songId, request)
  return request
}

export async function resolveSongArtworks(songIds: number[], force = false) {
  const uniqueSongIds = [...new Set(songIds)]
  const missingSongIds = force
    ? uniqueSongIds
    : uniqueSongIds.filter((songId) => !artworkUrlCache.has(songId))

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

export async function resolveSongArtworkSnapshots(songIds: number[]) {
  const uniqueSongIds = [...new Set(songIds)]
  const snapshots = await window.smplayer!.getSongArtworkSnapshots(uniqueSongIds)
  const snapshotsBySongId = new Map(snapshots.map((snapshot) => [snapshot.songId, snapshot]))
  return uniqueSongIds.map((songId) => snapshotsBySongId.get(songId))
}

export function useSongArtwork(songId: number | null | undefined, artworkUrl = '') {
  const [resolvedArtworkUrl, setResolvedArtworkUrl] = useState(() =>
    songId == null ? '' : getUsableArtworkUrl(songId, artworkUrl),
  )

  useEffect(() => {
    if (songId == null) {
      setResolvedArtworkUrl('')
      return
    }

    let isDisposed = false
    setResolvedArtworkUrl(getUsableArtworkUrl(songId, artworkUrl))

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
    })
  }

  return {
    artworkUrl: resolvedArtworkUrl,
    baseArtworkUrl: resolvedArtworkUrl,
    refreshArtwork,
  }
}
