import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getMusicMenuFlyoutItems, type MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { MusicDialog } from '../components/MusicDialog'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, RecentLibrarySong, SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

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
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
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

interface RecentAddToMenuState {
  songIds: number[]
  defaultPlaylistName: string
  x: number
  y: number
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

const RECENT_ADDED_LIMIT = 500
const RECENT_GRID_MIN_COLUMN_WIDTH = 252
const RECENT_GRID_COLUMN_GAP = 28
const RECENT_GRID_ROW_HEIGHT = 136
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
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
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
  const [addToMenu, setAddToMenu] = useState<RecentAddToMenuState | null>(null)
  const [songDialog, setSongDialog] = useState<{ song: LibrarySong; mode: 'properties' | 'lyrics' | 'album-art' } | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [recentAddedTimelineLabel, setRecentAddedTimelineLabel] = useState('')
  const navigate = useNavigate()
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const refreshSongPreferenceItem = async (songId: number) => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
  }
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

  useEffect(() => {
    if (songMenu) {
      void refreshSongPreferenceItem(songMenu.song.id)
    }
  }, [songMenu?.song.id])

  const clearSelection = () => {
    setSelectedSongIds(new Set())
    setSelectedSearchIds(new Set())
  }

  const hideSelectionAfterOperation = () => {
    if (hideMultiSelectCommandBarAfterOperation) {
      setMultiSelect(false)
      clearSelection()
    }
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
        {activeTab === 'added' ? (
          <strong>{recentAddedTimelineLabel}</strong>
        ) : (
          <span className="recent-commandbar-spacer" />
        )}
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
          onTimelineLabelChange={activeTab === 'added' ? setRecentAddedTimelineLabel : undefined}
          onOpenAddToMenu={(menu) => {
            setSongMenu(null)
            setAddToMenu(menu)
          }}
          onOpenMenu={(menu) => {
            setAddToMenu(null)
            setSongMenu(menu)
          }}
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
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            songIds: selectedVisibleSongIds,
            defaultPlaylistName: activeTab === 'added' ? t('recent.added') : t('recent.played'),
            x: rect.left,
            y: rect.top - 8,
          })
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
            folders,
            queueSongIds,
            playbackSongIds: nowPlayingSongIds,
            currentTrackId: selectedTrackId,
            isPlaying,
            t,
            onPlay: () => {
              onMoveToMusicOrPlay(songMenu.song.id)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id)
            },
            onAddToNowPlaying: () => {
              const previousQueueSongIds = nowPlayingSongIds
              onAddSongsToNowPlaying([songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                replaceNowPlaying(previousQueueSongIds),
              )
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, [songMenu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongToPlaylist(playlistId, songMenu.song.id)
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: targetPlaylist.name }), () =>
                removeSongFromPlaylist(playlistId, songMenu.song.id),
              )
            },
            onRemove: () => {
              onRemoveRecentPlayed([songMenu.song.id])
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedSongIds(new Set([songMenu.song.id]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void window.smplayer?.removePreferenceItem(songPreferenceItem!.id).then(() => refreshSongPreferenceItem(songMenu.song.id))
            },
            onSetPreference: (level) => {
              void window.smplayer?.addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then(() => refreshSongPreferenceItem(songMenu.song.id))
            },
            onMoveToFolder: (folderPath) => {
              const originalFolderPath = getParentFolderPath(songMenu.song.path)
              void moveSongToFolder(songMenu.song.id, folderPath)
              showUndo(t('notification.movedSong', { title: songMenu.song.title }), () =>
                moveSongToFolder(songMenu.song.id, originalFolderPath),
              )
            },
            onToggleFavorite: () => {
              onToggleFavorite(songMenu.song.id, !songMenu.song.favorite)
              const target = t('common.myFavorites')
              showUndo(
                songMenu.song.favorite
                  ? t('notification.removedFrom', { title: songMenu.song.title, target })
                  : t('notification.songAddedTo', { title: songMenu.song.title, target }),
                () => setSongFavorite(songMenu.song.id, songMenu.song.favorite),
              )
            },
            onReveal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              if (window.confirm(t('context.deleteSongConfirm', { title: songMenu.song.title }))) {
                onDeleteSongFromDisk(songMenu.song.id)
              }
            },
            onHide: async () => {
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveRecentPlayed([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                const hiddenItems = await window.smplayer!.getHiddenStorageItems()
                const hiddenItem = hiddenItems.find((item) => item.path === songMenu.song.path)
                await window.smplayer!.resumeHiddenStorageItem(hiddenItem!)
                await refresh()
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists/${encodeURIComponent(artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
            },
            onSeeMusicInfo: () => {
              setSongDialog({ song: songMenu.song, mode: 'properties' })
              setSongMenu(null)
            },
            onSeeLyrics: () => {
              setSongDialog({ song: songMenu.song, mode: 'lyrics' })
              setSongMenu(null)
            },
            onSeeAlbumArt: () => {
              setSongDialog({ song: songMenu.song, mode: 'album-art' })
              setSongMenu(null)
            },
          })}
        />
      ) : null}
      {addToMenu ? (
        <MenuFlyout
          position={addToMenu}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={getRecentAddToMenuItems({
            songIds: addToMenu.songIds,
            defaultPlaylistName: addToMenu.defaultPlaylistName,
            playlists,
            t,
            onAddToNowPlaying: () => {
              const previousQueueSongIds = nowPlayingSongIds
              onAddSongsToNowPlaying(addToMenu.songIds)
              showUndo(
                addToMenu.songIds.length === 1
                  ? t('notification.songAddedTo', {
                      title: visibleSongs.find((song) => song.id === addToMenu.songIds[0])!.title,
                      target: t('common.nowPlaying'),
                    })
                  : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: t('common.nowPlaying') }),
                () => replaceNowPlaying(previousQueueSongIds),
              )
              hideSelectionAfterOperation()
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, addToMenu.songIds)
              hideSelectionAfterOperation()
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              if (addToMenu.songIds.length === 1) {
                onAddSongToPlaylist(playlistId, addToMenu.songIds[0]!)
              } else {
                onAddSongsToPlaylist(playlistId, addToMenu.songIds)
              }
              showUndo(
                addToMenu.songIds.length === 1
                  ? t('notification.songAddedTo', {
                      title: visibleSongs.find((song) => song.id === addToMenu.songIds[0])!.title,
                      target: targetPlaylist.name,
                    })
                  : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: targetPlaylist.name }),
                () => Promise.all(addToMenu.songIds.map((songId) => removeSongFromPlaylist(playlistId, songId))).then(() => undefined),
              )
              hideSelectionAfterOperation()
            },
          })}
        />
      ) : null}
      {songDialog ? (
        <MusicDialog
          song={songDialog.song}
          mode={songDialog.mode}
          t={t}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onClose={() => {
            setSongDialog(null)
          }}
          onSaved={refresh}
        />
      ) : null}
    </section>
  )
}

