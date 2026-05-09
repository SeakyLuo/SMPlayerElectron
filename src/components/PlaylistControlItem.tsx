import clsx from 'clsx'
import { useRef, useState, type CSSProperties, type DragEventHandler, type PointerEvent, type Ref } from 'react'

import { getSongArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
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
  showArtwork?: boolean
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
  showArtwork = false,
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
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number; enabled: boolean } | null>(null)
  const swipeOffsetRef = useRef(0)
  const suppressClickRef = useRef(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const artists = getSongArtists(song)
  const artistLabel = artists.join(', ')
  const albumLabel = song.album || t('common.albumUnknown')
  const canSwipeFavorite = !selectionMode && Boolean(onToggleFavorite)
  const canSwipeRemove = !selectionMode && removable && Boolean(onRemoveFromListClick)
  const activate = () => {
    if (selectionMode) {
      onSelect?.(song.id)
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }
  const clampSwipeOffset = (offset: number) => {
    const maxOffset = 92
    if (offset > 0 && canSwipeFavorite) {
      return Math.min(offset, maxOffset)
    }
    if (offset < 0 && canSwipeRemove) {
      return Math.max(offset, -maxOffset)
    }
    return 0
  }

  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      enabled: canSwipeFavorite || canSwipeRemove,
    }
  }

  const moveSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const swipeStart = swipeStartRef.current
    if (!swipeStart?.enabled) {
      return
    }

    const deltaX = event.clientX - swipeStart.x
    const deltaY = event.clientY - swipeStart.y
    if (!isSwiping && Math.abs(deltaX) < 12) {
      return
    }
    if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX)) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(swipeStart.pointerId)
    swipeOffsetRef.current = clampSwipeOffset(deltaX)
    setIsSwiping(true)
    setSwipeOffset(swipeOffsetRef.current)
  }

  const finishSwipe = () => {
    const offset = swipeOffsetRef.current
    swipeStartRef.current = null
    swipeOffsetRef.current = 0
    setIsSwiping(false)
    setSwipeOffset(0)

    if (Math.abs(offset) > 0) {
      suppressClickRef.current = true
    }
    if (offset >= 64 && canSwipeFavorite) {
      onToggleFavorite?.(song.id, !song.favorite)
    }
    if (offset <= -64 && canSwipeRemove) {
      onRemoveFromListClick?.(song)
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
        'is-swiping': isSwiping,
        'has-artist': showArtist,
        'has-album': showAlbum,
        'has-artwork': showArtwork,
        'has-favorite': showFavorite,
      })}
      style={{ '--playlist-swipe-offset': `${swipeOffset}px` } as CSSProperties}
      draggable={draggable}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault()
          event.stopPropagation()
          suppressClickRef.current = false
          return
        }

        activate()
      }}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={finishSwipe}
      onDragStart={(event) => {
        if (isSwiping) {
          event.preventDefault()
          return
        }

        onDragStart?.(event)
      }}
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
      {canSwipeFavorite ? (
        <span className="playlist-control-swipe-action playlist-control-swipe-favorite" aria-hidden="true">
          <Icon name={song.favorite ? 'heartFilled' : 'heart'} />
          <span>{t('common.favorite')}</span>
        </span>
      ) : null}
      {canSwipeRemove ? (
        <span className="playlist-control-swipe-action playlist-control-swipe-remove" aria-hidden="true">
          <Icon name="close" />
          <span>{t('context.removeFromList')}</span>
        </span>
      ) : null}
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
        {showArtwork ? (
          <span className="playlist-control-item-artwork-wrap">
            <ArtworkImage
              className="playlist-control-item-artwork"
              src={song.artworkUrl}
              title={song.title}
              renderFallback={() => (
                <span className="playlist-control-item-artwork playlist-control-item-artwork-fallback" aria-hidden="true">
                  <DefaultAlbumArtwork className="playlist-control-item-artwork-fallback-image" />
                </span>
              )}
            />
            {!selectionMode ? (
              <button
                type="button"
                className="playlist-control-item-artwork-play"
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
            ) : null}
          </span>
        ) : null}
        <span className="playlist-control-item-title-text">{song.title}</span>
        <span className="playlist-control-item-hover-actions">
          {!showArtwork ? (
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
          ) : null}
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
            onArtistClick?.(artists[0]!)
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
