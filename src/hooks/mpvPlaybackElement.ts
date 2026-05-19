import type { MpvPlaybackEvent } from '../shared/mpvPlayback'

type PlaybackEventName =
  | 'loadstart'
  | 'loadedmetadata'
  | 'timeupdate'
  | 'durationchange'
  | 'canplay'
  | 'play'
  | 'playing'
  | 'waiting'
  | 'stalled'
  | 'seeking'
  | 'seeked'
  | 'error'
  | 'pause'
  | 'ended'

export interface PlaybackMediaElement {
  autoplay: boolean
  preload: string
  src: string
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
  error: Error | null
  volume: number
  muted: boolean
  seeking: boolean
  load: () => void
  play: () => Promise<void>
  pause: () => void
  removeAttribute: (name: string) => void
  addEventListener: (type: PlaybackEventName, listener: EventListener) => void
  removeEventListener: (type: PlaybackEventName, listener: EventListener) => void
  dispose: () => void
}

export function createMpvPlaybackElement(): PlaybackMediaElement {
  return new MpvPlaybackElement()
}

class MpvPlaybackElement extends EventTarget implements PlaybackMediaElement {
  autoplay = false
  preload = 'auto'
  src = ''
  duration = 0
  paused = true
  ended = false
  error: Error | null = null
  seeking = false
  private currentSongId: number | null = null
  private currentTimeSeconds = 0
  private volumePercent = 100
  private mutedValue = false
  private loadRequest: Promise<void> | null = null
  private resolveLoadRequest: (() => void) | null = null
  private rejectLoadRequest: ((error: Error) => void) | null = null
  private readonly unsubscribeMpvPlaybackEvent: () => void

  constructor() {
    super()
    this.unsubscribeMpvPlaybackEvent = window.smplayer!.onMpvPlaybackEvent((event) => {
      this.handleMpvEvent(event)
    })
  }

  get currentTime() {
    return this.currentTimeSeconds
  }

  set currentTime(seconds: number) {
    this.currentTimeSeconds = seconds
    this.seeking = true
    this.dispatchPlaybackEvent('seeking')
    void window.smplayer!.seekMpvPlayback(seconds).catch((error: unknown) => {
      this.handleError(error)
    })
  }

  get volume() {
    return this.volumePercent / 100
  }

  set volume(value: number) {
    this.volumePercent = Math.round(Math.min(1, Math.max(0, value)) * 100)
    if (this.currentSongId == null) {
      return
    }

    void window.smplayer!.setMpvPlaybackVolume(this.volumePercent).catch((error: unknown) => {
      this.handleError(error)
    })
  }

  get muted() {
    return this.mutedValue
  }

  set muted(value: boolean) {
    this.mutedValue = value
    if (this.currentSongId == null) {
      return
    }

    void window.smplayer!.setMpvPlaybackMuted(value).catch((error: unknown) => {
      this.handleError(error)
    })
  }

  load() {
    if (!this.src) {
      return
    }

    const songId = getMpvPlaybackSongId(this.src)
    this.currentSongId = songId
    this.currentTimeSeconds = 0
    this.duration = 0
    this.paused = true
    this.ended = false
    this.error = null
    this.dispatchPlaybackEvent('loadstart')

    this.loadRequest = new Promise<void>((resolve, reject) => {
      this.resolveLoadRequest = resolve
      this.rejectLoadRequest = reject
    })
    void this.loadRequest.catch(() => undefined)

    void window.smplayer!.loadMpvPlaybackSong({
      songId,
      volume: this.volumePercent,
      muted: this.mutedValue,
      autoplay: this.autoplay,
    }).catch((error: unknown) => {
      this.handleError(error)
    })
  }

  async play() {
    if (this.loadRequest) {
      await this.loadRequest
    }

    await window.smplayer!.playMpvPlayback()
  }

  pause() {
    if (this.currentSongId == null) {
      this.paused = true
      return
    }

    if (this.loadRequest && this.paused) {
      return
    }

    void window.smplayer!.pauseMpvPlayback().catch((error: unknown) => {
      this.handleError(error)
    })
  }

  removeAttribute(name: string) {
    if (name !== 'src') {
      return
    }

    const hadLoadedSong = this.currentSongId != null
    this.src = ''
    this.currentSongId = null
    this.currentTimeSeconds = 0
    this.duration = 0
    this.paused = true
    this.ended = false
    this.resolveLoadRequest = null
    this.rejectLoadRequest = null
    this.loadRequest = null
    if (!hadLoadedSong) {
      return
    }

    void window.smplayer!.stopMpvPlayback().catch((error: unknown) => {
      this.handleError(error)
    })
  }

  dispose() {
    this.unsubscribeMpvPlaybackEvent()
  }

  private handleMpvEvent(event: MpvPlaybackEvent) {
    if (event.songId != null && event.songId !== this.currentSongId) {
      return
    }

    switch (event.type) {
      case 'loadedmetadata':
        this.duration = event.duration
        this.currentTimeSeconds = 0
        this.seeking = false
        this.ended = false
        this.resolveLoadRequest?.()
        this.resolveLoadRequest = null
        this.rejectLoadRequest = null
        this.loadRequest = null
        this.dispatchPlaybackEvent('loadedmetadata')
        this.dispatchPlaybackEvent('durationchange')
        this.dispatchPlaybackEvent('canplay')
        break
      case 'durationchange':
        this.duration = event.duration
        this.dispatchPlaybackEvent('durationchange')
        break
      case 'timeupdate':
        this.currentTimeSeconds = event.currentTime
        this.dispatchPlaybackEvent('timeupdate')
        break
      case 'play':
        this.ended = false
        this.dispatchPlaybackEvent('play')
        break
      case 'playing':
        this.paused = false
        this.ended = false
        this.dispatchPlaybackEvent('playing')
        break
      case 'pause':
        this.paused = true
        this.dispatchPlaybackEvent('pause')
        break
      case 'seeking':
        this.seeking = true
        this.currentTimeSeconds = event.currentTime
        this.dispatchPlaybackEvent('seeking')
        break
      case 'seeked':
        this.seeking = false
        this.currentTimeSeconds = event.currentTime
        this.dispatchPlaybackEvent('seeked')
        this.dispatchPlaybackEvent('timeupdate')
        break
      case 'ended':
        this.ended = true
        this.paused = true
        this.dispatchPlaybackEvent('ended')
        break
      case 'error':
        this.handleError(new Error(event.message))
        break
    }
  }

  private handleError(error: unknown) {
    if (this.error) {
      return
    }

    this.error = error instanceof Error ? error : new Error(String(error))
    this.rejectLoadRequest?.(this.error)
    this.resolveLoadRequest = null
    this.rejectLoadRequest = null
    this.loadRequest = null
    this.dispatchPlaybackEvent('error')
  }

  private dispatchPlaybackEvent(type: PlaybackEventName) {
    this.dispatchEvent(new Event(type))
  }
}

function getMpvPlaybackSongId(url: string) {
  const parsedUrl = new URL(url)
  return Number(parsedUrl.pathname.slice(1))
}