function getRecentAddToMenuItems({
  songIds,
  playlists,
  defaultPlaylistName,
  t,
  onAddToNowPlaying,
  onCreatePlaylist,
  onAddToPlaylist,
}: {
  songIds: number[]
  playlists: LibraryPlaylist[]
  defaultPlaylistName: string
  t: Translator
  onAddToNowPlaying: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
}): MenuFlyoutItem[] {
  const items: MenuFlyoutItem[] = [
    {
      key: 'recent-add-now-playing',
      text: t('common.nowPlaying'),
      icon: 'nowPlaying',
      onClick: onAddToNowPlaying,
    },
  ]
  const myFavorites = playlists.find((playlist) => playlist.isBuiltIn)
  if (songIds.some((songId) => !myFavorites!.songIds.includes(songId))) {
    items.push({
      key: 'recent-add-my-favorites',
      text: t('common.myFavorites'),
      icon: 'heart',
      onClick: () => {
        onAddToPlaylist(myFavorites!.id)
      },
    })
  }

  items.push({ key: 'recent-add-separator', text: '', separator: true })
  items.push({
    key: 'recent-add-new-playlist',
    text: t('playlists.newName'),
    icon: 'plus',
    onClick: () => {
      const name = window.prompt(t('playlists.newName'), defaultPlaylistName)
      const nextName = name?.trim()
      if (nextName) {
        onCreatePlaylist(nextName)
      }
    },
  })
  const customPlaylists = playlists.filter((playlist) => {
    if (playlist.isBuiltIn) {
      return false
    }
    if (songIds.length === 1) {
      return !playlist.songIds.includes(songIds[0]!)
    }
    return true
  })
  customPlaylists.forEach((playlist) => {
    items.push({
      key: `recent-add-playlist-${playlist.id}`,
      text: playlist.name,
      icon: 'playlists',
      onClick: () => {
        onAddToPlaylist(playlist.id)
      },
    })
  })

  return items
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
  onTimelineLabelChange,
  onOpenAddToMenu,
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
  onTimelineLabelChange?: (label: string) => void
  onOpenAddToMenu: (menu: RecentAddToMenuState) => void
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

  useEffect(() => {
    if (onTimelineLabelChange) {
      const topSong = songs[Math.min(startRow * columnCount, songs.length - 1)]
      onTimelineLabelChange(topSong ? categorizeRecentAddedDate(topSong.dateAdded, t) : '')
    }
  }, [columnCount, onTimelineLabelChange, songs, startRow, t])

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
            <GridViewMusicItemControl
              key={song.id}
              song={song}
              queueSongIds={queueSongIds}
              selected={selectedSongIds.has(song.id)}
              current={song.id === selectedTrackId}
              playing={song.id === selectedTrackId && isPlaying}
              multiSelect={multiSelect}
              t={t}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onToggleSelection={onToggleSelection}
              onAddToPlaylistClick={(event, menuSong) => {
                onOpenAddToMenu({ songIds: [menuSong.id], defaultPlaylistName: '', x: event.clientX, y: event.clientY })
              }}
              onContextMenu={(event, menuSong) => {
                onOpenMenu({ song: menuSong, x: event.clientX, y: event.clientY, canRemove })
              }}
            />
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
            <RecentSearchTime value={entry.searchedAt} t={t} />
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

function RecentSearchTime({ value, t }: { value: string; t: Translator }) {
  const label = formatRecentSearchTime(value, t)
  return label ? <small>{label}</small> : null
}

function dateValue(value: string) {
  return new Date(value).getTime()
}

function categorizeRecentAddedDate(value: string, t: Translator) {
  const date = new Date(value)
  const now = new Date()

  if (sameCalendarDate(date, now)) {
    return t('recent.time.today')
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameCalendarDate(date, yesterday)) {
    return t('recent.time.yesterday')
  }

  const recent7Days = new Date(now)
  recent7Days.setDate(now.getDate() - 7)
  if (date > recent7Days) {
    return t('recent.time.recent7Days')
  }

  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return t('recent.time.thisMonth')
  }

  const recent30Days = new Date(now)
  recent30Days.setDate(now.getDate() - 30)
  if (date > recent30Days) {
    return t('recent.time.recent30Days')
  }

  if (date.getFullYear() === now.getFullYear()) {
    return t(`recent.time.month${date.getMonth() + 1}`)
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

function sameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function formatRecentSearchTime(value: string, t: Translator) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(resolveDateLocale(t), {
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
