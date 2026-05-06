import clsx from 'clsx'
import type { DragEventHandler, Ref } from 'react'

import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { Icon } from './icons'

interface PlaylistControlItemProps {
  song: LibrarySong
  t: Translator
  current?: boolean
  isPlaying?: boolean
  containerRef?: Ref<HTMLDivElement>
  rowNumber?: number
  selected?: boolean
  selectionMode?: boolean
  queueSongIds: number[]
  draggable?: boolean
  showAlbum?: boolean
  showArtist?: boolean
  showFavorite?: boolean
  showDuration?: boolean
  removable?: boolean
  onAddToPlaylistClick?: (song: LibrarySong, x: number, y: number) => void
  onRemoveFromListClick?: (song: LibrarySong) => void
  onContextMenu?: (song: LibrarySong, x: number, y: number) => void
  onDragStart?: DragEventHandler<HTMLDivElement>
  onDragOver?: DragEventHandler<HTMLDivElement>
  onDrop?: DragEventHandler<HTMLDivElement>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onSelect?: (songId: number) => void
  onArtistClick?: (artist: string) => void
  onAlbumClick?: (album: string) => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
}

export function PlaylistControlItem({
  song,
  t,
  current,
  isPlaying = false,
  containerRef,
  rowNumber,
  selected = false,
  selectionMode = false,
  queueSongIds,
  draggable = false,
  showAlbum = false,
  showArtist = false,
  showFavorite = false,
  showDuration = true,
  removable = false,
  onAddToPlaylistClick,
  onRemoveFromListClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onPlayTrack,
  onTogglePlayPause,
  onSelect,
  onArtistClick,
  onAlbumClick,
  onToggleFavorite,
}: PlaylistControlItemProps) {
  const artistLabel = song.artists.join(', ') || song.artist
  const albumLabel = song.album || t('common.albumUnknown')
  const activate = () => {
    if (selectionMode) {
      onSelect?.(song.id)
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }

  const toggleHoverPlay = () => {
    if (current && isPlaying && onTogglePlayPause) {
      onTogglePlayPause()
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }

  return (
    <div
      ref={containerRef}
      className={clsx('playlist-control-item', {
        'is-current': current,
        'is-playing': current && isPlaying,
        'is-selected': selected,
        'is-selecting': selectionMode,
        'has-artist': showArtist,
        'has-album': showAlbum,
        'has-favorite': showFavorite,
      })}
      draggable={draggable}
      role="button"
      tabIndex={0}
      onClick={activate}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onContextMenu?.(song, event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          activate()
        }
      }}
    >
      <span className="playlist-control-item-title">
        <span className="playlist-control-item-current-slot">
          {selectionMode ? (
            <span className="playlist-control-item-selection-mark">{selected ? <Icon name="check" /> : null}</span>
          ) : current ? (
            <span className="playlist-control-item-playing-wave" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
          ) : (
            <span className="playlist-control-item-index">{rowNumber}</span>
          )}
        </span>
        <span className="playlist-control-item-title-text">{song.title}</span>
        <span className="playlist-control-item-hover-actions">
          <button
            type="button"
            aria-label={current && isPlaying ? t('context.pause') : t('context.play')}
            title={current && isPlaying ? t('context.pause') : t('context.play')}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              toggleHoverPlay()
            }}
          >
            <Icon name={current && isPlaying ? 'pause' : 'play'} />
          </button>
          {onAddToPlaylistClick ? (
            <button
              type="button"
              aria-label={t('context.addToPlaylist')}
              title={t('context.addToPlaylist')}
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onAddToPlaylistClick(song, event.clientX, event.clientY)
              }}
            >
              <Icon name="plus" />
            </button>
          ) : null}
          {removable ? (
            <button
              type="button"
              aria-label={t('context.removeFromList')}
              title={t('context.removeFromList')}
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onRemoveFromListClick?.(song)
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </span>
      </span>
      {showArtist ? (
        <button
          type="button"
          className="playlist-control-item-meta"
          onClick={(event) => {
            event.stopPropagation()
            onArtistClick?.(artistLabel)
          }}
        >
          {artistLabel}
        </button>
      ) : null}
      {showAlbum ? (
        <button
          type="button"
          className="playlist-control-item-meta"
          onClick={(event) => {
            event.stopPropagation()
            onAlbumClick?.(albumLabel)
          }}
        >
          {albumLabel}
        </button>
      ) : null}
      {showFavorite ? (
        <button
          type="button"
          className={clsx('playlist-control-item-favorite', { 'is-active': song.favorite })}
          aria-label={t('common.favorite')}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite?.(song.id, !song.favorite)
          }}
        >
          <Icon name={song.favorite ? 'heartFilled' : 'heart'} />
        </button>
      ) : null}
      {showDuration ? <time>{formatDuration(song.duration)}</time> : null}
    </div>
  )
}
