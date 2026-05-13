import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppBarPortal } from '../components/AppBarPortal'
import { AlbumTile } from '../components/AlbumTile'
import { ArtworkImage } from '../components/ArtworkImage'
import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { requestConfirmDialog } from '../components/dialogService'
import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { GridViewHolder } from '../components/GridViewHolder'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems, getPreferenceMenuFlyoutItem } from '../components/MenuFlyoutHelper'
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
import { getSongsAddedMessage, getSongsByIds, shuffleSongIds } from './artistsPageModel'
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
  onAddNextAndPlay: (songId: number) => void
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
  onSearch: (entry: SearchHistoryEntry) => void
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

interface RecentArtistMenuState {
  artist: RecentArtistView
  x: number
  y: number
}

type RecentTab = 'added' | 'played' | 'searches'
type RecentPlayedFilter = 'songs' | 'artists' | 'albums' | 'playlists'

interface RecentPlayedCollectionSelection {
  key: string
  songIds: number[]
  playedAt: string
  defaultPlaylistName: string
}

interface RecentTimeGroup<T> {
  label: string
  date: string
  items: T[]
}

interface RecentSongGridHeaderRow {
  kind: 'header'
  label: string
  top: number
  height: number
}

interface RecentSongGridItemsRow {
  kind: 'items'
  label: string
  top: number
  height: number
  songs: LibrarySong[]
}

type RecentSongGridRow = RecentSongGridHeaderRow | RecentSongGridItemsRow

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

