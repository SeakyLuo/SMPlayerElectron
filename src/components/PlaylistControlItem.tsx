import clsx from 'clsx'
import type { DragEventHandler, KeyboardEvent, Ref } from 'react'

import { getSongArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { useSongArtwork } from '../hooks/useSongArtwork'
import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { Icon } from './icons'

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
  showArtist?: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onToggleSelection: () => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
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
  showArtist = true,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onToggleFavorite,
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
}: PlaylistControlItemProps) {
  const artists = getSongArtists(song, t('common.artistUnknown'))
  const artistLabel = artists.join(', ')
  const { artworkUrl, refreshArtwork } = useSongArtwork(song.id, song.artworkUrl)
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

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      draggable={draggable}
      className={clsx('now-playing-queue-item', className, {
        'has-album-column': showAlbum,
        'is-current': current,
        'is-playing': current && playing,
        'is-selected': selected,
        'is-selecting': selectionMode,
        'is-drop-before': dropPosition === 'before',
        'is-drop-after': dropPosition === 'after',
      })}
      onClick={open}
      onKeyDown={handleKeyDown}
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
        {showArtist ? (
          <span className="now-playing-queue-artists" title={artistLabel}>
            {artists.map((artist, index) => (
              <span key={`${song.id}-${artist}`}>
                {index > 0 ? ', ' : null}
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
          </span>
        ) : null}
      </span>
      <span className="now-playing-queue-actions">
        {onToggleFavorite ? (
          <button
            type="button"
            className={clsx('now-playing-queue-action', 'favorite', { 'is-active': song.favorite })}
            aria-label={t('common.favorite')}
            title={t('common.favorite')}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(song.id, !song.favorite)
            }}
          >
            <Icon name={song.favorite ? 'heartFilled' : 'heart'} />
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
          title={song.album || t('common.albumUnknown')}
          onClick={(event) => {
            event.stopPropagation()
            onSeeAlbum?.(song)
          }}
        >
          {song.album || t('common.albumUnknown')}
        </button>
      ) : null}
      <time>{formatDuration(song.duration)}</time>
    </div>
  )
}
