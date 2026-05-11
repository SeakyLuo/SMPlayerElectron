import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import {
  DEFAULT_ARTWORK_URL,
  getRepeatOneTitle,
  getRepeatTitle,
  getShuffleTitle,
  type MediaControlTrack,
  type VoiceAssistantResponse,
} from '../components/MediaControl'
import { Icon } from '../components/icons'
import { useSongArtwork } from '../hooks/useSongArtwork'
import type { LibrarySong, PlaybackMode } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { usePlaybackProgress } from '../state/playbackProgressStore'

type VoiceAssistantState = 'idle' | 'capturing' | 'processing'

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
  const [voiceAssistantText, setVoiceAssistantText] = useState('')
  const [voiceAssistantState, setVoiceAssistantState] = useState<VoiceAssistantState>('idle')
  const [voiceAssistantNeedsPrivacySettings, setVoiceAssistantNeedsPrivacySettings] = useState(false)
  const isProgressSeekingRef = useRef(false)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const morePanelRef = useRef<HTMLDivElement | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceAssistantTimerRef = useRef<number | null>(null)
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
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const trackTitle = track.title || t('nowPlaying.noActiveTrack')
  const trackArtist = track.artist || t('common.artistUnknown')

  const clearVoiceAssistantTimer = () => {
    if (voiceAssistantTimerRef.current != null) {
      window.clearTimeout(voiceAssistantTimerRef.current)
      voiceAssistantTimerRef.current = null
    }
  }

  const closeVoiceAssistant = () => {
    clearVoiceAssistantTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    speechRecognitionRef.current?.stop()
    speechRecognitionRef.current = null
    setVoiceAssistantOpen(false)
    setVoiceAssistantState('idle')
    setVoiceAssistantNeedsPrivacySettings(false)
  }

  const speakVoiceAssistantMessage = (message: string, ended: () => void) => {
    if (!('speechSynthesis' in window)) {
      ended()
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = voiceLanguage
    utterance.onend = ended
    window.speechSynthesis.speak(utterance)
  }

  const startVoiceRecognition = (showHint: boolean) => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceAssistantText(t('voiceAssistant.unavailable'))
      setVoiceAssistantNeedsPrivacySettings(true)
      return
    }

    setVoiceAssistantNeedsPrivacySettings(false)
    const recognition = new SpeechRecognition()
    speechRecognitionRef.current = recognition
    recognition.lang = voiceLanguage
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onsoundstart = () => {
      setVoiceAssistantState('capturing')
      setVoiceAssistantText(t('voiceAssistant.listening'))
    }
    recognition.onspeechend = () => {
      setVoiceAssistantState('processing')
      setVoiceAssistantText(t('voiceAssistant.processing'))
    }
    recognition.onerror = (event) => {
      setVoiceAssistantState('idle')
      if (event.error === 'aborted') {
        return
      }

      if (event.error === 'no-speech') {
        voiceAssistantTimerRef.current = window.setTimeout(() => {
          startVoiceRecognition(false)
        }, 250)
        return
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceAssistantNeedsPrivacySettings(true)
        setVoiceAssistantText(t('voiceAssistant.privacyRequired'))
        return
      }

      setVoiceAssistantText(t('voiceAssistant.notUnderstood'))
    }
    recognition.onend = () => {
      setVoiceAssistantState('idle')
      speechRecognitionRef.current = null
    }
    recognition.onresult = (event) => {
      setVoiceAssistantState('processing')
      const transcript = event.results[event.resultIndex][0].transcript.trim()
      if (!transcript) {
        setVoiceAssistantState('idle')
        voiceAssistantTimerRef.current = window.setTimeout(() => {
          startVoiceRecognition(false)
        }, 250)
        return
      }

      setVoiceAssistantText(transcript)
      void onVoiceCommand(transcript).then(({ message, shouldContinue }) => {
        setVoiceAssistantText(message)
        speakVoiceAssistantMessage(message, () => {
          if (shouldContinue) {
            voiceAssistantTimerRef.current = window.setTimeout(() => {
              startVoiceRecognition(false)
            }, 250)
          } else {
            voiceAssistantTimerRef.current = window.setTimeout(closeVoiceAssistant, 5000)
          }
        })
      })
    }
    recognition.addEventListener('nomatch', () => {
      setVoiceAssistantState('idle')
      voiceAssistantTimerRef.current = window.setTimeout(() => {
        startVoiceRecognition(false)
      }, 250)
    })

    if (showHint) {
      setVoiceAssistantText(getVoiceHint())
    }
    setVoiceAssistantState('idle')
    recognition.start()
  }

  const openVoiceAssistant = () => {
    setMoreOpen(false)
    setVoiceAssistantOpen(true)
    startVoiceRecognition(true)
  }

  const openVoiceAssistantPrivacySettings = () => {
    void window.smplayer?.openVoiceAssistantPrivacySettings()
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

  useEffect(() => {
    setFailedArtworkUrl('')
    if (track.id != null && baseArtworkUrl) {
      onArtworkResolved(track.id, baseArtworkUrl)
    }
  }, [baseArtworkUrl, onArtworkResolved, track.id])

  useEffect(() => {
    if (!moreOpen) {
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

  useEffect(() => () => {
    clearVoiceAssistantTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    speechRecognitionRef.current?.stop()
  }, [])

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
          <button
            ref={moreButtonRef}
            type="button"
            disabled={disabled}
            aria-label={t('player.more')}
            title={t('player.more')}
            onClick={() => {
              closeVoiceAssistant()
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
              <Icon name={isMuted ? 'volumeMuted' : 'volume'} />
            </button>
            <input
              className="mini-mode-volume-slider"
              type="range"
              min="0"
              max="100"
              value={volumeValue}
              style={{ '--range-progress': `${volumeValue}%` } as CSSProperties}
              onChange={(event) => {
                onVolumeChange(Number(event.currentTarget.value))
              }}
              aria-label={t('player.volume')}
            />
          </div>
          <button type="button" role="menuitem" onClick={onExitMiniMode}>
            <Icon name="miniMode" />
            <span>{t('player.exitMiniMode')}</span>
          </button>
        </div>
      ) : null}

      {voiceAssistantOpen ? (
        <div className={`mini-mode-voice-popover is-${voiceAssistantState}`} role="status">
          <span>{t(`voiceAssistant.state.${voiceAssistantState}`)}</span>
          <p>{voiceAssistantText}</p>
          {voiceAssistantNeedsPrivacySettings ? (
            <button type="button" onClick={openVoiceAssistantPrivacySettings} title={t('voiceAssistant.openPrivacySettings')}>
              {t('voiceAssistant.openPrivacySettings')}
            </button>
          ) : null}
          <button type="button" onClick={closeVoiceAssistant} aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>
      ) : null}
    </section>
  )
}
