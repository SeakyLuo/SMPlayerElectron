import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { AppBarPortal } from '../components/AppBarPortal'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { requestConfirmDialog } from '../components/dialogService'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems, getShuffleMenuItems, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar, MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER } from '../components/MultiSelectCommandBar'
import { MusicDialog } from '../components/MusicDialog'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { formatSongsAddedTo, formatSongsRemovedFrom } from '../shared/i18nCounts'
import { insertQueueEntries, insertQueueSongs, removeQueueRange } from '../shared/queueUndo'
import { quickPlay } from '../shared/QuickPlayHelper'
import { useLibraryStore } from '../state/useLibraryStore'
import { useStoredMultiSelect, useStoredNumberSet } from '../state/usePageSelectionStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'

const QUICK_PLAY_LIMIT = 100
const NOW_PLAYING_ROW_HEIGHT = 82
const NOW_PLAYING_COMPACT_ROW_HEIGHT = 78
const NOW_PLAYING_OVERSCAN_ROWS = 12
const NOW_PLAYING_COMPACT_QUERY = '(max-width: 720px)'

interface NowPlayingPageProps {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
  loading: boolean
  searchQuery: string
  error: string | null
  onTogglePlayPause: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[], queueIndex?: number) => void
  onReplaceQueue: (songIds: number[]) => void
  onPlayNext: (songId: number, queueIndex?: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongs: (songIds: number[]) => void
  onDeleteSongFromDisk: (songId: number) => void
  onClearQueue: () => void
  onOpenImmersiveMode: () => void
}

function matchesSearch(song: LibrarySong, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return [song.title, song.artist, ...song.artists, song.album, song.path]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedSearchQuery)
}

