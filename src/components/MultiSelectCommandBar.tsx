import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { Icon, type IconName } from './icons'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'

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
  extraActions?: Array<{
    key: string
    text: string
    icon: IconName
    disabled?: boolean
    hideAfterClick?: boolean
    onClick: (event: MouseEvent<HTMLButtonElement>) => void
  }>
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
  extraActions = [],
  onSelectAll,
  onReverseSelection,
  onClearSelection,
  onCancel,
}: MultiSelectCommandBarProps) {
  const hasSelection = selectedCount > 0
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const hideAfterOperation = useLibraryStore((state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation)
  const [layout, setLayout] = useState({
    left: 0,
    width: window.innerWidth,
    bottom: 0,
  })

  useLayoutEffect(() => {
    const anchor = anchorRef.current as HTMLSpanElement
    const layoutHost = anchor.closest('.workspace-content, .now-playing-full-page') as HTMLElement
    const playerBar = document.querySelector('.player-bar') as HTMLElement

    const updateLayout = () => {
      const contentRect = layoutHost.getBoundingClientRect()
      const playerRect = playerBar?.getBoundingClientRect()
      setLayout({
        left: contentRect.left,
        width: contentRect.width,
        bottom: playerRect ? window.innerHeight - playerRect.top : 12,
      })
    }

    updateLayout()
    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(layoutHost)
    window.addEventListener('resize', updateLayout)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [])

  const hideIfNeeded = () => {
    if (hideAfterOperation) {
      cancel()
    }
  }

  const cancel = () => {
    onClearSelection()
    onCancel()
  }

  const commandBar = (
    <div
      className={visible ? 'multi-select-command-bar is-visible' : 'multi-select-command-bar'}
      style={{
        '--multi-select-left': `${layout.left}px`,
        '--multi-select-width': `${layout.width}px`,
        '--multi-select-bottom': `${layout.bottom}px`,
      } as CSSProperties}
      aria-hidden={!visible}
    >
      <div className="multi-select-command-count">
        {hasSelection ? (
          <>
            <Icon name="check" />
            <strong>{t('albums.selectedCount', { count: selectedCount })}</strong>
          </>
        ) : null}
      </div>
      <div className="multi-select-command-actions">
        {showPlay && onPlay ? (
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => {
              onPlay()
              hideIfNeeded()
            }}
          >
            <Icon name="play" />
            <span>{t('albums.playSelected')}</span>
          </button>
        ) : null}
        {showAddTo && onAddToPlaylistMenuClick ? (
          <button type="button" disabled={!hasSelection} onClick={onAddToPlaylistMenuClick}>
            <Icon name="plus" />
            <span>{t('albums.addSelectedTo')}</span>
            <Icon name="chevronDown" />
          </button>
        ) : null}
        {showAddTo && playlists.length > 0 && onAddToPlaylist && !onAddToPlaylistMenuClick ? (
          <label className={hasSelection ? 'multi-select-command-select' : 'multi-select-command-select is-disabled'}>
            <Icon name="plus" />
            <span>{t('albums.addSelectedTo')}</span>
            <select
              defaultValue=""
              disabled={!hasSelection}
              onChange={(event) => {
                onAddToPlaylist(Number(event.currentTarget.value))
                event.currentTarget.value = ''
                hideIfNeeded()
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
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => {
              onRemove()
              hideIfNeeded()
            }}
          >
            <Icon name="trash" />
            <span>{removeLabel}</span>
          </button>
        ) : null}
        {extraActions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={(event) => {
              action.onClick(event)
              if (action.hideAfterClick) {
                hideIfNeeded()
              }
            }}
          >
            <Icon name={action.icon} />
            <span>{action.text}</span>
          </button>
        ))}
        <button type="button" onClick={onSelectAll}>
          <Icon name="selectAll" />
          <span>{t('albums.selectAll')}</span>
        </button>
        <button type="button" onClick={onReverseSelection}>
          <Icon name="sort" />
          <span>{t('albums.reverseSelection')}</span>
        </button>
        <button type="button" onClick={onClearSelection}>
          <Icon name="clearSelection" />
          <span>{t('albums.clearSelection')}</span>
        </button>
        <button type="button" onClick={cancel}>
          <Icon name="close" />
          <span>{t('common.cancel')}</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <span ref={anchorRef} className="multi-select-command-anchor" aria-hidden="true" />
      {createPortal(commandBar, document.body)}
    </>
  )
}
