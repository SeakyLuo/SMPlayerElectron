import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import type { DesktopLyricsCommand, DesktopLyricsDisplayState } from './shared/contracts'
import { Icon } from './components/icons'
import './styles/desktop-lyrics.css'

const initialState: DesktopLyricsDisplayState = {
  visible: false,
  loading: true,
  playing: false,
  locked: false,
  nightMode: true,
  opacity: 88,
  fontSize: 28,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  textColor: '#4aa8ff',
  strokeColor: '',
  lyricText: '',
  fallbackText: '',
  songTitle: '',
  artist: '',
  progressSeconds: 0,
  lyricLineStartMs: null,
  lyricLineEndMs: null,
  offsetMs: 0,
  labels: {
    close: '',
    lock: '',
    next: '',
    playPause: '',
    previous: '',
    settings: '',
    unlock: '',
    resetOffset: '',
  },
}

function requestDesktopLyricsCommand(command: DesktopLyricsCommand) {
  void window.smplayer?.requestDesktopLyricsCommand(command)
}

function getTimedScrollKeyframes(scrollDistance: number, durationMs: number): Keyframe[] {
  const startHoldMs = Math.min(550, Math.max(180, durationMs * 0.1))
  const endHoldMs = Math.min(450, Math.max(160, durationMs * 0.1))
  const startOffset = Math.min(0.18, startHoldMs / durationMs)
  const endOffset = Math.max(0.82, 1 - endHoldMs / durationMs)
  const endTransform = `translateX(${-scrollDistance}px)`

  return [
    { offset: 0, transform: 'translateX(0)' },
    { offset: startOffset, transform: 'translateX(0)', easing: 'cubic-bezier(0.37, 0, 0.63, 1)' },
    { offset: endOffset, transform: endTransform },
    { offset: 1, transform: endTransform },
  ]
}

