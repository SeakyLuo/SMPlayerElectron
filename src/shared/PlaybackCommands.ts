import type { PlaybackMode } from './contracts'
import {
  addNextAndPlay as buildAddNextAndPlayQueue,
  moveToMusicOrPlay as buildMoveToMusicOrPlayQueue,
  playNext as buildPlayNextQueue,
  setMusicAndPlayFromPlaylist,
} from './mediaHelper'
import { useLibraryStore } from '../state/useLibraryStore'

interface PlaybackRuntime {
  playTrack: (trackId: number, queueSongIds?: number[], queueIndex?: number) => Promise<void>
  getCurrentTrackId: () => number | null
  getCurrentQueueIndex: () => number | null
  getMode: () => PlaybackMode
}

let playbackRuntime: PlaybackRuntime

export class PlaybackCommands {
  static bind(runtime: PlaybackRuntime) {
    playbackRuntime = runtime
  }

  static async playTrackInQueue(trackId: number, queueSongIds: number[], queueIndex = -1) {
    const nextQueue = setMusicAndPlayFromPlaylist(
      useLibraryStore.getState().snapshot.nowPlaying.songIds,
      queueSongIds,
      trackId,
      playbackRuntime.getMode() === 'shuffle',
      queueIndex,
    )

    await useLibraryStore.getState().replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playbackRuntime.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  static async playTrack(trackId: number, queueSongIds?: number[], queueIndex = -1) {
    await playbackRuntime.playTrack(trackId, queueSongIds, queueIndex)
  }

  static async playNext(songId: number, queueIndex = -1) {
    const nextSongIds = buildPlayNextQueue(
      useLibraryStore.getState().snapshot.nowPlaying.songIds,
      songId,
      playbackRuntime.getCurrentTrackId(),
      queueIndex,
      playbackRuntime.getCurrentQueueIndex() ?? -1,
    )
    await useLibraryStore.getState().replaceNowPlaying(nextSongIds)
  }

  static async addNextAndPlay(songId: number) {
    const nextQueue = buildAddNextAndPlayQueue(
      useLibraryStore.getState().snapshot.nowPlaying.songIds,
      songId,
      playbackRuntime.getCurrentTrackId(),
      playbackRuntime.getCurrentQueueIndex() ?? -1,
    )

    await useLibraryStore.getState().replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playbackRuntime.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  static async moveToMusicOrPlay(songId: number, queueIndex = -1) {
    const nextQueue = buildMoveToMusicOrPlayQueue(
      useLibraryStore.getState().snapshot.nowPlaying.songIds,
      songId,
      queueIndex,
      playbackRuntime.getCurrentTrackId(),
      playbackRuntime.getCurrentQueueIndex() ?? -1,
    )

    await useLibraryStore.getState().replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playbackRuntime.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  static async setMusicAndPlay(songIds: number[]) {
    await useLibraryStore.getState().replaceNowPlaying(songIds)
    if (songIds[0] != null) {
      await playbackRuntime.playTrack(songIds[0], songIds, 0)
    }
  }

  static async playOrAddNext(songId: number) {
    const nowPlayingSongIds = useLibraryStore.getState().snapshot.nowPlaying.songIds
    if (nowPlayingSongIds.includes(songId)) {
      await playbackRuntime.playTrack(songId, nowPlayingSongIds)
      return
    }

    await PlaybackCommands.addNextAndPlay(songId)
  }
}
