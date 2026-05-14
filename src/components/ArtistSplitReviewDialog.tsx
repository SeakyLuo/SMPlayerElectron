import { useMemo, useRef, useState } from 'react'

import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import type { ArtistSplitResultItem } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { AlbumArtControl } from './AlbumArtControl'
import { CustomScrollbar } from './CustomScrollbar'
import { Icon } from './icons'
import { PopupDialog } from './PopupDialog'

const MAX_ARTIST_CELLS = 6

export function ArtistSplitReviewDialog({
  t,
  title,
  directSplits,
  possibleSplits,
  mergeSuggestions,
  onApply,
  onClose,
}: {
  t: Translator
  title: string
  directSplits: ArtistSplitResultItem[]
  possibleSplits: ArtistSplitResultItem[]
  mergeSuggestions: ArtistSplitResultItem[]
  onApply: (splits: ArtistSplitResultItem[]) => void | Promise<void>
  onClose: () => void
}) {
  return (
    <PopupDialog
      t={t}
      overlayClassName="artist-split-review-overlay"
      className="artist-split-review-dialog ContentDialog"
      navClassName="artist-split-review-nav"
      navLabel={title}
      ariaLabel={title}
      onClose={onClose}
      navChildren={(
        <div className="popup-dialog-title-block">
          <h2>{title}</h2>
        </div>
      )}
    >
      <ArtistSplitReviewPanel
        t={t}
        directSplits={directSplits}
        possibleSplits={possibleSplits}
        mergeSuggestions={mergeSuggestions}
        onApply={onApply}
        onClose={onClose}
      />
    </PopupDialog>
  )
}

