import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryPlaylist, LibrarySong, LyricsSnapshot, PlaybackMode, PreferenceItemSnapshot } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import { extractArtworkColorRgb, getDefaultArtworkColorRgb } from '../shared/artworkColor'
import type { Translator } from '../shared/i18n'
import { getCurrentLyricsLine } from '../shared/lyrics'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { Icon } from './icons'
import { formatDuration } from '../shared/formatters'
import { MenuFlyout } from './MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from './MenuFlyoutHelper'
import { MusicDialog } from './MusicDialog'

interface PlayerBarTrack {
  id: number | null
  title: string
  artist: string
  artworkUrl: string
  elapsedLabel: string
  durationLabel: string
  progressRatio: number
  progressSeconds: number
  durationSeconds: number
  isReady: boolean
  isLoading: boolean
  favorite?: boolean
}

interface PlayerBarProps {
  track: PlayerBarTrack
  currentSong: LibrarySong | null
  playlists: LibraryPlaylist[]
  queueSongIds: number[]
  disabled?: boolean
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
  onToggleFavorite: () => void
  onQuickPlay: () => void | Promise<void>
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  getVoiceHelpText: () => string
  voiceLanguage: string
  onOpenNowPlaying: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
}

interface VoiceAssistantResponse {
  message: string
  shouldContinue: boolean
}

type VoiceAssistantState = 'idle' | 'capturing' | 'processing'

function getShuffleTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'shuffle' ? t('player.shuffleEnabled') : t('player.shuffleDisabled')
}

function getRepeatTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat' ? t('player.repeatEnabled') : t('player.repeatDisabled')
}

function getRepeatOneTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat-one' ? t('player.repeatOneEnabled') : t('player.repeatOneDisabled')
}

const DEFAULT_ARTWORK_URL = '/monotone_bg_wide.png'

