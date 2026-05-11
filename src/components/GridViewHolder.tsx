import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import { GridArtworkCardContent } from './GridArtworkCardContent'
import { Icon } from './icons'
import { getPlaylistArtworkDisplayUrls, usePlaylistArtwork } from './playlistArtwork'
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
  onPointerDragStart?: (event: PointerEvent<HTMLDivElement>) => void
  cardRef?: (element: HTMLDivElement | null) => void
  dragOverlay?: boolean
  selectionMode?: boolean
  selectedMark?: ReactNode
  showDragHandle?: boolean
  style?: CSSProperties
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
  onPointerDragStart,
  cardRef,
  dragOverlay = false,
  selectionMode = false,
  selectedMark,
  showDragHandle = true,
  style,
  onContextMenu,
}: GridViewHolderProps) {
  const artworkUrls = usePlaylistArtwork(songs)
  const openOnKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  const startPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.grid-artwork-card-actions button')) {
      return
    }

    if (event.button !== 0) {
      return
    }

    onPointerDragStart?.(event)
  }

  return (
    <div
      role="button"
      ref={cardRef}
      tabIndex={0}
      className={`grid-view-holder${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${dragOverlay ? ' is-drag-overlay' : ''}${showDragHandle ? '' : ' is-static'}`}
      style={style}
      title={playlist.name}
      onClick={onOpen}
      onPointerDown={showDragHandle ? startPointerDrag : undefined}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu?.(event.clientX, event.clientY)
      }}
      onKeyDown={openOnKeyDown}
    >
      <GridArtworkCardContent
        actions={selectionMode ? [] : [
          {
            key: 'play',
            title: t('context.play'),
            icon: 'play',
            disabled: songs.length === 0,
            onClick: () => onPlay(),
          },
        ]}
        artworkUrls={getPlaylistArtworkDisplayUrls(artworkUrls)}
        fallbackIcon="playlists"
        selectedMark={selectedMark}
        subtitle={t('playlists.songCount', { count: playlist.songCount })}
        title={playlist.name}
      />
      {showDragHandle ? (
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
      ) : null}
    </div>
  )
}
