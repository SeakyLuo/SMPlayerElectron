import { useMemo, useState, type UIEvent } from 'react'

import { PopupDialog } from '../components/PopupDialog'
import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { Icon } from '../components/icons'
import { ArtistSplitReviewPanel } from '../components/ArtistSplitReviewDialog'
import { useSongArtwork } from '../hooks/useSongArtwork'
import type { ArtistSplitResultItem, LibrarySong, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { normalizePath, type FolderNode } from './localFolderModel'
import {
  getUpdateResultFileItems,
  joinClassNames,
} from './localPageModel'

const RESULT_ROW_HEIGHT = 66
const RESULT_ROW_OVERSCAN = 8
const RESULT_MAX_VISIBLE_ROWS = 14

export function FolderUpdateResultDialog({
  t,
  result,
  folder,
  songs,
  selectedTrackId,
  isPlaying,
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
  isPlaying: boolean
  onPlaySong: (songId: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onApplyArtistSplits: (splits: ArtistSplitResultItem[]) => void | Promise<void>
  onDismissArtistSplitSuggestions: () => void
  onClose: () => void
}) {
  const title = t('local.updateResultOfFolder', { name: folder.name })
  const groups = [
    { key: 'added', label: t('local.refreshAddedTab'), items: getUpdateResultFileItems(result.filesAdded, folder.path), playable: true },
    { key: 'removed', label: t('local.refreshRemovedTab'), items: getUpdateResultFileItems(result.filesRemoved, folder.path), playable: false },
    { key: 'moved', label: t('local.refreshMovedTab'), items: getUpdateResultFileItems(result.filesMoved, folder.path), playable: true },
  ].filter((group) => group.items.length > 0)
  const artistUpdateCount = result.artistSplitsApplied.length + result.artistSplitSuggestions.length + result.artistMergeSuggestions.length
  const [activeTabKey, setActiveTabKey] = useState(artistUpdateCount > 0 ? 'artists' : (groups[0]?.key ?? 'artists'))
  const tabs = [
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.items.length,
      icon: 'songs' as const,
    })),
    ...(artistUpdateCount > 0
      ? [{
        key: 'artists',
        label: t('local.refreshArtistUpdatesTab'),
        count: artistUpdateCount,
        icon: 'users' as const,
      }]
      : []),
  ]
  const activeFileGroup = groups.find((group) => group.key === activeTabKey)
  const songsByPathKey = useMemo(() => {
    const map = new Map<string, LibrarySong>()
    for (const song of songs) {
      map.set(normalizePath(song.path).toLocaleLowerCase(), song)
    }
    return map
  }, [songs])

  return (
    <PopupDialog
      t={t}
      overlayClassName="folder-update-result-popup-overlay"
      className="folder-update-result-dialog ContentDialog"
      navClassName="folder-update-result-nav"
      navLabel={title}
      ariaLabelledBy="folder-update-result-title"
      onClose={onClose}
      navChildren={(
        <div className="popup-dialog-title-block">
          <h2 id="folder-update-result-title">{title}</h2>
        </div>
      )}
    >
      <div className="folder-update-result-content">
        <div className="folder-update-result-tabs" role="tablist" aria-label={title}>
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              className={joinClassNames('folder-update-result-tab', activeTabKey === tab.key && 'is-active')}
              aria-selected={activeTabKey === tab.key}
              key={tab.key}
              onClick={() => setActiveTabKey(tab.key)}
            >
              <span className="folder-update-result-tab-label">
                <Icon name={tab.icon} className="folder-update-result-tab-icon" />
                <span>{tab.label}</span>
              </span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>
        {activeFileGroup ? (
          <FolderUpdateResultGroup
            t={t}
            group={activeFileGroup}
            songsByPathKey={songsByPathKey}
            selectedTrackId={selectedTrackId}
            isPlaying={isPlaying}
            onPlaySong={onPlaySong}
            onOpenSongMenu={onOpenSongMenu}
          />
        ) : null}
        {activeTabKey === 'artists' && artistUpdateCount > 0 ? (
          <ArtistSplitReviewPanel
            t={t}
            directSplits={result.artistSplitsApplied}
            possibleSplits={result.artistSplitSuggestions}
            mergeSuggestions={result.artistMergeSuggestions}
            onApply={onApplyArtistSplits}
            onClose={onDismissArtistSplitSuggestions}
          />
        ) : null}
      </div>
    </PopupDialog>
  )
}