export function NowPlayingPage({
  songs,
  librarySongs,
  recentSongs,
  playlists,
  favoritePlaylistId,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
  loading,
  searchQuery,
  error,
  onTogglePlayPause,
  onPlayTrack,
  onReplaceQueue,
  onPlayNext,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onToggleFavorite,
  onRemoveSongs,
  onDeleteSongFromDisk,
  onClearQueue,
  onOpenImmersiveMode,
}: NowPlayingPageProps) {
  const [multiSelect, setMultiSelect] = useStoredMultiSelect('now-playing')
  const [selectedQueueIndexes, setSelectedQueueIndexes] = useStoredNumberSet('now-playing', 'selectedQueueIndexes')
  const [randomMenuPosition, setRandomMenuPosition] = useState<MenuFlyoutPosition | null>(null)
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const [songDialog, setSongDialog] = useState<{ song: LibrarySong; mode: 'properties' | 'lyrics' | 'album-art' } | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [isCompactQueueLayout, setIsCompactQueueLayout] = useState(() => window.matchMedia(NOW_PLAYING_COMPACT_QUERY).matches)
  const listScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const listScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const resumeHiddenStorageItemByPath = useLibraryStore((state) => state.resumeHiddenStorageItemByPath)
  const refresh = useLibraryStore((state) => state.refresh)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const draggedQueueIndexRef = useRef<number | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ queueIndex: number; position: 'before' | 'after' } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const navigate = useNavigate()
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const playQuick = useCallback(async () => {
    const preferences = await refreshPreferences()
    if (!preferences) {
      return
    }

    const songIds = quickPlay({
      songs: librarySongs,
      recentSongs,
      playlists,
      folders,
      preferences,
    }, QUICK_PLAY_LIMIT)
    onReplaceQueue(songIds)
    onPlayTrack(songIds[0]!, songIds, 0)
  }, [folders, librarySongs, onPlayTrack, onReplaceQueue, playlists, recentSongs, refreshPreferences])

  const refreshSongPreferenceItem = async (songId: number, snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
  }

  useEffect(() => {
    if (songMenu) {
      void refreshSongPreferenceItem(songMenu.song.id)
    }
  }, [songMenu?.song.id])

  useEffect(() => {
    const compactQuery = window.matchMedia(NOW_PLAYING_COMPACT_QUERY)
    const updateCompactLayout = () => {
      setIsCompactQueueLayout(compactQuery.matches)
    }

    updateCompactLayout()
    compactQuery.addEventListener('change', updateCompactLayout)
    return () => {
      compactQuery.removeEventListener('change', updateCompactLayout)
    }
  }, [])

  const queueEntries = useMemo(
    () => songs.map((song, queueIndex) => ({ song, queueIndex })),
    [songs],
  )
  const visibleEntries = useMemo(
    () => queueEntries.filter((entry) => matchesSearch(entry.song, searchQuery)),
    [queueEntries, searchQuery],
  )
  const visibleSongs = useMemo(
    () => visibleEntries.map((entry) => entry.song),
    [visibleEntries],
  )
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const queueEntryKeys = useMemo(() => {
    const occurrenceCounts = new Map<number, number>()
    return songs.map((song) => {
      const occurrence = occurrenceCounts.get(song.id) ?? 0
      occurrenceCounts.set(song.id, occurrence + 1)
      return `now-playing-${song.id}-${occurrence}`
    })
  }, [songs])
  const selectedVisibleEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedQueueIndexes.has(entry.queueIndex)),
    [selectedQueueIndexes, visibleEntries],
  )
  const selectedVisibleSongIds = useMemo(
    () => selectedVisibleEntries.map((entry) => entry.song.id),
    [selectedVisibleEntries],
  )
  const selectedVisibleQueueIndexes = useMemo(
    () => selectedVisibleEntries.map((entry) => entry.queueIndex),
    [selectedVisibleEntries],
  )
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])
  const defaultNewPlaylistName = useMemo(() => getDefaultNewPlaylistName(t, playlists), [playlists, t])
  const currentSong = useMemo(
    () => songs.find((song) => song.id === selectedTrackId) ?? null,
    [selectedTrackId, songs],
  )
  const canUseQueueCommands = songs.length > 0
  const canUseLibraryCommands = librarySongs.length > 0
  const rowHeight = isCompactQueueLayout ? NOW_PLAYING_COMPACT_ROW_HEIGHT : NOW_PLAYING_ROW_HEIGHT
  const listHeight = visibleEntries.length * rowHeight
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / rowHeight) - NOW_PLAYING_OVERSCAN_ROWS)
  const endIndex = Math.min(
    visibleEntries.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / rowHeight) + NOW_PLAYING_OVERSCAN_ROWS,
  )
  const renderedEntries = visibleEntries.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * rowHeight
  const bottomSpacerHeight = (visibleEntries.length - endIndex) * rowHeight +
    (multiSelect ? MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER : 0)
  const randomActions = useMemo(
    () => {
      if (!randomMenuPosition) {
        return []
      }

      return getShuffleMenuItems({
        songs,
        librarySongs,
        recentSongs,
        playlists,
        folders,
        randomLimit: QUICK_PLAY_LIMIT,
        t,
        onQuickPlay: playQuick,
        onPlaySongs: (songIds) => {
          onReplaceQueue(songIds)
          onPlayTrack(songIds[0]!, songIds, 0)
        },
      })
    },
    [folders, librarySongs, onPlayTrack, onReplaceQueue, playQuick, playlists, randomMenuPosition, recentSongs, songs, t],
  )
  const addToMenuItem = addToMenu
    ? getAddToPlaylistMenuFlyoutItem({
        playlists: customPlaylists,
        songIds: addToMenu.songIds,
        t,
        defaultPlaylistName: addToMenu.defaultPlaylistName,
        currentPlaylistName: t('common.nowPlaying'),
        includeFavorites: addToMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
        onToggleFavorite: () => {
          const nextFavoriteSongIds = addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId))
          onAddSongsToPlaylist(favoritePlaylistId, nextFavoriteSongIds)
          showUndo(
            nextFavoriteSongIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === nextFavoriteSongIds[0])!.title,
                  target: t('common.myFavorites'),
                })
              : formatSongsAddedTo(t, nextFavoriteSongIds.length, t('common.myFavorites')),
            () => removeSongsFromPlaylist(favoritePlaylistId, nextFavoriteSongIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onCreatePlaylist: (name) => {
          void createPlaylist(name, addToMenu.songIds)
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onAddToPlaylist: (playlistId) => {
          const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
          onAddSongsToPlaylist(playlistId, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: targetPlaylist.name,
                })
              : formatSongsAddedTo(t, addToMenu.songIds.length, targetPlaylist.name),
            () => removeSongsFromPlaylist(playlistId, addToMenu.songIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
      })
    : null

  const clearSelection = () => {
    setSelectedQueueIndexes(new Set())
  }

  const toggleSelection = (queueIndex: number) => {
    setSelectedQueueIndexes((current) => {
      const next = new Set(current)
      if (next.has(queueIndex)) {
        next.delete(queueIndex)
      } else {
        next.add(queueIndex)
      }
      return next
    })
  }

  const playSelected = () => {
    const [firstSongId] = selectedVisibleSongIds
    onReplaceQueue(selectedVisibleSongIds)
    onPlayTrack(firstSongId!, selectedVisibleSongIds, 0)
  }

  const getDropPosition = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  const getTouchDropTarget = (clientX: number, clientY: number) => {
    const row = document.elementsFromPoint(clientX, clientY).find((element): element is HTMLElement =>
      element instanceof HTMLElement && element.classList.contains('now-playing-queue-item'),
    )
    if (!row) {
      return null
    }

    const queueIndex = Number(row.dataset.queueIndex)
    if (!Number.isInteger(queueIndex)) {
      return null
    }

    const rect = row.getBoundingClientRect()
    return {
      queueIndex,
      position: clientY > rect.top + rect.height / 2 ? 'after' as const : 'before' as const,
    }
  }

  const moveQueueSong = (draggedQueueIndex: number, targetQueueIndex: number, insertAfter: boolean) => {
    if (draggedQueueIndex === targetQueueIndex) {
      return
    }

    const nextSongIds = queueSongIds.slice()
    const [draggedSongId] = nextSongIds.splice(draggedQueueIndex, 1)
    const targetIndex = draggedQueueIndex < targetQueueIndex + (insertAfter ? 1 : 0)
      ? targetQueueIndex + (insertAfter ? 1 : 0) - 1
      : targetQueueIndex + (insertAfter ? 1 : 0)
    nextSongIds.splice(targetIndex, 0, draggedSongId!)
    onReplaceQueue(nextSongIds)
  }

  const moveTouchQueueDrag = (clientX: number, clientY: number) => {
    const target = getTouchDropTarget(clientX, clientY)
    setDropIndicator(target)
  }

  const completeTouchQueueDrag = (clientX: number, clientY: number) => {
    const draggedQueueIndex = draggedQueueIndexRef.current
    draggedQueueIndexRef.current = null
    const target = getTouchDropTarget(clientX, clientY)
    setDropIndicator(null)
    if (draggedQueueIndex == null || !target) {
      return
    }

    moveQueueSong(draggedQueueIndex, target.queueIndex, target.position === 'after')
  }

  const reverseSelection = () => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const entry of visibleEntries) {
        if (!current.has(entry.queueIndex)) {
          next.add(entry.queueIndex)
        }
      }
      return next
    })
  }

  const locateCurrent = (behavior: ScrollBehavior = 'smooth') => {
    const currentVisibleIndex = visibleEntries.findIndex((entry) =>
      selectedQueueIndex == null
        ? entry.song.id === selectedTrackId
        : entry.queueIndex === selectedQueueIndex,
    )
    if (currentVisibleIndex < 0) {
      return
    }

    const nextScrollTop = Math.max(
      0,
      currentVisibleIndex * rowHeight - (listShellRef.current?.clientHeight ?? viewportHeight) / 2 + rowHeight / 2,
    )
    setScrollTop(nextScrollTop)
    listShellRef.current?.scrollTo({ top: nextScrollTop, behavior })
  }

  const openAddToMenu = (x: number, y: number, anchor?: HTMLElement) => {
    setAddToMenu({
      x,
      y,
      anchor,
      songIds: queueSongIds,
      defaultPlaylistName: defaultNewPlaylistName,
    })
  }

  const addQueueToFavorites = () => {
    const nextFavoriteSongIds = queueSongIds.filter((songId) => !favoriteSongIdSet.has(songId))
    onAddSongsToPlaylist(favoritePlaylistId, nextFavoriteSongIds)
    showUndo(
      nextFavoriteSongIds.length === 1
        ? t('notification.songAddedTo', {
            title: songs.find((song) => song.id === nextFavoriteSongIds[0])!.title,
            target: t('common.myFavorites'),
          })
        : formatSongsAddedTo(t, nextFavoriteSongIds.length, t('common.myFavorites')),
      () => removeSongsFromPlaylist(favoritePlaylistId, nextFavoriteSongIds),
    )
  }

  const createPlaylistFromQueue = (name: string) => {
    void createPlaylist(name, queueSongIds)
  }

  const addQueueToPlaylist = (playlistId: number) => {
    const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
    onAddSongsToPlaylist(playlistId, queueSongIds)
    showUndo(
      queueSongIds.length === 1
        ? t('notification.songAddedTo', {
            title: songs.find((song) => song.id === queueSongIds[0])!.title,
            target: targetPlaylist.name,
          })
        : formatSongsAddedTo(t, queueSongIds.length, targetPlaylist.name),
      () => removeSongsFromPlaylist(playlistId, queueSongIds),
    )
  }

  const toggleMultiSelect = () => {
    setMultiSelect((current) => {
      if (current) {
        clearSelection()
      }
      return !current
    })
  }

  const addToPlaylistOverflowItem = getAddToPlaylistMenuFlyoutItem({
    playlists: customPlaylists,
    songIds: queueSongIds,
    t,
    defaultPlaylistName: defaultNewPlaylistName,
    currentPlaylistName: t('common.nowPlaying'),
    includeFavorites: queueSongIds.some((songId) => !favoriteSongIdSet.has(songId)),
    onToggleFavorite: addQueueToFavorites,
    onCreatePlaylist: createPlaylistFromQueue,
    onAddToPlaylist: addQueueToPlaylist,
  })
  const locateCurrentOverflowItem: MenuFlyoutItem = {
    key: 'locate-current',
    text: t('nowPlaying.locateCurrent'),
    icon: 'songs' as const,
    disabled: !canUseQueueCommands || !currentSong,
    onClick: () => {
      locateCurrent()
    },
  }
  const clearQueueOverflowItem: MenuFlyoutItem = {
    key: 'clear-queue',
    text: t('nowPlaying.clearQueue'),
    icon: 'close' as const,
    disabled: !canUseQueueCommands,
    onClick: onClearQueue,
  }
  const playModeOverflowItem: MenuFlyoutItem = {
    key: 'play-mode',
    text: t('nowPlaying.playMode'),
    icon: 'fullscreen' as const,
    disabled: !canUseQueueCommands || !currentSong,
    onClick: onOpenImmersiveMode,
  }
  const multiSelectOverflowItem: MenuFlyoutItem = {
    key: 'multi-select',
    text: t('albums.multiSelect'),
    icon: 'multiSelect' as const,
    disabled: !canUseQueueCommands,
    onClick: toggleMultiSelect,
  }
  const nowPlayingOverflowItems: MenuFlyoutItem[] = addToPlaylistOverflowItem
    ? [locateCurrentOverflowItem, addToPlaylistOverflowItem, clearQueueOverflowItem, playModeOverflowItem, multiSelectOverflowItem]
    : [locateCurrentOverflowItem, clearQueueOverflowItem, playModeOverflowItem, multiSelectOverflowItem]

  const renderPrimaryNowPlayingCommands = (variant: 'page' | 'appbar') => (
    <>
      <CommandBarButton
        icon="play"
        label={t('nowPlaying.quickPlay')}
        canOverflow={variant === 'page'}
        disabled={!canUseLibraryCommands}
        onClick={() => {
          void playQuick()
        }}
      />
      <CommandBarButton
        icon="shuffle"
        label={t('nowPlaying.randomPlay')}
        canOverflow={variant === 'page'}
        disabled={!canUseLibraryCommands}
        ariaHasPopup="menu"
        ariaExpanded={randomMenuPosition != null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setRandomMenuPosition({ x: rect.left, y: rect.bottom + 4, anchor: event.currentTarget })
        }}
        onOverflowClick={(position) => {
          setRandomMenuPosition(position)
        }}
      />
      {variant === 'page' && canUseQueueCommands ? (
        <CommandBarButton
          icon="songs"
          label={t('nowPlaying.locateCurrent')}
          disabled={!currentSong}
          onClick={() => {
            locateCurrent()
          }}
        />
      ) : null}
      {variant === 'page' && canUseQueueCommands ? (
        <>
          <CommandBarButton
            icon="plus"
            label={t('context.addToPlaylist')}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              openAddToMenu(rect.left, rect.bottom + 8, event.currentTarget)
            }}
            onOverflowClick={(position) => {
              openAddToMenu(position.x, position.y)
            }}
          />
          <CommandBarButton
            icon="close"
            label={t('nowPlaying.clearQueue')}
            onClick={onClearQueue}
          />
          <CommandBarButton
            icon="fullscreen"
            label={t('nowPlaying.playMode')}
            disabled={!currentSong}
            onClick={onOpenImmersiveMode}
          />
          <CommandBarButton
            active={multiSelect}
            icon="multiSelect"
            label={t('albums.multiSelect')}
            onClick={toggleMultiSelect}
          />
        </>
      ) : null}
    </>
  )

  useEffect(() => {
    const listShell = listShellRef.current
    if (!listShell) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(listShell.clientHeight)
    })
    setViewportHeight(listShell.clientHeight)
    resizeObserver.observe(listShell)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (songs.length > 0) {
      window.requestAnimationFrame(() => {
        locateCurrent('auto')
      })
    }
  }, [isCompactQueueLayout, selectedQueueIndex, selectedTrackId, searchQuery, songs.length, viewportHeight])
  const onListScrollbarPointerDown = useCustomScrollbar({
    frameRef: listScrollFrameRef,
    scrollContainerRef: listShellRef,
    scrollbarTrackRef: listScrollbarTrackRef,
    refreshDependencies: [listHeight, isCompactQueueLayout, visibleSongs.length],
  })

  return (
    <section className="now-playing-page page-panel">
      <AppBarPortal>
        <CommandBar
          className="appbar-commandbar now-playing-appbar-commandbar"
          overflowItems={canUseQueueCommands ? nowPlayingOverflowItems : []}
          overflowLabel={t('player.more')}
        >
          {renderPrimaryNowPlayingCommands('appbar')}
        </CommandBar>
      </AppBarPortal>

      <CommandBar className="now-playing-commandbar" overflowLabel={t('player.more')}>
        {renderPrimaryNowPlayingCommands('page')}
      </CommandBar>

      {randomMenuPosition ? (
        <MenuFlyout
          position={randomMenuPosition}
          items={randomActions}
          onClose={() => {
            setRandomMenuPosition(null)
          }}
        />
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="now-playing-list-scroll-frame custom-scrollbar-frame" ref={listScrollFrameRef}>
        <section
          className="now-playing-list-shell custom-scrollbar-container"
          ref={listShellRef}
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop)
          }}
        >
          {visibleSongs.length === 0 ? (
            loading ? (
              <LoadingState t={t} compact />
            ) : songs.length > 0 ? (
              <div className="empty-state compact">
                <h3>{t('nowPlaying.noQueueMatch', { query: searchQuery })}</h3>
                <p>{t('nowPlaying.queueSearchHelp')}</p>
              </div>
            ) : (
              null
            )
          ) : (
            <div className="now-playing-playlist-control" style={{ minHeight: listHeight }}>
            {topSpacerHeight > 0 ? <div className="now-playing-virtual-spacer" style={{ height: topSpacerHeight }} /> : null}
            {renderedEntries.map(({ song, queueIndex }) => {
              const current = selectedQueueIndex == null ? song.id === selectedTrackId : queueIndex === selectedQueueIndex

              return (
                <PlaylistControlItem
                  key={queueEntryKeys[queueIndex]}
                  containerRef={current ? currentRowRef : undefined}
                  song={song}
                  t={t}
                  current={current}
                  playing={isPlaying}
                  selected={selectedQueueIndexes.has(queueIndex)}
                  selectionMode={multiSelect}
                  dropPosition={dropIndicator?.queueIndex === queueIndex ? dropIndicator.position : null}
                  queueSongIds={queueSongIds}
                  touchReorderIndex={queueIndex}
                  onPlayTrack={(trackId, nextQueueSongIds) => {
                    onPlayTrack(trackId, nextQueueSongIds, queueIndex)
                  }}
                  onTogglePlayPause={onTogglePlayPause}
                  onToggleSelection={() => toggleSelection(queueIndex)}
                  onToggleFavorite={(songId, favorite) => {
                    onToggleFavorite(songId, favorite)
                  }}
                  onRemoveFromListClick={(contextSong) => {
                    onReplaceQueue(queueSongIds.filter((_, index) => index !== queueIndex))
                    showUndo(t('notification.removedFrom', { title: contextSong.title, target: t('common.nowPlaying') }), () =>
                      onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, queueIndex, [contextSong.id])),
                    )
                  }}
                  onAddToPlaylistClick={(contextSong, x, y) => {
                    setAddToMenu({
                      x,
                      y,
                      songIds: [contextSong.id],
                      defaultPlaylistName: getNextPlaylistName(contextSong.title, playlists),
                    })
                  }}
                  onContextMenu={(contextSong, x, y) => {
                    setSongMenu({ song: contextSong, queueIndex, x, y })
                  }}
                  onSeeAlbum={(contextSong) => {
                    navigate(`/albums?album=${encodeURIComponent(contextSong.album || t('common.albumUnknown'))}`)
                  }}
                  onSeeArtist={(artist) => {
                    navigate(`/artists?artist=${encodeURIComponent(artist)}`)
                  }}
                  onDragStart={(event) => {
                    draggedQueueIndexRef.current = queueIndex
                    setDropIndicator(null)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', String(queueIndex))
                  }}
                  onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropIndicator({
                    queueIndex,
                    position: getDropPosition(event),
                  })
                }}
                  onDragLeave={() => {
                    setDropIndicator((current) => current?.queueIndex === queueIndex ? null : current)
                  }}
                  onDrop={(event) => {
                  event.preventDefault()
                  const draggedQueueIndex = draggedQueueIndexRef.current
                  draggedQueueIndexRef.current = null
                  const insertAfter = getDropPosition(event) === 'after'
                  setDropIndicator(null)
                  if (draggedQueueIndex == null || draggedQueueIndex === queueIndex) {
                      return
                    }

                    moveQueueSong(draggedQueueIndex, queueIndex, insertAfter)
                  }}
                  onDragEnd={() => {
                    draggedQueueIndexRef.current = null
                    setDropIndicator(null)
                  }}
                  onTouchReorderStart={() => {
                    draggedQueueIndexRef.current = queueIndex
                    setDropIndicator(null)
                  }}
                  onTouchReorderMove={moveTouchQueueDrag}
                  onTouchReorderEnd={completeTouchQueueDrag}
                  onTouchReorderCancel={() => {
                    draggedQueueIndexRef.current = null
                    setDropIndicator(null)
                  }}
                />
              )
            })}
            {bottomSpacerHeight > 0 ? <div className="now-playing-virtual-spacer" style={{ height: bottomSpacerHeight }} /> : null}
            </div>
          )}
        </section>
        <CustomScrollbar
          scrollbarTrackRef={listScrollbarTrackRef}
          onThumbPointerDown={onListScrollbarPointerDown}
        />
      </div>

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedVisibleSongIds.length}
        t={t}
        playlists={playlists}
        removeLabel={t('nowPlaying.remove')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedVisibleSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            x: rect.left,
            y: rect.top - 8,
            anchor: event.currentTarget,
            songIds: selectedVisibleSongIds,
            defaultPlaylistName: defaultNewPlaylistName,
          })
        }}
        onRemove={() => {
          const removedSongIds = selectedVisibleQueueIndexes.map((queueIndex) => queueSongIds[queueIndex]!)
          const insertIndex = selectedVisibleQueueIndexes[0]!
          const removeMessage = selectedVisibleEntries.length === 1
            ? t('notification.removedFrom', { title: selectedVisibleEntries[0]!.song.title, target: t('common.nowPlaying') })
            : formatSongsRemovedFrom(t, selectedVisibleSongIds.length, t('common.nowPlaying'))
          onReplaceQueue(queueSongIds.filter((_, index) => !selectedVisibleQueueIndexes.includes(index)))
          showUndo(removeMessage, () =>
            onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertIndex, removedSongIds)),
          )
          clearSelection()
        }}
        onSelectAll={() => {
          setSelectedQueueIndexes(new Set(visibleEntries.map((entry) => entry.queueIndex)))
        }}
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
              showRemove: true,
              showSelect: true,
              showDelete: true,
            },
            playlists,
            folders,
            currentPlaylistName: t('common.nowPlaying'),
            excludePlaylistName: '',
            currentTrackId: selectedTrackId,
            isPlaying,
            t,
            onPlay: () => {
              onPlayTrack(songMenu.song.id, queueSongIds, songMenu.queueIndex)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id, songMenu.queueIndex)
            },
            onAddToNowPlaying: () => {
              const insertedIndex = queueSongIds.length
              onReplaceQueue([...queueSongIds, songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
              )
            },
            onCreatePlaylist: (name) => {
              void createPlaylist(name, [songMenu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongToPlaylist(playlistId, songMenu.song.id)
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: targetPlaylist.name }), () =>
                removeSongFromPlaylist(playlistId, songMenu.song.id),
              )
            },
            onRemove: () => {
              onReplaceQueue(queueSongIds.filter((_, index) => index !== songMenu.queueIndex))
              showUndo(t('notification.removedFrom', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, songMenu.queueIndex, [songMenu.song.id])),
              )
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedQueueIndexes(new Set([songMenu.queueIndex]))
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
            onSeeLocal: () => {
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
              const removedQueueEntries = queueSongIds
                .map((songId, index) => ({ index, songId }))
                .filter((entry) => entry.songId === songMenu.song.id)
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveSongs([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                await resumeHiddenStorageItemByPath(songMenu.song.path)
                onReplaceQueue(insertQueueEntries(useLibraryStore.getState().snapshot.nowPlaying.songIds, removedQueueEntries))
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
      {addToMenuItem?.submenu ? (
        <MenuFlyout
          position={addToMenu!}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={addToMenuItem.submenu}
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

interface NowPlayingSongMenuState {
  song: LibrarySong
  queueIndex: number
  x: number
  y: number
}

interface NowPlayingAddToMenuState extends MenuFlyoutPosition {
  songIds: number[]
  defaultPlaylistName: string
}

function getDefaultNewPlaylistName(t: Translator, playlists: LibraryPlaylist[]) {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return getNextPlaylistName(`${t('common.nowPlaying')} - ${year}/${month}/${day}`, playlists)
}

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  const playlistNames = new Set(playlists.map((playlist) => playlist.name))
  const siblingCount = playlists.filter((playlist) => playlist.name.startsWith(name)).length
  for (let index = 1; index <= siblingCount; index += 1) {
    const nextName = `${name} (${index})`
    if (!playlistNames.has(nextName)) {
      return nextName
    }
  }

  return name
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}
