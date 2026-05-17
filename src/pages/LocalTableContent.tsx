import type { ComponentProps, DragEvent, RefObject } from 'react'
import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { LOCAL_FOLDER_TYPE_ICON_URL } from '../components/LocalFolderCard'
import type { LibrarySong } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import type { Translator } from '../shared/i18n'
import { COLORFUL_ICON_URL } from '../shared/staticAssets'
import type { FolderNode } from './localFolderModel'
import { LocalSongQuickJump, LocalTableSectionHeader } from './LocalPageQuickJump'
import { getFolderListItemKey, getSongListItemKey, joinClassNames } from './localPageModel'

const LOCAL_FILE_TYPE_ICON_URL = COLORFUL_ICON_URL

export function LocalTableContent({
  frameRef,
  onShellRefChange,
  scrollbarTrackRef,
  onThumbPointerDown,
  childFolders,
  currentSongs,
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

  const ROW_HEIGHT = 48
  const OVERSCAN = 10

  const folderCount = showFolderItems ? childFolders.length : 0
  const songCount = showSongItems ? currentSongs.length : 0
  const totalRows = folderCount + songCount

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)

  const topSpacerHeight = startIndex * ROW_HEIGHT
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT)

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
            {topSpacerHeight > 0 && <tr style={{ height: topSpacerHeight }}><td colSpan={5} style={{ padding: 0, border: 0 }}></td></tr>}
            {showLocalSectionHeaders && childFolders.length > 0 ? (
              <LocalTableSectionHeader
                count={childFolders.length}
                expanded={foldersExpanded}
                title={t('common.folders')}
                onToggle={onToggleFoldersExpanded}
              />
            ) : null}
            {showFolderItems ? visibleFolders.map((folder) => (
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
                    {t('local.folderSongsCompact', { count: folder.directSongIds.length })}
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
            {showLocalSectionHeaders && currentSongs.length > 0 ? (
              <LocalTableSectionHeader
                count={currentSongs.length}
                expanded={songsExpanded}
                title={t('local.allSongs')}
                onToggle={onToggleSongsExpanded}
              />
            ) : null}
            {showSongItems && showSongQuickJump ? (
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
            {showSongItems ? visibleSongs.map((song, localIndex) => {
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
            {bottomSpacerHeight > 0 && <tr style={{ height: bottomSpacerHeight }}><td colSpan={5} style={{ padding: 0, border: 0 }}></td></tr>}
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
