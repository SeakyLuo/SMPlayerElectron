export function removeQueueRange(queueSongIds: number[], startIndex: number, count: number) {
  return [
    ...queueSongIds.slice(0, startIndex),
    ...queueSongIds.slice(startIndex + count),
  ]
}

export function insertQueueSongs(queueSongIds: number[], index: number, songIds: number[]) {
  return [
    ...queueSongIds.slice(0, index),
    ...songIds,
    ...queueSongIds.slice(index),
  ]
}

export function insertQueueEntries(
  queueSongIds: number[],
  entries: Array<{ index: number, songId: number }>,
) {
  let nextQueueSongIds = queueSongIds

  for (const entry of entries) {
    nextQueueSongIds = insertQueueSongs(nextQueueSongIds, entry.index, [entry.songId])
  }

  return nextQueueSongIds
}
