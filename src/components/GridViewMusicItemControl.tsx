import clsx from 'clsx'
import type { KeyboardEvent, MouseEvent } from 'react'

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
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSelection: (songId: number) => void
  onAddToPlaylistClick?: (event: MouseEvent<HTMLButtonElement>, song: LibrarySong) => void
  onContextMenu: (event: MouseEvent<HTMLElement>, song: LibrarySong) => void
}

export function GridViewMusicItemControl({
  song,
  queueSongIds,
  selected,
  current,
  playing,
  multiSelect,
  t,
  onPlayTrack,
  onToggleSelection,
  onAddToPlaylistClick,
  onContextMenu,
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

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx('recent-song-tile', {
        'is-current': current,
        'is-playing': playing,
        'is-selected': selected,
        'is-selecting': multiSelect,
      })}
      onClick={open}
      onKeyDown={onKeyDown}
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
              <Icon name="songs" />
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
