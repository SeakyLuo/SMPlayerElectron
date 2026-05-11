import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import {
  DEFAULT_ARTWORK_URL,
  getRepeatOneTitle,
  getRepeatTitle,
  getShuffleTitle,
  type MediaControlTrack,
  type VoiceAssistantResponse,
} from '../components/MediaControl'
import { VoiceAssistantFlyout, type VoiceAssistantFlyoutHandle } from '../components/VoiceAssistantFlyout'
import { Icon } from '../components/icons'
import { getVolumeIconName } from '../components/volumeIcon'
import { useSongArtwork } from '../hooks/useSongArtwork'
import type { LibrarySong, PlaybackMode } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { usePlaybackProgress } from '../state/playbackProgressStore'

interface MiniModePageProps {
  track: MediaControlTrack
  currentSong: LibrarySong | null
  disabled: boolean
  isPlaying: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  t: Translator
  onTogglePlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onBeginSeek: () => void
  onEndSeek: () => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
  onQuickPlay: () => void | Promise<void>
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  voiceLanguage: string
  onExitMiniMode: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
}

export function MiniModePage({
  track,
  currentSong,
  disabled,
  isPlaying,
  volume,
  isMuted,
  mode,
  t,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onBeginSeek,
  onEndSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
  onQuickPlay,
  onVoiceCommand,
  getVoiceHint,
  voiceLanguage,
  onExitMiniMode,
  onArtworkResolved,
}: MiniModePageProps) {
  const [isProgressSeeking, setIsProgressSeeking] = useState(false)
  const [draftProgressSeconds, setDraftProgressSeconds] = useState(0)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false)
  const [voiceAssistantAvailable, setVoiceAssistantAvailable] = useState(false)
  const [volumeTooltipActive, setVolumeTooltipActive] = useState(false)
  const isProgressSeekingRef = useRef(false)
  const volumeTooltipTimerRef = useRef<number | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const morePanelRef = useRef<HTMLDivElement | null>(null)
  const voiceAssistantFlyoutRef = useRef<VoiceAssistantFlyoutHandle>(null)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const {
    artworkUrl: effectiveArtworkUrl,
    baseArtworkUrl,
    refreshArtwork,
  } = useSongArtwork(track.id, track.artworkUrl)
  const usableArtworkUrl = effectiveArtworkUrl && effectiveArtworkUrl !== failedArtworkUrl
    ? effectiveArtworkUrl
    : ''
  const displayArtworkUrl = usableArtworkUrl || DEFAULT_ARTWORK_URL
  const effectiveDurationSeconds = durationSeconds || currentSong?.duration || 0
  const displayProgressSeconds = isProgressSeeking ? draftProgressSeconds : progressSeconds
  const progressValue = disabled || effectiveDurationSeconds <= 0
    ? 0
    : Math.min(Math.max(displayProgressSeconds, 0), effectiveDurationSeconds)
  const progressMax = Math.max(effectiveDurationSeconds, 0)
  const progressFill = progressMax > 0 ? (progressValue / progressMax) * 100 : 0
  const volumeValue = disabled ? 0 : Math.min(Math.max(volume, 0), 100)
  const volumeDisplayValue = Math.round(volumeValue)
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const volumeIconName = getVolumeIconName(volumeValue, isMuted)
  const trackTitle = track.title || t('nowPlaying.noActiveTrack')
  const trackArtist = track.artist || t('common.artistUnknown')

  const openVoiceAssistant = () => {
    setMoreOpen(false)
    setVoiceAssistantOpen(true)
    voiceAssistantFlyoutRef.current?.open()
  }

  const beginProgressSeek = (event: PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    isProgressSeekingRef.current = true
    setIsProgressSeeking(true)
    setDraftProgressSeconds(Number(event.currentTarget.value))
    onBeginSeek()
  }

  const commitProgressSeek = (seconds: number) => {
    if (!isProgressSeekingRef.current) {
      return
    }

    isProgressSeekingRef.current = false
    onSeek(seconds)
    onEndSeek()
    setIsProgressSeeking(false)
  }

  const runMoreAction = (action: () => void | Promise<void>) => {
    void Promise.resolve(action()).then(() => {
      setMoreOpen(false)
    })
  }

  const clearVolumeTooltipTimer = () => {
    if (volumeTooltipTimerRef.current != null) {
      window.clearTimeout(volumeTooltipTimerRef.current)
      volumeTooltipTimerRef.current = null
    }
  }

  const keepVolumeTooltipVisible = () => {
    if (disabled) {
      return
    }

    clearVolumeTooltipTimer()
    setVolumeTooltipActive(true)
  }

  const showVolumeTooltip = (duration = 900) => {
    if (disabled) {
      return
    }

    keepVolumeTooltipVisible()
    volumeTooltipTimerRef.current = window.setTimeout(() => {
      setVolumeTooltipActive(false)
      volumeTooltipTimerRef.current = null
    }, duration)
  }

  const hideVolumeTooltip = () => {
    clearVolumeTooltipTimer()
    setVolumeTooltipActive(false)
  }

  const commitVolumeChange = (value: string) => {
    onVolumeChange(Number(value))
  }

  useEffect(() => {
    void window.smplayer?.getAppInfo().then((appInfo) => {
      setVoiceAssistantAvailable(appInfo.platform === 'win32')
    })
  }, [])

  useEffect(() => () => {
    clearVolumeTooltipTimer()
  }, [])

  useEffect(() => {
    setFailedArtworkUrl('')
    if (track.id != null && baseArtworkUrl) {
      onArtworkResolved(track.id, baseArtworkUrl)
    }
  }, [baseArtworkUrl, onArtworkResolved, track.id])

  useEffect(() => {
    if (!moreOpen) {
      hideVolumeTooltip()
      return
    }

    const closeMoreOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (morePanelRef.current?.contains(target) || moreButtonRef.current?.contains(target)) {
        return
      }

      setMoreOpen(false)
    }

    document.addEventListener('pointerdown', closeMoreOnOutsidePointerDown)
    return () => {
      document.removeEventListener('pointerdown', closeMoreOnOutsidePointerDown)
    }
  }, [moreOpen])

  return (
    <section
      className="mini-mode-page"
      style={{ '--mini-mode-artwork': `url(${JSON.stringify(displayArtworkUrl)})` } as CSSProperties}
    >
      <div className="mini-mode-titlebar" aria-hidden="true" />
      <img
        className="mini-mode-artwork-probe"
        src={displayArtworkUrl}
        alt=""
        aria-hidden="true"
        onError={() => {
          setFailedArtworkUrl(displayArtworkUrl)
          refreshArtwork()
        }}
      />

      <div className="mini-mode-transport" aria-label={t('player.playPause')}>
        <button
          className="mini-mode-button"
          type="button"
          aria-label={t('player.previous')}
          title={t('player.previous')}
          disabled={disabled}
          onClick={onPrevious}
        >
          <Icon name="previous" />
        </button>
        <button
          className={`mini-mode-button primary${track.isLoading ? ' is-loading' : ''}`}
          type="button"
          aria-label={playTitle}
          title={playTitle}
          disabled={disabled}
          onClick={onTogglePlayPause}
        >
          {track.isLoading ? <span className="mini-mode-loading-spinner" aria-hidden="true" /> : <Icon name={isPlaying ? 'pause' : 'play'} />}
        </button>
        <button
          className="mini-mode-button"
          type="button"
          aria-label={t('player.next')}
          title={t('player.next')}
          disabled={disabled}
          onClick={onNext}
        >
          <Icon name="next" />
        </button>
      </div>

      <div className="mini-mode-bottom">
        <div className="mini-mode-track-copy">
          <strong title={trackTitle}>{trackTitle}</strong>
          <span title={trackArtist}>{trackArtist}</span>
        </div>
        <div className="mini-mode-actions">
          {voiceAssistantAvailable ? (
            <button
              className={voiceAssistantOpen ? 'is-active' : ''}
              type="button"
              disabled={disabled}
              aria-label={t('player.voiceAssistant')}
              title={t('player.voiceAssistant')}
              onClick={openVoiceAssistant}
            >
              <Icon name="voice" />
            </button>
          ) : null}
          <button
            ref={moreButtonRef}
            type="button"
            disabled={disabled}
            aria-label={t('player.more')}
            title={t('player.more')}
            onClick={() => {
              voiceAssistantFlyoutRef.current?.close()
              setMoreOpen((current) => !current)
            }}
          >
            <Icon name="moreHorizontal" />
          </button>
        </div>
        <input
          className="mini-mode-progress-slider"
          type="range"
          min="0"
          max={progressMax}
          step="0.1"
          value={progressValue}
          style={{ '--range-progress': `${progressFill}%` } as CSSProperties}
          disabled={disabled || effectiveDurationSeconds <= 0}
          onChange={(event) => {
            setDraftProgressSeconds(Number(event.currentTarget.value))
          }}
          onPointerDown={beginProgressSeek}
          onPointerUp={(event) => {
            commitProgressSeek(Number(event.currentTarget.value))
          }}
          onPointerCancel={(event) => {
            commitProgressSeek(Number(event.currentTarget.value))
          }}
          onLostPointerCapture={(event) => {
            commitProgressSeek(Number(event.currentTarget.value))
          }}
          aria-label={t('player.trackProgress')}
          title={`${formatDuration(progressValue)} / ${formatDuration(effectiveDurationSeconds)}`}
        />
      </div>

      {moreOpen ? (
        <div ref={morePanelRef} className="mini-mode-more-panel" role="menu">
          <button type="button" role="menuitem" onClick={() => runMoreAction(onQuickPlay)}>
            <Icon name="shuffle" />
            <span>{t('nowPlaying.randomPlay')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={mode === 'shuffle' ? 'is-active' : ''}
            onClick={() => runMoreAction(onToggleShuffle)}
          >
            <Icon name="shuffle" />
            <span>{getShuffleTitle(t, mode)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={mode === 'repeat' ? 'is-active' : ''}
            onClick={() => runMoreAction(onToggleRepeat)}
          >
            <Icon name="repeat" />
            <span>{getRepeatTitle(t, mode)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={mode === 'repeat-one' ? 'is-active' : ''}
            onClick={() => runMoreAction(onToggleRepeatOne)}
          >
            <Icon name="repeatOne" />
            <span>{getRepeatOneTitle(t, mode)}</span>
          </button>
          <div className="mini-mode-volume-row">
            <button type="button" onClick={onToggleMute} aria-label={volumeTitle} title={volumeTitle}>
              <Icon name={volumeIconName} />
            </button>
            <div
              className={`mini-mode-volume-slider-wrap${volumeTooltipActive ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
              style={{ '--volume-tooltip-left': `${volumeValue}%` } as CSSProperties}
            >
              <input
                className="mini-mode-volume-slider"
                type="range"
                min="0"
                max="100"
                value={volumeValue}
                style={{ '--range-progress': `${volumeValue}%` } as CSSProperties}
                disabled={disabled}
                onChange={() => {
                  keepVolumeTooltipVisible()
                }}
                onInput={(event) => {
                  commitVolumeChange(event.currentTarget.value)
                }}
                onPointerDown={() => {
                  keepVolumeTooltipVisible()
                }}
                onPointerEnter={() => {
                  keepVolumeTooltipVisible()
                }}
                onPointerLeave={() => {
                  hideVolumeTooltip()
                }}
                onPointerUp={(event) => {
                  commitVolumeChange(event.currentTarget.value)
                  showVolumeTooltip(650)
                }}
                onPointerCancel={() => {
                  hideVolumeTooltip()
                }}
                onLostPointerCapture={(event) => {
                  commitVolumeChange(event.currentTarget.value)
                  showVolumeTooltip(650)
                }}
                onFocus={() => {
                  keepVolumeTooltipVisible()
                }}
                onBlur={() => {
                  hideVolumeTooltip()
                }}
                aria-label={t('player.volume')}
                aria-valuetext={String(volumeDisplayValue)}
              />
              <span className="volume-slider-tooltip" aria-hidden="true">{volumeDisplayValue}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={onExitMiniMode}>
            <Icon name="miniMode" />
            <span>{t('player.exitMiniMode')}</span>
          </button>
        </div>
      ) : null}

      {voiceAssistantAvailable ? (
        <VoiceAssistantFlyout
          ref={voiceAssistantFlyoutRef}
          t={t}
          voiceLanguage={voiceLanguage}
          onVoiceCommand={onVoiceCommand}
          getVoiceHint={getVoiceHint}
          onOpenChange={setVoiceAssistantOpen}
          className="is-mini-mode"
        />
      ) : null}
    </section>
  )
}
