import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppBarPortal } from '../components/AppBarPortal'
import { AlbumTile } from '../components/AlbumTile'
import { ArtworkImage } from '../components/ArtworkImage'
import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { requestConfirmDialog } from '../components/dialogService'
import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { GridViewHolder } from '../components/GridViewHolder'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { MusicDialog } from '../components/MusicDialog'
import type { LibraryPlaylist, LibrarySong, PreferredLanguage, PreferenceItemSnapshot, PreferenceSettingsSnapshot, RecentAlbumPlayback, RecentArtistPlayback, RecentLibrarySong, RecentPlaylistPlayback, SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useRecentScrollbar } from '../hooks/useRecentScrollbar'
import {
  buildRecentAlbumViews,
  buildRecentArtistViews,
  buildRecentPlaylistViews,
  categorizeRecentDate,
  dateValue,
  formatRecentDateTime,
  type RecentAlbumView,
  type RecentArtistView,
  type RecentPlaylistView,
} from './recentPageModel'
import { RecentPlayedFilterBar, RecentTabButton, type RecentPlayedFilter, type RecentTab } from './RecentControls'
import { RecentSearchList } from './RecentSearchList'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

interface RecentPageProps {
  songs: LibrarySong[]
  recentSongs: RecentLibrarySong[]
  recentPlaylists: RecentPlaylistPlayback[]
  recentAlbums: RecentAlbumPlayback[]
  recentArtists: RecentArtistPlayback[]
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
const RECENT_GRID_COMPACT_ROW_HEIGHT = 104
const RECENT_GRID_BOTTOM_PADDING = 92
const RECENT_GRID_OVERSCAN_ROWS = 3
export function RecentPage({
  songs,
  recentSongs,
  recentPlaylists,
  recentAlbums,
  recentArtists,
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
  const [activePlayedFilter, setActivePlayedFilter] = useState<RecentPlayedFilter>('songs')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set())
  const [songMenu, setSongMenu] = useState<RecentSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<RecentAddToMenuState | null>(null)
  const [songDialog, setSongDialog] = useState<{ song: LibrarySong; mode: 'properties' | 'lyrics' | 'album-art' } | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [recentAddedTimelineLabel, setRecentAddedTimelineLabel] = useState('')
  const [recentPlayedTimelineLabel, setRecentPlayedTimelineLabel] = useState('')
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
  const recordRecentPlaylistPlayed = useLibraryStore((state) => state.recordRecentPlaylistPlayed)
  const recordRecentAlbumPlayed = useLibraryStore((state) => state.recordRecentAlbumPlayed)
  const recordRecentArtistPlayed = useLibraryStore((state) => state.recordRecentArtistPlayed)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
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
  const recentPlaylistViews = useMemo(
    () => buildRecentPlaylistViews(playlists, songs, recentPlaylists),
    [playlists, recentPlaylists, songs],
  )
  const recentAlbumViews = useMemo(
    () => buildRecentAlbumViews(songs, recentAlbums, t),
    [recentAlbums, songs, t],
  )
  const recentArtistViews = useMemo(
    () => buildRecentArtistViews(songs, recentArtists, t),
    [recentArtists, songs, t],
  )
  const recentPlayedCount = recentSongs.length + recentPlaylists.length + recentAlbums.length + recentArtists.length
  const isSongTab = activeTab === 'added' || activeTab === 'played'
  const isSearchTab = activeTab === 'searches'
  const canSelectVisibleSongs = activeTab === 'added'
    || (activeTab === 'played' && activePlayedFilter === 'songs')
  const visibleSongs = activeTab === 'added' ? recentAddedSongs : activeTab === 'played' ? recentSongs : []
  const queueSongIds = visibleSongs.map((song) => song.id)
  const selectedVisibleSongIds = visibleSongs.filter((song) => selectedSongIds.has(song.id)).map((song) => song.id)
  const selectedVisibleSearchIds = recentSearches.filter((entry) => selectedSearchIds.has(entry.id)).map((entry) => entry.id)
  const selectedCount = isSearchTab ? selectedVisibleSearchIds.length : selectedVisibleSongIds.length
  const canClearHistory = activeTab === 'played'
    ? recentSongs.length > 0 || recentPlaylists.length > 0 || recentAlbums.length > 0 || recentArtists.length > 0
    : activeTab === 'searches' && recentSearches.length > 0

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

  const switchPlayedFilter = (filter: RecentPlayedFilter) => {
    setActivePlayedFilter(filter)
    setMultiSelect(false)
    clearSelection()
    if (filter !== 'songs') {
      setRecentPlayedTimelineLabel('')
    }
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
        count={recentPlayedCount}
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
  const commandBarTimelineLabel =
    activeTab === 'added' ? recentAddedTimelineLabel :
      activeTab === 'played' && activePlayedFilter === 'songs' ? recentPlayedTimelineLabel :
        ''

  return (
    <section className="recent-page page-panel">
      <AppBarPortal>
        <div className="recent-appbar-tabs search-result-tabs" role="tablist">
          {renderRecentTabs()}
        </div>
      </AppBarPortal>
      <div className="recent-tabs search-result-tabs">
        {renderRecentTabs()}
      </div>
      {activeTab === 'played' ? (
        <RecentPlayedFilterBar
          activeFilter={activePlayedFilter}
          t={t}
          onChange={switchPlayedFilter}
        />
      ) : null}

      <CommandBar
        className="recent-commandbar"
        content={commandBarTimelineLabel ? <strong>{commandBarTimelineLabel}</strong> : <span className="recent-commandbar-spacer" />}
        overflowLabel={t('player.more')}
      >
        <CommandBarButton
          icon="multiSelect"
          label={t('albums.multiSelect')}
          active={multiSelect}
          disabled={isSearchTab ? recentSearches.length === 0 : !isSongTab || !canSelectVisibleSongs || visibleSongs.length === 0}
          onClick={() => {
            setMultiSelect((current) => !current)
            clearSelection()
          }}
        />
        {activeTab === 'played' || activeTab === 'searches' ? (
          <CommandBarButton
            icon="close"
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
      ) : activeTab === 'played' ? (
        <RecentPlayedPanel
          songs={visibleSongs}
          playlists={recentPlaylistViews}
          albums={recentAlbumViews}
          artists={recentArtistViews}
          filter={activePlayedFilter}
          queueSongIds={queueSongIds}
          selectedSongIds={selectedSongIds}
          multiSelect={multiSelect}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          loading={loading}
          t={t}
          preferredLanguage={preferredLanguage}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onToggleSelection={toggleSongSelection}
          onTimelineLabelChange={setRecentPlayedTimelineLabel}
          onOpenAddToMenu={(menu) => {
            setSongMenu(null)
            setAddToMenu(menu)
          }}
          onOpenMenu={(menu) => {
            setAddToMenu(null)
            setSongMenu(menu)
          }}
          onOpenPlaylist={(playlistId) => {
            navigate(`/playlists/${playlistId}`)
          }}
          onOpenAlbum={(albumName) => {
            navigate(`/albums?album=${encodeURIComponent(albumName)}`)
          }}
          onOpenArtist={(artistName) => {
            navigate(`/artists?artist=${encodeURIComponent(artistName)}`)
          }}
          onAddAlbum={(album, position) => {
            setSongMenu(null)
            setAddToMenu({
              ...position,
              songIds: album.songs.map((song) => song.id),
              defaultPlaylistName: album.name,
            })
          }}
          onRecordPlaylistPlayed={(playlistId) => {
            void recordRecentPlaylistPlayed(playlistId)
          }}
          onRecordAlbumPlayed={(album) => {
            void recordRecentAlbumPlayed(album)
          }}
          onRecordArtistPlayed={(artist) => {
            void recordRecentArtistPlayed(artist)
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
          canRemove={false}
          loading={loading}
          t={t}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onToggleSelection={toggleSongSelection}
          getTimelineDate={(song) => song.dateAdded}
          getDetailLabel={(song) => formatRecentDateTime(song.dateAdded, preferredLanguage)}
          onTimelineLabelChange={setRecentAddedTimelineLabel}
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
                        title: songsById.get(addToMenu.songIds[0]!)!.title,
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
                        title: songsById.get(nextFavoriteSongIds[0]!)!.title,
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
                        title: songsById.get(addToMenu.songIds[0]!)!.title,
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

function RecentPlayedPanel({
  songs,
  playlists,
  albums,
  artists,
  filter,
  queueSongIds,
  selectedSongIds,
  multiSelect,
  selectedTrackId,
  isPlaying,
  loading,
  t,
  preferredLanguage,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onTimelineLabelChange,
  onOpenAddToMenu,
  onOpenMenu,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onAddAlbum,
  onRecordPlaylistPlayed,
  onRecordAlbumPlayed,
  onRecordArtistPlayed,
}: {
  songs: LibrarySong[]
  playlists: RecentPlaylistView[]
  albums: RecentAlbumView[]
  artists: RecentArtistView[]
  filter: RecentPlayedFilter
  queueSongIds: number[]
  selectedSongIds: Set<number>
  multiSelect: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  loading: boolean
  t: Translator
  preferredLanguage: PreferredLanguage
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSelection: (songId: number) => void
  onTimelineLabelChange: (label: string) => void
  onOpenAddToMenu: (menu: RecentAddToMenuState) => void
  onOpenMenu: (menu: RecentSongMenuState) => void
  onOpenPlaylist: (playlistId: number) => void
  onOpenAlbum: (albumName: string) => void
  onOpenArtist: (artistName: string) => void
  onAddAlbum: (album: RecentAlbumView, position: { x: number; y: number }) => void
  onRecordPlaylistPlayed: (playlistId: number) => void
  onRecordAlbumPlayed: (album: string) => void
  onRecordArtistPlayed: (artist: string) => void
}) {
  const showPlaylists = filter === 'playlists'
  const showAlbums = filter === 'albums'
  const showArtists = filter === 'artists'
  const showSongs = filter === 'songs'
  const visiblePlaylists = showPlaylists ? playlists : []
  const visibleAlbums = showAlbums ? albums : []
  const visibleArtists = showArtists ? artists : []
  const visibleSongs = showSongs ? songs : []
  const hasCollections = visiblePlaylists.length > 0 || visibleAlbums.length > 0 || visibleArtists.length > 0

  if (!hasCollections && visibleSongs.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-played-panel">
      {visiblePlaylists.length > 0 ? (
        <RecentCollectionSection title={t('recent.playlists')}>
          <RecentPlaylistGrid
            playlists={visiblePlaylists}
            t={t}
            loading={false}
            onOpen={onOpenPlaylist}
            onPlay={(playlist) => {
              onRecordPlaylistPlayed(playlist.playlist.id)
              onPlayTrack(playlist.songs[0]!.id, playlist.songs.map((song) => song.id))
            }}
          />
        </RecentCollectionSection>
      ) : null}
      {visibleAlbums.length > 0 ? (
        <RecentCollectionSection title={t('recent.albums')}>
          <RecentAlbumGrid
            albums={visibleAlbums}
            t={t}
            loading={false}
            onOpen={onOpenAlbum}
            onPlay={(album) => {
              onRecordAlbumPlayed(album.name)
              onPlayTrack(album.songs[0]!.id, album.songs.map((song) => song.id))
            }}
            onAdd={onAddAlbum}
          />
        </RecentCollectionSection>
      ) : null}
      {visibleArtists.length > 0 ? (
        <RecentCollectionSection title={t('recent.artists')}>
          <RecentArtistList
            artists={visibleArtists}
            t={t}
            loading={false}
            onOpen={onOpenArtist}
            onPlay={(artist) => {
              onRecordArtistPlayed(artist.name)
              onPlayTrack(artist.songs[0]!.id, artist.songs.map((song) => song.id))
            }}
          />
        </RecentCollectionSection>
      ) : null}
      {showSongs ? <div className="recent-played-songs">
        <RecentSongGrid
          songs={visibleSongs}
          queueSongIds={queueSongIds}
          selectedSongIds={selectedSongIds}
          multiSelect={multiSelect}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          canRemove
          loading={false}
          t={t}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onToggleSelection={onToggleSelection}
          getTimelineDate={(song) => (song as RecentLibrarySong).playedAt}
          getDetailLabel={(song) => formatRecentDateTime((song as RecentLibrarySong).playedAt, preferredLanguage)}
          onTimelineLabelChange={onTimelineLabelChange}
          onOpenAddToMenu={onOpenAddToMenu}
          onOpenMenu={onOpenMenu}
        />
      </div> : null}
    </div>
  )
}

function RecentCollectionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="recent-collection-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function RecentPlaylistGrid({
  playlists,
  t,
  loading,
  onOpen,
  onPlay,
}: {
  playlists: RecentPlaylistView[]
  t: Translator
  loading: boolean
  onOpen: (playlistId: number) => void
  onPlay: (playlist: RecentPlaylistView) => void
}) {
  if (playlists.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-collection-scroll-frame">
      <div className="recent-collection-scroll">
        <div className="recent-collection-grid">
          {playlists.map(({ playlist, songs, playedAt }) => (
            <GridViewHolder
              key={playlist.id}
              playlist={playlist}
              songs={songs}
              selected={false}
              dragging={false}
              t={t}
              showDragHandle={false}
              onOpen={() => {
                onOpen(playlist.id)
              }}
              onPlay={() => {
                onPlay({ playlist, songs, playedAt })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RecentAlbumGrid({
  albums,
  t,
  loading,
  onOpen,
  onPlay,
  onAdd,
}: {
  albums: RecentAlbumView[]
  t: Translator
  loading: boolean
  onOpen: (albumName: string) => void
  onPlay: (album: RecentAlbumView) => void
  onAdd: (album: RecentAlbumView, position: { x: number; y: number }) => void
}) {
  if (albums.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-collection-scroll-frame">
      <div className="recent-collection-scroll">
        <div className="recent-collection-grid recent-album-grid">
          {albums.map((album) => (
            <AlbumTile
              key={album.name}
              album={album}
              multiSelect={false}
              selected={false}
              t={t}
              onOpenAlbum={() => {
                onOpen(album.name)
              }}
              onPlayAlbum={() => {
                onPlay(album)
              }}
              onAddAlbum={(position) => {
                onAdd(album, position)
              }}
              onToggleSelection={() => {
                onOpen(album.name)
              }}
              onOpenContextMenu={(position) => {
                onAdd(album, position)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RecentArtistList({
  artists,
  t,
  loading,
  onOpen,
  onPlay,
}: {
  artists: RecentArtistView[]
  t: Translator
  loading: boolean
  onOpen: (artistName: string) => void
  onPlay: (artist: RecentArtistView) => void
}) {
  if (artists.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-collection-scroll-frame">
      <div className="recent-collection-scroll recent-artist-list">
        {artists.map((artist) => (
          <div className="artist-virtual-row recent-artist-row" key={artist.name}>
            <button
              className="artist-list-item"
              type="button"
              title={artist.name}
              onClick={() => {
                onOpen(artist.name)
              }}
            >
              <RecentArtistArtwork artist={artist} />
              <span className="artist-list-copy">
                <strong>{artist.name}</strong>
              </span>
            </button>
            <button
              type="button"
              className="recent-artist-play"
              aria-label={t('detail.playArtist')}
              title={t('detail.playArtist')}
              onClick={() => {
                onPlay(artist)
              }}
            >
              <Icon name="play" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentArtistArtwork({ artist }: { artist: RecentArtistView }) {
  return (
    <ArtworkImage
      className="artist-list-artwork"
      src={artist.artworkUrl}
      title={artist.name}
      renderFallback={() => (
        <span className="artist-list-avatar" aria-hidden="true">
          <Icon name="users" />
        </span>
      )}
    />
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
  getTimelineDate,
  getDetailLabel,
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
  getTimelineDate: (song: LibrarySong) => string
  getDetailLabel?: (song: LibrarySong) => string
  onTimelineLabelChange?: (label: string) => void
  onOpenAddToMenu: (menu: RecentAddToMenuState) => void
  onOpenMenu: (menu: RecentSongMenuState) => void
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const gridScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const gridScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const [gridWidth, setGridWidth] = useState(960)
  const columnCount = Math.max(
    1,
    Math.floor((gridWidth + RECENT_GRID_COLUMN_GAP) / (RECENT_GRID_MIN_COLUMN_WIDTH + RECENT_GRID_COLUMN_GAP)),
  )
  const rowHeight = gridWidth <= 520 ? RECENT_GRID_COMPACT_ROW_HEIGHT : RECENT_GRID_ROW_HEIGHT
  const rowCount = Math.ceil(songs.length / columnCount)
  const listHeight = rowCount * rowHeight
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startRow = Math.max(
    0,
    Math.floor(effectiveScrollTop / rowHeight) - RECENT_GRID_OVERSCAN_ROWS,
  )
  const endRow = Math.min(
    rowCount,
    Math.ceil((effectiveScrollTop + viewportHeight) / rowHeight) + RECENT_GRID_OVERSCAN_ROWS,
  )
  const renderedSongs = songs.slice(startRow * columnCount, endRow * columnCount)
  const windowTop = startRow * rowHeight
  const onGridScrollbarPointerDown = useRecentScrollbar(
    gridScrollFrameRef,
    gridRef,
    gridScrollbarTrackRef,
    listHeight,
  )

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
      onTimelineLabelChange(topSong ? categorizeRecentDate(getTimelineDate(topSong), t) : '')
    }
  }, [columnCount, getTimelineDate, onTimelineLabelChange, songs, startRow, t])

  if (songs.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-grid-scroll-frame" ref={gridScrollFrameRef}>
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
                detailLabel={getDetailLabel?.(song)}
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
      <div className="recent-scrollbar" ref={gridScrollbarTrackRef} aria-hidden="true">
        <div className="recent-scrollbar-thumb" onPointerDown={onGridScrollbarPointerDown} />
      </div>
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

