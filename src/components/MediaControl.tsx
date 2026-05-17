import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryPlaylist, LibrarySong, LyricsSnapshot, PlaybackMode, PreferenceItemSnapshot, PreferenceSettingsSnapshot } from '../shared/contracts'
import { extractArtworkColorRgb, getDefaultArtworkColorRgb } from '../shared/artworkColor'
import type { Translator } from '../shared/i18n'
import { getCurrentLyricsLine } from '../shared/lyrics'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useSongArtwork } from '../hooks/useSongArtwork'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { Icon } from './icons'
import { formatDuration } from '../shared/formatters'
import { MenuFlyout } from './MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from './MenuFlyoutHelper'
import { MusicDialog } from './MusicDialog'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { VoiceAssistantFlyout, type VoiceAssistantFlyoutHandle, type VoiceAssistantResponse } from './VoiceAssistantFlyout'
import { VolumeSlider } from './VolumeSlider'
import { getVolumeIconName } from './volumeIcon'
import { DEFAULT_ARTWORK_URL, getRepeatOneTitle, getRepeatTitle, getShuffleTitle } from './mediaControlModel'

export type { VoiceAssistantResponse } from './VoiceAssistantFlyout'

const PLAYER_COMPACT_BREAKPOINT = 800

export interface MediaControlTrack {
  id: number | null
  title: string
  artist: string
  artworkUrl: string
  isLoading: boolean
  favorite?: boolean
}

interface MediaControlProps {
  track: MediaControlTrack
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
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  voiceLanguage: string
  onOpenNowPlaying: () => void
  isWindowFullScreen: boolean
  onToggleWindowFullScreen: () => void
  onEnterMiniMode: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
  onSaved: () => void | Promise<void>
}

interface MediaControlButtonsProps {
  trackId: number | null
  isLoading: boolean
  favorite?: boolean
  disabled: boolean
  isPlaying: boolean
  volumeValue: number
  mode: PlaybackMode
  progressSeconds: number
  progressValue: number
  progressMax: number
  progressFill: number
  durationSeconds: number
  t: Translator
  onTogglePlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeekChange: (seconds: number) => void
  onSeekPointerDown: (event: PointerEvent<HTMLInputElement>) => void
  onSeekPointerCommit: (event: PointerEvent<HTMLInputElement>) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
  onToggleFavorite: () => void
  onVoiceAssistantClick: () => void
  voiceAssistantAvailable: boolean
  voiceAssistantActive?: boolean
  isMuted: boolean
  onMoreClick: (event: MouseEvent<HTMLButtonElement>) => void
}

interface MediaControlSurfaceProps {
  trackId: number | null
  isLoading: boolean
  favorite?: boolean
  disabled: boolean
  isPlaying: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  currentSong: LibrarySong | null
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
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  voiceLanguage: string
  onMoreClick: (event: MouseEvent<HTMLButtonElement>) => void
}

function getPlaybackModeName(t: Translator, mode: PlaybackMode) {
  switch (mode) {
    case 'shuffle':
      return t('player.playbackModeShuffle')
    case 'repeat':
      return t('player.playbackModeRepeat')
    case 'repeat-one':
      return t('player.playbackModeRepeatOne')
    default:
      return t('player.playbackModeList')
  }
}

function getPlaybackModeIcon(mode: PlaybackMode): NonNullable<MenuFlyoutItem['icon']> {
  switch (mode) {
    case 'shuffle':
      return 'shuffle'
    case 'repeat':
      return 'repeat'
    case 'repeat-one':
      return 'repeatOne'
    default:
      return 'nowPlaying'
  }
}

function getNextPlaybackMode(mode: PlaybackMode): PlaybackMode {
  if (mode === 'once') {
    return 'shuffle'
  }

  if (mode === 'shuffle') {
    return 'repeat'
  }

  if (mode === 'repeat') {
    return 'repeat-one'
  }

  return 'once'
}