function FolderUpdateResultGroup({
  t,
  group,
  songsByPathKey,
  selectedTrackId,
  isPlaying,
  onPlaySong,
  onOpenSongMenu,
}: {
  t: Translator
  group: {
    key: string
    label: string
    items: Array<{
      path: string
      title: string
    }>
    playable: boolean
  }
  songsByPathKey: Map<string, LibrarySong>
  selectedTrackId: number | null
  isPlaying: boolean
  onPlaySong: (songId: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const rowCount = group.items.length
  const viewportHeight = Math.min(rowCount, RESULT_MAX_VISIBLE_ROWS) * RESULT_ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / RESULT_ROW_HEIGHT) - RESULT_ROW_OVERSCAN)
  const endIndex = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / RESULT_ROW_HEIGHT) + RESULT_ROW_OVERSCAN)
  const visibleItems = group.items.slice(startIndex, endIndex)

  const updateScrollTop = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }

  return (
    <section className="folder-update-result-group">
      <div
        className="folder-update-result-list is-virtual"
        style={{ height: viewportHeight }}
        onScroll={updateScrollTop}
      >
        <div className="folder-update-result-list-spacer" style={{ height: rowCount * RESULT_ROW_HEIGHT }}>
          {visibleItems.map((item, index) => {
            const itemIndex = startIndex + index
            const rowStyle = { top: itemIndex * RESULT_ROW_HEIGHT }
            const showsFullPath = item.title === item.path

            if (!group.playable) {
              const itemClassName = joinClassNames(
                'folder-update-result-item',
                'is-disabled',
                itemIndex === 0 && 'is-first',
                itemIndex % 2 === 0 && 'is-odd',
              )

              return (
                <div
                  className={itemClassName}
                  key={`${group.key}-${item.path}-${itemIndex}`}
                  style={rowStyle}
                  title={item.path}
                >
                  <span className="folder-update-result-playing-icon" aria-hidden="true" />
                  <span className={joinClassNames('folder-update-result-path', showsFullPath && 'is-full-path')}>{item.title}</span>
                </div>
              )
            }

            const song = songsByPathKey.get(normalizePath(item.path).toLocaleLowerCase())!
            const isCurrent = song.id === selectedTrackId
            const itemClassName = joinClassNames(
              'folder-update-result-item',
              'is-song',
              itemIndex === 0 && 'is-first',
              itemIndex % 2 === 0 && 'is-odd',
              isCurrent && 'is-playing',
            )

            return (
              <div
                className={itemClassName}
                key={`${group.key}-${item.path}-${itemIndex}`}
                style={rowStyle}
                title={item.path}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpenSongMenu(song, event.clientX, event.clientY)
                }}
              >
                <FolderUpdateResultArtwork
                  t={t}
                  song={song}
                  current={isCurrent}
                  isPlaying={isCurrent && isPlaying}
                  onPlay={() => onPlaySong(song.id)}
                />
                <span className={joinClassNames('folder-update-result-song-title', showsFullPath && 'is-full-path')}>
                  {item.title}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FolderUpdateResultArtwork({
  t,
  song,
  current,
  isPlaying,
  onPlay,
}: {
  t: Translator
  song: LibrarySong
  current: boolean
  isPlaying: boolean
  onPlay: () => void
}) {
  const { artworkUrl, refreshArtwork } = useSongArtwork(song.id, song.artworkUrl)

  return (
    <span className="folder-update-result-artwork-wrap">
      <ArtworkImage
        className="folder-update-result-artwork"
        src={artworkUrl}
        title={song.title}
        onError={refreshArtwork}
        renderFallback={() => (
          <span className="folder-update-result-artwork folder-update-result-artwork-fallback" aria-hidden="true">
            <DefaultAlbumArtwork className="folder-update-result-artwork-fallback-image" />
          </span>
        )}
      />
      {current ? (
        <span className="playlist-control-item-playing-wave folder-update-result-playing-wave" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : null}
      <button
        type="button"
        className="folder-update-result-artwork-play"
        aria-label={isPlaying ? t('context.pause') : t('context.play')}
        title={isPlaying ? t('context.pause') : t('context.play')}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} />
      </button>
    </span>
  )
}