export function ArtistSplitReviewPanel({
  t,
  directSplits,
  possibleSplits,
  mergeSuggestions,
  appliedDirectSplits = false,
  onApply,
  onClose,
}: {
  t: Translator
  directSplits: ArtistSplitResultItem[]
  possibleSplits: ArtistSplitResultItem[]
  mergeSuggestions: ArtistSplitResultItem[]
  appliedDirectSplits?: boolean
  onApply: (splits: ArtistSplitResultItem[]) => void | Promise<void>
  onClose: () => void
}) {
  const selectableSplits = useMemo(
    () => [...(appliedDirectSplits ? [] : directSplits), ...possibleSplits, ...mergeSuggestions],
    [appliedDirectSplits, directSplits, mergeSuggestions, possibleSplits],
  )
  const [artistEdits, setArtistEdits] = useState(() =>
    new Map([...mergeSuggestions, ...directSplits, ...possibleSplits].map((item) => [item.songId, item.artists])),
  )
  const [selectedSongIds, setSelectedSongIds] = useState(() =>
    new Set((appliedDirectSplits ? [] : directSplits).map((item) => item.songId)),
  )
  const [mergeExpanded, setMergeExpanded] = useState(true)
  const [directExpanded, setDirectExpanded] = useState(true)
  const [possibleExpanded, setPossibleExpanded] = useState(true)
  const contentFrameRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const selectedSplits = selectableSplits
    .filter((item) => selectedSongIds.has(item.songId))
    .map((item) => ({
      ...item,
      artists: getEditedArtists(artistEdits.get(item.songId) ?? item.artists),
    }))
  const onScrollbarPointerDown = useCustomScrollbar({
    frameRef: contentFrameRef,
    scrollContainerRef: contentRef,
    scrollbarTrackRef,
    refreshDependencies: [
      directExpanded,
      mergeExpanded,
      possibleExpanded,
      directSplits.length,
      mergeSuggestions.length,
      possibleSplits.length,
      artistEdits,
    ],
  })

  const toggleSplit = (songId: number) => {
    setSelectedSongIds((current) => {
      const next = new Set(current)
      if (next.has(songId)) {
        next.delete(songId)
      } else {
        next.add(songId)
      }
      return next
    })
  }

  const updateArtists = (songId: number, artists: string[]) => {
    setArtistEdits((current) => new Map(current).set(songId, artists))
  }
  const setGroupSelection = (items: ArtistSplitResultItem[], selected: boolean) => {
    setSelectedSongIds((current) => {
      const next = new Set(current)
      for (const item of items) {
        if (selected) {
          next.add(item.songId)
        } else {
          next.delete(item.songId)
        }
      }
      return next
    })
  }

  return (
    <>
      <div className="artist-split-review">
        <div className="artist-split-review-content-frame custom-scrollbar-frame" ref={contentFrameRef}>
        <div className="artist-split-review-content custom-scrollbar-container" ref={contentRef}>
          {directSplits.length > 0 ? (
            <ArtistSplitReviewGroup
              t={t}
              title={appliedDirectSplits ? t('local.refreshArtistSplitsAppliedTitle') : t('local.directArtistSplitsTitle')}
              count={directSplits.length}
              items={directSplits}
              selectedSongIds={selectedSongIds}
              disabled={appliedDirectSplits}
              artistEdits={artistEdits}
              expanded={directExpanded}
              onToggle={toggleSplit}
              onToggleExpanded={() => setDirectExpanded((current) => !current)}
              onSetGroupSelection={setGroupSelection}
              onUpdateArtists={updateArtists}
            />
          ) : null}
          {possibleSplits.length > 0 ? (
            <ArtistSplitReviewGroup
              t={t}
              title={t('local.refreshArtistSplitSuggestionsTitle')}
              count={possibleSplits.length}
              items={possibleSplits}
              selectedSongIds={selectedSongIds}
              artistEdits={artistEdits}
              expanded={possibleExpanded}
              onToggle={toggleSplit}
              onToggleExpanded={() => setPossibleExpanded((current) => !current)}
              onSetGroupSelection={setGroupSelection}
              onUpdateArtists={updateArtists}
            />
          ) : null}
          {mergeSuggestions.length > 0 ? (
            <ArtistSplitReviewGroup
              t={t}
              title={t('local.artistMergeSuggestionsTitle')}
              count={mergeSuggestions.length}
              items={mergeSuggestions}
              selectedSongIds={selectedSongIds}
              artistEdits={artistEdits}
              expanded={mergeExpanded}
              variant="merge"
              onToggle={toggleSplit}
              onToggleExpanded={() => setMergeExpanded((current) => !current)}
              onSetGroupSelection={setGroupSelection}
              onUpdateArtists={updateArtists}
            />
          ) : null}
        </div>
        <CustomScrollbar
          className="artist-split-review-scrollbar"
          scrollbarTrackRef={scrollbarTrackRef}
          onThumbPointerDown={onScrollbarPointerDown}
        />
        </div>
      </div>
      <div className="artist-split-review-footer">
        <button type="button" onClick={onClose}>{t('local.keepArtistSplits')}</button>
        <button
          type="button"
          className="song-dialog-primary-button"
          disabled={selectedSplits.length === 0}
          onClick={() => {
            void onApply(selectedSplits)
          }}
        >
          {t('local.applySelectedArtistSplits', { count: selectedSplits.length })}
        </button>
      </div>
    </>
  )
}

