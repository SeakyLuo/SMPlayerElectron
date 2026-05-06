import type { MouseEvent } from 'react'

import { Icon } from './icons'
import type { Translator } from '../shared/i18n'

interface MultiSelectCommandBarPlaylist {
  id: number
  name: string
}

interface MultiSelectCommandBarProps {
  visible: boolean
  selectedCount: number
  t: Translator
  playlists: MultiSelectCommandBarPlaylist[]
  showPlay?: boolean
  showAddTo?: boolean
  removeLabel?: string
  onPlay?: () => void
  onAddToPlaylist?: (playlistId: number) => void
  onAddToPlaylistMenuClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onRemove?: () => void
  onSelectAll: () => void
  onReverseSelection: () => void
  onClearSelection: () => void
  onCancel: () => void
}

export function MultiSelectCommandBar({
  visible,
  selectedCount,
  t,
  playlists,
  showPlay = true,
  showAddTo = true,
  removeLabel,
  onPlay,
  onAddToPlaylist,
  onAddToPlaylistMenuClick,
  onRemove,
  onSelectAll,
  onReverseSelection,
  onClearSelection,
  onCancel,
}: MultiSelectCommandBarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div
      className={visible ? 'multi-select-command-bar is-visible' : 'multi-select-command-bar'}
      aria-hidden={!visible}
    >
      <strong className="multi-select-command-count">
        <Icon name="check" />
        {t('albums.selectedCount', { count: selectedCount })}
      </strong>
      {showPlay && onPlay ? (
        <button type="button" disabled={!hasSelection} onClick={onPlay}>
          <Icon name="play" />
          {t('albums.playSelected')}
        </button>
      ) : null}
      {showAddTo && playlists.length > 0 && onAddToPlaylistMenuClick ? (
        <button type="button" disabled={!hasSelection} onClick={onAddToPlaylistMenuClick}>
          <Icon name="plus" />
          {t('albums.addSelectedTo')}
        </button>
      ) : null}
      {showAddTo && playlists.length > 0 && onAddToPlaylist && !onAddToPlaylistMenuClick ? (
        <label className={hasSelection ? 'multi-select-command-select' : 'multi-select-command-select is-disabled'}>
          <Icon name="plus" />
          <select
            defaultValue=""
            disabled={!hasSelection}
            onChange={(event) => {
              onAddToPlaylist(Number(event.currentTarget.value))
              event.currentTarget.value = ''
            }}
          >
            <option value="" disabled>
              {t('albums.addSelectedTo')}
            </option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {onRemove ? (
        <button type="button" disabled={!hasSelection} onClick={onRemove}>
          <Icon name="trash" />
          {removeLabel}
        </button>
      ) : null}
      <button type="button" onClick={onSelectAll}>
        <Icon name="selectAll" />
        {t('albums.selectAll')}
      </button>
      <button type="button" onClick={onReverseSelection}>
        <Icon name="sort" />
        {t('albums.reverseSelection')}
      </button>
      <button type="button" onClick={onClearSelection}>
        <Icon name="clearSelection" />
        {t('albums.clearSelection')}
      </button>
      <button type="button" onClick={onCancel}>
        <Icon name="close" />
        {t('common.cancel')}
      </button>
    </div>
  )
}
