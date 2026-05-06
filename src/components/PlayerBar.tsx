import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import type { PlaybackMode } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { Icon } from './icons'
import { formatDuration } from '../shared/formatters'

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
  favorite?: boolean
}

interface PlayerBarProps {
  track: PlayerBarTrack
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
  onOpenNowPlaying: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
}

function getShuffleTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'shuffle' ? t('player.shuffleEnabled') : t('player.shuffleDisabled')
}

function getRepeatTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat' ? t('player.repeatEnabled') : t('player.repeatDisabled')
}

function getRepeatOneTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat-one' ? t('player.repeatOneEnabled') : t('player.repeatOneDisabled')
}

const COVER_COLOR_MIN_VALUE = 10
const COVER_COLOR_MAX_VALUE = 205
const COVER_COLOR_GRID_DIVISIONS = 16
const DEFAULT_ARTWORK_URL = '/monotone_bg_wide.png'

function getDefaultPlayerColor() {
  return '91, 135, 182'
}

function getCoverColorDistance(red: number, green: number, blue: number) {
  return (
    (red - COVER_COLOR_MIN_VALUE) ** 2 +
    (green - COVER_COLOR_MIN_VALUE) ** 2 +
    (blue - COVER_COLOR_MIN_VALUE) ** 2
  )
}

async function extractCoverColorRgb(artworkUrl: string) {
  if (!artworkUrl) {
    return getDefaultPlayerColor()
  }

  const image = new Image()
  image.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => {
      resolve()
    }
    image.onerror = () => {
      reject(new Error('Failed to load artwork.'))
    }
    image.src = artworkUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width <= 0 || canvas.height <= 0) {
    return getDefaultPlayerColor()
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let selected = [91, 135, 182]
  let selectedDistance = -1

  for (let xIndex = 1; xIndex < COVER_COLOR_GRID_DIVISIONS; xIndex += 1) {
    for (let yIndex = 1; yIndex < COVER_COLOR_GRID_DIVISIONS; yIndex += 1) {
      const x = Math.min(canvas.width - 1, Math.floor((canvas.width * xIndex) / COVER_COLOR_GRID_DIVISIONS))
      const y = Math.min(canvas.height - 1, Math.floor((canvas.height * yIndex) / COVER_COLOR_GRID_DIVISIONS))
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data

      if (
        alpha === 0 ||
        red < COVER_COLOR_MIN_VALUE ||
        red > COVER_COLOR_MAX_VALUE ||
        green < COVER_COLOR_MIN_VALUE ||
        green > COVER_COLOR_MAX_VALUE ||
        blue < COVER_COLOR_MIN_VALUE ||
        blue > COVER_COLOR_MAX_VALUE
      ) {
        continue
      }

      const distance = getCoverColorDistance(red, green, blue)
      if (distance > selectedDistance) {
        selected = [red, green, blue]
        selectedDistance = distance
      }
    }
  }

  return selected.join(', ')
}

export function PlayerBar({
  track,
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
  onOpenNowPlaying,
  onArtworkResolved,
}: PlayerBarProps) {
  const progressValue = disabled || !track.isReady ? 0 : Math.min(Math.max(track.progressSeconds, 0), track.durationSeconds)
  const progressMax = Math.max(track.durationSeconds, 0)
  const progressFill = progressMax > 0 ? (progressValue / progressMax) * 100 : 0
  const volumeValue = disabled ? 0 : Math.min(Math.max(volume, 0), 100)
  const volumeTitle = isMuted ? t('player.unmute') : t('player.mute')
  const playTitle = isPlaying ? t('player.pause') : t('player.play')
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultPlayerColor)
  const [songArtwork, setSongArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState('')
  const effectiveArtworkUrl =
    track.artworkUrl ||
    (songArtwork?.trackId === track.id ? songArtwork.artworkUrl : '')
  const usableArtworkUrl = effectiveArtworkUrl && effectiveArtworkUrl !== failedArtworkUrl
    ? effectiveArtworkUrl
    : ''
  const displayArtworkUrl = usableArtworkUrl || DEFAULT_ARTWORK_URL

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

    extractCoverColorRgb(usableArtworkUrl)
      .then((nextColor) => {
        if (!isDisposed) {
          setCoverColorRgb(nextColor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setCoverColorRgb(getDefaultPlayerColor())
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
        disabled={disabled}
        aria-label={track.title}
        title={track.id == null ? undefined : track.title}
        onClick={onOpenNowPlaying}
      >
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
        <span className="player-track-copy">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
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
            className="transport-button primary"
            type="button"
            aria-label={playTitle}
            title={playTitle}
            disabled={disabled}
            onClick={onTogglePlayPause}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} />
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
          {disabled || track.isReady ? (
            <input
              className="media-slider"
              type="range"
              min="0"
              max={progressMax}
              step="0.1"
              value={progressValue}
              style={{ '--range-progress': `${progressFill}%` } as CSSProperties}
              onChange={(event) => {
                onSeek(Number(event.currentTarget.value))
              }}
              onPointerDown={onBeginSeek}
              onPointerUp={onEndSeek}
              disabled={disabled}
              aria-label={t('player.trackProgress')}
              title={formatDuration(progressValue)}
            />
          ) : (
            <div className="media-progress-loading" aria-hidden="true" />
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
            disabled={disabled}
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
          <button type="button" disabled={disabled} aria-label={t('player.voiceAssistant')} title={t('player.voiceAssistant')}>
            <Icon name="voice" />
          </button>
          <button type="button" disabled={disabled} aria-label={t('player.more')} title={t('player.more')}>
            <Icon name="moreHorizontal" />
          </button>
        </div>
      </div>
    </footer>
  )
}