function setPlaybackModeFromCurrent({
  mode,
  targetMode,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
}: {
  mode: PlaybackMode
  targetMode: PlaybackMode
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
}) {
  if (mode === targetMode) {
    return
  }

  if (targetMode === 'shuffle') {
    onToggleShuffle()
  } else if (targetMode === 'repeat') {
    onToggleRepeat()
  } else if (targetMode === 'repeat-one') {
    onToggleRepeatOne()
  } else if (mode === 'shuffle') {
    onToggleShuffle()
  } else if (mode === 'repeat') {
    onToggleRepeat()
  } else if (mode === 'repeat-one') {
    onToggleRepeatOne()
  }
}

function getPlaybackModeMenuItems(t: Translator, mode: PlaybackMode, setPlaybackMode: (mode: PlaybackMode) => void): MenuFlyoutItem[] {
  return [
    { key: 'playback-mode-list', text: getPlaybackModeName(t, 'once'), icon: 'nowPlaying', checked: mode === 'once', onClick: () => setPlaybackMode('once') },
    { key: 'playback-mode-shuffle', text: getPlaybackModeName(t, 'shuffle'), icon: 'shuffle', checked: mode === 'shuffle', onClick: () => setPlaybackMode('shuffle') },
    { key: 'playback-mode-repeat', text: getPlaybackModeName(t, 'repeat'), icon: 'repeat', checked: mode === 'repeat', onClick: () => setPlaybackMode('repeat') },
    { key: 'playback-mode-repeat-one', text: getPlaybackModeName(t, 'repeat-one'), icon: 'repeatOne', checked: mode === 'repeat-one', onClick: () => setPlaybackMode('repeat-one') },
  ]
}