export function DesktopLyricsApp() {
  const [state, setState] = useState(initialState)
  const lyricBoxRef = useRef<HTMLDivElement>(null)
  const lyricContentRef = useRef<HTMLSpanElement>(null)
  const lyricScrollAnimationRef = useRef<Animation | null>(null)
  const lyricScrollProgressRef = useRef({ lineKey: '', progressSeconds: 0 })
  const [lyricScrollDistance, setLyricScrollDistance] = useState(0)
  const offsetSeconds = Math.round(state.offsetMs / 100) / 10
  const lyricText = state.loading
    ? '...'
    : state.lyricText || state.fallbackText
  const lyricLineDurationSeconds = state.lyricLineStartMs != null && state.lyricLineEndMs != null
    ? Math.max(0.8, (state.lyricLineEndMs - state.lyricLineStartMs) / 1000)
    : null
  const lyricScrollDuration = `${lyricLineDurationSeconds ?? Math.min(8, Math.max(3, Math.round(lyricScrollDistance / 44) + 2))}s`
  const lyricLineKey = `${lyricText}:${state.lyricLineStartMs ?? ''}:${state.lyricLineEndMs ?? ''}`

  useEffect(() => window.smplayer?.onDesktopLyricsState(setState), [])

  useLayoutEffect(() => {
    document.documentElement.classList.add('desktop-lyrics-host')
    document.body.classList.add('desktop-lyrics-host')
    document.body.classList.toggle('night-mode', state.nightMode)
    document.documentElement.classList.toggle('night-mode', state.nightMode)
    return () => {
      document.documentElement.classList.remove('desktop-lyrics-host')
      document.body.classList.remove('desktop-lyrics-host')
    }
  }, [state.nightMode])

  useLayoutEffect(() => {
    const lyricBox = lyricBoxRef.current!
    const lyricContent = lyricContentRef.current!
    const updateLyricScrollDistance = () => {
      setLyricScrollDistance(Math.max(0, Math.ceil(lyricContent.scrollWidth - lyricBox.clientWidth)))
    }

    updateLyricScrollDistance()
    const resizeObserver = new ResizeObserver(updateLyricScrollDistance)
    resizeObserver.observe(lyricBox)
    return () => resizeObserver.disconnect()
  }, [lyricText, state.fontFamily, state.fontSize])

  useLayoutEffect(() => {
    const lyricContent = lyricContentRef.current!
    lyricScrollAnimationRef.current?.cancel()
    lyricScrollAnimationRef.current = null
    lyricContent.style.transform = ''

    if (lyricScrollDistance <= 0 || lyricLineDurationSeconds == null) {
      return
    }

    const durationMs = lyricLineDurationSeconds * 1000
    const animation = lyricContent.animate(getTimedScrollKeyframes(lyricScrollDistance, durationMs), {
      duration: durationMs,
      fill: 'both',
    })
    lyricScrollAnimationRef.current = animation
    if (state.lyricLineStartMs != null) {
      const elapsedMs = Math.max(0, (state.progressSeconds * 1000) - state.lyricLineStartMs)
      animation.currentTime = Math.min(elapsedMs, durationMs)
    }
    if (!state.playing) {
      animation.pause()
    }

    return () => {
      animation.cancel()
      if (lyricScrollAnimationRef.current === animation) {
        lyricScrollAnimationRef.current = null
      }
    }
  }, [lyricLineDurationSeconds, lyricLineKey, lyricScrollDistance])

  useLayoutEffect(() => {
    const animation = lyricScrollAnimationRef.current
    if (!animation || state.lyricLineStartMs == null) {
      return
    }

    const previous = lyricScrollProgressRef.current
    const progressJumped = previous.lineKey === lyricLineKey && Math.abs(state.progressSeconds - previous.progressSeconds) > 1.2
    lyricScrollProgressRef.current = { lineKey: lyricLineKey, progressSeconds: state.progressSeconds }
    if (progressJumped) {
      const elapsedMs = Math.max(0, (state.progressSeconds * 1000) - state.lyricLineStartMs)
      animation.currentTime = Math.min(elapsedMs, animation.effect!.getTiming().duration as number)
    }

    if (state.playing) {
      animation.play()
    } else {
      animation.pause()
    }
  }, [lyricLineKey, state.lyricLineStartMs, state.playing, state.progressSeconds])

  return (
    <main
      className={`desktop-lyrics-window${state.nightMode ? ' is-night' : ' is-day'}${state.locked ? ' is-locked' : ''}`}
      style={{
        '--desktop-lyrics-opacity': state.opacity / 100,
        '--desktop-lyrics-font-size': `${state.fontSize}px`,
        '--desktop-lyrics-font-family': state.fontFamily,
        '--desktop-lyrics-color': state.textColor,
        '--desktop-lyrics-stroke-color': state.strokeColor || 'transparent',
        '--desktop-lyrics-scroll-distance': `${lyricScrollDistance}px`,
        '--desktop-lyrics-scroll-duration': lyricScrollDuration,
      } as CSSProperties}
    >
      <section className="desktop-lyrics-card">
        <div className="desktop-lyrics-drag-region" aria-hidden="true" />
        <div className="desktop-lyrics-meta">
          <span>{state.songTitle}</span>
          {state.artist ? <span>{state.artist}</span> : null}
        </div>
        <div
          className="desktop-lyrics-text"
          title={lyricText}
          ref={lyricBoxRef}
          data-overflow={lyricScrollDistance > 0 ? 'true' : undefined}
          data-timed={lyricLineDurationSeconds != null ? 'true' : undefined}
        >
          <span key={lyricText} ref={lyricContentRef}>{lyricText}</span>
        </div>
        <div className="desktop-lyrics-toolbar">
          <button
            type="button"
            title={state.labels.previous}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'previous' })
            }}
          >
            <Icon name="previous" />
          </button>
          <button
            type="button"
            title={state.labels.playPause}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'play-pause' })
            }}
          >
            <Icon name={state.playing ? 'pause' : 'play'} />
          </button>
          <button
            type="button"
            title={state.labels.next}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'next' })
            }}
          >
            <Icon name="next" />
          </button>
          <span className="desktop-lyrics-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            title="-0.1s"
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'offset', deltaMs: -100 })
            }}
          >
            -0.1s
          </button>
          <button
            type="button"
            title="+0.1s"
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'offset', deltaMs: 100 })
            }}
          >
            +0.1s
          </button>
          <button
            type="button"
            title={state.labels.resetOffset}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'reset-offset' })
            }}
          >
            {offsetSeconds > 0 ? `+${offsetSeconds}s` : `${offsetSeconds}s`}
          </button>
          <span className="desktop-lyrics-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            title={state.locked ? state.labels.unlock : state.labels.lock}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'toggle-lock' })
            }}
          >
            <Icon name={state.locked ? 'lock' : 'unlock'} />
          </button>
          <button
            type="button"
            title={state.labels.settings}
            onClick={() => {
              requestDesktopLyricsCommand({ type: 'open-settings' })
            }}
          >
            <Icon name="settings" />
          </button>
          {!state.locked ? (
            <button
              type="button"
              title={state.labels.close}
              onClick={() => {
                requestDesktopLyricsCommand({ type: 'disable' })
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      </section>
    </main>
  )
}
