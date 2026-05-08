import { useSyncExternalStore } from 'react'

export interface PlaybackProgressSnapshot {
  progressSeconds: number
  durationSeconds: number
}

let snapshot: PlaybackProgressSnapshot = {
  progressSeconds: 0,
  durationSeconds: 0,
}

const listeners = new Set<() => void>()

export function setPlaybackProgress(nextSnapshot: Partial<PlaybackProgressSnapshot>) {
  const next = {
    ...snapshot,
    ...nextSnapshot,
  }

  if (
    next.progressSeconds === snapshot.progressSeconds &&
    next.durationSeconds === snapshot.durationSeconds
  ) {
    return
  }

  snapshot = next
  for (const listener of listeners) {
    listener()
  }
}

export function getPlaybackProgressSnapshot() {
  return snapshot
}

function subscribePlaybackProgress(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePlaybackProgress() {
  return useSyncExternalStore(
    subscribePlaybackProgress,
    getPlaybackProgressSnapshot,
    getPlaybackProgressSnapshot,
  )
}
