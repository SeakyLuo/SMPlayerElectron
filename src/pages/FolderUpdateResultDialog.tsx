import { useEffect, useRef } from 'react'

import { Icon } from '../components/icons'
import { ArtistSplitReviewPanel } from '../components/ArtistSplitReviewDialog'
import type { ArtistSplitResultItem, LibrarySong, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { FolderNode } from './localFolderModel'
import {
  findSongByPath,
  getUpdateResultFileItems,
  joinClassNames,
} from './localPageModel'

export function FolderUpdateResultDialog({
  t,
  result,
  folder,
  songs,
  selectedTrackId,
  songMenuOpen,
  onPlaySong,
  onOpenSongMenu,
  onApplyArtistSplits,
  onDismissArtistSplitSuggestions,
  onClose,
}: {
  t: Translator
  result: ScanLibraryResult
  folder: FolderNode
  songs: LibrarySong[]
  selectedTrackId: number | null
  songMenuOpen: boolean
  onPlaySong: (songId: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onApplyArtistSplits: (splits: ArtistSplitResultItem[]) => void | Promise<void>
  onDismissArtistSplitSuggestions: () => void
  onClose: () => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const groups = [
    { key: 'added', label: t('local.refreshAddedGroup', { count: result.filesAdded.length }), items: getUpdateResultFileItems(result.filesAdded, folder.path), playable: true },
    { key: 'removed', label: t('local.refreshRemovedGroup', { count: result.filesRemoved.length }), items: getUpdateResultFileItems(result.filesRemoved, folder.path), playable: false },
    { key: 'moved', label: t('local.refreshMovedGroup', { count: result.filesMoved.length }), items: getUpdateResultFileItems(result.filesMoved, folder.path), playable: true },
  ].filter((group) => group.items.length > 0)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !songMenuOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, songMenuOpen])

  return (
    <div className="folder-update-result-overlay" role="presentation">
      <section className="folder-update-result-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-update-result-title">
        <div className="folder-update-result-header">
          <h3 id="folder-update-result-title">{t('local.updateResultOfFolder', { name: folder.name })}</h3>
          <button ref={closeButtonRef} type="button" className="folder-update-result-close" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="folder-update-result-groups">
          {groups.map((group) => (
            <section className="folder-update-result-group" key={group.key}>
              <h4>{group.label}</h4>
              <div className="folder-update-result-list">
                {group.items.map((item, index) => {
                  if (!group.playable) {
                    return (
                      <div
                        className="folder-update-result-item is-disabled"
                        key={`${group.key}-${item.path}-${index}`}
                        title={item.path}
                      >
                        <span className="folder-update-result-playing-icon" aria-hidden="true" />
                        <span className="folder-update-result-path">{item.title}</span>
                      </div>
                    )
                  }

                  const song = findSongByPath(songs, item.path)!
                  const isPlaying = song.id === selectedTrackId
                  const itemClassName = joinClassNames(
                    'folder-update-result-item',
                    isPlaying && 'is-playing',
                  )

                  return (
                    <button
                      type="button"
                      className={itemClassName}
                      key={`${group.key}-${item.path}-${index}`}
                      title={item.path}
                      onClick={() => {
                        onPlaySong(song.id)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        onOpenSongMenu(song, event.clientX, event.clientY)
                      }}
                    >
                      <span className="folder-update-result-playing-icon" aria-hidden="true">
                        {isPlaying ? <Icon name="play" /> : null}
                      </span>
                      <span className="folder-update-result-path">{item.title}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {result.artistSplitsApplied.length > 0 ||
          result.artistSplitSuggestions.length > 0 ||
          result.artistMergeSuggestions.length > 0 ? (
            <ArtistSplitReviewPanel
              t={t}
              directSplits={result.artistSplitsApplied}
              possibleSplits={result.artistSplitSuggestions}
              mergeSuggestions={result.artistMergeSuggestions}
              appliedDirectSplits
              onApply={onApplyArtistSplits}
              onClose={onDismissArtistSplitSuggestions}
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}
