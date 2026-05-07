import type { KeyboardEvent } from 'react'

import { Icon } from './icons'
import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface GridViewHolderProps {
  playlist: LibraryPlaylist
  songs: LibrarySong[]
  selected: boolean
  t: Translator
  canMoveUp: boolean
  canMoveDown: boolean
  onOpen: () => void
  onPlay: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onContextMenu?: (x: number, y: number) => void
}

export function GridViewHolder({
  playlist,
  songs,
  selected,
  t,
  canMoveUp,
  canMoveDown,
  onOpen,
  onPlay,
  onMoveUp,
  onMoveDown,
  onContextMenu,
}: GridViewHolderProps) {
  const artworks = songs.map((song) => song.artworkUrl).filter(Boolean).slice(0, 4)
  const openOnKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`grid-view-holder${selected ? ' is-selected' : ''}`}
      title={playlist.name}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu?.(event.clientX, event.clientY)
      }}
      onKeyDown={openOnKeyDown}
    >
      <span className={`grid-view-holder-cover artwork-count-${artworks.length}`} aria-hidden="true">
        {artworks.length > 0 ? (
          artworks.map((artworkUrl) => <img key={artworkUrl} src={artworkUrl} alt="" />)
        ) : (
          <span className="grid-view-holder-cover-fallback">
            <Icon name="playlists" />
          </span>
        )}
      </span>
      <span className="grid-view-holder-copy">
        <strong>{playlist.name}</strong>
        <small>
          {t('playlists.songCount', { count: playlist.songCount })}
          {playlist.isBuiltIn ? ` · ${t('playlists.builtIn')}` : ''}
        </small>
      </span>
      <span className="grid-view-holder-actions">
        <span
          role="button"
          tabIndex={0}
          className="grid-view-holder-action"
          title={t('context.play')}
          onClick={(event) => {
            event.stopPropagation()
            onPlay()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              onPlay()
            }
          }}
        >
          <Icon name="play" />
        </span>
        {!playlist.isBuiltIn ? (
          <>
            <span
              role="button"
              tabIndex={0}
              className="grid-view-holder-action"
              aria-disabled={!canMoveUp}
              title={t('playlists.up')}
              onClick={(event) => {
                event.stopPropagation()
                if (canMoveUp) {
                  onMoveUp()
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && canMoveUp) {
                  event.preventDefault()
                  event.stopPropagation()
                  onMoveUp()
                }
              }}
            >
              <Icon name="chevronUp" />
            </span>
            <span
              role="button"
              tabIndex={0}
              className="grid-view-holder-action"
              aria-disabled={!canMoveDown}
              title={t('playlists.down')}
              onClick={(event) => {
                event.stopPropagation()
                if (canMoveDown) {
                  onMoveDown()
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && canMoveDown) {
                  event.preventDefault()
                  event.stopPropagation()
                  onMoveDown()
                }
              }}
            >
              <Icon name="chevronDown" />
            </span>
          </>
        ) : null}
      </span>
    </div>
  )
}
