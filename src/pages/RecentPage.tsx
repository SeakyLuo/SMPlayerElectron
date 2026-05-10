import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { APPBAR_PAGE_ACTIONS_ID } from '../components/AppBar'
import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { requestConfirmDialog } from '../components/dialogService'
import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { MusicDialog } from '../components/MusicDialog'
import type { LibraryPlaylist, LibrarySong, PreferredLanguage, PreferenceItemSnapshot, PreferenceSettingsSnapshot, RecentLibrarySong, SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

type RecentTab = 'added' | 'played' | 'searches'

interface RecentPageProps {
  songs: LibrarySong[]
  recentSongs: RecentLibrarySong[]
  recentSearches: SearchHistoryEntry[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  favoriteSongIds: number[]
  t: Translator
  loading: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  showCount: boolean
  preferredLanguage: PreferredLanguage
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
  onRestoreRecentPlayed: (songIds: number[]) => void
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
  favoritePlaylistId,
  favoriteSongIds,
  t,
  loading,
  selectedTrackId,
  isPlaying,
  showCount,
  preferredLanguage,
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
  onRestoreRecentPlayed,
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
  const [appBarActionsHost, setAppBarActionsHost] = useState<HTMLElement | null>(null)
  const navigate = useNavigate()
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const resumeHiddenStorageItemByPath = useLibraryStore((state) => state.resumeHiddenStorageItemByPath)
  const restoreRecentSearch = useLibraryStore((state) => state.restoreRecentSearch)
  const refresh = useLibraryStore((state) => state.refresh)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const favoriteSongIdSet = useMemo(() => new Set(favoriteSongIds), [favoriteSongIds])
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const refreshSongPreferenceItem = async (songId: number, snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
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
    const updateAppBarActionsHost = () => {
      setAppBarActionsHost(document.getElementById(APPBAR_PAGE_ACTIONS_ID))
    }

    updateAppBarActionsHost()
    window.addEventListener('resize', updateAppBarActionsHost)

    return () => {
      window.removeEventListener('resize', updateAppBarActionsHost)
    }
  }, [])

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

  const clearHistory = () => {
    if (activeTab === 'played') {
      void requestConfirmDialog({
        title: t('common.confirm'),
        message: t('recent.clearPlayedConfirm'),
      }).then((confirmed) => {
        if (confirmed) {
          onClearRecentPlayed()
        }
      })
      return
    }

    void requestConfirmDialog({
      title: t('common.confirm'),
      message: t('recent.clearSearchesConfirm'),
    }).then((confirmed) => {
      if (confirmed) {
        onClearRecentSearches()
      }
    })
  }

  const renderRecentTabs = () => (
    <>
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
    </>
  )

  return (
    <section className="recent-page page-panel">
      {appBarActionsHost
        ? createPortal(
            <div className="recent-appbar-tabs search-result-tabs" role="tablist">
              {renderRecentTabs()}
            </div>,
            appBarActionsHost,
          )
        : null}
      <div className="recent-tabs search-result-tabs">
        {renderRecentTabs()}
      </div>

      <CommandBar
        className="recent-commandbar"
        content={activeTab === 'added' ? <strong>{recentAddedTimelineLabel}</strong> : <span className="recent-commandbar-spacer" />}
      >
        <CommandBarButton
          icon="menu"
          label={t('albums.multiSelect')}
          active={multiSelect}
          disabled={activeTab === 'searches' ? recentSearches.length === 0 : visibleSongs.length === 0}
          onClick={() => {
            setMultiSelect((current) => !current)
            clearSelection()
          }}
        />
        {activeTab === 'played' || activeTab === 'searches' ? (
          <CommandBarButton
            icon="clearSelection"
            label={t('recent.clearHistory')}
            disabled={!canClearHistory}
            onClick={clearHistory}
          />
        ) : null}
      </CommandBar>

      {activeTab === 'searches' ? (
        <RecentSearchList
          entries={recentSearches}
          multiSelect={multiSelect}
          selectedEntryIds={selectedSearchIds}
          t={t}
          preferredLanguage={preferredLanguage}
          loading={loading}
          onSearch={onSearch}
          onToggleSelection={toggleSearchSelection}
          onRemove={(entryId) => {
            const entry = recentSearches.find((recentSearch) => recentSearch.id === entryId)!
            onRemoveRecentSearches([entryId])
            showUndo(t('notification.itemRemoved', { name: entry.query }), () =>
              restoreRecentSearch(entry),
            )
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
          loading={loading}
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
              const insertedIndex = nowPlayingSongIds.length
              onAddSongsToNowPlaying([songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
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
              showUndo(t('notification.removedFrom', { title: songMenu.song.title, target: t('recent.played') }), () =>
                onRestoreRecentPlayed([songMenu.song.id]),
              )
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedSongIds(new Set([songMenu.song.id]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void removePreferenceItem(songPreferenceItem!).then(() => refreshSongPreferenceItem(songMenu.song.id, usePreferenceStore.getState().snapshot))
            },
            onSetPreference: (level) => {
              void addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then((snapshot) => refreshSongPreferenceItem(songMenu.song.id, snapshot))
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
              void requestConfirmDialog({
                title: t('playlists.delete'),
                message: t('context.deleteSongConfirm', { title: songMenu.song.title }),
                confirmText: t('playlists.delete'),
              }).then((confirmed) => {
                if (confirmed) {
                  onDeleteSongFromDisk(songMenu.song.id)
                }
              })
            },
            onHide: async () => {
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveRecentPlayed([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                await resumeHiddenStorageItemByPath(songMenu.song.path)
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists?artist=${encodeURIComponent(artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums?album=${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
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
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists,
              songIds: addToMenu.songIds,
              t,
              defaultPlaylistName: addToMenu.defaultPlaylistName,
              includeNowPlaying: true,
              includeFavorites: addToMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
              onAddToNowPlaying: () => {
                const insertedIndex = nowPlayingSongIds.length
                onAddSongsToNowPlaying(addToMenu.songIds)
                showUndo(
                  addToMenu.songIds.length === 1
                    ? t('notification.songAddedTo', {
                        title: visibleSongs.find((song) => song.id === addToMenu.songIds[0])!.title,
                        target: t('common.nowPlaying'),
                      })
                    : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: t('common.nowPlaying') }),
                  () => replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, addToMenu.songIds.length)),
                )
                hideSelectionAfterOperation()
              },
              onToggleFavorite: () => {
                const nextFavoriteSongIds = addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId))
                onAddSongsToPlaylist(favoritePlaylistId, nextFavoriteSongIds)
                showUndo(
                  nextFavoriteSongIds.length === 1
                    ? t('notification.songAddedTo', {
                        title: visibleSongs.find((song) => song.id === nextFavoriteSongIds[0])!.title,
                        target: t('common.myFavorites'),
                      })
                    : t('notification.songsAddedTo', { count: nextFavoriteSongIds.length, target: t('common.myFavorites') }),
                  () => removeSongsFromPlaylist(favoritePlaylistId, nextFavoriteSongIds),
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
                  () => removeSongsFromPlaylist(playlistId, addToMenu.songIds),
                )
                hideSelectionAfterOperation()
              },
            }),
          ].filter((item) => item != null)}
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
  loading,
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
  loading: boolean
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
    return loading ? <LoadingState t={t} compact /> : (
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
  preferredLanguage,
  loading,
  onSearch,
  onToggleSelection,
  onRemove,
}: {
  entries: SearchHistoryEntry[]
  multiSelect: boolean
  selectedEntryIds: Set<number>
  t: Translator
  preferredLanguage: PreferredLanguage
  loading: boolean
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
    return loading ? <LoadingState t={t} compact /> : (
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
            <RecentSearchTime value={entry.searchedAt} preferredLanguage={preferredLanguage} />
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

function RecentSearchTime({ value, preferredLanguage }: { value: string; preferredLanguage: PreferredLanguage }) {
  const label = formatRecentSearchTime(value, preferredLanguage)
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

function formatRecentSearchTime(value: string, preferredLanguage: PreferredLanguage) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(resolveDateLocale(preferredLanguage), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveDateLocale(preferredLanguage: PreferredLanguage) {
  return preferredLanguage === 'system' ? undefined : preferredLanguage
}