export function MediaControlButtons({
  trackId,
  isLoading,
  favorite,
  disabled,
  isPlaying,
  volumeValue,
  mode,
  progressSeconds,
  progressValue,
  progressMax,
  progressFill,
  durationSeconds,
  t,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeekChange,
  onSeekPointerDown,
  onSeekPointerCommit,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
  onToggleFavorite,
  onVoiceAssistantClick,
  voiceAssistantAvailable,
  voiceAssistantActive = false,
  isMuted,
  onMoreClick,
}: MediaControlButtonsProps) {
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const [compactVolumeOpen, setCompactVolumeOpen] = useState(false)
  const [modeMenu, setModeMenu] = useState<MenuFlyoutPosition | null>(null)
  const [liveVolumeValue, setLiveVolumeValue] = useState(volumeValue)
  const compactVolumeButtonRef = useRef<HTMLButtonElement | null>(null)
  const compactVolumePanelRef = useRef<HTMLDivElement | null>(null)
  const modeLongPressTimerRef = useRef<number | null>(null)
  const suppressNextModeClickRef = useRef(false)
  const volumeIconName = getVolumeIconName(liveVolumeValue, isMuted)
  const modeTitle = `${t('player.playbackMode')}: ${getPlaybackModeName(t, mode)}`
  const modeIconName = getPlaybackModeIcon(mode)

  const setPlaybackMode = (targetMode: PlaybackMode) => {
    setPlaybackModeFromCurrent({
      mode,
      targetMode,
      onToggleShuffle,
      onToggleRepeat,
      onToggleRepeatOne,
    })
  }

  const cyclePlaybackMode = () => {
    setCompactVolumeOpen(false)
    setPlaybackMode(getNextPlaybackMode(mode))
  }

  const clearModeLongPressTimer = () => {
    if (modeLongPressTimerRef.current != null) {
      window.clearTimeout(modeLongPressTimerRef.current)
      modeLongPressTimerRef.current = null
    }
  }

  const openModeMenu = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setCompactVolumeOpen(false)
    setModeMenu({ x: rect.left, y: rect.top - 8, anchor: button })
  }

  useEffect(() => () => {
    clearModeLongPressTimer()
  }, [])

  useEffect(() => {
    setLiveVolumeValue(volumeValue)
  }, [volumeValue])

  useEffect(() => {
    if (!compactVolumeOpen) {
      return
    }

    const closeVolumeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (compactVolumePanelRef.current?.contains(target) || compactVolumeButtonRef.current?.contains(target)) {
        return
      }

      setCompactVolumeOpen(false)
    }

    document.addEventListener('pointerdown', closeVolumeOnOutsidePointerDown)
    return () => {
      document.removeEventListener('pointerdown', closeVolumeOnOutsidePointerDown)
    }
  }, [compactVolumeOpen])

  return (
    <>
      <div className="player-center">
        <div className="transport-row">
          <button
            className="transport-button skip"
            type="button"
            aria-label={t('player.previous')}
            title={t('player.previous')}
            disabled={disabled}
            onClick={onPrevious}
          >
            <Icon name="previous" />
          </button>
          <button
            className={`transport-button primary${isLoading ? ' is-loading' : ''}`}
            type="button"
            aria-label={playTitle}
            title={playTitle}
            disabled={disabled}
            onClick={onTogglePlayPause}
          >
            {isLoading ? <span className="player-loading-spinner" aria-hidden="true" /> : <Icon name={isPlaying ? 'pause' : 'play'} />}
          </button>
          <button
            className="transport-button skip"
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
          <span>{formatDuration(progressSeconds)}</span>
          {isLoading ? (
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
                onSeekChange(Number(event.currentTarget.value))
              }}
              onPointerDown={onSeekPointerDown}
              onPointerUp={onSeekPointerCommit}
              onPointerCancel={onSeekPointerCommit}
              onLostPointerCapture={onSeekPointerCommit}
              disabled={disabled || durationSeconds <= 0}
              aria-label={t('player.trackProgress')}
              title={formatDuration(progressValue)}
            />
          )}
          <span>{formatDuration(durationSeconds)}</span>
        </div>
      </div>

      <div className="player-utility">
        <div className="player-volume-row">
          <div className="player-compact-volume-action">
            <button
              ref={compactVolumeButtonRef}
              type="button"
              disabled={disabled}
              className={compactVolumeOpen ? 'is-active' : ''}
              onClick={() => {
                setModeMenu(null)
                setCompactVolumeOpen((current) => !current)
              }}
              aria-label={volumeTitle}
              title={volumeTitle}
            >
              <Icon name={volumeIconName} />
            </button>
            {compactVolumeOpen ? (
              <VolumeSlider
                ref={compactVolumePanelRef}
                className="mini-mode-volume-popover player-compact-volume-popover"
                inputClassName="mini-mode-volume-slider"
                orientation="vertical"
                value={volumeValue}
                disabled={disabled}
                ariaLabel={t('player.volume')}
                showTooltipOnMount
                onChange={onVolumeChange}
                onLiveValueChange={setLiveVolumeValue}
              />
            ) : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            className={isMuted ? 'player-volume-toggle is-active' : 'player-volume-toggle'}
            onClick={onToggleMute}
            aria-label={volumeTitle}
            title={volumeTitle}
          >
            <Icon name={volumeIconName} />
          </button>
          <VolumeSlider
            className="volume-slider-wrap"
            inputClassName="media-slider"
            value={volumeValue}
            disabled={disabled}
            ariaLabel={t('player.volume')}
            onChange={onVolumeChange}
            onLiveValueChange={setLiveVolumeValue}
          />
          <button
            type="button"
            disabled={disabled || trackId == null}
            className={`favorite-toggle${favorite ? ' is-active' : ''}`}
            onClick={onToggleFavorite}
            aria-label={t('common.favorite')}
            title={favorite ? t('player.unlike') : t('player.like')}
          >
            <Icon name={favorite ? 'heartFilled' : 'heart'} />
          </button>
        </div>
        <div className="player-mode-row">
          <button
            type="button"
            disabled={disabled}
            className={mode === 'shuffle' ? 'player-mode-button is-active' : 'player-mode-button'}
            onClick={onToggleShuffle}
            aria-label={getShuffleTitle(t, mode)}
            title={getShuffleTitle(t, mode)}
          >
            <Icon name="shuffle" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={mode === 'repeat' ? 'player-mode-button is-active' : 'player-mode-button'}
            onClick={onToggleRepeat}
            aria-label={getRepeatTitle(t, mode)}
            title={getRepeatTitle(t, mode)}
          >
            <Icon name="repeat" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={mode === 'repeat-one' ? 'player-mode-button is-active' : 'player-mode-button'}
            onClick={onToggleRepeatOne}
            aria-label={getRepeatOneTitle(t, mode)}
            title={getRepeatOneTitle(t, mode)}
          >
            <Icon name="repeatOne" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className={mode === 'once' ? 'player-compact-mode-button' : 'player-compact-mode-button is-active'}
            aria-label={modeTitle}
            title={modeTitle}
            onClick={() => {
              if (suppressNextModeClickRef.current) {
                suppressNextModeClickRef.current = false
                return
              }

              cyclePlaybackMode()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              clearModeLongPressTimer()
              openModeMenu(event.currentTarget)
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return
              }

              const button = event.currentTarget
              clearModeLongPressTimer()
              modeLongPressTimerRef.current = window.setTimeout(() => {
                modeLongPressTimerRef.current = null
                suppressNextModeClickRef.current = true
                openModeMenu(button)
              }, 520)
            }}
            onPointerUp={clearModeLongPressTimer}
            onPointerCancel={clearModeLongPressTimer}
            onPointerLeave={clearModeLongPressTimer}
          >
            <Icon name={modeIconName} />
          </button>
          {voiceAssistantAvailable ? (
            <button
              type="button"
              disabled={disabled}
              className={voiceAssistantActive ? 'is-active' : ''}
              aria-label={t('player.voiceAssistant')}
              title={t('player.voiceAssistant')}
              onClick={onVoiceAssistantClick}
            >
              <Icon name="voice" />
            </button>
          ) : null}
          <button type="button" disabled={disabled} aria-label={t('player.more')} title={t('player.more')} onClick={onMoreClick}>
            <Icon name="moreHorizontal" />
          </button>
        </div>
      </div>
      {modeMenu ? (
        <MenuFlyout
          position={modeMenu}
          onClose={() => {
            setModeMenu(null)
          }}
          items={getPlaybackModeMenuItems(t, mode, setPlaybackMode)}
        />
      ) : null}
    </>
  )
}

