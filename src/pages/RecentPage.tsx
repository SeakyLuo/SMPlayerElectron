import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getMusicMenuFlyoutItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { getDisplayArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, RecentLibrarySong, SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

type RecentTab = 'added' | 'played' | 'searches'

interface RecentPageProps {
  songs: LibrarySong[]
  recentSongs: RecentLibrarySong[]
  recentSearches: SearchHistoryEntry[]
  playlists: LibraryPlaylist[]
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  showCount: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRevealSong: (songPath: string) => void
  onDeleteSongFromDisk: (songId: number) => void
  onRemoveRecentPlayed: (songIds: number[]) => void
  onClearRecentPlayed: () => void
  onRemoveRecentSearches: (entryIds: number[]) => void
  onClearRecentSearches: () => void
  onSearch: (query: string) => void
}

interface RecentSongMenuState {
  song: LibrarySong
  x: number
  y: number
  canRemove: boolean
}

const RECENT_ADDED_LIMIT = 500
const RECENT_GRID_MIN_COLUMN_WIDTH = 238
const RECENT_GRID_COLUMN_GAP = 34
const RECENT_GRID_ROW_HEIGHT = 140
const RECENT_GRID_BOTTOM_PADDING = 92
const RECENT_GRID_OVERSCAN_ROWS = 3
const RECENT_SEARCH_ROW_HEIGHT = 50
const RECENT_SEARCH_BOTTOM_PADDING = 92
const RECENT_SEARCH_OVERSCAN_ROWS = 8

export function RecentPage({
  songs,
  recentSongs,
  recentSearches,
  playlists,
  t,
  selectedTrackId,
  isPlaying,
  showCount,
  onPlayTrack,
  onTogglePlayPause,
  onPlayNext,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onToggleFavorite,
  onRevealSong,
  onDeleteSongFromDisk,
  onRemoveRecentPlayed,
  onClearRecentPlayed,
  onRemoveRecentSearches,
  onClearRecentSearches,
  onSearch,
}: RecentPageProps) {
  const [activeTab, setActiveTab] = useState<RecentTab>('added')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set())
  const [songMenu, setSongMenu] = useState<RecentSongMenuState | null>(null)
  const navigate = useNavigate()
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const recentAddedSongs = useMemo(
    () => songs.slice().sort((left, right) => dateValue(right.dateAdded) - dateValue(left.dateAdded)).slice(0, RECENT_ADDED_LIMIT),
    [songs],
  )
  const visibleSongs = activeTab === 'added' ? recentAddedSongs : recentSongs
  const queueSongIds = visibleSongs.map((song) => song.id)
  const selectedVisibleSongIds = visibleSongs.filter((song) => selectedSongIds.has(song.id)).map((song) => song.id)
  const selectedVisibleSearchIds = recentSearches.filter((entry) => selectedSearchIds.has(entry.id)).map((entry) => entry.id)
  const selectedCount = activeTab === 'searches' ? selectedVisibleSearchIds.length : selectedVisibleSongIds.length
  const canClearHistory = activeTab === 'played' ? recentSongs.length > 0 : recentSearches.length > 0

  const clearSelection = () => {
    setSelectedSongIds(new Set())
    setSelectedSearchIds(new Set())
  }

  const switchTab = (tab: RecentTab) => {
    setActiveTab(tab)
    setMultiSelect(false)
    clearSelection()
  }

  const toggleSongSelection = (songId: number) => {
    setSelectedSongIds((current) => toggleSetItem(current, songId))
  }

  const toggleSearchSelection = (entryId: number) => {
    setSelectedSearchIds((current) => toggleSetItem(current, entryId))
  }

  const playSelected = () => {
    onPlayTrack(selectedVisibleSongIds[0]!, selectedVisibleSongIds)
  }

  const reverseSelection = () => {
    if (activeTab === 'searches') {
      setSelectedSearchIds((current) => new Set(recentSearches.filter((entry) => !current.has(entry.id)).map((entry) => entry.id)))
      return
    }

    setSelectedSongIds((current) => new Set(visibleSongs.filter((song) => !current.has(song.id)).map((song) => song.id)))
  }

  const selectAll = () => {
    if (activeTab === 'searches') {
      setSelectedSearchIds(new Set(recentSearches.map((entry) => entry.id)))
      return
    }

    setSelectedSongIds(new Set(visibleSongs.map((song) => song.id)))
  }

  const removeSelected = () => {
    if (activeTab === 'played') {
      onRemoveRecentPlayed(selectedVisibleSongIds)
    } else {
      onRemoveRecentSearches(selectedVisibleSearchIds)
    }
    clearSelection()
  }

  return (
    <section className="recent-page page-panel">
      <div className="recent-tabs search-result-tabs">
        <RecentTabButton
          active={activeTab === 'added'}
          count={recentAddedSongs.length}
          label={t('recent.added')}
          showCount={showCount}
          onClick={() => {
            switchTab('added')
          }}
        />
        <RecentTabButton
          active={activeTab === 'played'}
          count={recentSongs.length}
          label={t('recent.played')}
          showCount={showCount}
          onClick={() => {
            switchTab('played')
          }}
        />
        <RecentTabButton
          active={activeTab === 'searches'}
          count={recentSearches.length}
          label={t('recent.searches')}
          showCount={showCount}
          onClick={() => {
            switchTab('searches')
          }}
        />
      </div>

      <header className="recent-commandbar">
        <div className="recent-command-actions">
          <button
            type="button"
            className={clsx('now-playing-command', { 'is-active': multiSelect })}
            disabled={activeTab === 'searches' ? recentSearches.length === 0 : visibleSongs.length === 0}
            onClick={() => {
              setMultiSelect((current) => !current)
              clearSelection()
            }}
          >
            <Icon name="menu" />
            {t('albums.multiSelect')}
          </button>
          {activeTab === 'played' || activeTab === 'searches' ? (
            <button
              type="button"
              className="now-playing-command"
              disabled={!canClearHistory}
              onClick={activeTab === 'played' ? onClearRecentPlayed : onClearRecentSearches}
            >
              <Icon name="clearSelection" />
              {t('recent.clearHistory')}
            </button>
          ) : null}
        </div>
      </header>

      {activeTab === 'searches' ? (
        <RecentSearchList
          entries={recentSearches}
          multiSelect={multiSelect}
          selectedEntryIds={selectedSearchIds}
          t={t}
          onSearch={onSearch}
          onToggleSelection={toggleSearchSelection}
          onRemove={(entryId) => {
            onRemoveRecentSearches([entryId])
          }}
        />
      ) : (
        <RecentSongGrid
          songs={visibleSongs}
          queueSongIds={queueSongIds}
          selectedSongIds={selectedSongIds}
          multiSelect={multiSelect}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          canRemove={activeTab === 'played'}
          t={t}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onToggleSelection={toggleSongSelection}
          onOpenMenu={setSongMenu}
        />
      )}

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedCount}
        t={t}
        playlists={customPlaylists}
        showPlay={activeTab !== 'searches'}
        showAddTo={activeTab !== 'searches'}
        removeLabel={t('context.removeFromList')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedVisibleSongIds)
        }}
        onRemove={activeTab === 'added' ? undefined : removeSelected}
        onSelectAll={selectAll}
        onReverseSelection={reverseSelection}
        onClearSelection={clearSelection}
        onCancel={() => {
          setMultiSelect(false)
          clearSelection()
        }}
      />

      {songMenu ? (
        <MenuFlyout
          position={songMenu}
          onClose={() => {
            setSongMenu(null)
          }}
          items={getMusicMenuFlyoutItems({
            song: songMenu.song,
            option: {
              showRemove: songMenu.canRemove,
              showSelect: true,
            },
            playlists,
            queueSongIds,
            currentTrackId: selectedTrackId,
            isPlaying,
            t,
            onPlay: () => {
              onPlayTrack(songMenu.song.id, queueSongIds)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id)
            },
            onAddToPlaylist: (playlistId) => {
              onAddSongToPlaylist(playlistId, songMenu.song.id)
            },
            onRemove: () => {
              onRemoveRecentPlayed([songMenu.song.id])
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedSongIds(new Set([songMenu.song.id]))
            },
            onToggleFavorite: () => {
              onToggleFavorite(songMenu.song.id, !songMenu.song.favorite)
            },
            onReveal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              onDeleteSongFromDisk(songMenu.song.id)
            },
            onSeeArtist: () => {
              navigate(`/artists/${encodeURIComponent(songMenu.song.artists[0] || songMenu.song.artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
            },
            onSeeMusicInfo: () => {
              navigate('/now-playing?full=1&panel=info')
            },
            onSeeLyrics: () => {
              navigate('/now-playing?full=1&panel=lyrics')
            },
            onSeeAlbumArt: () => {
              navigate('/now-playing?full=1&panel=album-art')
            },
          })}
        />
      ) : null}
    </section>
  )
}

function RecentTabButton({
  active,
  count,
  label,
  showCount,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  showCount: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
      <span>{label}</span>
      {showCount ? <strong>{count}</strong> : null}
    </button>
  )
}

function RecentSongGrid({
  songs,
  queueSongIds,
  selectedSongIds,
  multiSelect,
  selectedTrackId,
  isPlaying,
  canRemove,
  t,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onOpenMenu,
}: {
  songs: LibrarySong[]
  queueSongIds: number[]
  selectedSongIds: Set<number>
  multiSelect: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  canRemove: boolean
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSelection: (songId: number) => void
  onOpenMenu: (menu: RecentSongMenuState) => void
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const [gridWidth, setGridWidth] = useState(960)
  const columnCount = Math.max(
    1,
    Math.floor((gridWidth + RECENT_GRID_COLUMN_GAP) / (RECENT_GRID_MIN_COLUMN_WIDTH + RECENT_GRID_COLUMN_GAP)),
  )
  const rowCount = Math.ceil(songs.length / columnCount)
  const listHeight = rowCount * RECENT_GRID_ROW_HEIGHT
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startRow = Math.max(
    0,
    Math.floor(effectiveScrollTop / RECENT_GRID_ROW_HEIGHT) - RECENT_GRID_OVERSCAN_ROWS,
  )
  const endRow = Math.min(
    rowCount,
    Math.ceil((effectiveScrollTop + viewportHeight) / RECENT_GRID_ROW_HEIGHT) + RECENT_GRID_OVERSCAN_ROWS,
  )
  const renderedSongs = songs.slice(startRow * columnCount, endRow * columnCount)
  const windowTop = startRow * RECENT_GRID_ROW_HEIGHT

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(grid.clientHeight)
      setGridWidth(grid.clientWidth)
    })

    setViewportHeight(grid.clientHeight)
    setGridWidth(grid.clientWidth)
    resizeObserver.observe(grid)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  if (songs.length === 0) {
    return (
      <div className="empty-state compact">
        <h3>{t('recent.empty')}</h3>
      </div>
    )
  }

  return (
    <div
      className="recent-grid-shell"
      ref={gridRef}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop)
      }}
    >
      <div className="recent-grid-virtual" style={{ height: listHeight + RECENT_GRID_BOTTOM_PADDING }}>
        <div
          className="recent-song-grid-window"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            transform: `translateY(${windowTop}px)`,
          }}
        >
      {renderedSongs.map((song) => (
        <button
          type="button"
          key={song.id}
          className={clsx('recent-song-tile', {
            'is-current': song.id === selectedTrackId,
            'is-playing': song.id === selectedTrackId && isPlaying,
            'is-selected': selectedSongIds.has(song.id),
            'is-selecting': multiSelect,
          })}
          onClick={() => {
            if (multiSelect) {
              onToggleSelection(song.id)
            } else {
              onPlayTrack(song.id, queueSongIds)
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            onOpenMenu({ song, x: event.clientX, y: event.clientY, canRemove })
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
                {selectedSongIds.has(song.id) ? <Icon name="check" /> : null}
              </span>
            ) : null}
            {song.id === selectedTrackId ? (
              <span
                className="recent-song-playing-mark"
                aria-label={isPlaying ? t('context.pause') : t('context.play')}
                onClick={(event) => {
                  event.stopPropagation()
                  onTogglePlayPause()
                }}
              >
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </span>
          <span className="recent-song-copy">
            <strong title={song.title}>{song.title}</strong>
            <span title={getDisplayArtists(song)}>{getDisplayArtists(song)}</span>
          </span>
        </button>
      ))}
        </div>
      </div>
    </div>
  )
}

function RecentSearchList({
  entries,
  multiSelect,
  selectedEntryIds,
  t,
  onSearch,
  onToggleSelection,
  onRemove,
}: {
  entries: SearchHistoryEntry[]
  multiSelect: boolean
  selectedEntryIds: Set<number>
  t: Translator
  onSearch: (query: string) => void
  onToggleSelection: (entryId: number) => void
  onRemove: (entryId: number) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const listHeight = entries.length * RECENT_SEARCH_ROW_HEIGHT
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / RECENT_SEARCH_ROW_HEIGHT) - RECENT_SEARCH_OVERSCAN_ROWS,
  )
  const endIndex = Math.min(
    entries.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / RECENT_SEARCH_ROW_HEIGHT) + RECENT_SEARCH_OVERSCAN_ROWS,
  )
  const renderedEntries = entries.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * RECENT_SEARCH_ROW_HEIGHT
  const bottomSpacerHeight = (entries.length - endIndex) * RECENT_SEARCH_ROW_HEIGHT + RECENT_SEARCH_BOTTOM_PADDING

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(list.clientHeight)
    })

    setViewportHeight(list.clientHeight)
    resizeObserver.observe(list)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  if (entries.length === 0) {
    return (
      <div className="empty-state compact">
        <h3>{t('recent.noSearches')}</h3>
      </div>
    )
  }

  return (
    <div
      className="recent-search-list"
      ref={listRef}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop)
      }}
    >
      {topSpacerHeight > 0 ? <div className="recent-search-spacer" style={{ height: topSpacerHeight }} /> : null}
      {renderedEntries.map((entry) => (
        <div
          className={clsx('recent-search-row', {
            'is-selected': selectedEntryIds.has(entry.id),
          })}
          key={entry.id}
        >
          <button
            type="button"
            className="recent-search-row-main"
            onClick={() => {
              if (multiSelect) {
                onToggleSelection(entry.id)
              } else {
                onSearch(entry.query)
              }
            }}
          >
            {multiSelect ? (
              <span className="playlist-control-item-selection-mark">
                {selectedEntryIds.has(entry.id) ? <Icon name="check" /> : null}
              </span>
            ) : null}
            <span>{entry.query}</span>
            {formatRecentSearchTime(entry.searchedAt, t) ? (
              <small>{formatRecentSearchTime(entry.searchedAt, t)}</small>
            ) : null}
          </button>
          {!multiSelect ? (
            <button
              type="button"
              className="recent-search-remove"
              aria-label={t('sidebar.removeRecentSearch', { query: entry.query })}
              onClick={() => {
                onRemove(entry.id)
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      ))}
      {bottomSpacerHeight > 0 ? <div className="recent-search-spacer" style={{ height: bottomSpacerHeight }} /> : null}
    </div>
  )
}

function toggleSetItem<T>(source: Set<T>, item: T) {
  const next = new Set(source)
  if (next.has(item)) {
    next.delete(item)
  } else {
    next.add(item)
  }
  return next
}

function dateValue(value: string) {
  return new Date(value).getTime()
}

function formatRecentSearchTime(value: string, t: Translator) {
  if (!value) {
    return ''
  }

  return new Date(value).toLocaleString(resolveDateLocale(t), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveDateLocale(t: Translator) {
  return t('common.search') === '搜索' ? 'zh-CN' : 'en-US'
}
