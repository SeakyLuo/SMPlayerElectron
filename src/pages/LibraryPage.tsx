import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useRef } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '../components/icons'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import type { AppSettingsUpdate, LibrarySnapshot, LibrarySong } from '../shared/contracts'
import { getDisplayArtists, getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

interface LibraryPageProps {
  snapshot: LibrarySnapshot
  t: Translator
  songs: LibrarySong[]
  loading: boolean
  scanning: boolean
  error: string | null
  selectedTrackId: number | null
  searchQuery: string
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onUpdateSettings: (update: AppSettingsUpdate) => void
}

type LibrarySortColumn = 'title' | 'artist' | 'album' | 'duration' | 'favorite' | 'playCount' | 'dateAdded'
type LibrarySortDirection = 'ascending' | 'descending'

interface LibrarySortState {
  column: LibrarySortColumn
  direction: LibrarySortDirection
}

type ColumnWidths = Record<LibrarySortColumn, number>

const VIRTUAL_ROW_HEIGHT = 58
const VIRTUAL_OVERSCAN_ROWS = 12
const MIN_COLUMN_WIDTH = 86
const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  title: 280,
  artist: 200,
  album: 240,
  duration: 110,
  favorite: 96,
  playCount: 120,
  dateAdded: 170,
}

export function LibraryPage({
  snapshot,
  t,
  songs,
  error,
  selectedTrackId,
  searchQuery,
  onPlayTrack,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onRevealSong,
  onDeleteSongFromDisk,
}: LibraryPageProps) {
  const hasSongs = songs.length > 0
  const hasLibrary = snapshot.songs.length > 0
  const [sortState, setSortState] = useState<LibrarySortState | null>(null)
  const visibleSongs = useMemo(
    () => sortState ? sortSongsByColumn(songs, sortState) : songs,
    [songs, sortState],
  )
  const tableShellRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const visibleStartIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS)
  const visibleEndIndex = Math.min(
    visibleSongs.length,
    Math.ceil((scrollTop + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS,
  )
  const renderedSongs = visibleSongs.slice(visibleStartIndex, visibleEndIndex)
  const topSpacerHeight = visibleStartIndex * VIRTUAL_ROW_HEIGHT
  const bottomSpacerHeight = (visibleSongs.length - visibleEndIndex) * VIRTUAL_ROW_HEIGHT
  const queueSongIds = useMemo(() => visibleSongs.map((song) => song.id), [visibleSongs])
  const tableWidth = Object.values(columnWidths).reduce((total, width) => total + width, 0)

  const toggleSort = (column: LibrarySortColumn) => {
    setSortState((current) => {
      if (current?.column !== column) {
        return { column, direction: 'ascending' }
      }

      if (current.direction === 'ascending') {
        return { column, direction: 'descending' }
      }

      return null
    })
  }

  const resizeColumn = (column: LibrarySortColumn, deltaX: number) => {
    setColumnWidths((current) => ({
      ...current,
      [column]: Math.max(MIN_COLUMN_WIDTH, current[column] + deltaX),
    }))
  }

  useEffect(() => {
    const tableShell = tableShellRef.current
    if (!tableShell) {
      return
    }

    const updateViewportHeight = () => {
      setViewportHeight(tableShell.clientHeight)
    }
    const resizeObserver = new ResizeObserver(updateViewportHeight)
    updateViewportHeight()
    resizeObserver.observe(tableShell)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <section className="page-panel library-page">
      {error ? <div className="error-banner">{error}</div> : null}

      {!hasSongs ? (
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
      ) : (
        <div
          className="table-shell library-table-shell"
          ref={tableShellRef}
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop)
          }}
        >
          <table className="music-table" style={{ width: tableWidth }}>
            <colgroup>
              {(Object.keys(columnWidths) as LibrarySortColumn[]).map((column) => (
                <col key={column} style={{ width: columnWidths[column] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <SortableHeader column="title" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.name')}
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
                <SortableHeader column="favorite" sortState={sortState} onSort={toggleSort} onResize={resizeColumn}>
                  {t('common.favorite')}
                </SortableHeader>
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
                  <td colSpan={7} style={{ height: topSpacerHeight }} />
                </tr>
              ) : null}
              {renderedSongs.map((song) => {
                const isCurrent = song.id === selectedTrackId
                const artistLabel = getDisplayArtists(song)
                const albumLabel = song.album || t('common.albumUnknown')
                const durationLabel = formatDuration(song.duration)
                const playCountLabel = song.playCount ? String(song.playCount) : ''
                const dateAddedLabel = formatDateTime(song.dateAdded)

                return (
                  <tr
                    key={song.id}
                    className={clsx({ 'is-current': isCurrent })}
                    onClick={() => {
                      void onPlayTrack(song.id, queueSongIds)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setContextMenu({
                        song,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }}
                  >
                    <td title={song.title}>
                      <div className="cell-title">
                        {isCurrent ? (
                          <span className="play-indicator">
                            <Icon name="play" />
                          </span>
                        ) : null}
                        <span className="song-name">{song.title}</span>
                      </div>
                    </td>
                    <td title={artistLabel}>
                      <div className="music-table-cell-content">
                        {getSongArtists(song).map((artist, index) => (
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
                    <td title={albumLabel}>
                      <div className="music-table-cell-content">
                        <Link
                          className="table-link"
                          title={albumLabel}
                          to={`/albums/${encodeURIComponent(song.album || 'Unknown album')}`}
                          onClick={(event) => {
                            event.stopPropagation()
                          }}
                        >
                          {albumLabel}
                        </Link>
                      </div>
                    </td>
                    <td title={durationLabel}>
                      <span className="music-table-cell-content">{durationLabel}</span>
                    </td>
                    <td title={song.favorite ? t('common.favorite') : ''}>
                      {song.favorite ? (
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
                    <td title={playCountLabel}>
                      <span className="music-table-cell-content">{playCountLabel}</span>
                    </td>
                    <td title={dateAddedLabel}>
                      <span className="music-table-cell-content">{dateAddedLabel}</span>
                    </td>
                  </tr>
                )
              })}
              {bottomSpacerHeight > 0 ? (
                <tr className="virtual-spacer-row">
                  <td colSpan={7} style={{ height: bottomSpacerHeight }} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {contextMenu ? (
        <MusicMenuFlyout
          menu={contextMenu}
          playlists={snapshot.playlists}
          queueSongIds={queueSongIds}
          t={t}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => {
            setContextMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
        />
      ) : null}
    </section>
  )
}

function SortableHeader({
  children,
  column,
  sortState,
  onSort,
  onResize,
}: {
  children: string
  column: LibrarySortColumn
  sortState: LibrarySortState | null
  onSort: (column: LibrarySortColumn) => void
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

function sortSongsByColumn(songs: LibrarySong[], sortState: LibrarySortState) {
  const direction = sortState.direction === 'ascending' ? 1 : -1

  return songs.slice().sort((left, right) => {
    const result = compareSongs(left, right, sortState.column)
    return direction * (result || compareText(left.title, right.title) || left.id - right.id)
  })
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
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
