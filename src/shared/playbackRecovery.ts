import type { PlaybackMode } from './contracts'
import { currentIndex } from './mediaHelper'

export function getNextRecoverableTrackId({
  playbackSongIds,
  activeTrackId,
  activeQueueIndex,
  mode,
  failedTrackIds,
}: {
  playbackSongIds: number[]
  activeTrackId: number | null
  activeQueueIndex: number
  mode: PlaybackMode
  failedTrackIds: Set<number>
}) {
  const activeIndex = currentIndex(playbackSongIds, activeTrackId, activeQueueIndex)
  const shouldWrap = mode === 'repeat' || mode === 'shuffle'
  const orderedSongIds = shouldWrap
    ? [...playbackSongIds.slice(activeIndex + 1), ...playbackSongIds.slice(0, activeIndex + 1)]
    : playbackSongIds.slice(activeIndex + 1)

  return orderedSongIds.find((songId) => !failedTrackIds.has(songId)) ?? null
}