const RECENT_ADDED_LIMIT = 500
const RECENT_GRID_MIN_COLUMN_WIDTH = 270
const RECENT_GRID_COLUMN_GAP = 28
const RECENT_GRID_ROW_HEIGHT = 136
const RECENT_GRID_COMPACT_ROW_HEIGHT = 104
const RECENT_GROUP_HEADER_HEIGHT = 36
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
  onAddNextAndPlay,
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
  const [selectedCollectionKeys, setSelectedCollectionKeys] = useState<Set<string>>(new Set())
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set())
  const [songMenu, setSongMenu] = useState<RecentSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<RecentAddToMenuState | null>(null)
  const [artistMenu, setArtistMenu] = useState<RecentArtistMenuState | null>(null)
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
  const isSearchTab = activeTab === 'searches'
  const canSelectVisibleSongs = activeTab === 'added'
    || (activeTab === 'played' && activePlayedFilter === 'songs')
  const visibleSongs = activeTab === 'added' ? recentAddedSongs : activeTab === 'played' ? recentSongs : []
  const isPlayedCollectionTab = activeTab === 'played' && activePlayedFilter !== 'songs'
  const visiblePlayedCollections = useMemo<RecentPlayedCollectionSelection[]>(() => {
    if (!isPlayedCollectionTab) {
      return []
    }

    if (activePlayedFilter === 'playlists') {
      return recentPlaylistViews.map((playlist) => ({
        key: getRecentCollectionKey('playlists', playlist.playlist.id),
        songIds: playlist.songs.map((song) => song.id),
        playedAt: playlist.playedAt,
        defaultPlaylistName: playlist.playlist.name,
      }))
    }

    if (activePlayedFilter === 'albums') {
      return recentAlbumViews.map((album) => ({
        key: getRecentCollectionKey('albums', album.name),
        songIds: album.songIds,
        playedAt: album.playedAt,
        defaultPlaylistName: album.name,
      }))
    }

    return recentArtistViews.map((artist) => ({
      key: getRecentCollectionKey('artists', artist.name),
      songIds: artist.songs.map((song) => song.id),
      playedAt: artist.playedAt,
      defaultPlaylistName: artist.name,
    }))
  }, [activePlayedFilter, isPlayedCollectionTab, recentAlbumViews, recentArtistViews, recentPlaylistViews])
  const queueSongIds = visibleSongs.map((song) => song.id)
  const selectedVisibleSongIds = visibleSongs.filter((song) => selectedSongIds.has(song.id)).map((song) => song.id)
  const selectedVisibleCollections = visiblePlayedCollections.filter((item) => selectedCollectionKeys.has(item.key))
  const selectedCollectionSongIds = uniqueSongIds(selectedVisibleCollections.flatMap((item) => item.songIds))
  const selectedOperationSongIds = isPlayedCollectionTab ? selectedCollectionSongIds : selectedVisibleSongIds
  const selectedVisibleSearchIds = recentSearches.filter((entry) => selectedSearchIds.has(entry.id)).map((entry) => entry.id)
  const selectedCount = isSearchTab
    ? selectedVisibleSearchIds.length
    : isPlayedCollectionTab
      ? selectedVisibleCollections.length
      : selectedVisibleSongIds.length
  const canSelectVisibleItems = isSearchTab
    ? recentSearches.length > 0
    : isPlayedCollectionTab
      ? visiblePlayedCollections.length > 0
      : canSelectVisibleSongs && visibleSongs.length > 0
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
    setSelectedCollectionKeys(new Set())
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
    setRecentPlayedTimelineLabel('')
  }

  const toggleSongSelection = (songId: number) => {
    setSelectedSongIds((current) => toggleSetItem(current, songId))
  }

  const toggleSearchSelection = (entryId: number) => {
    setSelectedSearchIds((current) => toggleSetItem(current, entryId))
  }

  const toggleCollectionSelection = (key: string) => {
    setSelectedCollectionKeys((current) => toggleSetItem(current, key))
  }

  const playSelected = () => {
    onPlayTrack(selectedOperationSongIds[0]!, selectedOperationSongIds)
  }

  const reverseSelection = () => {
    if (activeTab === 'searches') {
      setSelectedSearchIds((current) => new Set(recentSearches.filter((entry) => !current.has(entry.id)).map((entry) => entry.id)))
      return
    }

    if (isPlayedCollectionTab) {
      setSelectedCollectionKeys((current) => new Set(visiblePlayedCollections.filter((item) => !current.has(item.key)).map((item) => item.key)))
      return
    }

    setSelectedSongIds((current) => new Set(visibleSongs.filter((song) => !current.has(song.id)).map((song) => song.id)))
  }

  const selectAll = () => {
    if (activeTab === 'searches') {
      setSelectedSearchIds(new Set(recentSearches.map((entry) => entry.id)))
      return
    }

    if (isPlayedCollectionTab) {
      setSelectedCollectionKeys(new Set(visiblePlayedCollections.map((item) => item.key)))
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
      activeTab === 'played' ? recentPlayedTimelineLabel :
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
          disabled={!canSelectVisibleItems}
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
          selectedCollectionKeys={selectedCollectionKeys}
          multiSelect={multiSelect}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          loading={loading}
          t={t}
          preferredLanguage={preferredLanguage}
          onPlayTrack={onPlayTrack}
          onAddNextAndPlay={onAddNextAndPlay}
          onPlayNext={onPlayNext}
          onTogglePlayPause={onTogglePlayPause}
          onToggleSelection={toggleSongSelection}
          onToggleCollectionSelection={toggleCollectionSelection}
          onTimelineLabelChange={setRecentPlayedTimelineLabel}
          onOpenAddToMenu={(menu) => {
            setSongMenu(null)
            setArtistMenu(null)
            setAddToMenu(menu)
          }}
          onOpenMenu={(menu) => {
            setAddToMenu(null)
            setArtistMenu(null)
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
          onOpenArtistMenu={(artist, position) => {
            setSongMenu(null)
            setAddToMenu(null)
            setArtistMenu({ artist, ...position })
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
          onAddNextAndPlay={onAddNextAndPlay}
          onPlayNext={onPlayNext}
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
            songIds: selectedOperationSongIds,
            defaultPlaylistName: getRecentSelectionDefaultName(activeTab, activePlayedFilter, selectedVisibleCollections, t),
            x: rect.left,
            y: rect.top - 8,
          })
        }}
        onRemove={activeTab === 'added' || isPlayedCollectionTab ? undefined : removeSelected}
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
      {artistMenu ? (
        <RecentArtistContextMenu
          menu={artistMenu}
          playlists={playlists}
          t={t}
          onClose={() => {
            setArtistMenu(null)
          }}
          onPlaySongs={(songIds) => {
            const shuffledSongIds = shuffleSongIds(songIds)
            recordRecentArtistPlayed(artistMenu.artist.name)
            onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
          }}
          onAddSongsToNowPlaying={onAddSongsToNowPlaying}
          onAddSongsToFavorites={(songIds) => {
            onAddSongsToPlaylist(favoritePlaylistId, songIds)
          }}
          onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onSelectSongs={() => {
            setMultiSelect(true)
            setSelectedCollectionKeys(new Set([getRecentCollectionKey('artists', artistMenu.artist.name)]))
          }}
        />
      ) : null}
      {addToMenu ? (
        <MenuFlyout
          position={addToMenu}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={(getAddToPlaylistMenuFlyoutItem({
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
            })?.submenu ?? [])}
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

function RecentArtistContextMenu({
  menu,
  playlists,
  t,
  onClose,
  onPlaySongs,
  onAddSongsToNowPlaying,
  onAddSongsToFavorites,
  onCreatePlaylistWithSongs,
  onAddSongsToPlaylist,
  onSelectSongs,
}: {
  menu: RecentArtistMenuState
  playlists: LibraryPlaylist[]
  t: Translator
  onClose: () => void
  onPlaySongs: (songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onAddSongsToFavorites: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onSelectSongs: () => void
}) {
  const songIds = useMemo(() => menu.artist.songs.map((song) => song.id), [menu.artist.songs])
  const favoriteSongIds = useMemo(() => menu.artist.songs.filter((song) => !song.favorite).map((song) => song.id), [menu.artist.songs])
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const refreshPreferenceItem = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setPreferenceItem(settings.artists.find((item) => item.itemId === menu.artist.name) ?? null)
  }
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds,
    t,
    defaultPlaylistName: menu.artist.name,
    includeNowPlaying: true,
    includeFavorites: favoriteSongIds.length > 0,
    onAddToNowPlaying: () => {
      const insertedIndex = useLibraryStore.getState().snapshot.nowPlaying.songIds.length
      onAddSongsToNowPlaying(songIds)
      showUndo(getSongsAddedMessage(menu.artist.songs, t('common.nowPlaying'), t), () =>
        replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, songIds.length)),
      )
    },
    onToggleFavorite: () => {
      const favoritePlaylistId = useLibraryStore.getState().snapshot.favorites.playlistId
      onAddSongsToFavorites(favoriteSongIds)
      showUndo(getSongsAddedMessage(getSongsByIds(menu.artist.songs, favoriteSongIds), t('common.myFavorites'), t), () =>
        removeSongsFromPlaylist(favoritePlaylistId, favoriteSongIds),
      )
    },
    onCreatePlaylist: (name) => {
      onCreatePlaylistWithSongs(name, songIds)
    },
    onAddToPlaylist: (playlistId) => {
      const playlist = playlists.find((item) => item.id === playlistId)!
      onAddSongsToPlaylist(playlistId, songIds)
      showUndo(getSongsAddedMessage(menu.artist.songs, playlist.name, t), () =>
        removeSongsFromPlaylist(playlistId, songIds),
      )
    },
  })

  useEffect(() => {
    void refreshPreferenceItem()
  }, [menu.artist.name])

  return (
    <MenuFlyout
      position={menu}
      onClose={onClose}
      items={[
        {
          key: 'shuffle',
          text: t('nowPlaying.randomPlay'),
          icon: 'shuffle',
          onClick: () => {
            onPlaySongs(songIds)
          },
        },
        ...(addToItem ? [addToItem] : []),
        {
          key: 'multi-select',
          text: t('common.multiSelect'),
          icon: 'multiSelect',
          onClick: onSelectSongs,
        },
        getPreferenceMenuFlyoutItem({
          type: 'artist',
          itemId: menu.artist.name,
          name: menu.artist.name,
          preferenceItem,
          t,
          onUpdated: refreshPreferenceItem,
        }),
      ]}
    />
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
  selectedCollectionKeys,
  multiSelect,
  selectedTrackId,
  isPlaying,
  loading,
  t,
  preferredLanguage,
  onPlayTrack,
  onAddNextAndPlay,
  onPlayNext,
  onTogglePlayPause,
  onToggleSelection,
  onToggleCollectionSelection,
  onTimelineLabelChange,
  onOpenAddToMenu,
  onOpenMenu,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onAddAlbum,
  onOpenArtistMenu,
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
  selectedCollectionKeys: Set<string>
  multiSelect: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  loading: boolean
  t: Translator
  preferredLanguage: PreferredLanguage
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddNextAndPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onToggleSelection: (songId: number) => void
  onToggleCollectionSelection: (key: string) => void
  onTimelineLabelChange: (label: string) => void
  onOpenAddToMenu: (menu: RecentAddToMenuState) => void
  onOpenMenu: (menu: RecentSongMenuState) => void
  onOpenPlaylist: (playlistId: number) => void
  onOpenAlbum: (albumName: string) => void
  onOpenArtist: (artistName: string) => void
  onAddAlbum: (album: RecentAlbumView, position: { x: number; y: number }) => void
  onOpenArtistMenu: (artist: RecentArtistView, position: { x: number; y: number }) => void
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
        <RecentPlaylistGrid
          playlists={visiblePlaylists}
          t={t}
          preferredLanguage={preferredLanguage}
          loading={false}
          onOpen={onOpenPlaylist}
          onPlay={(playlist) => {
            onRecordPlaylistPlayed(playlist.playlist.id)
            onPlayTrack(playlist.songs[0]!.id, playlist.songs.map((song) => song.id))
          }}
          multiSelect={multiSelect}
          selectedKeys={selectedCollectionKeys}
          onToggleSelection={onToggleCollectionSelection}
          onTimelineLabelChange={onTimelineLabelChange}
        />
      ) : null}
      {visibleAlbums.length > 0 ? (
        <RecentAlbumGrid
          albums={visibleAlbums}
          t={t}
          preferredLanguage={preferredLanguage}
          loading={false}
          onOpen={onOpenAlbum}
          onPlay={(album) => {
            onRecordAlbumPlayed(album.name)
            onPlayTrack(album.songs[0]!.id, album.songs.map((song) => song.id))
          }}
          onAdd={onAddAlbum}
          multiSelect={multiSelect}
          selectedKeys={selectedCollectionKeys}
          onToggleSelection={onToggleCollectionSelection}
          onTimelineLabelChange={onTimelineLabelChange}
        />
      ) : null}
      {visibleArtists.length > 0 ? (
        <RecentArtistList
          artists={visibleArtists}
          t={t}
          preferredLanguage={preferredLanguage}
          loading={false}
          onOpen={onOpenArtist}
          onPlay={(artist) => {
            onRecordArtistPlayed(artist.name)
            const shuffledSongIds = shuffleSongIds(artist.songs.map((song) => song.id))
            onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
          }}
          onOpenContextMenu={onOpenArtistMenu}
          multiSelect={multiSelect}
          selectedKeys={selectedCollectionKeys}
          onToggleSelection={onToggleCollectionSelection}
          onTimelineLabelChange={onTimelineLabelChange}
        />
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
          onAddNextAndPlay={onAddNextAndPlay}
          onPlayNext={onPlayNext}
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

function RecentPlayedFilterBar({
  activeFilter,
  t,
  onChange,
}: {
  activeFilter: RecentPlayedFilter
  t: Translator
  onChange: (filter: RecentPlayedFilter) => void
}) {
  const filters: Array<{ key: RecentPlayedFilter; label: string; icon: 'songs' | 'users' | 'albums' | 'playlists' }> = [
    { key: 'songs', label: t('common.songs'), icon: 'songs' },
    { key: 'artists', label: t('common.artists'), icon: 'users' },
    { key: 'albums', label: t('common.albums'), icon: 'albums' },
    { key: 'playlists', label: t('common.playlists'), icon: 'playlists' },
  ]

  return (
    <div className="recent-played-filters" role="tablist" aria-label={t('recent.played')}>
      {filters.map((filterItem) => (
        <button
          type="button"
          className={filterItem.key === activeFilter ? 'is-active' : ''}
          key={filterItem.key}
          onClick={() => onChange(filterItem.key)}
        >
          <Icon name={filterItem.icon} />
          <span>{filterItem.label}</span>
        </button>
      ))}
    </div>
  )
}

function RecentCollectionTimelineFrame({
  children,
  className,
  t,
  onTimelineLabelChange,
}: {
  children: ReactNode
  className?: string
  t: Translator
  onTimelineLabelChange: (label: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) {
      return
    }

    let animationFrame = 0
    const updateTimelineLabel = () => {
      const scrollTop = scrollElement.getBoundingClientRect().top
      const items = [...scrollElement.querySelectorAll<HTMLElement>('[data-recent-timeline-date]')]
      const topItem = items.find((item) => item.getBoundingClientRect().bottom > scrollTop + 1) ?? items[0]
      onTimelineLabelChange(
        topItem && !topItem.classList.contains('recent-time-group-header')
          ? categorizeRecentDate(topItem.dataset.recentTimelineDate!, t)
          : '',
      )
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateTimelineLabel)
    }

    updateTimelineLabel()
    scrollElement.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(scrollElement)
    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(scrollElement, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scrollElement.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [onTimelineLabelChange, t])

  return (
    <div className="recent-collection-scroll-frame">
      <div className={className ? `recent-collection-scroll ${className}` : 'recent-collection-scroll'} ref={scrollRef}>
        {children}
      </div>
    </div>
  )
}

function RecentPlaylistGrid({
  playlists,
  t,
  preferredLanguage,
  loading,
  onOpen,
  onPlay,
  multiSelect,
  selectedKeys,
  onToggleSelection,
  onTimelineLabelChange,
}: {
  playlists: RecentPlaylistView[]
  t: Translator
  preferredLanguage: PreferredLanguage
  loading: boolean
  onOpen: (playlistId: number) => void
  onPlay: (playlist: RecentPlaylistView) => void
  multiSelect: boolean
  selectedKeys: Set<string>
  onToggleSelection: (key: string) => void
  onTimelineLabelChange: (label: string) => void
}) {
  if (playlists.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }
  const groups = groupRecentItems(playlists, (playlist) => playlist.playedAt, t)

  return (
    <RecentCollectionTimelineFrame t={t} onTimelineLabelChange={onTimelineLabelChange}>
      {groups.map((group) => (
        <section className="recent-time-group" key={group.label}>
          <h3 className="recent-time-group-header" data-recent-timeline-date={group.date}>{group.label}</h3>
          <div className="recent-collection-grid">
            {group.items.map(({ playlist, songs, playedAt }) => (
              <GridViewHolder
                key={playlist.id}
                playlist={playlist}
                songs={songs}
                subtitle={formatRecentDateTime(playedAt, preferredLanguage)}
                selected={selectedKeys.has(getRecentCollectionKey('playlists', playlist.id))}
                dragging={false}
                t={t}
                showDragHandle={false}
                selectionMode={multiSelect}
                selectedMark={multiSelect ? (
                  <span className={selectedKeys.has(getRecentCollectionKey('playlists', playlist.id)) ? 'album-select-mark is-selected' : 'album-select-mark'} aria-hidden="true">
                    {selectedKeys.has(getRecentCollectionKey('playlists', playlist.id)) ? <Icon name="check" /> : null}
                  </span>
                ) : null}
                timelineDate={playedAt}
                onOpen={() => {
                  if (multiSelect) {
                    onToggleSelection(getRecentCollectionKey('playlists', playlist.id))
                  } else {
                    onOpen(playlist.id)
                  }
                }}
                onPlay={() => {
                  onPlay({ playlist, songs, playedAt })
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </RecentCollectionTimelineFrame>
  )
}

function RecentAlbumGrid({
  albums,
  t,
  preferredLanguage,
  loading,
  onOpen,
  onPlay,
  onAdd,
  multiSelect,
  selectedKeys,
  onToggleSelection,
  onTimelineLabelChange,
}: {
  albums: RecentAlbumView[]
  t: Translator
  preferredLanguage: PreferredLanguage
  loading: boolean
  onOpen: (albumName: string) => void
  onPlay: (album: RecentAlbumView) => void
  onAdd: (album: RecentAlbumView, position: { x: number; y: number }) => void
  multiSelect: boolean
  selectedKeys: Set<string>
  onToggleSelection: (key: string) => void
  onTimelineLabelChange: (label: string) => void
}) {
  if (albums.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }
  const groups = groupRecentItems(albums, (album) => album.playedAt, t)

  return (
    <RecentCollectionTimelineFrame t={t} onTimelineLabelChange={onTimelineLabelChange}>
      {groups.map((group) => (
        <section className="recent-time-group" key={group.label}>
          <h3 className="recent-time-group-header" data-recent-timeline-date={group.date}>{group.label}</h3>
          <div className="recent-collection-grid recent-album-grid">
            {group.items.map((album) => (
              <AlbumTile
                key={album.name}
                album={album}
                multiSelect={multiSelect}
                selected={selectedKeys.has(getRecentCollectionKey('albums', album.name))}
                t={t}
                subtitle={formatRecentDateTime(album.playedAt, preferredLanguage)}
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
                  onToggleSelection(getRecentCollectionKey('albums', album.name))
                }}
                onOpenContextMenu={(position) => {
                  onAdd(album, position)
                }}
                timelineDate={album.playedAt}
              />
            ))}
          </div>
        </section>
      ))}
    </RecentCollectionTimelineFrame>
  )
}

function RecentArtistList({
  artists,
  t,
  preferredLanguage,
  loading,
  onOpen,
  onPlay,
  onOpenContextMenu,
  multiSelect,
  selectedKeys,
  onToggleSelection,
  onTimelineLabelChange,
}: {
  artists: RecentArtistView[]
  t: Translator
  preferredLanguage: PreferredLanguage
  loading: boolean
  onOpen: (artistName: string) => void
  onPlay: (artist: RecentArtistView) => void
  onOpenContextMenu: (artist: RecentArtistView, position: { x: number; y: number }) => void
  multiSelect: boolean
  selectedKeys: Set<string>
  onToggleSelection: (key: string) => void
  onTimelineLabelChange: (label: string) => void
}) {
  if (artists.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }
  const groups = groupRecentItems(artists, (artist) => artist.playedAt, t)

  return (
    <RecentCollectionTimelineFrame className="recent-artist-list" t={t} onTimelineLabelChange={onTimelineLabelChange}>
      {groups.map((group) => (
        <section className="recent-time-group recent-artist-time-group" key={group.label}>
          <h3 className="recent-time-group-header" data-recent-timeline-date={group.date}>{group.label}</h3>
          <div className="recent-collection-grid recent-artist-grid">
            {group.items.map((artist) => (
              <div className="artist-virtual-row recent-artist-row" key={artist.name} data-recent-timeline-date={artist.playedAt}>
                <div
                  role="button"
                  tabIndex={0}
                  className={selectedKeys.has(getRecentCollectionKey('artists', artist.name)) ? 'artist-list-item is-selected' : 'artist-list-item'}
                  title={artist.name}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onOpenContextMenu(artist, { x: event.clientX, y: event.clientY })
                  }}
                  onClick={() => {
                    if (multiSelect) {
                      onToggleSelection(getRecentCollectionKey('artists', artist.name))
                    } else {
                      onOpen(artist.name)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      if (multiSelect) {
                        onToggleSelection(getRecentCollectionKey('artists', artist.name))
                      } else {
                        onOpen(artist.name)
                      }
                    }
                  }}
                >
                  <span className="artist-list-artwork-shell">
                    <RecentArtistArtwork artist={artist} />
                    {!multiSelect ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="artist-list-hover-play recent-artist-play"
                        aria-label={t('nowPlaying.randomPlay')}
                        title={t('nowPlaying.randomPlay')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onPlay(artist)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.stopPropagation()
                            onPlay(artist)
                          }
                        }}
                    >
                      <Icon name="play" />
                    </span>
                  ) : null}
                  </span>
                  <span className="artist-list-copy">
                    <strong>{artist.name}</strong>
                    <small>{formatRecentDateTime(artist.playedAt, preferredLanguage)}</small>
                  </span>
                </div>
                {multiSelect ? (
                  <span className={selectedKeys.has(getRecentCollectionKey('artists', artist.name)) ? 'album-select-mark is-selected' : 'album-select-mark'} aria-hidden="true">
                    {selectedKeys.has(getRecentCollectionKey('artists', artist.name)) ? <Icon name="check" /> : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </RecentCollectionTimelineFrame>
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
          <DefaultAlbumArtwork className="artist-list-avatar-image" />
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
  onAddNextAndPlay,
  onPlayNext,
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
  onAddNextAndPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
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
  const groups = useMemo(() => groupRecentItems(songs, getTimelineDate, t), [getTimelineDate, songs, t])
  const columnCount = Math.max(
    1,
    Math.floor((gridWidth + RECENT_GRID_COLUMN_GAP) / (RECENT_GRID_MIN_COLUMN_WIDTH + RECENT_GRID_COLUMN_GAP)),
  )
  const rowHeight = gridWidth <= 520 ? RECENT_GRID_COMPACT_ROW_HEIGHT : RECENT_GRID_ROW_HEIGHT
  const columnWidth = (gridWidth - RECENT_GRID_COLUMN_GAP * (columnCount - 1)) / columnCount
  const showSongMoreButton = columnWidth >= 330
  const layout = useMemo(() => buildRecentSongGridLayout(groups, columnCount, rowHeight), [columnCount, groups, rowHeight])
  const listHeight = layout.height
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const overscanHeight = rowHeight * RECENT_GRID_OVERSCAN_ROWS
  const renderedRows = layout.rows.filter((row) =>
    row.top + row.height >= effectiveScrollTop - overscanHeight &&
    row.top <= effectiveScrollTop + viewportHeight + overscanHeight,
  )
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
      const topRow = layout.rows.find((row) => row.top + row.height > effectiveScrollTop + 1)
      onTimelineLabelChange(topRow && topRow.kind !== 'header' ? topRow.label : '')
    }
  }, [effectiveScrollTop, layout.rows, onTimelineLabelChange])

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
          {renderedRows.map((row) => row.kind === 'header' ? (
            <h3
              className="recent-time-group-header recent-song-time-group-header"
              key={`header-${row.label}`}
              style={{ transform: `translateY(${row.top}px)` }}
            >
              {row.label}
            </h3>
          ) : (
            <div
              className="recent-song-grid-row"
              key={`row-${row.top}`}
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                transform: `translateY(${row.top}px)`,
              }}
            >
              {row.songs.map((song) => (
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
                  showMoreButton={showSongMoreButton}
                  onPlayTrack={(songId) => {
                    onAddNextAndPlay(songId)
                  }}
                  onTogglePlayPause={onTogglePlayPause}
                  onToggleSelection={onToggleSelection}
                  onAddToPlaylistClick={(event, menuSong) => {
                    onOpenAddToMenu({ songIds: [menuSong.id], defaultPlaylistName: '', x: event.clientX, y: event.clientY })
                  }}
                  onPlayNextClick={(menuSong) => {
                    onPlayNext(menuSong.id)
                  }}
                  onMoreClick={(menuSong, x, y) => {
                    onOpenMenu({ song: menuSong, x, y, canRemove })
                  }}
                  onContextMenu={(event, menuSong) => {
                    onOpenMenu({ song: menuSong, x: event.clientX, y: event.clientY, canRemove })
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="recent-scrollbar" ref={gridScrollbarTrackRef} aria-hidden="true">
        <div className="recent-scrollbar-thumb" onPointerDown={onGridScrollbarPointerDown} />
      </div>
    </div>
  )
}

function groupRecentItems<T>(items: T[], getDate: (item: T) => string, t: Translator): Array<RecentTimeGroup<T>> {
  const groups: Array<RecentTimeGroup<T>> = []

  for (const item of items) {
    const date = getDate(item)
    const label = categorizeRecentDate(date, t)
    const currentGroup = groups[groups.length - 1]

    if (currentGroup?.label === label) {
      currentGroup.items.push(item)
    } else {
      groups.push({ label, date, items: [item] })
    }
  }

  return groups
}

function buildRecentSongGridLayout(groups: Array<RecentTimeGroup<LibrarySong>>, columnCount: number, rowHeight: number) {
  const rows: RecentSongGridRow[] = []
  let top = 0

  for (const group of groups) {
    rows.push({
      kind: 'header',
      label: group.label,
      top,
      height: RECENT_GROUP_HEADER_HEIGHT,
    })
    top += RECENT_GROUP_HEADER_HEIGHT

    for (let index = 0; index < group.items.length; index += columnCount) {
      rows.push({
        kind: 'items',
        label: group.label,
        top,
        height: rowHeight,
        songs: group.items.slice(index, index + columnCount),
      })
      top += rowHeight
    }
  }

  return { rows, height: top }
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

function getRecentCollectionKey(filter: Exclude<RecentPlayedFilter, 'songs'>, value: string | number) {
  return `${filter}:${value}`
}

function uniqueSongIds(songIds: number[]) {
  return [...new Set(songIds)]
}

function getRecentSelectionDefaultName(
  activeTab: RecentTab,
  activePlayedFilter: RecentPlayedFilter,
  selectedCollections: RecentPlayedCollectionSelection[],
  t: Translator,
) {
  if (activeTab === 'added') {
    return t('recent.added')
  }

  if (selectedCollections.length === 1) {
    return selectedCollections[0]!.defaultPlaylistName
  }

  if (activePlayedFilter === 'artists') {
    return t('common.artists')
  }

  if (activePlayedFilter === 'albums') {
    return t('common.albums')
  }

  if (activePlayedFilter === 'playlists') {
    return t('common.playlists')
  }

  return t('recent.played')
}

