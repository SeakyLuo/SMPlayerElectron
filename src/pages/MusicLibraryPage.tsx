import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useRef } from 'react'
import { Link } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import type { AppSettingsUpdate, LibrarySnapshot, LibrarySong, MusicLibrarySortCriterion } from '../shared/contracts'
import { getDisplayArtists, getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { compareLocalText, getLocalTextQuickJumpBucket, LOCAL_TEXT_QUICK_JUMP_KEYS } from '../shared/textCompare'
import { useSongArtwork } from '../hooks/useSongArtwork'

interface MusicLibraryPageProps {
  snapshot: LibrarySnapshot
  t: Translator
  songs: LibrarySong[]
  loading: boolean
  scanning: boolean
  error: string | null
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddNextAndPlay: (trackId: number) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onUpdateSettings: (update: AppSettingsUpdate) => void
  readOnly?: boolean
  resolveArtwork?: boolean
}

type LibrarySortColumn = 'artwork' | 'title' | 'artist' | 'album' | 'duration' | 'favorite' | 'playCount' | 'dateAdded'
type LibrarySortableColumn = Exclude<LibrarySortColumn, 'artwork' | 'favorite'>
type LibrarySortDirection = 'ascending' | 'descending'

interface LibrarySortState {
  column: LibrarySortableColumn
  direction: LibrarySortDirection
}

type ColumnWidths = Record<LibrarySortColumn, number>

const WIDE_VIRTUAL_ROW_HEIGHT = 58
const COMPACT_VIRTUAL_ROW_HEIGHT = 76
const VIRTUAL_OVERSCAN_ROWS = 12
const MIN_COLUMN_WIDTH = 86
const COMPACT_LIBRARY_BREAKPOINT = 720
const QUICK_JUMP_KEYS = LOCAL_TEXT_QUICK_JUMP_KEYS
const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  artwork: 66,
  title: 280,
  artist: 200,
  album: 240,
  duration: 110,
  favorite: 96,
  playCount: 120,
  dateAdded: 170,
}