function MediaControlLyrics({ line }: { line: string }) {
  return (
    <span className="player-track-lyrics" title={line}>
      <span key={line} className="player-track-lyrics-line">
        {line}
      </span>
    </span>
  )
}

export function MediaControlSurface({
  trackId,
  isLoading,
  favorite,
  disabled,
  isPlaying,
  volume,
  isMuted,
  mode,
  currentSong,
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
  onVoiceCommand,
  getVoiceHint,
  voiceLanguage,
  onMoreClick,
}: MediaControlSurfaceProps) {
  const [isProgressSeeking, setIsProgressSeeking] = useState(false)
  const [draftProgressSeconds, setDraftProgressSeconds] = useState(0)
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false)
  const [voiceAssistantAvailable, setVoiceAssistantAvailable] = useState(false)
  const isProgressSeekingRef = useRef(false)
  const voiceAssistantFlyoutRef = useRef<VoiceAssistantFlyoutHandle>(null)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const effectiveDurationSeconds = durationSeconds || currentSong?.duration || 0
  const displayProgressSeconds = isProgressSeeking ? draftProgressSeconds : progressSeconds
  const progressValue = disabled || effectiveDurationSeconds <= 0 ? 0 : Math.min(Math.max(displayProgressSeconds, 0), effectiveDurationSeconds)
  const progressMax = Math.max(effectiveDurationSeconds, 0)
  const progressFill = progressMax > 0 ? (progressValue / progressMax) * 100 : 0
  const volumeValue = disabled ? 0 : Math.min(Math.max(volume, 0), 100)

  useEffect(() => {
    void window.smplayer?.getAppInfo().then((appInfo) => {
      setVoiceAssistantAvailable(appInfo.platform === 'win32')
    })
  }, [])

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

  return (
    <>
      <MediaControlButtons
        trackId={trackId}
        isLoading={isLoading}
        favorite={favorite}
        disabled={disabled}
        isPlaying={isPlaying}
        volumeValue={volumeValue}
        mode={mode}
        progressSeconds={progressValue}
        progressValue={progressValue}
        progressMax={progressMax}
        progressFill={progressFill}
        durationSeconds={effectiveDurationSeconds}
        t={t}
        onTogglePlayPause={onTogglePlayPause}
        onPrevious={onPrevious}
        onNext={onNext}
        onSeekChange={(nextValue) => {
          setDraftProgressSeconds(nextValue)
        }}
        onSeekPointerDown={beginProgressSeek}
        onSeekPointerCommit={(event) => {
          commitProgressSeek(Number(event.currentTarget.value))
        }}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
        onToggleShuffle={onToggleShuffle}
        onToggleRepeat={onToggleRepeat}
        onToggleRepeatOne={onToggleRepeatOne}
        onToggleFavorite={onToggleFavorite}
        onVoiceAssistantClick={() => {
          if (voiceAssistantOpen) {
            voiceAssistantFlyoutRef.current?.close()
          } else {
            voiceAssistantFlyoutRef.current?.open()
          }
        }}
        voiceAssistantAvailable={voiceAssistantAvailable}
        voiceAssistantActive={voiceAssistantAvailable && voiceAssistantOpen}
        isMuted={isMuted}
        onMoreClick={onMoreClick}
      />
      {voiceAssistantAvailable ? (
        <VoiceAssistantFlyout
          ref={voiceAssistantFlyoutRef}
          t={t}
          voiceLanguage={voiceLanguage}
          onVoiceCommand={onVoiceCommand}
          getVoiceHint={getVoiceHint}
          onOpenChange={setVoiceAssistantOpen}
        />
      ) : null}
    </>
  )
}

