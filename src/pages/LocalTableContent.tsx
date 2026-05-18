import type { ComponentProps, CSSProperties, DragEvent, RefObject } from 'react'
import { useState, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'

import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { LOCAL_FOLDER_TYPE_ICON_URL } from '../components/LocalFolderCard'
import { MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER } from '../components/MultiSelectCommandBar'
import type { LibrarySong } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import type { Translator } from '../shared/i18n'
import { formatLocalFolderSongCount } from '../shared/i18nCounts'
import { COLORFUL_ICON_URL } from '../shared/staticAssets'
import type { FolderNode } from './localFolderModel'
import { LocalSongQuickJump, LocalTableSectionHeader } from './LocalPageQuickJump'
import { getFolderListItemKey, getSongListItemKey, joinClassNames } from './localPageModel'

const LOCAL_FILE_TYPE_ICON_URL = COLORFUL_ICON_URL
const TABLE_ROW_HEIGHT = 48
const TREE_FOLDER_ROW_HEIGHT = 74
const TREE_SONG_ROW_HEIGHT = 72
const OVERSCAN = 10

export type LocalTableTreeRow =
  | {
    key: string
    type: 'folder'
    folder: FolderNode
    depth: number
    expanded: boolean
    expandable: boolean
  }
  | {
    key: string
    type: 'song'
    song: LibrarySong
    depth: number
    songIndex: number
  }

function buildOffsets(rowHeights: number[]) {
  const offsets = [0]
  for (const height of rowHeights) {
    offsets.push(offsets[offsets.length - 1]! + height)
  }
  return offsets
}

function findVirtualStartIndex(offsets: number[], scrollTop: number) {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (offsets[mid]! <= scrollTop) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return Math.min(low, offsets.length - 2)
}

function findVirtualEndIndex(offsets: number[], bottom: number) {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid]! < bottom) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return Math.min(low + 1, offsets.length - 1)
}

