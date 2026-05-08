import type { DragEvent, KeyboardEvent } from 'react'

import { GridArtworkCardContent } from './GridArtworkCardContent'
import { Icon } from './icons'
import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface GridViewHolderProps {
  playlist: LibraryPlaylist
  songs: LibrarySong[]
  selected: boolean
  dragging: boolean
  t: Translator
  onOpen: () => void
  onPlay: () => void
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onContextMenu?: (x: number, y: number) => void
}

export function GridViewHolder({
  playlist,
  songs,
  selected,
  dragging,
  t,
  onOpen,
  onPlay,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContextMenu,
}: GridViewHolderProps) {
  const artworks = getDisplayArtworks(songs)
  const openOnKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  const startDragging = (event: DragEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest('.grid-view-holder-drag-handle')) {
      event.preventDefault()
      return
    }

    onDragStart(event)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className={`grid-view-holder${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      title={playlist.name}
      onClick={onOpen}
      onDragStart={startDragging}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu?.(event.clientX, event.clientY)
      }}
      onKeyDown={openOnKeyDown}
    >
      <GridArtworkCardContent
        actions={[
          {
            key: 'play',
            title: t('context.play'),
            icon: 'play',
            disabled: songs.length === 0,
            onClick: () => onPlay(),
          },
        ]}
        artworkUrls={artworks}
        fallbackIcon="playlists"
        subtitle={t('playlists.songCount', { count: playlist.songCount })}
        title={playlist.name}
      />
      <button
        aria-label={t('playlists.dragToSort')}
        className="grid-view-holder-drag-handle"
        title={t('playlists.dragToSort')}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <Icon name="grip" />
      </button>
    </div>
  )
}

function getDisplayArtworks(songs: LibrarySong[]) {
  const songWithArtwork = songs.find((song) => song.artworkUrl)
  return songWithArtwork ? [songWithArtwork.artworkUrl] : []
}
