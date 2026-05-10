import type {
  PlaybackMode,
  LibrarySong,
} from './contracts'
import { shuffleArray } from './RandomPlayHelper'

export interface PlaybackQueueResult {
  songIds: number[]
  trackId: number | null
  trackIndex: number | null
}

export function currentIndex(songIds: number[], currentTrackId: number | null, currentTrackIndex = -1) {
  if (currentTrackId == null) {
    return -1
  }

  return currentTrackIndex > -1 && songIds[currentTrackIndex] === currentTrackId
    ? currentTrackIndex
    : songIds.indexOf(currentTrackId)
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
  const targetIndex = currentIndex(songIds, targetTrackId)
  const trackIndex = targetIndex > -1 ? targetIndex : songIds.length > 0 ? 0 : -1

  return {
    songIds: songIds.slice(),
    trackId: trackIndex > -1 ? songIds[trackIndex] : null,
    trackIndex: trackIndex > -1 ? trackIndex : null,
  }
}

export function setPlaylistAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(songIds, targetTrackId)
}

export function setMusicAndPlay(songId: number): PlaybackQueueResult {
  return {
    songIds: addMusic(clear(), songId),
    trackId: songId,
    trackIndex: 0,
  }
}

export function setMusicAndPlayFromPlaylist(
  currentSongIds: number[],
  nextSongIds: number[],
  targetTrackId: number,
  shuffleEnabled: boolean,
  targetIndex = -1,
) {
  const songIds = samePlaylist(nextSongIds, currentSongIds)
    ? currentSongIds
    : shuffleEnabled
      ? shufflePlaylist(nextSongIds, targetTrackId)
      : nextSongIds.slice()
  const resolvedTargetIndex = currentIndex(songIds, targetTrackId, shuffleEnabled && !samePlaylist(nextSongIds, currentSongIds) ? -1 : targetIndex)
  const trackIndex = resolvedTargetIndex > -1 ? resolvedTargetIndex : songIds.length > 0 ? 0 : -1

  return {
    songIds,
    trackId: trackIndex > -1 ? songIds[trackIndex] : null,
    trackIndex: trackIndex > -1 ? trackIndex : null,
  }
}

export function shuffleAndPlay(songIds: number[], targetTrackId: number | null = null) {
  return setPlaylist(shufflePlaylist(songIds, targetTrackId ?? undefined), targetTrackId)
}

export function shuffleOthers(songIds: number[], currentTrackId: number | null) {
  const index = currentIndex(songIds, currentTrackId)
  if (index === -1) {
    return songIds
  }

  return shufflePlaylist(songIds, currentTrackId!)
}

export function shufflePlaylist(songIds: number[], startTrackId?: number) {
  const shuffled = shuffleArray(songIds)

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
  currentTrackIndex = -1,
) {
  if (targetIndex > -1 && targetIndex < songIds.length && songIds[targetIndex] === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: targetIndex,
    }
  }

  const activeIndex = currentIndex(songIds, currentTrackId, currentTrackIndex)
  if (activeIndex > -1 && songIds[activeIndex] === targetTrackId) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: activeIndex,
    }
  }

  const playlistIndex = songIds.indexOf(targetTrackId)
  return playlistIndex === -1
    ? addNextAndPlay(songIds, targetTrackId, currentTrackId, currentTrackIndex)
    : {
        songIds,
        trackId: targetTrackId,
        trackIndex: playlistIndex,
      }
}

export function addNextAndPlay(
  songIds: number[],
  targetTrackId: number,
  currentTrackId: number | null,
  currentTrackIndex = -1,
) {
  const targetIndex = songIds.indexOf(targetTrackId)
  if (targetIndex > -1) {
    return {
      songIds,
      trackId: targetTrackId,
      trackIndex: targetIndex,
    }
  }

  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const nextSongIds = addMusic(songIds, targetTrackId, index + 1)
  return {
    songIds: nextSongIds,
    trackId: targetTrackId,
    trackIndex: index + 1,
  }
}

export function moveNext(songIds: number[], currentTrackId: number | null, mode: PlaybackMode, currentTrackIndex = -1) {
  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const nextIndex = index + 1

  if (nextIndex < songIds.length) {
    return songIds[nextIndex]
  }

  return mode === 'repeat' || mode === 'shuffle' ? songIds[0] : null
}

export function movePrev(songIds: number[], currentTrackId: number | null, mode: PlaybackMode, currentTrackIndex = -1) {
  const index = currentIndex(songIds, currentTrackId, currentTrackIndex)
  const previousIndex = index - 1

  if (previousIndex >= 0) {
    return songIds[previousIndex]
  }

  return mode === 'repeat' || mode === 'shuffle' ? songIds[songIds.length - 1] : null
}

export function playNext(
  songIds: number[],
  targetTrackId: number,
  currentTrackId: number | null,
  targetIndex = -1,
  currentTrackIndex = -1,
) {
  const activeIndex = currentIndex(songIds, currentTrackId, currentTrackIndex)

  if (targetIndex > -1 && targetIndex < songIds.length && songIds[targetIndex] === targetTrackId) {
    return moveMusic(songIds, targetIndex, activeIndex + (targetIndex < activeIndex ? 0 : 1), currentTrackId, currentTrackIndex)
  }

  return addMusic(songIds, targetTrackId, activeIndex + 1)
}

export function moveMusic(songIds: number[], from: number, to: number, currentTrackId: number | null, currentTrackIndex = -1) {
  if (from === to) {
    return songIds
  }

  const nextSongIds = songIds.slice()
  const current = nextSongIds[from]

  if (from === currentIndex(nextSongIds, currentTrackId, currentTrackIndex)) {
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
