import clsx from 'clsx'
import { useRef, useState, type CSSProperties, type DragEventHandler, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from 'react'

import { getSongArtists, joinArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { useSongArtwork } from '../hooks/useSongArtwork'
import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { Icon } from './icons'

const QUEUE_ITEM_SWIPE_LIMIT = 108
const QUEUE_ITEM_SWIPE_OPEN_TRIGGER = 58
const QUEUE_ITEM_SWIPE_MOVE_THRESHOLD = 12
const QUEUE_ITEM_SWIPE_AXIS_RATIO = 1.45

interface PlaylistControlItemProps {
  className?: string
  song: LibrarySong
  t: Translator
  current: boolean
  playing: boolean
  selected: boolean
  selectionMode: boolean
  dropPosition: 'before' | 'after' | null
  queueSongIds: number[]
  containerRef?: Ref<HTMLDivElement>
  draggable?: boolean
  showAlbum?: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onToggleSelection: () => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
  favoriteLoading?: boolean
  onRemoveFromListClick?: (song: LibrarySong) => void
  onPlayNextClick?: (song: LibrarySong) => void
  onAddToPlaylistClick?: (song: LibrarySong, x: number, y: number) => void
  onContextMenu: (song: LibrarySong, x: number, y: number) => void
  onSeeAlbum?: (song: LibrarySong) => void
  onSeeArtist?: (artist: string) => void
  onDragStart?: DragEventHandler<HTMLDivElement>
  onDragOver?: DragEventHandler<HTMLDivElement>
  onDragLeave?: DragEventHandler<HTMLDivElement>
  onDrop?: DragEventHandler<HTMLDivElement>
  onDragEnd?: DragEventHandler<HTMLDivElement>
  touchReorderIndex?: number
  onTouchReorderStart?: (clientX: number, clientY: number) => void
  onTouchReorderMove?: (clientX: number, clientY: number) => void
  onTouchReorderEnd?: (clientX: number, clientY: number) => void
  onTouchReorderCancel?: () => void
}

export function PlaylistControlItem({
  className,
  song,
  t,
  current,
  playing,
  selected,
  selectionMode,
  dropPosition,
  queueSongIds,
  containerRef,
  draggable = true,
  showAlbum = true,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onToggleFavorite,
  favoriteLoading = false,
  onRemoveFromListClick,
  onPlayNextClick,
  onAddToPlaylistClick,
  onContextMenu,
  onSeeAlbum,
  onSeeArtist,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  touchReorderIndex,
  onTouchReorderStart,
  onTouchReorderMove,
  onTouchReorderEnd,
  onTouchReorderCancel,
}: PlaylistControlItemProps) {
  const artists = getSongArtists(song, t('common.artistUnknown'))
  const artistSeparator = t('common.artistSeparator')
  const artistLabel = joinArtists(artists, artistSeparator)
  const albumLabel = song.album || t('common.albumUnknown')
  const artistAlbumLabel = showAlbum ? `${artistLabel} • ${albumLabel}` : artistLabel
  const { artworkUrl, refreshArtwork } = useSongArtwork(song.id, song.artworkUrl)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeOffsetRef = useRef(0)
  const touchGestureRef = useRef<{ pointerId: number; startX: number; startY: number; mode: 'pending' | 'swipe' | 'reorder' } | null>(null)
  const suppressNextClickRef = useRef(false)
  const open = () => {
    if (selectionMode) {
      onToggleSelection()
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }
  const suppressNextClick = () => {
    suppressNextClickRef.current = true
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, 0)
  }
  const resetSwipe = () => {
    touchGestureRef.current = null
    swipeOffsetRef.current = 0
    setSwipeOffset(0)
  }
  const startTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || event.button !== 0 || selectionMode) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button,input,textarea,select,a')) {
      return
    }

    if (!onRemoveFromListClick && !onTouchReorderStart) {
      return
    }

    touchGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: 'pending',
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = touchGestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return
    }

    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (gesture.mode === 'pending' && Math.max(absX, absY) < QUEUE_ITEM_SWIPE_MOVE_THRESHOLD) {
      return
    }

    if (gesture.mode === 'pending') {
      if (onTouchReorderStart && absY >= QUEUE_ITEM_SWIPE_MOVE_THRESHOLD && absY >= absX / QUEUE_ITEM_SWIPE_AXIS_RATIO) {
        gesture.mode = 'reorder'
        onTouchReorderStart(gesture.startX, gesture.startY)
      } else if (onRemoveFromListClick && deltaX < 0 && absX >= absY * QUEUE_ITEM_SWIPE_AXIS_RATIO) {
        gesture.mode = 'swipe'
      } else {
        resetSwipe()
        return
      }
    }

    event.preventDefault()
    if (gesture.mode === 'reorder') {
      onTouchReorderMove?.(event.clientX, event.clientY)
      return
    }

    const nextOffset = Math.max(
      -QUEUE_ITEM_SWIPE_LIMIT,
      Math.min(0, deltaX),
    )
    swipeOffsetRef.current = nextOffset
    setSwipeOffset(nextOffset)
  }
  const finishTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = touchGestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const mode = gesture.mode
    const nextOffset = swipeOffsetRef.current <= -QUEUE_ITEM_SWIPE_OPEN_TRIGGER ? -QUEUE_ITEM_SWIPE_LIMIT : 0
    touchGestureRef.current = null
    swipeOffsetRef.current = nextOffset
    setSwipeOffset(nextOffset)
    if (mode === 'pending') {
      return
    }

    event.preventDefault()
    suppressNextClick()
    if (mode === 'reorder') {
      onTouchReorderEnd?.(event.clientX, event.clientY)
    }
  }
  const cancelTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = touchGestureRef.current
    if (gesture?.pointerId === event.pointerId) {
      if (gesture.mode === 'reorder') {
        onTouchReorderCancel?.()
      }
      resetSwipe()
    }
  }

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      draggable={draggable}
      data-queue-index={touchReorderIndex}
      style={{ '--queue-swipe-offset': `${swipeOffset}px` } as CSSProperties}
      className={clsx('now-playing-queue-item', className, {
        'has-album-column': showAlbum,
        'is-current': current,
        'is-playing': current && playing,
        'is-selected': selected,
        'is-selecting': selectionMode,
        'is-swiping': swipeOffset !== 0,
        'is-touch-reorderable': Boolean(onTouchReorderStart),
        'is-drop-before': dropPosition === 'before',
        'is-drop-after': dropPosition === 'after',
      })}
      onClick={(event) => {
        if (suppressNextClickRef.current) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (swipeOffsetRef.current !== 0) {
          event.preventDefault()
          event.stopPropagation()
          resetSwipe()
          return
        }

        open()
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={startTouchGesture}
      onPointerMove={moveTouchGesture}
      onPointerUp={finishTouchGesture}
      onPointerCancel={cancelTouchGesture}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(song, event.clientX, event.clientY)
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {onRemoveFromListClick ? (
        <button
          type="button"
          className="now-playing-queue-swipe-action now-playing-queue-swipe-remove"
          aria-label={t('nowPlaying.remove')}
          onClick={(event) => {
            event.stopPropagation()
            resetSwipe()
            onRemoveFromListClick(song)
          }}
        >
          <span>{t('nowPlaying.remove')}</span>
          <Icon name="close" />
        </button>
      ) : null}
      <span className="now-playing-queue-surface" aria-hidden="true" />
      <span className="now-playing-queue-artwork-wrap">
        <ArtworkImage
          className="now-playing-queue-artwork"
          src={artworkUrl}
          title={song.title}
          onError={refreshArtwork}
          renderFallback={() => (
            <span className="now-playing-queue-artwork now-playing-queue-artwork-fallback" aria-hidden="true">
              <DefaultAlbumArtwork className="now-playing-queue-artwork-fallback-image" />
            </span>
          )}
        />
        {current && !selectionMode ? (
          <span className="now-playing-queue-playing-overlay" aria-hidden="true">
            <span className="playlist-control-item-playing-wave">
              <span />
              <span />
              <span />
              <span />
            </span>
          </span>
        ) : null}
        {selectionMode ? (
          <span className="now-playing-queue-select-mark" aria-hidden="true">
            {selected ? <Icon name="check" /> : null}
          </span>
        ) : null}
        {!selectionMode ? (
          <button
            type="button"
            className="now-playing-queue-play"
            aria-label={current && playing ? t('context.pause') : t('context.play')}
            title={current && playing ? t('context.pause') : t('context.play')}
            onClick={(event) => {
              event.stopPropagation()
              if (current && playing && onTogglePlayPause) {
                onTogglePlayPause()
              } else {
                onPlayTrack(song.id, queueSongIds)
              }
            }}
          >
            <Icon name={current && playing ? 'pause' : 'play'} />
          </button>
        ) : null}
      </span>
      <span className="now-playing-queue-copy">
        <strong title={song.title}>{song.title}</strong>
        <span className="now-playing-queue-artists" title={artistAlbumLabel}>
          {artists.map((artist, index) => (
            <span key={`${song.id}-${artist}`}>
              {index > 0 ? artistSeparator : null}
              <button
                type="button"
                className="now-playing-queue-artist"
                onClick={(event) => {
                  event.stopPropagation()
                  onSeeArtist?.(artist)
                }}
              >
                {artist}
              </button>
            </span>
          ))}
          {showAlbum ? (
            <span className="now-playing-queue-inline-album">
              <span className="now-playing-queue-meta-separator">•</span>
              <button
                type="button"
                className="now-playing-queue-inline-album-button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSeeAlbum?.(song)
                }}
              >
                {albumLabel}
              </button>
            </span>
          ) : null}
        </span>
      </span>
      <span className="now-playing-queue-actions">
        {onToggleFavorite ? (
          <button
            type="button"
            className={clsx('now-playing-queue-action', 'favorite', { 'is-active': song.favorite, 'is-loading': favoriteLoading })}
            aria-label={t('common.favorite')}
            aria-busy={favoriteLoading}
            title={t('common.favorite')}
            disabled={favoriteLoading}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(song.id, !song.favorite)
            }}
          >
            {favoriteLoading ? <span className="queue-action-spinner" aria-hidden="true" /> : <Icon name={song.favorite ? 'heartFilled' : 'heart'} />}
          </button>
        ) : null}
        {onAddToPlaylistClick ? (
          <button
            type="button"
            className="now-playing-queue-action is-hover-action"
            aria-label={t('context.addToPlaylist')}
            title={t('context.addToPlaylist')}
            onClick={(event) => {
              event.stopPropagation()
              const rect = event.currentTarget.getBoundingClientRect()
              onAddToPlaylistClick(song, rect.left, rect.bottom + 8)
            }}
          >
            <Icon name="plus" />
          </button>
        ) : null}
        {onPlayNextClick ? (
          <button
            type="button"
            className="now-playing-queue-action is-hover-action is-play-next-action"
            aria-label={t('context.playNext')}
            title={t('context.playNext')}
            onClick={(event) => {
              event.stopPropagation()
              onPlayNextClick(song)
            }}
          >
            <Icon name="playNext" />
          </button>
        ) : null}
        {onRemoveFromListClick ? (
          <button
            type="button"
            className="now-playing-queue-action is-hover-action"
            aria-label={t('nowPlaying.remove')}
            title={t('nowPlaying.remove')}
            onClick={(event) => {
              event.stopPropagation()
              onRemoveFromListClick(song)
            }}
          >
            <Icon name="close" />
          </button>
        ) : null}
        <button
          type="button"
          className="now-playing-queue-action is-hover-action"
          aria-label={t('player.more')}
          title={t('player.more')}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            onContextMenu(song, rect.left, rect.bottom + 8)
          }}
        >
          <Icon name="moreHorizontal" />
        </button>
      </span>
      {showAlbum ? (
        <button
          type="button"
          className="now-playing-queue-album"
          title={albumLabel}
          onClick={(event) => {
            event.stopPropagation()
            onSeeAlbum?.(song)
          }}
        >
          {albumLabel}
        </button>
      ) : null}
      <time>{formatDuration(song.duration)}</time>
    </div>
  )
}
