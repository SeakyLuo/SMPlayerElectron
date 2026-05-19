export interface MpvPlaybackLoadRequest {
  songId: number
  volume: number
  muted: boolean
  autoplay: boolean
}

export interface MpvPlaybackState {
  songId: number | null
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
}

export type MpvPlaybackEvent =
  | { type: 'loadedmetadata'; songId: number; duration: number }
  | { type: 'durationchange'; songId: number | null; duration: number }
  | { type: 'timeupdate'; songId: number | null; currentTime: number }
  | { type: 'play'; songId: number | null }
  | { type: 'playing'; songId: number | null }
  | { type: 'pause'; songId: number | null }
  | { type: 'seeking'; songId: number | null; currentTime: number }
  | { type: 'seeked'; songId: number | null; currentTime: number }
  | { type: 'ended'; songId: number | null }
  | { type: 'error'; songId: number | null; message: string }
