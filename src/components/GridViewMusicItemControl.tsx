import clsx from 'clsx'
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'

import { ArtworkImage } from './ArtworkImage'
import { Icon } from './icons'
import { getDisplayArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface GridViewMusicItemControlProps {
  song: LibrarySong
  queueSongIds: number[]
  selected: boolean
  current: boolean
  playing: boolean
  multiSelect: boolean
  t: Translator
  variant?: 'recent' | 'local'
  draggable?: boolean
  detailLabel?: string
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSelection: (songId: number) => void
  onAddToPlaylistClick?: (event: MouseEvent<HTMLButtonElement>, song: LibrarySong) => void
  onContextMenu: (event: MouseEvent<HTMLElement>, song: LibrarySong) => void
  onDragStart?: (event: DragEvent<HTMLDivElement>, song: LibrarySong) => void
}

export function GridViewMusicItemControl({
  song,
  queueSongIds,
  selected,
  current,
  playing,
  multiSelect,
  t,
  variant = 'recent',
  draggable,
  detailLabel,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onAddToPlaylistClick,
  onContextMenu,
  onDragStart,
}: GridViewMusicItemControlProps) {
  const artistLabel = getDisplayArtists(song)
  const open = () => {
    if (multiSelect) {
      onToggleSelection(song.id)
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  if (variant === 'local') {
    return (
      <div
        role="button"
        tabIndex={0}
        className={clsx('local-grid-song-card', {
          'is-current': current,
          'is-playing': playing,
          'is-selected': selected,
          'is-selecting': multiSelect,
        })}
        draggable={draggable}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragStart={(event) => {
          onDragStart?.(event, song)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          onContextMenu(event, song)
        }}
      >
        <span className="local-grid-song-cover-wrap">
          <ArtworkImage
            className="local-grid-song-cover"
            src={song.artworkUrl}
            title={song.title}
            renderFallback={() => (
              <span className="local-grid-song-cover local-grid-song-cover-fallback" aria-hidden="true">
                <img className="local-grid-song-cover-fallback-image" src="/monotone_bg_wide.png" alt="" />
              </span>
            )}
          />
          {multiSelect ? (
            <span className={selected ? 'local-card-check is-selected' : 'local-card-check'} aria-hidden="true">
              {selected ? <Icon name="check" /> : null}
            </span>
          ) : null}
          {!multiSelect ? (
            <span className="local-grid-song-actions">
              <button
                type="button"
                aria-label={current && playing ? t('context.pause') : t('context.play')}
                title={current && playing ? t('context.pause') : t('context.play')}
                onClick={(event) => {
                  event.stopPropagation()
                  if (current && playing) {
                    onTogglePlayPause()
                  } else {
                    onPlayTrack(song.id, queueSongIds)
                  }
                }}
              >
                <Icon name={current && playing ? 'pause' : 'play'} />
              </button>
              {onAddToPlaylistClick ? (
                <button
                  type="button"
                  aria-label={t('context.addToPlaylist')}
                  title={t('context.addToPlaylist')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onAddToPlaylistClick(event, song)
                  }}
                >
                  <Icon name="plus" />
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="local-grid-song-title-row">
          <strong title={song.title}>{song.title}</strong>
          {current ? (
            <span className="local-grid-song-playing-icon" aria-hidden="true">
              <Icon name="play" />
            </span>
          ) : null}
        </span>
        <span className="local-grid-song-subtitle" title={artistLabel}>{artistLabel}</span>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx('recent-song-tile', {
        'has-detail': detailLabel,
        'is-current': current,
        'is-playing': playing,
        'is-selected': selected,
        'is-selecting': multiSelect,
      })}
      draggable={draggable}
      onClick={open}
      onKeyDown={onKeyDown}
      onDragStart={(event) => {
        onDragStart?.(event, song)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(event, song)
      }}
    >
      <span className="recent-song-artwork-wrap">
        <ArtworkImage
          className="recent-song-artwork"
          src={song.artworkUrl}
          title={song.title}
          renderFallback={() => (
            <span className="recent-song-artwork recent-song-artwork-fallback" aria-hidden="true">
              <img className="recent-song-artwork-fallback-image" src="/monotone_bg_wide.png" alt="" />
            </span>
          )}
        />
        {multiSelect ? (
          <span className="recent-song-select-mark" aria-hidden="true">
            {selected ? <Icon name="check" /> : null}
          </span>
        ) : null}
        {!multiSelect && onAddToPlaylistClick ? (
          <button
            type="button"
            className="recent-song-hover-add"
            aria-label={t('context.addToPlaylist')}
            title={t('context.addToPlaylist')}
            onClick={(event) => {
              event.stopPropagation()
              onAddToPlaylistClick(event, song)
            }}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
      </span>
      <span className="recent-song-copy">
        <strong title={song.title}>{song.title}</strong>
        <span title={artistLabel}>{artistLabel}</span>
        {detailLabel ? <small className="recent-song-time" title={detailLabel}>{detailLabel}</small> : null}
        {current ? (
          <span className="recent-song-playing-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </span>
    </div>
  )
}
