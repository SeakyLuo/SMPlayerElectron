import type { PlaybackMode } from '../shared/contracts'

interface PlayerBarTrack {
  title: string
  artist: string
  artworkUrl: string
  elapsedLabel: string
  durationLabel: string
  progressRatio: number
}

interface PlayerBarProps {
  track: PlayerBarTrack
  disabled?: boolean
  isPlaying: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  onTogglePlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (ratio: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onCycleRepeatMode: () => void
}

function getRepeatLabel(mode: PlaybackMode) {
  switch (mode) {
    case 'repeat':
      return 'REPEAT'
    case 'repeat-one':
      return 'REPEAT 1'
    default:
      return 'ONCE'
  }
}

export function PlayerBar({
  track,
  disabled = false,
  isPlaying,
  volume,
  isMuted,
  mode,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeatMode,
}: PlayerBarProps) {
  return (
    <footer className={`player-bar${disabled ? ' disabled' : ''}`}>
      <div className="player-track">
        {track.artworkUrl ? (
          <img className="album-swatch artwork-image" src={track.artworkUrl} alt={`${track.title} artwork`} />
        ) : (
          <div className="album-swatch" aria-hidden="true" />
        )}
        <div>
          <h3>{track.title}</h3>
          <p>{track.artist}</p>
        </div>
      </div>

      <div className="player-center">
        <div className="transport-row">
          <button
            className="transport-button"
            type="button"
            aria-label="Previous track"
            disabled={disabled}
            onClick={onPrevious}
          >
            PREV
          </button>
          <button
            className="transport-button primary"
            type="button"
            aria-label="Play or pause"
            disabled={disabled}
            onClick={onTogglePlayPause}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <button
            className="transport-button"
            type="button"
            aria-label="Next track"
            disabled={disabled}
            onClick={onNext}
          >
            NEXT
          </button>
        </div>
        <div className="progress-row">
          <span>{track.elapsedLabel}</span>
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(track.progressRatio * 1000)}
            onChange={(event) => {
              onSeek(Number(event.currentTarget.value) / 1000)
            }}
            disabled={disabled}
            aria-label="Track progress"
          />
          <span>{track.durationLabel}</span>
        </div>
      </div>

      <div className="player-utility">
        <button
          type="button"
          disabled={disabled}
          className={mode === 'shuffle' ? 'is-active' : ''}
          onClick={onToggleShuffle}
        >
          SHUFFLE
        </button>
        <button
          type="button"
          disabled={disabled}
          className={mode !== 'shuffle' && mode !== 'once' ? 'is-active' : ''}
          onClick={onCycleRepeatMode}
        >
          {getRepeatLabel(mode)}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={isMuted ? 'is-active' : ''}
          onClick={onToggleMute}
        >
          {isMuted ? 'UNMUTE' : 'MUTE'}
        </button>
        <div className="volume-shell">
          <span>VOL</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            disabled={disabled}
            onChange={(event) => {
              onVolumeChange(Number(event.currentTarget.value))
            }}
            aria-label="Volume"
          />
          <span>{volume}</span>
        </div>
      </div>
    </footer>
  )
}
