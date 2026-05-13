export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'seeking'

export type PlaybackTransition =
  | { type: 'idle' }
  | { type: 'load-track'; autoplay: boolean }
  | { type: 'ready' }
  | { type: 'play-requested' }
  | { type: 'playing' }
  | { type: 'pause' }
  | { type: 'paused' }
  | { type: 'buffering' }
  | { type: 'seeking' }
  | { type: 'seeked'; paused: boolean }
  | { type: 'can-play'; paused: boolean; pendingAutoplay: boolean }

export function transitionPlaybackStatus(
  currentStatus: PlaybackStatus,
  transition: PlaybackTransition,
): PlaybackStatus {
  switch (transition.type) {
    case 'idle':
      return 'idle'
    case 'load-track':
      return 'loading'
    case 'ready':
      return 'ready'
    case 'play-requested':
      return 'loading'
    case 'playing':
      return 'playing'
    case 'pause':
      return currentStatus === 'loading' || currentStatus === 'seeking' || currentStatus === 'buffering'
        ? currentStatus
        : 'paused'
    case 'paused':
      return 'paused'
    case 'buffering':
      return 'buffering'
    case 'seeking':
      return 'seeking'
    case 'seeked':
      return transition.paused ? 'paused' : 'playing'
    case 'can-play':
      return transition.pendingAutoplay
        ? currentStatus
        : transition.paused
          ? 'ready'
          : 'playing'
  }
}
