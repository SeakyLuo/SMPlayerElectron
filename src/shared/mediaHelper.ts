import type { LibrarySong, PlaybackMode } from './contracts'

export interface PlaybackQueueResult {
  songIds: number[]
  trackId: number | null
}

export function currentIndex(songIds: number[], currentTrackId: number | null) {
  return currentTrackId == null ? -1 : songIds.indexOf(currentTrackId)
}

export function normalizeQueueSongIds(songIds: number[], songs: LibrarySong[]) {
  const songIdsInLibrary = new Set(songs.map((song) => song.id))
  return songIds.filter((songId) => songIdsInLibrary.has(songId))
}

export function samePlaylist(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((songId, index) => songId === right[index])
}

export function addMusic(songIds: number[], songId: number, index = songIds.length) {
  const nextSongIds = songIds.slice()
  nextSongIds.splice(index, 0, songId)
  return nextSongIds
}

export function clear() {
  return []
}

export function setPlaylist(songIds: number[], targetTrackId: number | null = null): PlaybackQueueResult {
  return {
    songIds: songIds.slice(),
    trackId: moveToMusic(songIds, targetTrackId) ? targetTrackId : songIds[0] ?? null,
  }
}

export function setPlaylistAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(songIds, targetTrackId)
}

export function setMusicAndPlay(songId: number): PlaybackQueueResult {
  return {
    songIds: addMusic(clear(), songId),
    trackId: songId,
  }
}

export function setMusicAndPlayFromPlaylist(
  currentSongIds: number[],
  nextSongIds: number[],
  targetTrackId: number,
  shuffleEnabled: boolean,
) {
  const songIds = samePlaylist(nextSongIds, currentSongIds)
    ? currentSongIds
    : shuffleEnabled
      ? shufflePlaylist(nextSongIds, targetTrackId)
      : nextSongIds.slice()

  return {
    songIds,
    trackId: moveToMusic(songIds, targetTrackId) ? targetTrackId : songIds[0] ?? null,
  }
}

export function shuffleAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(shufflePlaylist(songIds, targetTrackId ?? undefined), targetTrackId)
}

export function quickPlay(songIds: number[], randomLimit = 100) {
  return setPlaylistAndPlay(songIds.slice(0, randomLimit))
}

export function shuffleOthers(songIds: number[], currentTrackId: number | null) {
  const index = currentIndex(songIds, currentTrackId)
  if (index === -1) {
    return songIds
  }

  return shufflePlaylist(songIds, currentTrackId!)
}

export function shufflePlaylist(songIds: number[], startTrackId?: number) {
  const shuffled = songIds.slice()

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = current
  }

  if (startTrackId != null) {
    const startIndex = shuffled.indexOf(startTrackId)
    if (startIndex > -1) {
      shuffled.splice(startIndex, 1)
      shuffled.unshift(startTrackId)
    }
  }

  return shuffled
}

export function moveToMusic(songIds: number[], targetTrackId: number | null) {
  return targetTrackId != null && songIds.includes(targetTrackId)
}

export function moveToMusicOrPlay(
  songIds: number[],
  targetTrackId: number,
  targetIndex: number,
  currentTrackId: number | null,
) {
  if (targetIndex > -1 && targetIndex < songIds.length && songIds[targetIndex] === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
    }
  }

  if (currentTrackId === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
    }
  }

  const playlistIndex = songIds.indexOf(targetTrackId)
  return playlistIndex === -1
    ? addNextAndPlay(songIds, targetTrackId, currentTrackId)
    : {
        songIds,
        trackId: targetTrackId,
      }
}

export function addNextAndPlay(
  songIds: number[],
  targetTrackId: number,
  currentTrackId: number | null,
) {
  if (moveToMusic(songIds, targetTrackId)) {
    return {
      songIds,
      trackId: targetTrackId,
    }
  }

  const index = currentIndex(songIds, currentTrackId)
  const nextSongIds = addMusic(songIds, targetTrackId, index + 1)
  return {
    songIds: nextSongIds,
    trackId: targetTrackId,
  }
}

export function moveNext(songIds: number[], currentTrackId: number | null, mode: PlaybackMode) {
  const index = currentIndex(songIds, currentTrackId)
  const nextIndex = index + 1

  if (nextIndex < songIds.length) {
    return songIds[nextIndex]
  }

  return mode === 'repeat' ? songIds[0] : null
}

export function movePrev(songIds: number[], currentTrackId: number | null, mode: PlaybackMode) {
  const index = currentIndex(songIds, currentTrackId)
  const previousIndex = index - 1

  if (previousIndex >= 0) {
    return songIds[previousIndex]
  }

  return mode === 'repeat' ? songIds[songIds.length - 1] : null
}

export function playNext(songIds: number[], targetTrackId: number, currentTrackId: number | null) {
  const index = songIds.indexOf(targetTrackId)
  const activeIndex = currentIndex(songIds, currentTrackId)

  if (index > -1) {
    return moveMusic(songIds, index, activeIndex + (index < activeIndex ? 0 : 1), currentTrackId)
  }

  return addMusic(songIds, targetTrackId, activeIndex + 1)
}

export function moveMusic(songIds: number[], from: number, to: number, currentTrackId: number | null) {
  if (from === to) {
    return songIds
  }

  const nextSongIds = songIds.slice()
  const current = nextSongIds[from]

  if (from === currentIndex(nextSongIds, currentTrackId)) {
    const stepCount = Math.abs(from - to)
    for (let index = 0; index < stepCount; index += 1) {
      const item = nextSongIds[to]
      nextSongIds.splice(to, 1)
      nextSongIds.splice(from, 0, item)
    }
    return nextSongIds
  }

  nextSongIds.splice(from, 1)
  nextSongIds.splice(to, 0, current)
  return nextSongIds
}

export function removeMusic(songIds: number[], index: number) {
  const nextSongIds = songIds.slice()
  nextSongIds.splice(index, 1)
  return nextSongIds
}