export function MediaControl({
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
  onPlayTrack,
  onVoiceCommand,
  getVoiceHint,
  voiceLanguage,
  onOpenNowPlaying,
  isWindowFullScreen,
  onToggleWindowFullScreen,
  onEnterMiniMode,
  onArtworkResolved,
  onSaved,
}: MediaControlProps) {
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const snapshotQueueSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const playerLyricsSource = useLibraryStore((state) => state.snapshot.settings.playerLyricsSource)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const effectiveDurationSeconds = durationSeconds || currentSong?.duration || 0
  const progressRatio = effectiveDurationSeconds > 0 ? progressSeconds / effectiveDurationSeconds : 0
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultArtworkColorRgb)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState('')
  const [moreMenu, setMoreMenu] = useState<MenuFlyoutPosition | null>(null)
  const [dialogMode, setDialogMode] = useState<'properties' | 'lyrics' | 'album-art' | null>(null)
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [lyrics, setLyrics] = useState<LyricsSnapshot | null>(null)
  const [isCompactPlayerMenu, setIsCompactPlayerMenu] = useState(() => window.innerWidth <= PLAYER_COMPACT_BREAKPOINT)
  const {
    artworkUrl: effectiveArtworkUrl,
    baseArtworkUrl,
    refreshArtwork,
  } = useSongArtwork(track.id, track.artworkUrl)
  const usableArtworkUrl = effectiveArtworkUrl && effectiveArtworkUrl !== failedArtworkUrl
    ? effectiveArtworkUrl
    : ''
  const displayArtworkUrl = usableArtworkUrl || DEFAULT_ARTWORK_URL
  const refreshPreferenceItem = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    if (currentSong) {
      const settings = snapshot ?? await refreshPreferences()
      if (!settings) {
        return
      }
      setPreferenceItem(settings.songs.find((item) => item.itemId === String(currentSong.id)) ?? null)
    }
  }

  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const currentLyricsLine = useMemo(
    () => getCurrentLyricsLine(lyrics, progressSeconds, progressRatio),
    [lyrics, progressRatio, progressSeconds],
  )

  const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMoreMenu({ x: rect.left, y: rect.top - 8, anchor: event.currentTarget })
    void refreshPreferenceItem()
  }

  useEffect(() => {
    const updateCompactMenu = () => {
      setIsCompactPlayerMenu(window.innerWidth <= PLAYER_COMPACT_BREAKPOINT)
    }

    window.addEventListener('resize', updateCompactMenu)
    return () => {
      window.removeEventListener('resize', updateCompactMenu)
    }
  }, [])

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
    setLyrics(null)
    void window.smplayer!.getLyrics(currentSong.id, playerLyricsSource).then((snapshot) => {
      if (!isDisposed) {
        setLyrics(snapshot)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [currentSong?.id, playerLyricsSource])

  const refreshCurrentSong = async () => {
    if (currentSong) {
      const snapshot = await window.smplayer!.getLyrics(currentSong.id, playerLyricsSource)
      setLyrics(snapshot)
      refreshArtwork()
    }
    await onSaved()
  }

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
          {usableArtworkUrl ? (
            <img
              className="album-swatch artwork-image"
              src={displayArtworkUrl}
              alt=""
              aria-hidden="true"
              onError={() => {
                setFailedArtworkUrl(displayArtworkUrl)
                refreshArtwork()
              }}
            />
          ) : (
            <DefaultAlbumArtwork className="album-swatch artwork-image" />
          )}
          <span className="player-artwork-overlay" aria-hidden="true">
            <Icon name="fullscreen" />
          </span>
        </span>
        <span className="player-track-copy">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
          {currentLyricsLine ? <MediaControlLyrics line={currentLyricsLine} /> : null}
        </span>
      </button>

      <MediaControlSurface
        trackId={track.id}
        isLoading={track.isLoading}
        favorite={track.favorite}
        disabled={disabled}
        isPlaying={isPlaying}
        volume={volume}
        mode={mode}
        currentSong={currentSong}
        t={t}
        onTogglePlayPause={onTogglePlayPause}
        onPrevious={onPrevious}
        onNext={onNext}
        onSeek={onSeek}
        onBeginSeek={onBeginSeek}
        onEndSeek={onEndSeek}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
        onToggleShuffle={onToggleShuffle}
        onToggleRepeat={onToggleRepeat}
        onToggleRepeatOne={onToggleRepeatOne}
        onToggleFavorite={onToggleFavorite}
        onVoiceCommand={onVoiceCommand}
        getVoiceHint={getVoiceHint}
        voiceLanguage={voiceLanguage}
        isMuted={isMuted}
        onMoreClick={openMoreMenu}
      />
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
                const insertedIndex = snapshotQueueSongIds.length
                void replaceNowPlaying([...snapshotQueueSongIds, currentSong.id])
                showUndo(t('notification.songAddedTo', { title: currentSong.title, target: t('common.nowPlaying') }), () =>
                  replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
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
                void addSongToPlaylist(playlistId, currentSong.id)
                showUndo(t('notification.songAddedTo', { title: currentSong.title, target: playlist.name }), () =>
                  removeSongFromPlaylist(playlistId, currentSong.id),
                )
              }
            },
            onToggleFavorite,
            mode,
            volume,
            isMuted,
            isCompact: isCompactPlayerMenu,
            onVolumeChange,
            onToggleMute,
            onToggleShuffle,
            onToggleRepeat,
            onToggleRepeatOne,
            onPreferenceChanged: refreshPreferenceItem,
            onSeeArtist: (artist) => {
              if (currentSong) {
                navigate(`/artists?artist=${encodeURIComponent(artist)}`)
              }
            },
            onSeeAlbum: () => {
              if (currentSong) {
                navigate(`/albums?album=${encodeURIComponent(currentSong.album || t('common.albumUnknown'))}`)
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
            onSeeLocal: () => {
              if (currentSong) {
                void window.smplayer?.revealItemInFolder(currentSong.path)
              }
            },
            isWindowFullScreen,
            onToggleWindowFullScreen,
            onEnterMiniMode,
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
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onSaved={() => {
            void refreshCurrentSong()
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
  mode,
  volume,
  isMuted,
  isCompact,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
  onPreferenceChanged,
  onSeeArtist,
  onSeeAlbum,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
  onSeeLocal,
  isWindowFullScreen,
  onToggleWindowFullScreen,
  onEnterMiniMode,
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
  mode: PlaybackMode
  volume: number
  isMuted: boolean
  isCompact: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
  onPreferenceChanged: () => void | Promise<void>
  onSeeArtist: (artist: string) => void
  onSeeAlbum: () => void
  onSeeMusicInfo: () => void
  onSeeLyrics: () => void
  onSeeAlbumArt: () => void
  onSeeLocal: () => void | Promise<void>
  isWindowFullScreen: boolean
  onToggleWindowFullScreen: () => void
  onEnterMiniMode: () => void
}) {
  const items: MenuFlyoutItem[] = [
    { key: 'quick-play', text: t('nowPlaying.quickPlay'), icon: 'play', onClick: onQuickPlay },
  ]
  const volumeValue = Math.min(Math.max(volume, 0), 100)

  const setPlaybackMode = (targetMode: PlaybackMode) => {
    if (mode === targetMode) {
      return
    }

    if (targetMode === 'shuffle') {
      onToggleShuffle()
    } else if (targetMode === 'repeat') {
      onToggleRepeat()
    } else if (targetMode === 'repeat-one') {
      onToggleRepeatOne()
    } else if (mode === 'shuffle') {
      onToggleShuffle()
    } else if (mode === 'repeat') {
      onToggleRepeat()
    } else if (mode === 'repeat-one') {
      onToggleRepeatOne()
    }
  }

  if (isCompact) {
    items.push(
      {
        key: 'playback-mode',
        text: `${t('player.playbackMode')}: ${getPlaybackModeName(t, mode)}`,
        icon: getPlaybackModeIcon(mode),
        submenu: getPlaybackModeMenuItems(t, mode, setPlaybackMode),
      },
      {
        key: 'player-volume',
        text: t('player.volume'),
        icon: getVolumeIconName(volumeValue, isMuted),
        kind: 'volume',
        keepOpen: true,
        volumeValue,
        volumeMuted: isMuted,
        onVolumeChange,
        onToggleMute,
      },
      {
        key: 'player-favorite',
        text: song?.favorite ? t('player.unlike') : t('player.like'),
        icon: song?.favorite ? 'heartFilled' : 'heart',
        ...(song?.favorite ? { iconTone: 'favorite' as const } : {}),
        disabled: !song,
        onClick: onToggleFavorite,
      },
    )
  }

  if (!song) {
    return items
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [song.id],
    t,
    defaultPlaylistName: song.title,
    includeNowPlaying: false,
    includeFavorites: !isCompact && !song.favorite,
    onAddToNowPlaying,
    onToggleFavorite,
    onCreatePlaylist,
    onAddToPlaylist,
  })

  if (addToItem) {
    items.push(addToItem)
  }

  const viewItems: MenuFlyoutItem[] = [
    { key: 'see-artist', text: t('context.seeArtist'), icon: 'users', onClick: () => onSeeArtist(song.artist) },
    { key: 'see-album', text: t('context.seeAlbum'), icon: 'albums', onClick: onSeeAlbum },
    { key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', keepOpen: true, onClick: onSeeMusicInfo },
    { key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'lyrics', keepOpen: true, onClick: onSeeLyrics },
    { key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'pictures', keepOpen: true, onClick: onSeeAlbumArt },
    { key: 'see-local-file', text: t('context.seeLocalFile'), icon: 'local', onClick: onSeeLocal },
  ]

  items.push(
    getPreferenceMenuFlyoutItem({
      type: 'song',
      itemId: String(song.id),
      name: song.title,
      preferenceItem,
      t,
      onUpdated: onPreferenceChanged,
    }),
    {
      key: 'view',
      text: t('context.view'),
      icon: 'view',
      submenu: viewItems,
    },
    {
      key: isWindowFullScreen ? 'exit-full-screen' : 'full-screen',
      text: isWindowFullScreen ? t('nowPlaying.exitFullScreenItem') : t('nowPlaying.fullScreen'),
      icon: isWindowFullScreen ? 'fullscreenExit' : 'fullscreen',
      onClick: onToggleWindowFullScreen,
    },
    {
      key: 'mini-mode',
      text: t('player.miniMode'),
      icon: 'miniMode',
      onClick: onEnterMiniMode,
    },
  )

  return items
}