export function LocalTableContent({
  frameRef,
  onShellRefChange,
  scrollbarTrackRef,
  onThumbPointerDown,
  childFolders,
  currentSongs,
  treeRows,
  currentRelativePath,
  selectedFolderPaths,
  selectedSongIds,
  dragOverFolderPath,
  selectedListItemKey,
  selectedTrackId,
  isPlaying,
  multiSelect,
  showLocalSectionHeaders,
  showFolderItems,
  showSongItems,
  foldersExpanded,
  songsExpanded,
  showSongQuickJump,
  songQuickJumpBasisName,
  songQuickJumpMap,
  queueSongIds,
  t,
  localSongItemRefs,
  onToggleFoldersExpanded,
  onToggleSongsExpanded,
  onToggleTreeFolderExpanded,
  onToggleFolderSelection,
  onSelectListItem,
  onOpenFolder,
  onOpenFolderMenu,
  onDragFolderStart,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropFolder,
  onDragLocalItemEnd,
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onToggleSongSelection,
  onOpenSongMenu,
  onDragSongStart,
  onPlayTrack,
  onTogglePlayPause,
  onMoveToMusicOrPlay,
  onPlayNext,
  onAddSong,
  onJumpToSongKey,
}: {
  frameRef: RefObject<HTMLDivElement | null>
  onShellRefChange: (node: HTMLDivElement | null) => void
  scrollbarTrackRef: RefObject<HTMLDivElement | null>
  onThumbPointerDown: ComponentProps<typeof CustomScrollbar>['onThumbPointerDown']
  childFolders: FolderNode[]
  currentSongs: LibrarySong[]
  treeRows?: LocalTableTreeRow[]
  currentRelativePath: string
  selectedFolderPaths: Set<string>
  selectedSongIds: Set<number>
  dragOverFolderPath: string
  selectedListItemKey: string
  selectedTrackId: number | null
  isPlaying: boolean
  multiSelect: boolean
  showLocalSectionHeaders: boolean
  showFolderItems: boolean
  showSongItems: boolean
  foldersExpanded: boolean
  songsExpanded: boolean
  showSongQuickJump: boolean
  songQuickJumpBasisName: string
  songQuickJumpMap: Map<string, number>
  queueSongIds: number[]
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  onToggleFoldersExpanded: () => void
  onToggleSongsExpanded: () => void
  onToggleTreeFolderExpanded?: (folderPath: string) => void
  onToggleFolderSelection: (folderPath: string) => void
  onSelectListItem: (key: string) => void
  onOpenFolder: (folderPath: string) => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDragOverFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLeaveFolder: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLocalItemEnd: () => void
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onToggleSongSelection: (songId: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onJumpToSongKey: (key: string) => void
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)
  const shellObserverRef = useRef<ResizeObserver | null>(null)

  const setShellRef = useCallback((node: HTMLDivElement | null) => {
    onShellRefChange(node)

    if (shellObserverRef.current) {
      shellObserverRef.current.disconnect()
      shellObserverRef.current = null
    }

    if (node) {
      setViewportHeight(node.clientHeight)
      const ro = new ResizeObserver(() => setViewportHeight(node.clientHeight))
      ro.observe(node)
      shellObserverRef.current = ro
    }
  }, [onShellRefChange])

  const useTreeRows = treeRows != null
  const folderCount = showFolderItems ? childFolders.length : 0
  const songCount = showSongItems ? currentSongs.length : 0
  const totalRows = useTreeRows ? treeRows.length : folderCount + songCount
  const treeRowOffsets = useMemo(() => buildOffsets((treeRows ?? []).map((row) =>
    row.type === 'folder' ? TREE_FOLDER_ROW_HEIGHT : TREE_SONG_ROW_HEIGHT,
  )), [treeRows])
  const rawStartIndex = useTreeRows
    ? findVirtualStartIndex(treeRowOffsets, scrollTop)
    : Math.floor(scrollTop / TABLE_ROW_HEIGHT)
  const rawEndIndex = useTreeRows
    ? findVirtualEndIndex(treeRowOffsets, scrollTop + viewportHeight)
    : Math.ceil((scrollTop + viewportHeight) / TABLE_ROW_HEIGHT)
  const startIndex = Math.max(0, rawStartIndex - OVERSCAN)
  const endIndex = Math.min(totalRows, rawEndIndex + OVERSCAN)

  const topSpacerHeight = useTreeRows ? treeRowOffsets[startIndex]! : startIndex * TABLE_ROW_HEIGHT
  const bottomSpacerHeight = useTreeRows
    ? Math.max(0, treeRowOffsets[treeRowOffsets.length - 1]! - treeRowOffsets[endIndex]!)
    : Math.max(0, (totalRows - endIndex) * TABLE_ROW_HEIGHT)
  const effectiveBottomSpacerHeight = bottomSpacerHeight + (multiSelect ? MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER : 0)

  const visibleTreeRows = useTreeRows ? treeRows.slice(startIndex, endIndex) : []
  const visibleFolders = showFolderItems ? childFolders.slice(startIndex, Math.min(folderCount, endIndex)) : []
  const songStartIndex = Math.max(0, startIndex - folderCount)
  const songEndIndex = Math.max(0, endIndex - folderCount)
  const visibleSongs = showSongItems ? currentSongs.slice(songStartIndex, songEndIndex) : []

  return (
    <div className="local-scroll-frame custom-scrollbar-frame" ref={frameRef}>
      <div
        className="table-shell local-table-shell custom-scrollbar-container"
        ref={setShellRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table className="music-table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.artist')}</th>
              <th>{t('common.album')}</th>
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr className="local-table-spacer-row" style={{ height: topSpacerHeight }}>
                <td colSpan={5} style={{ padding: 0, border: 0 }}></td>
              </tr>
            )}
            {useTreeRows ? visibleTreeRows.map((row) => row.type === 'folder' ? (
              <tr
                key={row.key}
                className={joinClassNames(
                  'local-table-folder-row local-table-tree-row',
                  !multiSelect && selectedListItemKey === getFolderListItemKey(row.folder.relativePath) && 'is-selected',
                  multiSelect && selectedFolderPaths.has(row.folder.relativePath) && 'is-selected',
                  dragOverFolderPath === row.folder.relativePath && 'is-drop-target',
                )}
                style={{ '--local-tree-depth': row.depth } as CSSProperties}
                draggable
                onDragStart={(event) => {
                  onDragFolderStart(event, row.folder)
                }}
                onDragOver={(event) => {
                  onDragOverFolder(event, row.folder)
                }}
                onDragLeave={(event) => {
                  onDragLeaveFolder(event, row.folder)
                }}
                onDrop={(event) => {
                  onDropFolder(event, row.folder)
                }}
                onDragEnd={onDragLocalItemEnd}
                onClick={() => {
                  if (multiSelect) {
                    onToggleFolderSelection(row.folder.relativePath)
                  } else {
                    onSelectListItem(getFolderListItemKey(row.folder.relativePath))
                  }
                }}
                onDoubleClick={() => {
                  if (!multiSelect) {
                    onOpenFolder(row.folder.relativePath)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpenFolderMenu(row.folder, event.clientX, event.clientY)
                }}
              >
                <td className="local-table-name-cell local-table-folder-name-cell local-table-tree-cell" colSpan={3}>
                  <button
                    className="local-table-tree-toggle"
                    type="button"
                    disabled={!row.expandable}
                    aria-label={row.folder.name}
                    aria-expanded={row.expandable ? row.expanded : undefined}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleTreeFolderExpanded?.(row.folder.relativePath)
                    }}
                  >
                    {row.expandable ? <Icon name={row.expanded ? 'chevronDown' : 'chevronRight'} /> : null}
                  </button>
                  {multiSelect ? (
                    <span className={selectedFolderPaths.has(row.folder.relativePath) ? 'local-check is-selected' : 'local-check'}>
                      {selectedFolderPaths.has(row.folder.relativePath) ? <Icon name="check" /> : null}
                    </span>
                  ) : null}
                  <button className="table-link table-link-button" type="button">
                    <img className="local-table-type-icon" src={LOCAL_FOLDER_TYPE_ICON_URL} alt="" />
                    <span className="local-table-primary-text">{row.folder.name}</span>
                  </button>
                  <span className="local-table-folder-summary">
                    {formatLocalFolderSongCount(t, row.folder.subtreeSongIds.length)}
                  </span>
                  {!multiSelect ? (
                    <span className="local-table-item-actions">
                      <button
                        type="button"
                        title={t('local.playAllButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onPlayFolder(row.folder)
                        }}
                      >
                        <Icon name="shuffle" />
                      </button>
                      <button
                        type="button"
                        title={t('context.addToPlaylist')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAddFolder(row.folder, event.clientX, event.clientY)
                        }}
                      >
                        <Icon name="plus" />
                      </button>
                      <button
                        type="button"
                        title={t('local.updateFolder')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRefreshFolder(row.folder)
                        }}
                      >
                        <Icon name="refresh" />
                      </button>
                      <button
                        type="button"
                        title={t('local.searchFolderButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSearchFolder(row.folder)
                        }}
                      >
                        <Icon name="search" />
                      </button>
                      <button
                        type="button"
                        title={t('local.openLocalButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRevealFolder(row.folder)
                        }}
                      >
                        <Icon name="local" />
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ) : (
              <tr
                key={row.key}
                ref={(element) => {
                  localSongItemRefs.current[row.songIndex] = element
                }}
                className={joinClassNames(
                  'local-table-song-row local-table-tree-row',
                  row.song.id === selectedTrackId && 'is-current',
                  !multiSelect && selectedListItemKey === getSongListItemKey(row.song.id) && 'is-selected',
                  multiSelect && selectedSongIds.has(row.song.id) && 'is-selected',
                )}
                style={{ '--local-tree-depth': row.depth } as CSSProperties}
                draggable
                onDragStart={(event) => {
                  onDragSongStart(event, row.song)
                }}
                onDragEnd={onDragLocalItemEnd}
                onClick={() => {
                  if (multiSelect) {
                    onToggleSongSelection(row.song.id)
                  } else {
                    onSelectListItem(getSongListItemKey(row.song.id))
                  }
                }}
                onDoubleClick={() => {
                  if (!multiSelect) {
                    onPlayTrack(row.song.id, queueSongIds)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpenSongMenu(row.song, event.clientX, event.clientY)
                }}
              >
                <td className="local-table-name-cell local-table-tree-cell" colSpan={3}>
                  <span className="local-table-tree-toggle" aria-hidden="true" />
                  {multiSelect ? (
                    <span className={selectedSongIds.has(row.song.id) ? 'local-check is-selected' : 'local-check'}>
                      {selectedSongIds.has(row.song.id) ? <Icon name="check" /> : null}
                    </span>
                  ) : null}
                  <span className="local-table-row-icon">
                    {row.song.id === selectedTrackId ? (
                      <Icon name="play" />
                    ) : (
                      <img className="local-table-type-icon" src={LOCAL_FILE_TYPE_ICON_URL} alt="" />
                    )}
                  </span>
                  <div className="local-table-title-wrap">
                    <span className="local-table-primary-text">{row.song.title}</span>
                    <div className="local-table-secondary-text">
                      {(() => {
                        const songArtists = getSongArtists(row.song, t('common.artistUnknown'))
                        const separator = t('common.artistSeparator')
                        return songArtists.map((artist, index) => (
                          <span key={artist}>
                            {index > 0 ? separator : null}
                            <Link
                              className="table-link"
                              to={`/artists?artist=${encodeURIComponent(artist)}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {artist}
                            </Link>
                          </span>
                        ))
                      })()}
                      <span className="local-table-tree-album-separator"> · </span>
                      <Link
                        className="table-link"
                        to={`/albums?album=${encodeURIComponent(row.song.album || t('common.albumUnknown'))}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.song.album || t('common.albumUnknown')}
                      </Link>
                    </div>
                  </div>
                  {!multiSelect ? (
                    <span className="local-table-item-actions local-table-song-actions">
                      <button
                        type="button"
                        title={t('context.play')}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (row.song.id === selectedTrackId && isPlaying) {
                            onTogglePlayPause()
                          } else {
                            onMoveToMusicOrPlay(row.song.id)
                          }
                        }}
                      >
                        <Icon name={row.song.id === selectedTrackId && isPlaying ? 'pause' : 'play'} />
                      </button>
                      <button
                        type="button"
                        title={t('context.addToPlaylist')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAddSong(row.song, event.clientX, event.clientY)
                        }}
                      >
                        <Icon name="plus" />
                      </button>
                      <button
                        type="button"
                        title={t('context.playNext')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onPlayNext(row.song.id)
                        }}
                      >
                        <Icon name="playNext" />
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            )) : null}
            {!useTreeRows && showLocalSectionHeaders && childFolders.length > 0 ? (
              <LocalTableSectionHeader
                count={childFolders.length}
                expanded={foldersExpanded}
                title={t('common.folders')}
                onToggle={onToggleFoldersExpanded}
              />
            ) : null}
            {!useTreeRows && showFolderItems ? visibleFolders.map((folder) => (
              <tr
                key={folder.relativePath}
                className={joinClassNames(
                  'local-table-folder-row',
                  !multiSelect && selectedListItemKey === getFolderListItemKey(folder.relativePath) && 'is-selected',
                  multiSelect && selectedFolderPaths.has(folder.relativePath) && 'is-selected',
                  dragOverFolderPath === folder.relativePath && 'is-drop-target',
                )}
                draggable
                onDragStart={(event) => {
                  onDragFolderStart(event, folder)
                }}
                onDragOver={(event) => {
                  onDragOverFolder(event, folder)
                }}
                onDragLeave={(event) => {
                  onDragLeaveFolder(event, folder)
                }}
                onDrop={(event) => {
                  onDropFolder(event, folder)
                }}
                onDragEnd={onDragLocalItemEnd}
                onClick={() => {
                  if (multiSelect) {
                    onToggleFolderSelection(folder.relativePath)
                  } else {
                    onSelectListItem(getFolderListItemKey(folder.relativePath))
                  }
                }}
                onDoubleClick={() => {
                  if (!multiSelect) {
                    onOpenFolder(folder.relativePath)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpenFolderMenu(folder, event.clientX, event.clientY)
                }}
              >
                <td className="local-table-name-cell local-table-folder-name-cell" colSpan={3}>
                  {multiSelect ? (
                    <span className={selectedFolderPaths.has(folder.relativePath) ? 'local-check is-selected' : 'local-check'}>
                      {selectedFolderPaths.has(folder.relativePath) ? <Icon name="check" /> : null}
                    </span>
                  ) : null}
                  <button className="table-link table-link-button" type="button">
                    <img className="local-table-type-icon" src={LOCAL_FOLDER_TYPE_ICON_URL} alt="" />
                    <span className="local-table-primary-text">{folder.name}</span>
                  </button>
                  <span className="local-table-folder-summary">
                    {formatLocalFolderSongCount(t, folder.directSongIds.length)}
                  </span>
                  <Icon name="chevronRight" />
                  {!multiSelect ? (
                    <span className="local-table-item-actions">
                      <button
                        type="button"
                        title={t('local.playAllButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onPlayFolder(folder)
                        }}
                      >
                        <Icon name="shuffle" />
                      </button>
                      <button
                        type="button"
                        title={t('context.addToPlaylist')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAddFolder(folder, event.clientX, event.clientY)
                        }}
                      >
                        <Icon name="plus" />
                      </button>
                      <button
                        type="button"
                        title={t('local.updateFolder')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRefreshFolder(folder)
                        }}
                      >
                        <Icon name="refresh" />
                      </button>
                      <button
                        type="button"
                        title={t('local.searchFolderButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSearchFolder(folder)
                        }}
                      >
                        <Icon name="search" />
                      </button>
                      <button
                        type="button"
                        title={t('local.openLocalButtonTooltip')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRevealFolder(folder)
                        }}
                      >
                        <Icon name="local" />
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            )) : null}
            {!useTreeRows && showLocalSectionHeaders && currentSongs.length > 0 ? (
              <LocalTableSectionHeader
                count={currentSongs.length}
                expanded={songsExpanded}
                title={t('local.allSongs')}
                onToggle={onToggleSongsExpanded}
              />
            ) : null}
            {!useTreeRows && showSongItems && showSongQuickJump ? (
              <tr className="local-table-quick-jump-row">
                <td colSpan={3}>
                  <LocalSongQuickJump
                    basisName={songQuickJumpBasisName}
                    enabledKeys={songQuickJumpMap}
                    t={t}
                    visible={showSongQuickJump}
                    onJump={onJumpToSongKey}
                  />
                </td>
              </tr>
            ) : null}
            {!useTreeRows && showSongItems ? visibleSongs.map((song, localIndex) => {
              const index = songStartIndex + localIndex
              return (
              <tr
                key={`${currentRelativePath}-${song.id}`}
                ref={(element) => {
                  localSongItemRefs.current[index] = element
                }}
                className={joinClassNames(
                  'local-table-song-row',
                  song.id === selectedTrackId && 'is-current',
                  !multiSelect && selectedListItemKey === getSongListItemKey(song.id) && 'is-selected',
                  multiSelect && selectedSongIds.has(song.id) && 'is-selected',
                )}
                draggable
                onDragStart={(event) => {
                  onDragSongStart(event, song)
                }}
                onDragEnd={onDragLocalItemEnd}
                onClick={() => {
                  if (multiSelect) {
                    onToggleSongSelection(song.id)
                  } else {
                    onSelectListItem(getSongListItemKey(song.id))
                  }
                }}
                onDoubleClick={() => {
                  if (!multiSelect) {
                    onPlayTrack(song.id, queueSongIds)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpenSongMenu(song, event.clientX, event.clientY)
                }}
              >
                <td className="local-table-play-cell" onDoubleClick={() => onPlayTrack(song.id, queueSongIds)}>
                  {multiSelect ? (
                    <span className={selectedSongIds.has(song.id) ? 'local-check is-selected' : 'local-check'}>
                      {selectedSongIds.has(song.id) ? <Icon name="check" /> : null}
                    </span>
                  ) : null}
                  <span className="local-table-row-icon">
                    {song.id === selectedTrackId ? (
                      <Icon name="play" />
                    ) : (
                      <img className="local-table-type-icon" src={LOCAL_FILE_TYPE_ICON_URL} alt="" />
                    )}
                  </span>
                </td>
                <td className="local-table-title-cell" onDoubleClick={() => onPlayTrack(song.id, queueSongIds)}>
                  <div className="local-table-title-wrap">
                    <span className="local-table-primary-text">{song.title}</span>
                    {!multiSelect ? (
                      <span className="local-table-item-actions local-table-song-actions">
                        <button
                          type="button"
                          title={t('context.play')}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (song.id === selectedTrackId && isPlaying) {
                              onTogglePlayPause()
                            } else {
                              onMoveToMusicOrPlay(song.id)
                            }
                          }}
                        >
                          <Icon name={song.id === selectedTrackId && isPlaying ? 'pause' : 'play'} />
                        </button>
                        <button
                          type="button"
                          title={t('context.addToPlaylist')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAddSong(song, event.clientX, event.clientY)
                          }}
                        >
                          <Icon name="plus" />
                        </button>
                        <button
                          type="button"
                          title={t('context.playNext')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onPlayNext(song.id)
                          }}
                        >
                          <Icon name="playNext" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <div className="local-table-secondary-text">
                    {(() => {
                      const songArtists = getSongArtists(song, t('common.artistUnknown'))
                      const separator = t('common.artistSeparator')
                      return songArtists.map((artist, index) => (
                      <span key={artist}>
                        {index > 0 ? separator : null}
                        <Link
                          className="table-link"
                          to={`/artists?artist=${encodeURIComponent(artist)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {artist}
                        </Link>
                      </span>
                      ))
                    })()}
                  </div>
                </td>
                <td className="local-table-album-cell">
                  <Link
                    className="table-link"
                    to={`/albums?album=${encodeURIComponent(song.album || t('common.albumUnknown'))}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {song.album || t('common.albumUnknown')}
                  </Link>
                </td>
              </tr>
              )
            }) : null}
            {effectiveBottomSpacerHeight > 0 && (
              <tr className="local-table-spacer-row" style={{ height: effectiveBottomSpacerHeight }}>
                <td colSpan={5} style={{ padding: 0, border: 0 }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <CustomScrollbar
        scrollbarTrackRef={scrollbarTrackRef}
        onThumbPointerDown={onThumbPointerDown}
      />
    </div>
  )
}