export function MusicLibraryPage({
  snapshot,
  t,
  songs,
  loading,
  scanning,
  error,
  selectedTrackId,
  isPlaying,
  searchQuery,
  onPlayTrack,
  onAddNextAndPlay,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onRevealSong,
  onDeleteSongFromDisk,
  onUpdateSettings,
  readOnly = false,
  resolveArtwork = true,
}: MusicLibraryPageProps) {
  const hasSongs = songs.length > 0
  const hasLibrary = snapshot.songs.length > 0
  const [sortState, setSortState] = useState<LibrarySortState>(() => ({
    column: toLibrarySortColumn(snapshot.settings.musicLibrarySort),
    direction: 'ascending',
  }))
  const visibleSongs = useMemo(
    () => sortSongsByColumn(songs, sortState),
    [songs, sortState],
  )
  const tableShellRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [selectionMenu, setSelectionMenu] = useState<MenuFlyoutPosition | null>(null)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectionAnchorSongId, setSelectionAnchorSongId] = useState<number | null>(null)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportSize, setViewportSize] = useState({ height: 640, width: 1160 })
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.innerWidth < COMPACT_LIBRARY_BREAKPOINT)
  const [quickJumpPanelOpen, setQuickJumpPanelOpen] = useState(false)
  const viewportHeight = viewportSize.height
  const viewportWidth = viewportSize.width
  const virtualRowHeight = isCompactLayout ? COMPACT_VIRTUAL_ROW_HEIGHT : WIDE_VIRTUAL_ROW_HEIGHT
  const quickJumpColumn = sortState.column
  const visibleStartIndex = Math.max(0, Math.floor(scrollTop / virtualRowHeight) - VIRTUAL_OVERSCAN_ROWS)
  const visibleEndIndex = Math.min(
    visibleSongs.length,
    Math.ceil((scrollTop + viewportHeight) / virtualRowHeight) + VIRTUAL_OVERSCAN_ROWS,
  )
  const renderedSongs = visibleSongs.slice(visibleStartIndex, visibleEndIndex)
  const topSpacerHeight = visibleStartIndex * virtualRowHeight
  const bottomSpacerHeight = (visibleSongs.length - visibleEndIndex) * virtualRowHeight
  const queueSongIds = useMemo(() => visibleSongs.map((song) => song.id), [visibleSongs])
  const effectiveSelectedSongIds = useMemo(
    () => queueSongIds.filter((songId) => selectedSongIds.has(songId)),
    [queueSongIds, selectedSongIds],
  )
  const tableWidth = isCompactLayout
    ? viewportWidth
    : Math.max(
        Object.values(columnWidths).reduce((total, width) => total + width, 0),
        viewportWidth,
      )
  const customPlaylists = snapshot.playlists.filter((playlist) => !playlist.isBuiltIn)
  const favoriteSongIdSet = useMemo(() => new Set(snapshot.favorites.songIds), [snapshot.favorites.songIds])
  const quickJumpMap = useMemo(
    () => buildQuickJumpMap(visibleSongs, quickJumpColumn),
    [quickJumpColumn, visibleSongs],
  )
  const quickJumpKeys = sortState.direction === 'descending'
    ? QUICK_JUMP_KEYS.slice().reverse()
    : QUICK_JUMP_KEYS
  const compactSortOptions: Array<{ column: LibrarySortableColumn; label: string }> = [
    { column: 'title', label: t('musicLibrary.titleHeader') },
    { column: 'artist', label: t('common.artist') },
    { column: 'album', label: t('common.album') },
    { column: 'duration', label: t('common.duration') },
    { column: 'playCount', label: t('common.playCount') },
    { column: 'dateAdded', label: t('common.dateAdded') },
  ]
  const quickJumpBasisName = getLibraryQuickJumpBasisName(quickJumpColumn, t)
  const activeQuickJumpKey = getQuickJumpBucket(
    visibleSongs[Math.min(visibleSongs.length - 1, Math.max(0, Math.floor(scrollTop / virtualRowHeight)))],
    quickJumpColumn,
  )

  useEffect(() => {
    setSortState({
      column: toLibrarySortColumn(snapshot.settings.musicLibrarySort),
      direction: 'ascending',
    })
  }, [snapshot.settings.musicLibrarySort])

  const toggleSort = (column: LibrarySortableColumn) => {
    setSortState((current) => {
      if (current?.column !== column) {
        onUpdateSettings({ musicLibrarySort: toMusicLibrarySortCriterion(column) })
        return { column, direction: 'ascending' }
      }

      onUpdateSettings({ musicLibrarySort: toMusicLibrarySortCriterion(column) })
      return {
        column,
        direction: current.direction === 'ascending' ? 'descending' : 'ascending',
      }
    })
  }

  const addSongsToFavorites = (songIds: number[]) => {
    onAddSongsToPlaylist(snapshot.favorites.playlistId, songIds)
  }

  const resizeColumn = (column: LibrarySortColumn, deltaX: number) => {
    setColumnWidths((current) => ({
      ...current,
      [column]: Math.max(MIN_COLUMN_WIDTH, current[column] + deltaX),
    }))
  }

  const jumpToKey = (key: string) => {
    const targetIndex = quickJumpMap.get(key)
    if (targetIndex == null) {
      return
    }

    const tableShell = tableShellRef.current as HTMLDivElement
    tableShell.scrollTo({
      top: targetIndex * virtualRowHeight,
    })
  }

  const jumpToKeyAndClose = (key: string) => {
    jumpToKey(key)
    setQuickJumpPanelOpen(false)
  }

  const selectSong = (songId: number, extendSelection: boolean, rangeSelection: boolean) => {
    if (!extendSelection && !rangeSelection) {
      setSelectedSongIds(new Set([songId]))
      setSelectionAnchorSongId(songId)
      return
    }

    if (rangeSelection && selectionAnchorSongId != null) {
      const anchorIndex = queueSongIds.indexOf(selectionAnchorSongId)
      const targetIndex = queueSongIds.indexOf(songId)
      const [startIndex, endIndex] = anchorIndex < targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex]
      setSelectedSongIds(new Set(queueSongIds.slice(startIndex, endIndex + 1)))
      return
    }

    setSelectedSongIds((current) => {
      const next = new Set(current)
      if (next.has(songId)) {
        next.delete(songId)
      } else {
        next.add(songId)
      }
      return next
    })
    setSelectionAnchorSongId(songId)
  }

  useEffect(() => {
    const updateLayout = () => {
      setIsCompactLayout(window.innerWidth < COMPACT_LIBRARY_BREAKPOINT)
      const tableShell = tableShellRef.current
      if (!tableShell) {
        return
      }

      const nextViewportSize = {
        height: tableShell.clientHeight,
        width: tableShell.clientWidth,
      }
      setViewportSize((current) => (
        current.height === nextViewportSize.height && current.width === nextViewportSize.width
          ? current
          : nextViewportSize
      ))
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => {
      window.removeEventListener('resize', updateLayout)
    }
  }, [hasSongs])

  useEffect(() => {
    const toggleQuickJumpPanel = () => {
      setQuickJumpPanelOpen((current) => !current)
    }
    const closeQuickJumpPanel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickJumpPanelOpen(false)
      }
    }

    window.addEventListener('smplayer:library-quick-jump-toggle', toggleQuickJumpPanel)
    window.addEventListener('keydown', closeQuickJumpPanel)
    return () => {
      window.removeEventListener('smplayer:library-quick-jump-toggle', toggleQuickJumpPanel)
      window.removeEventListener('keydown', closeQuickJumpPanel)
    }
  }, [])

  useEffect(() => {
    if (!isCompactLayout) {
      setQuickJumpPanelOpen(false)
    }
  }, [isCompactLayout])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('smplayer:library-quick-jump-open-change', {
      detail: isCompactLayout && quickJumpPanelOpen,
    }))

    return () => {
      window.dispatchEvent(new CustomEvent('smplayer:library-quick-jump-open-change', { detail: false }))
    }
  }, [isCompactLayout, quickJumpPanelOpen])

  return (
    <section className="page-panel library-page">
      {error ? <div className="error-banner">{error}</div> : null}

      {!hasSongs ? (
        loading || scanning ? (
          <LoadingState t={t} />
        ) : (
        <div className="empty-state">
          <h3>
            {hasLibrary
              ? t('library.noSearchMatch', { query: searchQuery })
              : t('library.scanToBegin')}
          </h3>
          <p>
            {hasLibrary
              ? t('library.tryAnotherSearch')
              : t('library.scanHelp')}
          </p>
        </div>
        )
      ) : (
        <>
          {isCompactLayout && quickJumpPanelOpen ? (
            <div className="library-quick-jump-panel" role="dialog" aria-label="#-Z">
              <div className="library-quick-jump-panel-header">
                <strong>#-Z</strong>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  title={t('common.close')}
                  onClick={() => {
                    setQuickJumpPanelOpen(false)
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="library-quick-jump-grid">
                {quickJumpKeys.map((key) => {
                  const enabled = quickJumpMap.has(key)

                  return (
                    <button
                      key={key}
                      type="button"
                      className={clsx({ 'is-active': activeQuickJumpKey === key })}
                      disabled={!enabled}
                      title={getQuickJumpTooltip(key, enabled, t('common.songs'), quickJumpBasisName, t)}
                      onClick={() => {
                        jumpToKeyAndClose(key)
                      }}
                    >
                      {key}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        <div className={clsx('library-content-shell', { 'is-compact': isCompactLayout })}>
          <nav className="library-quick-jump" aria-label={t('common.search')}>
            {quickJumpKeys.map((key) => {
              const enabled = quickJumpMap.has(key)

              return (
                <button
                  key={key}
                  type="button"
                  className={clsx({ 'is-active': activeQuickJumpKey === key })}
                  disabled={!enabled}
                  title={getQuickJumpTooltip(key, enabled, t('common.songs'), quickJumpBasisName, t)}
                  onClick={() => {
                    jumpToKey(key)
                  }}
                >
                  {key}
                </button>
              )
            })}
          </nav>
          <div
            className="table-shell library-table-shell"
            ref={tableShellRef}
            onWheel={(event) => {
              const horizontalDelta = event.shiftKey ? event.deltaY : event.deltaX
              if (horizontalDelta === 0) {
                return
              }

              event.currentTarget.scrollLeft += horizontalDelta
              event.preventDefault()
            }}
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop)
            }}
          >
          <table className="music-table" style={{ width: tableWidth }}>
            {isCompactLayout ? (
              <caption className="library-compact-sort-bar">
                {compactSortOptions.map(({ column, label }) => {
                  const direction = sortState.column === column ? sortState.direction : null

                  return (
                    <button
                      key={column}
                      type="button"
                      className={clsx('library-compact-sort-button', { 'is-sorted': direction })}
                      onClick={() => {
                        toggleSort(column)
                      }}
                    >
                      <span>{label}</span>
                      {direction ? (
                        <Icon name={direction === 'ascending' ? 'chevronUp' : 'chevronDown'} />
                      ) : null}
                    </button>
                  )
                })}
              </caption>
            ) : null}
            <colgroup>
              {(Object.keys(columnWidths) as LibrarySortColumn[]).map((column) => (
                <col key={column} style={{ width: columnWidths[column] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <ResizableHeader column="artwork" onResize={resizeColumn}>
                  {''}
                </ResizableHeader>
                <SortableHeader column="title" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('musicLibrary.titleHeader')}
                </SortableHeader>
                <SortableHeader column="artist" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.artist')}
                </SortableHeader>
                <SortableHeader column="album" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.album')}
                </SortableHeader>
                <SortableHeader column="duration" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.duration')}
                </SortableHeader>
                <ResizableHeader column="favorite" onResize={resizeColumn}>
                  {t('table.favorite')}
                </ResizableHeader>
                <SortableHeader column="playCount" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.playCount')}
                </SortableHeader>
                <SortableHeader column="dateAdded" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.dateAdded')}
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {topSpacerHeight > 0 ? (
                <tr className="virtual-spacer-row">
                  <td colSpan={8} style={{ height: topSpacerHeight }} />
                </tr>
              ) : null}
              {renderedSongs.map((song) => {
                const isCurrent = song.id === selectedTrackId
                const artistLabel = getDisplayArtists(song)
                const artists = getSongArtists(song)
                const albumLabel = song.album || t('common.albumUnknown')
                const durationLabel = formatDuration(song.duration)
                const playCountLabel = song.playCount ? String(song.playCount) : ''
                const dateAddedLabel = formatDateTime(song.dateAdded)

                return (
                  <tr
                    key={song.id}
                    className={clsx({
                      'is-current': isCurrent,
                      'is-playing': isCurrent && isPlaying,
                      'is-selected': selectedSongIds.has(song.id),
                    })}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.shiftKey) {
                        selectSong(song.id, event.ctrlKey || event.metaKey, event.shiftKey)
                        return
                      }

                      setSelectedSongIds(new Set([song.id]))
                      setSelectionAnchorSongId(song.id)
                    }}
                    onDoubleClick={() => {
                      onAddNextAndPlay(song.id)
                    }}
                    onContextMenu={(event) => {
                      if (readOnly) {
                        return
                      }

                      event.preventDefault()
                      const selectedIds = selectedSongIds.has(song.id)
                        ? effectiveSelectedSongIds
                        : [song.id]
                      if (selectedIds.length > 1) {
                        setContextMenu(null)
                        setSelectedSongIds(new Set(selectedIds))
                        setSelectionMenu({ x: event.clientX, y: event.clientY })
                        return
                      }

                      setSelectionMenu(null)
                      setContextMenu({
                        song,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }}
                  >
                    <td className="library-artwork-cell">
                      <LibraryRowArtwork
                        song={song}
                        t={t}
                        current={isCurrent}
                        isPlaying={isCurrent && isPlaying}
                        onPlay={() => {
                          if (isCurrent) {
                            onTogglePlayPause()
                          } else {
                            onAddNextAndPlay(song.id)
                          }
                        }}
                        resolveArtwork={resolveArtwork}
                      />
                    </td>
                    <td className="library-title-cell" title={song.title}>
                      <div className="cell-title">
                        <span className="song-name">{song.title}</span>
                      </div>
                    </td>
                    <td className="library-artist-cell" title={artistLabel}>
                      <div className="music-table-cell-content">
                        {artists.map((artist, index) => (
                          <span key={artist}>
                            {index > 0 ? ', ' : null}
                            <Link
                              className="table-link"
                              title={artist}
                              to={`/artists/${encodeURIComponent(artist)}`}
                              onClick={(event) => {
                                event.stopPropagation()
                              }}
                            >
                              {artist}
                            </Link>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="library-album-cell" title={albumLabel}>
                      <div className="music-table-cell-content">
                        <Link
                          className="table-link"
                          title={albumLabel}
                          to={`/albums/${encodeURIComponent(albumLabel)}`}
                          onClick={(event) => {
                            event.stopPropagation()
                          }}
                        >
                          {albumLabel}
                        </Link>
                      </div>
                    </td>
                    <td className="library-duration-cell" title={durationLabel}>
                      <span className="music-table-cell-content">{durationLabel}</span>
                    </td>
                    <td className="library-favorite-cell" title={song.favorite ? t('common.favorite') : ''}>
                      {song.favorite && !readOnly ? (
                        <button
                          type="button"
                          className="favorite-icon-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleFavorite(song.id, false)
                          }}
                          aria-label={t('common.favorite')}
                        >
                          <Icon name="heartFilled" />
                        </button>
                      ) : null}
                    </td>
                    <td className="library-play-count-cell" title={playCountLabel}>
                      <span className="music-table-cell-content">{playCountLabel}</span>
                    </td>
                    <td className="library-date-cell" title={dateAddedLabel}>
                      <span className="music-table-cell-content">{dateAddedLabel}</span>
                    </td>
                  </tr>
                )
              })}
              {bottomSpacerHeight > 0 ? (
                <tr className="virtual-spacer-row">
                  <td colSpan={8} style={{ height: bottomSpacerHeight }} />
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
        </>
      )}

      {contextMenu ? (
        <MusicMenuFlyout
          menu={contextMenu}
          playlists={snapshot.playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => {
            setContextMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          showSelect={false}
        />
      ) : null}
      {selectionMenu ? (
        <MenuFlyout
          position={selectionMenu}
          onClose={() => {
            setSelectionMenu(null)
          }}
          items={[
            {
              key: 'shuffle',
              text: t('nowPlaying.randomPlay'),
              icon: 'shuffle',
              onClick: () => {
                const shuffledSongIds = shuffleSongIds(effectiveSelectedSongIds)
                if (shuffledSongIds.length > 0) {
                  onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
                }
              },
            } satisfies MenuFlyoutItem,
            getAddToPlaylistMenuFlyoutItem({
              playlists: customPlaylists,
              songIds: effectiveSelectedSongIds,
              t,
              includeNowPlaying: true,
              includeFavorites: effectiveSelectedSongIds.some((songId) => !favoriteSongIdSet.has(songId)),
              defaultPlaylistName: t('common.songs'),
              onAddToNowPlaying: () => {
                onAddSongsToNowPlaying(effectiveSelectedSongIds)
              },
              onToggleFavorite: () => {
                addSongsToFavorites(effectiveSelectedSongIds.filter((songId) => !favoriteSongIdSet.has(songId)))
              },
              onCreatePlaylist: (name) => {
                onCreatePlaylistWithSongs(name, effectiveSelectedSongIds)
              },
              onAddToPlaylist: (playlistId) => {
                onAddSongsToPlaylist(playlistId, effectiveSelectedSongIds)
              },
            }),
          ].filter((item) => item != null)}
        />
      ) : null}
    </section>
  )
}

function LibraryRowArtwork({
  song,
  t,
  current,
  isPlaying,
  onPlay,
  resolveArtwork,
}: {
  song: LibrarySong
  t: Translator
  current: boolean
  isPlaying: boolean
  onPlay: () => void
  resolveArtwork: boolean
}) {
  const resolved = useSongArtwork(resolveArtwork ? song.id : null, song.artworkUrl)
  const artworkUrl = resolveArtwork ? resolved.artworkUrl : song.artworkUrl
  const refreshArtwork = resolveArtwork ? resolved.refreshArtwork : undefined

  return (
    <span className="library-row-artwork-wrap">
      <ArtworkImage
        className="library-row-artwork"
        src={artworkUrl}
        title={song.title}
        onError={refreshArtwork}
        renderFallback={() => (
          <span className="library-row-artwork library-row-artwork-fallback" aria-hidden="true">
            <DefaultAlbumArtwork className="library-row-artwork-fallback-image" />
          </span>
        )}
      />
      {current ? (
        <span className="playlist-control-item-playing-wave library-row-playing-wave" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : null}
      <button
        type="button"
        className="library-row-artwork-play"
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

function shuffleSongIds(songIds: number[]) {
  const shuffled = songIds.slice()
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[targetIndex]
    shuffled[targetIndex] = current
  }
  return shuffled
}

function SortableHeader({
  children,
  column,
  sortState,
  onSort,
  onResize,
}: {
  children: string
  column: LibrarySortableColumn
  sortState: LibrarySortState | null
  onSort: (column: LibrarySortableColumn) => void
  onResize: (column: LibrarySortColumn, deltaX: number) => void
}) {
  const direction = sortState?.column === column ? sortState.direction : null

  return (
    <th className={clsx({ 'is-sorted': direction })}>
      <button
        type="button"
        className="table-sort-button"
        onClick={() => {
          onSort(column)
        }}
      >
        <span>{children}</span>
        {direction ? (
          <span className="table-sort-indicator">
            <Icon name={direction === 'ascending' ? 'chevronUp' : 'chevronDown'} />
          </span>
        ) : null}
      </button>
      <span
        className="table-column-resizer"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const startX = event.clientX
          let lastDelta = 0

          const onPointerMove = (moveEvent: PointerEvent) => {
            const nextDelta = moveEvent.clientX - startX
            onResize(column, nextDelta - lastDelta)
            lastDelta = nextDelta
          }
          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
          }

          window.addEventListener('pointermove', onPointerMove)
          window.addEventListener('pointerup', onPointerUp)
        }}
      />
    </th>
  )
}

function ResizableHeader({
  children,
  column,
  onResize,
}: {
  children: string
  column: LibrarySortColumn
  onResize: (column: LibrarySortColumn, deltaX: number) => void
}) {
  return (
    <th>
      <span className="table-sort-button">
        <span>{children}</span>
      </span>
      <ColumnResizer column={column} onResize={onResize} />
    </th>
  )
}

function ColumnResizer({
  column,
  onResize,
}: {
  column: LibrarySortColumn
  onResize: (column: LibrarySortColumn, deltaX: number) => void
}) {
  return (
    <span
      className="table-column-resizer"
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const startX = event.clientX
        let lastDelta = 0

        const onPointerMove = (moveEvent: PointerEvent) => {
          const nextDelta = moveEvent.clientX - startX
          onResize(column, nextDelta - lastDelta)
          lastDelta = nextDelta
        }
        const onPointerUp = () => {
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerUp)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
      }}
    />
  )
}

function sortSongsByColumn(songs: LibrarySong[], sortState: LibrarySortState) {
  const direction = sortState.direction === 'ascending' ? 1 : -1

  return songs.slice().sort((left, right) => {
    const result = compareSongs(left, right, sortState.column)
    return direction * (result || compareText(left.title, right.title) || left.id - right.id)
  })
}

function toLibrarySortColumn(criterion: MusicLibrarySortCriterion): LibrarySortableColumn {
  switch (criterion) {
    case 'play-count':
      return 'playCount'
    case 'date-added':
      return 'dateAdded'
    default:
      return criterion
  }
}

function toMusicLibrarySortCriterion(column: LibrarySortableColumn): MusicLibrarySortCriterion {
  switch (column) {
    case 'playCount':
      return 'play-count'
    case 'dateAdded':
      return 'date-added'
    default:
      return column
  }
}

function getLibraryQuickJumpBasisName(column: LibrarySortColumn, t: Translator) {
  switch (column) {
    case 'artist':
      return t('common.artist')
    case 'album':
      return t('common.album')
    case 'duration':
      return t('common.duration')
    case 'playCount':
      return t('common.playCount')
    case 'dateAdded':
      return t('common.dateAdded')
    case 'artwork':
    case 'favorite':
    case 'title':
      return t('musicLibrary.titleHeader')
  }
}

function buildQuickJumpMap(songs: LibrarySong[], column: LibrarySortColumn) {
  const indexes = new Map<string, number>()

  songs.forEach((song, index) => {
    const bucket = getQuickJumpBucket(song, column)
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

function getQuickJumpBucket(song: LibrarySong | undefined, column: LibrarySortColumn) {
  return getLocalTextQuickJumpBucket(getQuickJumpValue(song, column))
}

function getQuickJumpValue(song: LibrarySong | undefined, column: LibrarySortColumn) {
  if (!song) {
    return ''
  }

  switch (column) {
    case 'artist':
      return getDisplayArtists(song)
    case 'album':
      return song.album
    case 'duration':
      return formatDuration(song.duration)
    case 'favorite':
      return song.favorite ? 'Favorite' : ''
    case 'playCount':
      return String(song.playCount)
    case 'dateAdded':
      return formatDateTime(song.dateAdded)
    default:
      return song.title
  }
}

function compareSongs(left: LibrarySong, right: LibrarySong, column: LibrarySortColumn) {
  switch (column) {
    case 'artist':
      return compareText(getDisplayArtists(left), getDisplayArtists(right))
    case 'album':
      return compareText(left.album, right.album)
    case 'duration':
      return left.duration - right.duration
    case 'favorite':
      return Number(left.favorite) - Number(right.favorite)
    case 'playCount':
      return left.playCount - right.playCount
    case 'dateAdded':
      return Date.parse(left.dateAdded) - Date.parse(right.dateAdded)
    default:
      return compareText(left.title, right.title)
  }
}

function compareText(left: string, right: string) {
  return compareLocalText(left, right)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