export function PlayerBar({
  track,
  currentSong,
  playlists,
  queueSongIds,
  disabled = false,
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
  onToggleFavorite,
  onQuickPlay,
  onVoiceCommand,
  getVoiceHint,
  getVoiceHelpText,
  voiceLanguage,
  onOpenNowPlaying,
  onArtworkResolved,
}: PlayerBarProps) {
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const snapshotQueueSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const playerLyricsSource = useLibraryStore((state) => state.snapshot.settings.playerLyricsSource)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const [isProgressSeeking, setIsProgressSeeking] = useState(false)
  const [draftProgressSeconds, setDraftProgressSeconds] = useState(0)
  const isProgressSeekingRef = useRef(false)
  const displayProgressSeconds = isProgressSeeking ? draftProgressSeconds : track.progressSeconds
  const progressValue = disabled || !track.isReady ? 0 : Math.min(Math.max(displayProgressSeconds, 0), track.durationSeconds)
  const progressMax = Math.max(track.durationSeconds, 0)
  const progressFill = progressMax > 0 ? (progressValue / progressMax) * 100 : 0
  const volumeValue = disabled ? 0 : Math.min(Math.max(volume, 0), 100)
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultArtworkColorRgb)
  const [songArtwork, setSongArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState('')
  const [moreMenu, setMoreMenu] = useState<MenuFlyoutPosition | null>(null)
  const [dialogMode, setDialogMode] = useState<'properties' | 'lyrics' | 'album-art' | null>(null)
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [lyrics, setLyrics] = useState<LyricsSnapshot | null>(null)
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false)
  const [voiceAssistantText, setVoiceAssistantText] = useState('')
  const [voiceAssistantState, setVoiceAssistantState] = useState<VoiceAssistantState>('idle')
  const [voiceAssistantNeedsPrivacySettings, setVoiceAssistantNeedsPrivacySettings] = useState(false)
  const [voiceAssistantHelpOpen, setVoiceAssistantHelpOpen] = useState(false)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceAssistantTimerRef = useRef<number | null>(null)
  const voiceAssistantStateLabel = t(`voiceAssistant.state.${voiceAssistantState}`)
  const effectiveArtworkUrl =
    track.artworkUrl ||
    (songArtwork?.trackId === track.id ? songArtwork.artworkUrl : '')
  const usableArtworkUrl = effectiveArtworkUrl && effectiveArtworkUrl !== failedArtworkUrl
    ? effectiveArtworkUrl
    : ''
  const displayArtworkUrl = usableArtworkUrl || DEFAULT_ARTWORK_URL
  const refreshPreferenceItem = async () => {
    if (currentSong) {
      const settings = await window.smplayer!.getPreferenceSettings()
      setPreferenceItem(settings.songs.find((item) => item.itemId === String(currentSong.id)) ?? null)
    }
  }

  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const currentLyricsLine = useMemo(
    () => getCurrentLyricsLine(lyrics, track.progressSeconds, track.progressRatio),
    [lyrics, track.progressRatio, track.progressSeconds],
  )

  const closeVoiceAssistant = () => {
    if (voiceAssistantTimerRef.current != null) {
      window.clearTimeout(voiceAssistantTimerRef.current)
      voiceAssistantTimerRef.current = null
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    speechRecognitionRef.current?.stop()
    speechRecognitionRef.current = null
    setVoiceAssistantOpen(false)
    setVoiceAssistantState('idle')
    setVoiceAssistantNeedsPrivacySettings(false)
    setVoiceAssistantHelpOpen(false)
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

    if (showHint) {
      setVoiceAssistantText(getVoiceHint())
    }
    setVoiceAssistantState('idle')
    recognition.start()
  }

  const openVoiceAssistant = () => {
    setVoiceAssistantOpen(true)
    startVoiceRecognition(true)
  }

  const showVoiceAssistantHelp = () => {
    const message = getVoiceHelpText()
    setVoiceAssistantHelpOpen(true)
    setVoiceAssistantText(message)
    speakVoiceAssistantMessage(message, () => {})
  }

  const openVoiceAssistantPrivacySettings = () => {
    void window.smplayer?.openVoiceAssistantPrivacySettings()
  }

  const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMoreMenu({ x: rect.left, y: rect.top })
    void refreshPreferenceItem()
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

  useEffect(() => {
    let isDisposed = false

    if (track.id == null || !window.smplayer) {
      return () => {
        isDisposed = true
      }
    }

    window.smplayer.getSongArtwork(track.id)
      .then((artworkUrl) => {
        if (!isDisposed) {
          setSongArtwork({ trackId: track.id!, artworkUrl })
          if (artworkUrl) {
            onArtworkResolved(track.id!, artworkUrl)
          }
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setSongArtwork({ trackId: track.id!, artworkUrl: '' })
        }
      })

    return () => {
      isDisposed = true
    }
  }, [track.id])

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

  const retryLoadSongArtwork = () => {
    if (track.id == null || !window.smplayer) {
      return
    }

    window.smplayer.getSongArtwork(track.id)
      .then((artworkUrl) => {
        setSongArtwork({ trackId: track.id!, artworkUrl })
        if (artworkUrl) {
          onArtworkResolved(track.id!, artworkUrl)
        }
      })
      .catch(() => {
        setSongArtwork({ trackId: track.id!, artworkUrl: '' })
      })
  }

  useEffect(() => {
    let isDisposed = false

    extractArtworkColorRgb(usableArtworkUrl)
      .then((nextColor) => {
        if (!isDisposed) {
          setCoverColorRgb(nextColor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setCoverColorRgb(getDefaultArtworkColorRgb())
        }
      })

    return () => {
      isDisposed = true
    }
  }, [usableArtworkUrl])

  return (
    <footer
      className={`player-bar${disabled ? ' disabled' : ''}`}
      style={{ '--player-cover-rgb': coverColorRgb } as CSSProperties}
    >
      <button
        className="player-track"
        type="button"
        disabled={track.id == null}
        aria-label={track.title}
        title={track.id == null ? undefined : track.title}
        onClick={onOpenNowPlaying}
      >
        <span className="player-artwork-shell">
          <img
            className="album-swatch artwork-image"
            src={displayArtworkUrl}
            alt=""
            aria-hidden="true"
            onError={() => {
              setFailedArtworkUrl(displayArtworkUrl)
              retryLoadSongArtwork()
            }}
          />
          <span className="player-artwork-overlay" aria-hidden="true">
            <Icon name="fullscreen" />
          </span>
        </span>
        <span className="player-track-copy">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
          {currentLyricsLine ? (
            <span
              className="player-track-lyrics"
              title={currentLyricsLine}
            >
              {currentLyricsLine}
            </span>
          ) : null}
        </span>
      </button>

      <div className="player-center">
        <div className="transport-row">
          <button
            className="transport-button"
            type="button"
            aria-label={t('player.previous')}
            title={t('player.previous')}
            disabled={disabled}
            onClick={onPrevious}
          >
            <Icon name="previous" />
          </button>
          <button
            className={`transport-button primary${track.isLoading ? ' is-loading' : ''}`}
            type="button"
            aria-label={playTitle}
            title={playTitle}
            disabled={disabled}
            onClick={onTogglePlayPause}
          >
            {track.isLoading ? <span className="player-loading-spinner" aria-hidden="true" /> : <Icon name={isPlaying ? 'pause' : 'play'} />}
          </button>
          <button
            className="transport-button"
            type="button"
            aria-label={t('player.next')}
            title={t('player.next')}
            disabled={disabled}
            onClick={onNext}
          >
            <Icon name="next" />
          </button>
        </div>
        <div className="progress-row">
          <span>{track.elapsedLabel}</span>
          {track.isLoading ? (
            <div className="media-progress-loading" aria-hidden="true" />
          ) : (
            <input
              className="media-slider"
              type="range"
              min="0"
              max={progressMax}
              step="0.1"
              value={progressValue}
              style={{ '--range-progress': `${progressFill}%` } as CSSProperties}
              onChange={(event) => {
                const nextValue = Number(event.currentTarget.value)
                setDraftProgressSeconds(nextValue)
                if (!isProgressSeekingRef.current) {
                  onSeek(nextValue)
                }
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
              disabled={disabled || !track.isReady}
              aria-label={t('player.trackProgress')}
              title={formatDuration(progressValue)}
            />
          )}
          <span>{track.durationLabel}</span>
        </div>
      </div>

      <div className="player-utility">
        <div className="player-volume-row">
          <button
            type="button"
            disabled={disabled}
            className={isMuted ? 'is-active' : ''}
            onClick={onToggleMute}
            aria-label={volumeTitle}
            title={volumeTitle}
          >
            <Icon name={isMuted ? 'volumeMuted' : 'volume'} />
          </button>
          <input
            className="media-slider"
            type="range"
            min="0"
            max="100"
            value={volumeValue}
            style={{ '--range-progress': `${volumeValue}%` } as CSSProperties}
            disabled={disabled}
            onChange={(event) => {
              onVolumeChange(Number(event.currentTarget.value))
            }}
            aria-label={t('player.volume')}
            title={String(volumeValue)}
          />
          <button
            type="button"
            disabled={disabled || track.id == null}
            className={`favorite-toggle${track.favorite ? ' is-active' : ''}`}
            onClick={onToggleFavorite}
            aria-label={t('common.favorite')}
            title={track.favorite ? t('player.unlike') : t('player.like')}
          >
            <Icon name={track.favorite ? 'heartFilled' : 'heart'} />
          </button>
        </div>
        <div className="player-mode-row">
          <button
            type="button"
            disabled={disabled}
            className={mode === 'shuffle' ? 'is-active' : ''}
            onClick={onToggleShuffle}
            aria-label={getShuffleTitle(t, mode)}
            title={getShuffleTitle(t, mode)}
          >
            <Icon name="shuffle" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={mode === 'repeat' ? 'is-active' : ''}
            onClick={onToggleRepeat}
            aria-label={getRepeatTitle(t, mode)}
            title={getRepeatTitle(t, mode)}
          >
            <Icon name="repeat" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={mode === 'repeat-one' ? 'is-active' : ''}
            onClick={onToggleRepeatOne}
            aria-label={getRepeatOneTitle(t, mode)}
            title={getRepeatOneTitle(t, mode)}
          >
            <Icon name="repeatOne" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={voiceAssistantOpen ? 'is-active' : ''}
            aria-label={t('player.voiceAssistant')}
            title={t('player.voiceAssistant')}
            onClick={openVoiceAssistant}
          >
            <Icon name="voice" />
          </button>
          <button type="button" disabled={disabled} aria-label={t('player.more')} title={t('player.more')} onClick={openMoreMenu}>
            <Icon name="moreHorizontal" />
          </button>
        </div>
      </div>
      {voiceAssistantOpen ? (
        <div className={`voice-assistant-popover is-${voiceAssistantState}`} role="status">
          <div className="voice-assistant-state">{voiceAssistantStateLabel}</div>
          <div className="voice-assistant-copy">{voiceAssistantText}</div>
          <button
            type="button"
            className="voice-assistant-help-button"
            onClick={showVoiceAssistantHelp}
            title={t('voiceAssistant.getHelp')}
          >
            {t('voiceAssistant.getHelp')}
          </button>
          {voiceAssistantNeedsPrivacySettings ? (
            <button
              type="button"
              className="voice-assistant-help-button"
              onClick={openVoiceAssistantPrivacySettings}
              title={t('voiceAssistant.openPrivacySettings')}
            >
              {t('voiceAssistant.openPrivacySettings')}
            </button>
          ) : null}
          <button type="button" onClick={closeVoiceAssistant} aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="close" />
          </button>
          {voiceAssistantState !== 'idle' ? <div className="voice-assistant-progress" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {voiceAssistantHelpOpen ? (
        <div className="voice-assistant-help-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-assistant-help-title">
          <div className="voice-assistant-help-panel">
            <div className="voice-assistant-help-header">
              <h2 id="voice-assistant-help-title">{t('voiceAssistant.helpTitle')}</h2>
              <button type="button" onClick={() => setVoiceAssistantHelpOpen(false)} aria-label={t('common.close')} title={t('common.close')}>
                <Icon name="close" />
              </button>
            </div>
            <div className="voice-assistant-help-body">
              <h3>{t('voiceAssistant.supportedCommands')}</h3>
              <div className="voice-assistant-command-list">
                <span>{t('voiceAssistant.command.play')}</span>
                <p>{t('voiceAssistant.command.play1')}</p>
                <span />
                <p>{t('voiceAssistant.command.play2')}</p>
                <span />
                <p>{t('voiceAssistant.command.play3')}</p>
                <span>{t('voiceAssistant.command.playControl')}</span>
                <p>{t('voiceAssistant.command.playControl1')}</p>
                <span>{t('voiceAssistant.command.volume')}</span>
                <p>{t('voiceAssistant.command.volume1')}</p>
                <span />
                <p>{t('voiceAssistant.command.volume2')}</p>
                <span>{t('voiceAssistant.command.search')}</span>
                <p>{t('voiceAssistant.command.search1')}</p>
                <span>{t('voiceAssistant.command.help')}</span>
                <p>{t('voiceAssistant.command.help1')}</p>
              </div>
              <h3>{t('voiceAssistant.notice')}</h3>
              <ol>
                <li>{t('voiceAssistant.noticeSmartness')}</li>
                <li>{t('voiceAssistant.noticeCommandIntro')}</li>
                <li>{t('voiceAssistant.noticeExample')}</li>
              </ol>
            </div>
          </div>
        </div>
      ) : null}
      {moreMenu ? (
        <MenuFlyout
          position={moreMenu}
          onClose={() => {
            setMoreMenu(null)
          }}
          items={getPlayerMoreMenuItems({
            song: currentSong,
            playlists,
            preferenceItem,
            t,
            onQuickPlay,
            onAddToNowPlaying: () => {
              if (currentSong) {
                const previousQueueSongIds = snapshotQueueSongIds
                void replaceNowPlaying([...snapshotQueueSongIds, currentSong.id])
                showUndo(t('notification.songAddedTo', { title: currentSong.title, target: t('common.nowPlaying') }), () =>
                  replaceNowPlaying(previousQueueSongIds),
                )
              }
            },
            onCreatePlaylist: (name) => {
              if (currentSong) {
                void createPlaylist(name, [currentSong.id])
              }
            },
            onAddToPlaylist: (playlistId) => {
              if (currentSong) {
                const playlist = playlists.find((item) => item.id === playlistId)!
                void window.smplayer?.addSongToPlaylist(playlistId, currentSong.id)
                showUndo(t('notification.songAddedTo', { title: currentSong.title, target: playlist.name }), () =>
                  removeSongFromPlaylist(playlistId, currentSong.id),
                )
              }
            },
            onToggleFavorite,
            onPreferenceChanged: refreshPreferenceItem,
            onSeeArtist: (artist) => {
              if (currentSong) {
                navigate(`/artists/${encodeURIComponent(artist)}`)
              }
            },
            onSeeAlbum: () => {
              if (currentSong) {
                navigate(`/albums/${encodeURIComponent(currentSong.album || t('common.albumUnknown'))}`)
              }
            },
            onSeeMusicInfo: () => {
              setMoreMenu(null)
              setDialogMode('properties')
            },
            onSeeLyrics: () => {
              setMoreMenu(null)
              setDialogMode('lyrics')
            },
            onSeeAlbumArt: () => {
              setMoreMenu(null)
              setDialogMode('album-art')
            },
          })}
        />
      ) : null}
      {currentSong && dialogMode ? (
        <MusicDialog
          song={currentSong}
          mode={dialogMode}
          t={t}
          currentTrackId={currentSong.id}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onClose={() => {
            setDialogMode(null)
            setMoreMenu(null)
          }}
        />
      ) : null}
    </footer>
  )
}

function getPlayerMoreMenuItems({
  song,
  playlists,
  preferenceItem,
  t,
  onQuickPlay,
  onAddToNowPlaying,
  onCreatePlaylist,
  onAddToPlaylist,
  onToggleFavorite,
  onPreferenceChanged,
  onSeeArtist,
  onSeeAlbum,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
}: {
  song: LibrarySong | null
  playlists: LibraryPlaylist[]
  preferenceItem: PreferenceItemSnapshot | null
  t: Translator
  onQuickPlay: () => void | Promise<void>
  onAddToNowPlaying: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  onToggleFavorite: () => void
  onPreferenceChanged: () => void | Promise<void>
  onSeeArtist: (artist: string) => void
  onSeeAlbum: () => void
  onSeeMusicInfo: () => void
  onSeeLyrics: () => void
  onSeeAlbumArt: () => void
}) {
  const items: MenuFlyoutItem[] = [
    { key: 'quick-play', text: t('nowPlaying.quickPlay'), icon: 'shuffle', onClick: onQuickPlay },
  ]

  if (!song) {
    return items
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [song.id],
    t,
    defaultPlaylistName: song.title,
    includeNowPlaying: true,
    includeFavorites: !song.favorite,
    onAddToNowPlaying,
    onToggleFavorite,
    onCreatePlaylist,
    onAddToPlaylist,
  })

  if (addToItem) {
    items.push(addToItem)
  }

  const artists = getSongArtists(song)
  items.push(
    getPreferenceMenuFlyoutItem({
      type: 'song',
      itemId: String(song.id),
      name: song.title,
      preferenceItem,
      t,
      onUpdated: onPreferenceChanged,
    }),
    artists.length === 1
      ? { key: 'see-artist', text: t('context.seeArtist'), icon: 'users', onClick: () => onSeeArtist(artists[0]) }
      : {
          key: 'see-artist',
          text: t('context.seeArtist'),
          icon: 'users',
          submenu: artists.map((artist) => ({
            key: `see-artist-${artist}`,
            text: artist,
            icon: 'users' as const,
            onClick: () => onSeeArtist(artist),
          })),
        },
    { key: 'see-album', text: t('context.seeAlbum'), icon: 'albums', onClick: onSeeAlbum },
    { key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', keepOpen: true, onClick: onSeeMusicInfo },
    { key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'songs', keepOpen: true, onClick: onSeeLyrics },
    { key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'albums', keepOpen: true, onClick: onSeeAlbumArt },
  )

  return items
}
