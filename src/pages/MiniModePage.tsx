import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import type { MediaControlTrack, VoiceAssistantResponse } from '../components/MediaControl'
import { DEFAULT_ARTWORK_URL, getRepeatOneTitle, getRepeatTitle } from '../components/mediaControlModel'
import { VoiceAssistantFlyout, type VoiceAssistantFlyoutHandle } from '../components/VoiceAssistantFlyout'
import { Icon, type IconName } from '../components/icons'
import { getVolumeIconName } from '../components/volumeIcon'
import { useSongArtwork } from '../hooks/useSongArtwork'
import type { LibrarySong, LyricsRequestMode, LyricsSnapshot, PlaybackMode } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { getCurrentLyricsLine } from '../shared/lyrics'
import { usePlaybackProgress } from '../state/playbackProgressStore'

interface MiniModePageProps {
  track: MediaControlTrack
  currentSong: LibrarySong | null
  disabled: boolean
  isPlaying: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playerLyricsSource: LyricsRequestMode
  t: Translator
  onTogglePlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onBeginSeek: () => void
  onEndSeek: () => void
  onVolumeChange: (volume: number) => void
  onCycleRepeatMode: () => void
  onToggleFavorite: () => void
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
  playerLyricsSource,
  t,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onBeginSeek,
  onEndSeek,
  onVolumeChange,
  onCycleRepeatMode,
  onToggleFavorite,
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
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false)
  const [voiceAssistantAvailable, setVoiceAssistantAvailable] = useState(false)
  const [volumeTooltipActive, setVolumeTooltipActive] = useState(false)
  const [lyrics, setLyrics] = useState<LyricsSnapshot | null>(null)
  const isProgressSeekingRef = useRef(false)
  const controlsHideTimerRef = useRef<number | null>(null)
  const volumeTooltipTimerRef = useRef<number | null>(null)
  const volumeButtonRef = useRef<HTMLButtonElement | null>(null)
  const volumePanelRef = useRef<HTMLDivElement | null>(null)
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
  const progressRatio = effectiveDurationSeconds > 0 ? progressSeconds / effectiveDurationSeconds : 0
  const currentLyricsLine = useMemo(
    () => getCurrentLyricsLine(lyrics, progressSeconds, progressRatio).trim(),
    [lyrics, progressRatio, progressSeconds],
  )
  const volumeValue = disabled ? 0 : Math.min(Math.max(volume, 0), 100)
  const volumeDisplayValue = Math.round(volumeValue)
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const volumeIconName = getVolumeIconName(volumeValue, isMuted)
  const favoriteTitle = track.favorite ? t('player.unlike') : t('player.like')
  const repeatTitle = mode === 'repeat-one' ? getRepeatOneTitle(t, mode) : getRepeatTitle(t, mode)
  const repeatIconName: IconName = mode === 'repeat-one' ? 'repeatOne' : 'repeat'
  const trackTitle = track.title || t('nowPlaying.noActiveTrack')
  const trackArtist = track.artist || t('common.artistUnknown')

  const openVoiceAssistant = () => {
    setVolumeOpen(false)
    if (voiceAssistantOpen) {
      voiceAssistantFlyoutRef.current?.close()
    } else {
      voiceAssistantFlyoutRef.current?.open()
    }
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

  const runMiniAction = (action: () => void | Promise<void>) => {
    setVolumeOpen(false)
    void Promise.resolve(action())
  }

  const clearControlsHideTimer = () => {
    if (controlsHideTimerRef.current != null) {
      window.clearTimeout(controlsHideTimerRef.current)
      controlsHideTimerRef.current = null
    }
  }

  const showControls = () => {
    clearControlsHideTimer()
    setControlsVisible(true)
  }

  const scheduleControlsHide = () => {
    clearControlsHideTimer()
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
      setVolumeOpen(false)
      controlsHideTimerRef.current = null
    }, 5000)
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
    clearControlsHideTimer()
    clearVolumeTooltipTimer()
  }, [])

  useEffect(() => {
    if (volumeOpen || voiceAssistantOpen || isProgressSeeking) {
      showControls()
    }
  }, [isProgressSeeking, voiceAssistantOpen, volumeOpen])

  useEffect(() => {
    setFailedArtworkUrl('')
    if (track.id != null && baseArtworkUrl) {
      onArtworkResolved(track.id, baseArtworkUrl)
    }
  }, [baseArtworkUrl, onArtworkResolved, track.id])

  useEffect(() => {
    if (!currentSong) {
      setLyrics(null)
      return
    }

    let isDisposed = false
    void window.smplayer!.getLyrics(currentSong.id, playerLyricsSource).then((snapshot) => {
      if (!isDisposed) {
        setLyrics(snapshot)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [currentSong?.id, playerLyricsSource])

  useEffect(() => {
    const handleLyricsUpdated = (event: Event) => {
      const songId = (event as CustomEvent<{ songId?: number }>).detail?.songId
      if (songId == null || currentSong?.id !== songId) {
        return
      }

      void window.smplayer!.getLyrics(songId, playerLyricsSource).then((snapshot) => {
        setLyrics(snapshot)
      })
    }

    window.addEventListener('smplayer:lyrics-updated', handleLyricsUpdated)
    return () => {
      window.removeEventListener('smplayer:lyrics-updated', handleLyricsUpdated)
    }
  }, [currentSong?.id, playerLyricsSource])

  useEffect(() => {
    if (!volumeOpen) {
      hideVolumeTooltip()
      return
    }

    const closeVolumeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (volumePanelRef.current?.contains(target) || volumeButtonRef.current?.contains(target)) {
        return
      }

      setVolumeOpen(false)
    }

    document.addEventListener('pointerdown', closeVolumeOnOutsidePointerDown)
    return () => {
      document.removeEventListener('pointerdown', closeVolumeOnOutsidePointerDown)
    }
  }, [volumeOpen])

  return (
    <section
      className={`mini-mode-page${controlsVisible ? ' is-controls-visible' : ''}`}
      style={{ '--mini-mode-artwork': `url(${JSON.stringify(displayArtworkUrl)})` } as CSSProperties}
      onPointerEnter={showControls}
      onPointerMove={showControls}
      onPointerLeave={scheduleControlsHide}
      onFocusCapture={showControls}
    >
      <div className="mini-mode-titlebar" aria-hidden="true" />
      <div className="mini-mode-top-actions">
        <button
          className="mini-mode-corner-button"
          type="button"
          aria-label={t('player.exitMiniMode')}
          title={t('player.exitMiniMode')}
          onClick={onExitMiniMode}
        >
          <Icon name="arrowLeft" />
        </button>
      </div>
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

      <div className="mini-mode-track-copy">
        <strong title={trackTitle}>{trackTitle}</strong>
        <span title={trackArtist}>{trackArtist}</span>
        {currentLyricsLine ? (
          <span className="mini-mode-control-lyrics" title={currentLyricsLine}>
            <span key={currentLyricsLine}>{currentLyricsLine}</span>
          </span>
        ) : null}
      </div>

      {currentLyricsLine ? (
        <div className="mini-mode-lyrics-strip">
          <span key={currentLyricsLine}>{currentLyricsLine}</span>
        </div>
      ) : null}

      <div className="mini-mode-bottom">
        <div className="mini-mode-controls-surface">
          <div className="mini-mode-actions">
            <button
              type="button"
              disabled={disabled}
              aria-label={t('nowPlaying.randomPlay')}
              title={t('nowPlaying.randomPlay')}
              onClick={() => {
                runMiniAction(onQuickPlay)
              }}
            >
              <Icon name="dice" />
            </button>
            <button
              type="button"
              disabled={disabled}
              className={mode === 'repeat' || mode === 'repeat-one' ? 'is-active' : ''}
              aria-label={repeatTitle}
              title={repeatTitle}
              onClick={() => {
                runMiniAction(onCycleRepeatMode)
              }}
            >
              <Icon name={repeatIconName} />
            </button>
            <button
              className={`favorite-toggle${track.favorite ? ' is-active' : ''}`}
              type="button"
              disabled={disabled || track.id == null}
              aria-label={favoriteTitle}
              title={favoriteTitle}
              onClick={onToggleFavorite}
            >
              <Icon name={track.favorite ? 'heartFilled' : 'heart'} />
            </button>
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
            <div className="mini-mode-volume-action">
              <button
                ref={volumeButtonRef}
                type="button"
                disabled={disabled}
                className={volumeOpen ? 'is-active' : ''}
                aria-label={volumeTitle}
                title={volumeTitle}
                onClick={() => {
                  voiceAssistantFlyoutRef.current?.close()
                  setVolumeOpen((current) => !current)
                }}
              >
                <Icon name={volumeIconName} />
              </button>
              {volumeOpen ? (
                <div
                  ref={volumePanelRef}
                  className={`mini-mode-volume-popover${volumeTooltipActive ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                  style={{ '--volume-tooltip-bottom': `${volumeValue}%` } as CSSProperties}
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
              ) : null}
            </div>
          </div>
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