function ArtistSplitReviewGroup({
  t,
  title,
  count,
  items,
  selectedSongIds,
  artistEdits,
  expanded,
  disabled = false,
  variant = 'split',
  onToggle,
  onToggleExpanded,
  onSetGroupSelection,
  onUpdateArtists,
}: {
  t: Translator
  title: string
  count: number
  items: ArtistSplitResultItem[]
  selectedSongIds: Set<number>
  artistEdits: Map<number, string[]>
  expanded: boolean
  disabled?: boolean
  variant?: 'split' | 'merge'
  onToggle: (songId: number) => void
  onToggleExpanded: () => void
  onSetGroupSelection: (items: ArtistSplitResultItem[], selected: boolean) => void
  onUpdateArtists: (songId: number, artists: string[]) => void
}) {
  const [editingSongId, setEditingSongId] = useState<number | null>(null)
  const selectedCount = items.filter((item) => selectedSongIds.has(item.songId)).length
  const allSelected = items.length > 0 && selectedCount === items.length

  return (
    <section className="artist-split-review-group">
      <div className="artist-split-review-group-header">
        <button
          type="button"
          className="artist-split-review-group-toggle"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
          <h3>{title}</h3>
          <span>{count}</span>
        </button>
        {!disabled ? (
          <button
            type="button"
            className="artist-split-review-group-select"
            onClick={() => onSetGroupSelection(items, !allSelected)}
          >
            {allSelected ? t('local.clearArtistSplitSelection') : t('local.selectAllArtistSplits')}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="artist-split-review-list">
          {items.map((item) => {
            const selected = disabled || selectedSongIds.has(item.songId)
            const editedArtists = artistEdits.get(item.songId) ?? item.artists
            const editing = editingSongId === item.songId
            return (
              <div
                className={[
                  'artist-split-review-item',
                  selected && 'is-selected',
                  editing && 'is-editing',
                ].filter(Boolean).join(' ')}
                key={`${item.songId}-${item.artist}`}
                onClick={(event) => {
                  if (!disabled && !(event.target as HTMLElement).closest('button,input')) {
                    onToggle(item.songId)
                  }
                }}
              >
                <input
                  className="artist-split-review-checkbox"
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onToggle(item.songId)}
                />
                <span
                  className={selected ? 'artist-split-review-check is-selected' : 'artist-split-review-check'}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={disabled ? -1 : 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!disabled) {
                      onToggle(item.songId)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      onToggle(item.songId)
                    }
                  }}
                >
                  {selected ? <Icon name="check" /> : null}
                </span>
                <AlbumArtControl
                  title={item.title}
                  artworkUrl=""
                  songId={item.songId}
                  className="artist-split-review-artwork"
                />
                <span className="artist-split-review-copy">
                  <strong>{item.title}</strong>
                  <span className="artist-split-review-original">
                    <small>{t('local.artistSplitOriginal')}</small>
                    <span>{item.artist}</span>
                  </span>
                  <span className={editing ? 'artist-split-review-next is-editing' : 'artist-split-review-next'}>
                      <small>{t(variant === 'merge' ? 'local.artistMergeAfter' : 'local.artistSplitAfter')}</small>
                    {editing ? (
                      <span className="artist-split-review-inline-actions">
                        <button
                          type="button"
                          disabled={editedArtists.length >= MAX_ARTIST_CELLS}
                          onClick={() => onUpdateArtists(item.songId, [...editedArtists, ''])}
                          aria-label={t('common.add')}
                        >
                          <Icon name="plus" />
                        </button>
                        <button type="button" onClick={() => setEditingSongId(null)} aria-label={t('settings.save')}>
                          <Icon name="check" />
                        </button>
                      </span>
                    ) : null}
                    {editing ? (
                      <span
                        className="artist-split-review-editor"
                      >
                        {(editedArtists.length > 0 ? editedArtists : ['']).slice(0, MAX_ARTIST_CELLS).map((artist, index) => (
                          <span key={index} className="artist-split-review-editor-cell">
                            <input
                              value={artist}
                              onChange={(event) => {
                                const nextArtists = editedArtists.slice()
                                nextArtists[index] = event.currentTarget.value
                                onUpdateArtists(item.songId, nextArtists)
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateArtists(
                                  item.songId,
                                  editedArtists.length > 1
                                    ? editedArtists.filter((_, artistIndex) => artistIndex !== index)
                                    : [''],
                                )
                              }}
                              aria-label={t('playlists.removeSelected')}
                            >
                              <Icon name="close" />
                            </button>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>
                        {getEditedArtists(editedArtists).map((artist) => (
                          <em
                            key={artist}
                            className={variant === 'merge' ? 'artist-split-review-merge-chip' : undefined}
                          >
                            {artist}
                          </em>
                        ))}
                      </span>
                    )}
                  </span>
                </span>
                <span className="artist-split-review-row-actions">
                  {!editing ? (
                    <button type="button" onClick={() => setEditingSongId(item.songId)} aria-label={t('common.edit')}>
                      <Icon name="edit" />
                    </button>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function getEditedArtists(artists: string[]) {
  return artists.map((artist) => artist.trim()).filter(Boolean)
}
