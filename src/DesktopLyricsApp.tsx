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

export function DesktopLyricsApp() {
  const [state, setState] = useState(initialState)
  const lyricBoxRef = useRef<HTMLDivElement>(null)
  const lyricContentRef = useRef<HTMLSpanElement>(null)
  const [lyricScrollDistance, setLyricScrollDistance] = useState(0)
  const offsetSeconds = Math.round(state.offsetMs / 100) / 10
  const lyricText = state.loading
    ? '...'
    : state.lyricText || state.fallbackText
  const lyricScrollDuration = `${Math.min(12, Math.max(5, Math.round(lyricScrollDistance / 28) + 4))}s`

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
