import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

import { AppBar, APPBAR_PAGE_ACTIONS_ID } from './components/AppBar'
import { CustomScrollbar } from './components/CustomScrollbar'
import { DialogHost } from './components/DialogHost'
import { MediaControl } from './components/MediaControl'
import { RenameDialog } from './components/RenameDialog'
import { ReleaseNotesDialog } from './components/ReleaseNotesDialog'
import { Sidebar } from './components/Sidebar'
import { shuffleSongIds } from './components/headeredPlaylistModel'
import { Icon } from './components/icons'
import { InAppNotificationWithButton } from './components/InAppNotificationWithButton'
import { useAppWindowController, useWindowControlsLight } from './hooks/useAppWindowController'
import { useOpenFilesPlayback } from './hooks/useOpenFilesPlayback'
import { usePlaybackCommands } from './hooks/usePlaybackCommands'
import { usePlaybackController } from './hooks/usePlaybackController'
import { useRevealItem } from './hooks/useRevealItem'
import { useReleaseNotesVersion } from './hooks/useReleaseNotesVersion'
import { useScrollbarHoverClass } from './hooks/useScrollbarHoverClass'
import { useCustomScrollbar } from './hooks/useCustomScrollbar'
import { useDeleteSongFromDisk } from './hooks/useDeleteSongFromDisk'
import { useSearchController } from './hooks/useSearchController'
import { useTrackNotification } from './hooks/useTrackNotification'
import { useTouchContextMenu } from './hooks/useTouchContextMenu'
import { useVoiceAssistantController } from './hooks/useVoiceAssistantController'
import { useUndoableNotificationStore } from './state/useUndoableNotificationStore'
import { LocalTitleGrid } from './pages/LocalTitleGrid'
import { MiniModePage } from './pages/MiniModePage'
import { NowPlayingFullPage } from './pages/NowPlayingFullPage'
import type { LibrarySong } from './shared/contracts'
import { getDisplayArtists } from './shared/artists'
import { createTranslator, resolveLocale } from './shared/i18n'
import { getNextPlaylistName } from './shared/playlistNames'
import { quickPlay } from './shared/QuickPlayHelper'
import { AppRoutes } from './AppRoutes'
import {
  applyThemeColor,
  getClockMinute,
  getNextClockMinuteDelay,
  getPageTitle,
  getRouteSection,
  getScrollElementKey,
  getSearchFolderName,
  getSearchFolderPath,
  isAlbumDetailRoute,
  isClockMinuteInRange,
  isPlaylistDetailRoute,
  NAVIGATION_MINIMAL_BREAKPOINT,
  NAVIGATION_OVERLAY_BREAKPOINT,
  RESTORABLE_ROUTES,
  RESTORABLE_SCROLL_SELECTORS,
  SCROLLBAR_HOST_SELECTOR,
  SCROLLBAR_HOVER_CLASS,
  settingsTimeToMinute,
} from './appModel'
import { useLibraryStore } from './state/useLibraryStore'
import { usePreferenceStore } from './state/usePreferenceStore'
import './App.css'

function App() {
  useTouchContextMenu()

  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [resolvedArtwork, setResolvedArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const updateResolvedArtwork = useCallback((trackId: number, artworkUrl: string) => {
    setResolvedArtwork((current) => {
      if (current?.trackId === trackId && current.artworkUrl === artworkUrl) {
        return current
      }

      return { trackId, artworkUrl }
    })
  }, [])
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('smplayer:navigation-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [isNavigationMinimal, setIsNavigationMinimal] = useState(() => window.innerWidth < NAVIGATION_MINIMAL_BREAKPOINT)
  const [isNavigationOverlay, setIsNavigationOverlay] = useState(() =>
    window.innerWidth >= NAVIGATION_MINIMAL_BREAKPOINT && window.innerWidth < NAVIGATION_OVERLAY_BREAKPOINT,
  )
  const [isMinimalNavigationOpen, setIsMinimalNavigationOpen] = useState(false)
  const navigationModeRef = useRef<'minimal' | 'overlay' | 'wide'>(
    window.innerWidth < NAVIGATION_MINIMAL_BREAKPOINT
      ? 'minimal'
      : window.innerWidth < NAVIGATION_OVERLAY_BREAKPOINT
        ? 'overlay'
        : 'wide',
  )
  const hasSeenNavigationRef = useRef(false)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const workspaceContentRef = useRef<HTMLElement | null>(null)
  const workspaceScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const currentRouteScrollKeyRef = useRef('')
  const routeScrollPositionsRef = useRef(new Map<string, Map<string, { top: number; left: number }>>())
  const routeMemoryRef = useRef(new Map<string, string>())
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [navigationDepth, setNavigationDepth] = useState(0)
  const [showNowPlayingFullPage, setShowNowPlayingFullPage] = useState(false)
  const [startupNightModeActive] = useState(() =>
    document.body.classList.contains('night-mode') || document.documentElement.classList.contains('night-mode'),
  )
  const [windowControlClockMinute, setWindowControlClockMinute] = useState(getClockMinute)
  const [isCreatePlaylistDialogOpen, setIsCreatePlaylistDialogOpen] = useState(false)
  const [pendingCreatedPlaylistName, setPendingCreatedPlaylistName] = useState('')
  const [compactArtistTitle, setCompactArtistTitle] = useState('')
  const [immersiveHeaderTitle, setImmersiveHeaderTitle] = useState('')
  const [isLibraryQuickJumpOpen, setIsLibraryQuickJumpOpen] = useState(false)
  const revealItem = useRevealItem()

  const snapshot = useLibraryStore((state) => state.snapshot)
  const loading = useLibraryStore((state) => state.loading)
  const pageLoading = loading || !initialLoadComplete
  const scanning = useLibraryStore((state) => state.scanning)
  const moveProgress = useLibraryStore((state) => state.moveProgress)
  const error = useLibraryStore((state) => state.error)
  const refresh = useLibraryStore((state) => state.refresh)
  const refreshShell = useLibraryStore((state) => state.refreshShell)
  const loadFolders = useLibraryStore((state) => state.loadFolders)
  const loadRecent = useLibraryStore((state) => state.loadRecent)
  const loadSongs = useLibraryStore((state) => state.loadSongs)
  const scanLibrary = useLibraryStore((state) => state.scanLibrary)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist)
  const restorePlaylist = useLibraryStore((state) => state.restorePlaylist)
  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const reorderPlaylists = useLibraryStore((state) => state.reorderPlaylists)
  const recordRecentPlaylistPlayed = useLibraryStore((state) => state.recordRecentPlaylistPlayed)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const moveLocalItemsToFolder = useLibraryStore((state) => state.moveLocalItemsToFolder)
  const clearNowPlaying = useLibraryStore((state) => state.clearNowPlaying)
  const saveSearchQuery = useLibraryStore((state) => state.saveSearchQuery)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const restoreRecentSearch = useLibraryStore((state) => state.restoreRecentSearch)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const updateSettings = useLibraryStore((state) => state.updateSettings)
  const saveViewState = useLibraryStore((state) => state.saveViewState)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const onWorkspaceScrollbarPointerDown = useCustomScrollbar({
    frameRef: workspaceRef,
    scrollContainerRef: workspaceContentRef,
    scrollbarTrackRef: workspaceScrollbarTrackRef,
    disabled: showNowPlayingFullPage,
    refreshDependencies: [
      location.pathname,
      location.search,
      snapshot.counts.songs,
      snapshot.playlists.length,
      snapshot.folders.length,
      snapshot.nowPlaying.songIds.length,
      isNavigationMinimal,
    ],
  })
  const [localRelativePath, setLocalRelativePath] = useState('')
  const handleEnterMiniMode = useCallback(() => {
    setShowNowPlayingFullPage(false)
  }, [])
  const appWindow = useAppWindowController({
    onScanLibrary: scanLibrary,
    onEnterMiniMode: handleEnterMiniMode,
  })
  const settingsNightModeActive = snapshot.settings.nightMode === 'on' || (
    snapshot.settings.nightMode === 'auto' &&
    isClockMinuteInRange(
      windowControlClockMinute,
      settingsTimeToMinute(snapshot.settings.nightModeStartTime),
      settingsTimeToMinute(snapshot.settings.nightModeEndTime),
    )
  )
  const nightModeActive = initialLoadComplete ? settingsNightModeActive : startupNightModeActive
  const usesLightWindowControls = appWindow.isMiniMode || nightModeActive
  useWindowControlsLight(usesLightWindowControls)

  useEffect(() => {
    document.documentElement.classList.toggle('night-mode', nightModeActive)
    document.documentElement.classList.remove('startup-night-mode')
    document.body.classList.toggle('night-mode', nightModeActive)
    document.documentElement.style.backgroundColor = ''
    document.body.style.backgroundColor = ''
    document.getElementById('root')?.style.removeProperty('background-color')

    return () => {
      document.documentElement.classList.remove('night-mode')
      document.body.classList.remove('night-mode')
    }
  }, [nightModeActive])

  useEffect(() => {
    if (snapshot.settings.nightMode !== 'auto') {
      setWindowControlClockMinute(getClockMinute())
      return
    }

    let timeout = 0
    const scheduleNextNightModeBoundary = () => {
      timeout = window.setTimeout(() => {
        setWindowControlClockMinute(getClockMinute())
        scheduleNextNightModeBoundary()
      }, getNextClockMinuteDelay([
        settingsTimeToMinute(snapshot.settings.nightModeStartTime),
        settingsTimeToMinute(snapshot.settings.nightModeEndTime),
      ]))
    }

    setWindowControlClockMinute(getClockMinute())
    scheduleNextNightModeBoundary()

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    snapshot.settings.nightMode,
    snapshot.settings.nightModeEndTime,
    snapshot.settings.nightModeStartTime,
  ])

  useEffect(() => {
    if (!pendingCreatedPlaylistName) {
      return
    }

    const playlist = snapshot.playlists.find((item) => item.name === pendingCreatedPlaylistName)
    if (playlist) {
      navigate(`/playlists/${playlist.id}`)
      void saveViewState({ lastPlaylistId: playlist.id })
      setPendingCreatedPlaylistName('')
    }
  }, [navigate, pendingCreatedPlaylistName, saveViewState, snapshot.playlists])

  const {
    releaseNotesDialogVersion,
    setReleaseNotesDialogVersion,
  } = useReleaseNotesVersion({
    ready: initialLoadComplete,
    lastReleaseNotesVersion: snapshot.settings.lastReleaseNotesVersion,
  })

  const playback = usePlaybackController(snapshot, initialLoadComplete)
  const playbackCommands = usePlaybackCommands({
    playTrack: playback.playTrack,
    currentTrackId: playback.currentTrackId,
    currentQueueIndex: playback.currentQueueIndex,
    mode: playback.mode,
  })
  const {
    searchInput,
    submittedSearchQuery,
    searchResultQuery,
    searchResultsLoading,
    setSearchInput,
    commitSearchQuery,
    commitDirectorySearchQuery,
  } = useSearchController({
    navigate,
    saveSearchQuery,
    addRecentSearch,
  })
  const routeScrollKey = `${location.pathname}${location.search}`
  const routeSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const targetAlbumQuery = routeSearchParams.get('album')
  const currentRouteSection = getRouteSection(location.pathname)
  const isInAlbumDetail = isAlbumDetailRoute(location.pathname) || (location.pathname === '/albums' && targetAlbumQuery != null)

  useEffect(() => {
    if (currentRouteSection && currentRouteSection !== '/albums') {
      routeMemoryRef.current.set(currentRouteSection, currentRouteSection === '/artists' ? `${location.pathname}${location.search}` : location.pathname)
    }
  }, [currentRouteSection, location.pathname, location.search])

  const getRestoredNavTarget = (target: string) => {
    if (target === '/albums') {
      return target
    }

    if (target === '/playlists') {
      return target
    }

    return routeMemoryRef.current.get(target) ?? target
  }

  const goBackFromSidebar = () => {
    if (isInAlbumDetail && navigationDepth === 0) {
      navigate('/albums', { replace: true })
      return
    }

    if (isPlaylistDetailRoute(location.pathname) && navigationDepth === 0) {
      navigate('/playlists', { replace: true })
      return
    }

    navigate(-1)
  }

  const saveScrollElement = (element: HTMLElement) => {
    const root = workspaceContentRef.current
    if (!root || element !== root && !root.contains(element)) {
      return
    }

    const key = getScrollElementKey(root, element)
    if (!key) {
      return
    }

    const routePositions =
      routeScrollPositionsRef.current.get(currentRouteScrollKeyRef.current) ??
      new Map<string, { top: number; left: number }>()
    routePositions.set(key, { top: element.scrollTop, left: element.scrollLeft })
    routeScrollPositionsRef.current.set(currentRouteScrollKeyRef.current, routePositions)
  }

  const saveScrollSnapshot = () => {
    const root = workspaceContentRef.current
    if (!root) {
      return
    }

    saveScrollElement(root)
    for (const element of root.querySelectorAll(RESTORABLE_SCROLL_SELECTORS.join(','))) {
      saveScrollElement(element as HTMLElement)
    }
  }

  const restoreScrollSnapshot = () => {
    const root = workspaceContentRef.current
    const routePositions = routeScrollPositionsRef.current.get(routeScrollKey)
    if (!root) {
      return
    }

    const restoreElement = (element: HTMLElement) => {
      const key = getScrollElementKey(root, element)
      const position = key ? routePositions?.get(key) : undefined
      element.scrollTo(position ?? { top: 0, left: 0 })
    }

    restoreElement(root)
    for (const element of root.querySelectorAll(RESTORABLE_SCROLL_SELECTORS.join(','))) {
      restoreElement(element as HTMLElement)
    }
  }

  const t = useMemo(
    () => createTranslator(snapshot.settings.preferredLanguage),
    [snapshot.settings.preferredLanguage],
  )
  const deleteSongFromDisk = useDeleteSongFromDisk(t)
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const currentPlaybackSong = playback.currentTrack
    ? songsById.get(playback.currentTrack.id) ?? playback.currentTrack
    : null
  const nowPlayingSongs = useMemo(
    () =>
      snapshot.nowPlaying.songIds
        .map((songId) => songsById.get(songId) ?? null)
        .filter((song): song is LibrarySong => song != null),
    [snapshot.nowPlaying.songIds, songsById],
  )
  const showCount = snapshot.settings.showCount
  const playerTrack = currentPlaybackSong
    ? {
        id: currentPlaybackSong.id,
        title: currentPlaybackSong.title,
        artist:
          currentPlaybackSong.artist ||
          getDisplayArtists(currentPlaybackSong, t('common.artistUnknown')) ||
          currentPlaybackSong.album ||
          t('common.artistUnknown'),
        artworkUrl:
          currentPlaybackSong.artworkUrl ||
          (resolvedArtwork?.trackId === currentPlaybackSong.id ? resolvedArtwork.artworkUrl : ''),
        isLoading: playback.status === 'loading' || playback.status === 'buffering',
        favorite: currentPlaybackSong.favorite,
      }
    : {
        id: null,
        title: pageLoading ? t('nowPlaying.loading') : '',
        artist: '',
        artworkUrl: '',
        isLoading: pageLoading,
        favorite: false,
      }

  const refreshOpenFilesPlayback = useCallback(async () => {
    if (useLibraryStore.getState().songsLoaded) {
      await refresh()
      return
    }

    await refreshShell()
    await loadSongs()
  }, [loadSongs, refresh, refreshShell])

  useEffect(() => {
    let isDisposed = false

    void refreshShell().finally(() => {
      if (!isDisposed) {
        setInitialLoadComplete(true)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [refreshShell])

  useOpenFilesPlayback({
    songs: snapshot.songs,
    refresh: refreshOpenFilesPlayback,
    playTrack: playbackCommands.playTrack,
  })

  useEffect(() => {
    if (showNowPlayingFullPage) {
      void Promise.all([loadSongs(), loadRecent()])
    }
  }, [loadRecent, loadSongs, showNowPlayingFullPage])

  useEffect(() => {
    if (location.pathname === '/') {
      return
    }

    const nextLastPage = location.pathname.startsWith('/local/') ? '/local' : location.pathname
    if (RESTORABLE_ROUTES.has(nextLastPage)) {
      void saveViewState({ lastPage: nextLastPage })
    }
  }, [location.pathname, saveViewState])

  useEffect(() => {
    currentRouteScrollKeyRef.current = routeScrollKey
    window.requestAnimationFrame(() => {
      restoreScrollSnapshot()
      window.requestAnimationFrame(restoreScrollSnapshot)
    })

    return saveScrollSnapshot
  }, [routeScrollKey])

  useEffect(() => {
    if (!hasSeenNavigationRef.current) {
      hasSeenNavigationRef.current = true
      return
    }

    setNavigationDepth((current) => {
      if (navigationType === 'PUSH') {
        return current + 1
      }

      if (navigationType === 'POP') {
        return Math.max(0, current - 1)
      }

      return current
    })
  }, [location.key, navigationType])

  useEffect(() => {
    applyThemeColor(snapshot.settings.themeColor)
  }, [snapshot.settings.themeColor])

  useScrollbarHoverClass(SCROLLBAR_HOST_SELECTOR, SCROLLBAR_HOVER_CLASS)

  useEffect(() => {
    try {
      window.localStorage.setItem('smplayer:navigation-collapsed', String(isNavigationCollapsed))
    } catch {
      // Ignore storage failures in restricted renderer previews.
    }
  }, [isNavigationCollapsed])

  useEffect(() => {
    const updateNavigationMode = () => {
      const width = window.innerWidth
      const nextIsMinimal = width < NAVIGATION_MINIMAL_BREAKPOINT
      const nextIsOverlay = width >= NAVIGATION_MINIMAL_BREAKPOINT && width < NAVIGATION_OVERLAY_BREAKPOINT
      const nextNavigationMode = nextIsMinimal ? 'minimal' : nextIsOverlay ? 'overlay' : 'wide'
      const navigationModeChanged = nextNavigationMode !== navigationModeRef.current

      setIsNavigationOverlay(nextIsOverlay)
      setIsNavigationMinimal(nextIsMinimal)
      if (navigationModeChanged) {
        if (nextNavigationMode === 'wide') {
          setIsNavigationCollapsed(false)
        } else {
          setIsNavigationCollapsed(true)
          setIsMinimalNavigationOpen(false)
        }
      } else if (!nextIsMinimal) {
        setIsMinimalNavigationOpen(false)
      }
      navigationModeRef.current = nextNavigationMode
    }

    updateNavigationMode()
    window.addEventListener('resize', updateNavigationMode)
    return () => {
      window.removeEventListener('resize', updateNavigationMode)
    }
  }, [])

  useEffect(() => {
    const updateLibraryQuickJumpOpen = (event: Event) => {
      setIsLibraryQuickJumpOpen(Boolean((event as CustomEvent<boolean>).detail))
    }

    window.addEventListener('smplayer:library-quick-jump-open-change', updateLibraryQuickJumpOpen)
    return () => {
      window.removeEventListener('smplayer:library-quick-jump-open-change', updateLibraryQuickJumpOpen)
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/songs') {
      setIsLibraryQuickJumpOpen(false)
    }
  }, [location.pathname])

  useEffect(() => {
    const updateImmersiveHeaderTitle = (event: Event) => {
      setImmersiveHeaderTitle((event as CustomEvent<{ title: string }>).detail.title)
    }

    window.addEventListener('smplayer:immersive-title-change', updateImmersiveHeaderTitle)
    return () => {
      window.removeEventListener('smplayer:immersive-title-change', updateImmersiveHeaderTitle)
    }
  }, [])

  useEffect(() => {
    setImmersiveHeaderTitle('')
  }, [location.pathname, location.search])

  useTrackNotification(currentPlaybackSong, t)

  async function playQuick() {
    await Promise.all([loadSongs(), loadFolders(), loadRecent()])
    const preferences = await usePreferenceStore.getState().refresh()
    if (!preferences) {
      return
    }

    const currentSnapshot = useLibraryStore.getState().snapshot
    const songIds = quickPlay({
      songs: currentSnapshot.songs,
      recentSongs: currentSnapshot.recentSongs,
      playlists: currentSnapshot.playlists,
      folders: currentSnapshot.folders,
      preferences,
    })
    await playbackCommands.setMusicAndPlay(songIds)
  }

  async function randomPlayPlaylist(playlistId: number) {
    const playlist = snapshot.playlists.find((item) => item.id === playlistId)!
    await recordRecentPlaylistPlayed(playlistId)
    await playbackCommands.setMusicAndPlay(shuffleSongIds(playlist.songIds))
  }

  const voiceAssistant = useVoiceAssistantController({
    snapshot,
    songsById,
    playback,
    playbackCommands,
    t,
    playQuick,
    commitSearchQuery,
  })

  const isLocalRoute = location.pathname === '/local'
  const isHeaderedPlaylistRoute = isInAlbumDetail ||
    location.pathname.startsWith('/playlists/') ||
    location.pathname.startsWith('/favorites')
  const canNavigateBack = navigationDepth > 0 || isInAlbumDetail || isPlaylistDetailRoute(location.pathname)
  const isNavigationRail = isNavigationMinimal ? !isMinimalNavigationOpen : isNavigationCollapsed
  const useCollapsedShellLayout = isNavigationMinimal || isNavigationRail
  const isNavigationOverlayOpen = isNavigationMinimal
    ? isMinimalNavigationOpen
    : isNavigationOverlay && !isNavigationCollapsed
  const currentLocalRelativePath = isLocalRoute ? localRelativePath : ''
  const searchFolderRelativePath = new URLSearchParams(location.search).get('folder') ?? ''
  const searchFolderPath = getSearchFolderPath(snapshot.settings.rootPath, searchFolderRelativePath)
  const searchFolderName = getSearchFolderName(snapshot.settings.rootPath, searchFolderRelativePath)
  const currentPageTitle = compactArtistTitle || immersiveHeaderTitle ||
    (location.pathname === '/' && !initialLoadComplete
    ? ''
    : isInAlbumDetail
      ? ''
    : getPageTitle(
      location.pathname,
      snapshot.counts,
      t,
      showCount,
      submittedSearchQuery,
      searchFolderName,
      snapshot.nowPlaying.songIds.length,
      snapshot.playlists.filter((playlist) => !playlist.isBuiltIn).length,
    ))
  const toggleNavigation = () => {
    if (isNavigationMinimal) {
      setIsMinimalNavigationOpen((current) => !current)
      return
    }

    setIsNavigationCollapsed((current) => !current)
  }

  const startMinimalTitlebarDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button')) {
      return
    }

    appWindow.startWindowDrag(event)
  }

  useEffect(() => {
    if (!isNavigationOverlayOpen) {
      return
    }

    const closeNavigationOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.sidebar')) {
        return
      }

      if (isNavigationMinimal) {
        setIsMinimalNavigationOpen(false)
      } else {
        setIsNavigationCollapsed(true)
      }
    }

    document.addEventListener('pointerdown', closeNavigationOnOutsidePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', closeNavigationOnOutsidePointerDown, true)
    }
  }, [isNavigationMinimal, isNavigationOverlayOpen])

  const playerControlBindings = {
    isPlaying: playback.isPlaying,
    volume: playback.volume,
    isMuted: playback.isMuted,
    mode: playback.mode,
    onTogglePlayPause: () => {
      void playback.togglePlayPause()
    },
    onPrevious: () => {
      void playback.playPrevious()
    },
    onNext: () => {
      void playback.playNext()
    },
    onSeek: playback.seekToSeconds,
    onBeginSeek: playback.beginSeek,
    onEndSeek: playback.endSeek,
    onVolumeChange: playback.setVolumeLevel,
    onToggleMute: playback.toggleMute,
    onToggleShuffle: playback.toggleShuffle,
    onToggleRepeat: playback.toggleRepeat,
    onToggleRepeatOne: playback.toggleRepeatOne,
    onCycleRepeatMode: playback.cycleRepeatMode,
    onVoiceCommand: voiceAssistant.handleVoiceCommand,
    getVoiceHint: voiceAssistant.getVoiceHint,
    getVoiceHelpText: voiceAssistant.getVoiceHelpText,
    voiceLanguage: resolveLocale(snapshot.settings.preferredLanguage),
  }

  if (appWindow.isMiniMode) {
    return (
      <MiniModePage
        track={playerTrack}
        currentSong={currentPlaybackSong}
        disabled={snapshot.nowPlaying.songIds.length === 0}
        playerLyricsSource={snapshot.settings.playerLyricsSource}
        t={t}
        {...playerControlBindings}
        onQuickPlay={() => {
          void playQuick()
        }}
        onToggleFavorite={() => {
          if (currentPlaybackSong) {
            void setSongFavorite(currentPlaybackSong.id, !currentPlaybackSong.favorite)
          }
        }}
        onExitMiniMode={appWindow.exitMiniMode}
        onArtworkResolved={updateResolvedArtwork}
      />
    )
  }

  return (
    <div
      className={`app-shell${useCollapsedShellLayout ? ' nav-collapsed' : ''}${isNavigationOverlay ? ' nav-overlay' : ''}${isNavigationOverlayOpen && !isNavigationMinimal ? ' nav-overlay-open' : ''}${isNavigationMinimal ? ' nav-minimal' : ''}${isNavigationMinimal && isMinimalNavigationOpen ? ' nav-minimal-open' : ''}${isHeaderedPlaylistRoute ? ' is-headered-playlist-route' : ''}`}
    >
      {isNavigationMinimal ? (
        <div
          className="minimal-titlebar"
          onPointerDownCapture={startMinimalTitlebarDrag}
          onPointerUpCapture={appWindow.stopWindowDrag}
          onPointerCancelCapture={appWindow.stopWindowDrag}
          onLostPointerCapture={appWindow.stopWindowDrag}
        >
          {canNavigateBack ? (
            <button
              className="minimal-titlebar-back-button"
              type="button"
              aria-label={t('sidebar.back')}
              title={t('sidebar.back')}
              onClick={goBackFromSidebar}
            >
              <Icon name="arrowLeft" />
            </button>
          ) : null}
          <span className={canNavigateBack ? 'minimal-titlebar-title has-back-button' : 'minimal-titlebar-title'}>
            {t('app.shell')}
          </span>
        </div>
      ) : null}
      <Sidebar
        t={t}
        collapsed={isNavigationRail}
        appName={t('app.shell')}
        playlists={snapshot.playlists}
        canGoBack={canNavigateBack}
        searchQuery={searchInput}
        recentSearches={snapshot.search.recentSearches}
        getRestoredNavTarget={getRestoredNavTarget}
        onGoBack={goBackFromSidebar}
        onNavigate={() => {
          setShowNowPlayingFullPage(false)
          setIsMinimalNavigationOpen(false)
        }}
        onCreatePlaylist={() => {
          setIsCreatePlaylistDialogOpen(true)
        }}
        onCreatePlaylistWithSongs={(name, songIds) => {
          void createPlaylist(name, songIds)
        }}
        onDeletePlaylist={(playlistId) => {
          const playlistIndex = snapshot.playlists.findIndex((item) => item.id === playlistId)
          const playlist = snapshot.playlists[playlistIndex]!
          void deletePlaylist(playlistId)
          showUndoableNotification(t('notification.playlistRemoved', { name: playlist.name }), t('common.undo'), () =>
            restorePlaylist(playlist, playlistIndex),
          )
        }}
        onRenamePlaylist={(playlistId, name) => {
          void renamePlaylist(playlistId, name)
        }}
        onReorderPlaylists={(playlistIds) => {
          void reorderPlaylists(playlistIds)
        }}
        onRandomPlayPlaylist={(playlistId) => {
          void randomPlayPlaylist(playlistId)
        }}
        onSearchChange={setSearchInput}
        onSearchCommit={(value, type) => {
          void commitSearchQuery(value, type)
          if (isNavigationOverlayOpen) {
            if (isNavigationMinimal) {
              setIsMinimalNavigationOpen(false)
            } else {
              setIsNavigationCollapsed(true)
            }
          }
        }}
        onSearchClear={() => {
          setSearchInput('')
          void saveSearchQuery('')
        }}
        onRecentSearchRemove={(entryId) => {
          const entry = snapshot.search.recentSearches.find((recentSearch) => recentSearch.id === entryId)!
          void removeRecentSearch(entryId)
          showUndoableNotification(t('notification.itemRemoved', { name: entry.query }), t('common.undo'), () =>
            restoreRecentSearch(entry),
          )
        }}
        onRecentSearchesClear={() => {
          void clearRecentSearches()
        }}
        onToggleCollapsed={() => {
          toggleNavigation()
        }}
      />
      <div
        ref={workspaceRef}
        className={
          location.pathname === '/recent' && !isNavigationMinimal
            ? 'workspace custom-scrollbar-frame is-headerless-route'
            : isHeaderedPlaylistRoute
            ? 'workspace custom-scrollbar-frame is-immersive-route is-headered-playlist-route'
            : isLocalRoute
              ? 'workspace custom-scrollbar-frame is-local-route'
              : 'workspace custom-scrollbar-frame'
        }
      >
        {isNavigationMinimal ? (
          <AppBar
            menuLabel={isNavigationRail ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
            onMenuClick={toggleNavigation}
            actions={location.pathname !== '/recent' ? (
              <>
                {location.pathname === '/songs' ? (
                  <button
                    className={`appbar-icon-button appbar-quick-jump-button${isLibraryQuickJumpOpen ? ' is-open' : ''}`}
                    type="button"
                    aria-label="#-Z"
                    title="#-Z"
                    onClick={() => {
                      window.dispatchEvent(new Event('smplayer:library-quick-jump-toggle'))
                    }}
                  >
                    <span>#-Z</span>
                  </button>
                ) : null}
                <div className="appbar-page-actions" id={APPBAR_PAGE_ACTIONS_ID} />
              </>
            ) : undefined}
          >
            {location.pathname === '/recent' ? (
              <div className="appbar-page-actions appbar-title-page-actions" id={APPBAR_PAGE_ACTIONS_ID} />
            ) : isLocalRoute && snapshot.settings.rootPath ? (
              <LocalTitleGrid
                songs={snapshot.songs}
                folders={snapshot.folders}
                playlists={snapshot.playlists}
                favoritePlaylistId={snapshot.favorites.playlistId}
                t={t}
                rootPath={snapshot.settings.rootPath}
                currentRelativePath={currentLocalRelativePath}
                onHiddenFoldersListButtonClick={() => {
                  navigate('/hidden-folders')
                }}
                onOpenFolder={(targetRelativePath) => {
                  setLocalRelativePath(targetRelativePath)
                  navigate('/local', { replace: true })
                }}
                onRevealFolder={revealItem}
                onSearchDirectory={(query, folderRelativePath) => {
                  commitDirectorySearchQuery(query, folderRelativePath)
                }}
                onPlayTrack={(trackId, queueSongIds) => {
                  void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                }}
                onAddSongsToNowPlaying={(songIds) => {
                  void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                }}
                onCreatePlaylistWithSongs={(name, songIds) => {
                  void createPlaylist(name, songIds)
                }}
                onAddSongsToPlaylist={(playlistId, songIds) => {
                  void addSongsToPlaylist(playlistId, songIds)
                }}
                onDropLocalItems={async (payload, targetRelativePath) => {
                  const targetFolderPath = targetRelativePath
                    ? getSearchFolderPath(snapshot.settings.rootPath, targetRelativePath)
                    : snapshot.settings.rootPath
                  await moveLocalItemsToFolder(payload.songIds, payload.folderPaths, targetFolderPath)
                }}
                onMoveLocalItemsToFolder={async (songIds, folderPaths, targetFolderPath) => {
                  await moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath)
                }}
              />
            ) : (
              <h1>{currentPageTitle}</h1>
            )}
          </AppBar>
        ) : (
          <header className="workspace-header">
            {isLocalRoute && snapshot.settings.rootPath ? (
              <LocalTitleGrid
                songs={snapshot.songs}
                folders={snapshot.folders}
                playlists={snapshot.playlists}
                favoritePlaylistId={snapshot.favorites.playlistId}
                t={t}
                rootPath={snapshot.settings.rootPath}
                currentRelativePath={currentLocalRelativePath}
                onHiddenFoldersListButtonClick={() => {
                  navigate('/hidden-folders')
                }}
                onOpenFolder={(targetRelativePath) => {
                  setLocalRelativePath(targetRelativePath)
                  navigate('/local', { replace: true })
                }}
                onRevealFolder={revealItem}
                onSearchDirectory={(query, folderRelativePath) => {
                  commitDirectorySearchQuery(query, folderRelativePath)
                }}
                onPlayTrack={(trackId, queueSongIds) => {
                  void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                }}
                onAddSongsToNowPlaying={(songIds) => {
                  void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                }}
                onCreatePlaylistWithSongs={(name, songIds) => {
                  void createPlaylist(name, songIds)
                }}
                onAddSongsToPlaylist={(playlistId, songIds) => {
                  void addSongsToPlaylist(playlistId, songIds)
                }}
                onDropLocalItems={async (payload, targetRelativePath) => {
                  const targetFolderPath = targetRelativePath
                    ? getSearchFolderPath(snapshot.settings.rootPath, targetRelativePath)
                    : snapshot.settings.rootPath
                  await moveLocalItemsToFolder(payload.songIds, payload.folderPaths, targetFolderPath)
                }}
                onMoveLocalItemsToFolder={async (songIds, folderPaths, targetFolderPath) => {
                  await moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath)
                }}
              />
            ) : (
              <div className="appbar-title-drag-region">
                <h1>{currentPageTitle}</h1>
              </div>
            )}
            <div className="status-pills">
              <span>{t('app.songsCached', { count: snapshot.counts.songs })}</span>
            </div>
          </header>
        )}

        <main
          ref={workspaceContentRef}
          className="workspace-content custom-scrollbar-container"
          onScrollCapture={(event) => {
            saveScrollElement(event.target as HTMLElement)
          }}
        >
          <AppRoutes
            context={{
              initialLoadComplete,
              snapshot,
              t,
              pageLoading,
              scanning,
              error,
              playback,
              playbackCommands,
              revealItem,
              setCompactArtistTitle,
              setShowNowPlayingFullPage,
              showCount,
              commitSearchQuery,
              localRelativePath,
              setLocalRelativePath,
              commitDirectorySearchQuery,
              searchResultQuery,
              submittedSearchQuery,
              searchResultsLoading,
              searchFolderPath,
            }}
          />
        </main>
        <CustomScrollbar
          className="workspace-scrollbar"
          scrollbarTrackRef={workspaceScrollbarTrackRef}
          onThumbPointerDown={onWorkspaceScrollbarPointerDown}
        />
      </div>

      {showNowPlayingFullPage ? (
        <NowPlayingFullPage
          songs={nowPlayingSongs}
          librarySongs={snapshot.songs}
          recentSongs={snapshot.recentSongs}
          playlists={snapshot.playlists}
          favoritePlaylistId={snapshot.favorites.playlistId}
          currentSong={currentPlaybackSong}
          t={t}
          selectedTrackId={playback.currentTrackId}
          selectedQueueIndex={playback.currentQueueIndex}
          loading={pageLoading}
          {...playerControlBindings}
          resolvedArtworkUrl={
            currentPlaybackSong && resolvedArtwork?.trackId === currentPlaybackSong.id
              ? resolvedArtwork.artworkUrl
              : ''
          }
          error={error}
          onClose={() => {
            setShowNowPlayingFullPage(false)
          }}
          onPlayTrack={(trackId, queueSongIds, queueIndex) => {
            void playbackCommands.playTrack(trackId, queueSongIds, queueIndex)
          }}
          onReplaceQueue={(songIds) => {
            void replaceNowPlaying(songIds)
          }}
          onPlayNext={(songId, queueIndex) => {
            void playbackCommands.playNext(songId, queueIndex)
          }}
          onAddSongToPlaylist={(playlistId, songId) => {
            void addSongToPlaylist(playlistId, songId)
          }}
          onAddSongsToPlaylist={(playlistId, songIds) => {
            void addSongsToPlaylist(playlistId, songIds)
          }}
          onRevealSong={revealItem}
          onToggleFavorite={(songId, favorite) => {
            void setSongFavorite(songId, favorite)
          }}
          onRemoveSongs={(songIds) => {
            void replaceNowPlaying(snapshot.nowPlaying.songIds.filter((songId) => !songIds.includes(songId)))
          }}
          onDeleteSongFromDisk={(songId) => {
            void deleteSongFromDisk(songsById.get(songId)!)
          }}
          onClearQueue={() => {
            void clearNowPlaying()
          }}
          onArtworkResolved={updateResolvedArtwork}
          onRefresh={() => {
            void refresh()
          }}
        />
      ) : null}

      <div className={showNowPlayingFullPage ? 'media-control-host is-hidden' : 'media-control-host'}>
        <MediaControl
          track={playerTrack}
          currentSong={currentPlaybackSong}
          playlists={snapshot.playlists}
          queueSongIds={snapshot.nowPlaying.songIds}
          disabled={snapshot.nowPlaying.songIds.length === 0}
          t={t}
          {...playerControlBindings}
          onToggleFavorite={() => {
            if (currentPlaybackSong) {
              void setSongFavorite(currentPlaybackSong.id, !currentPlaybackSong.favorite)
            }
          }}
          onQuickPlay={() => {
            void playQuick()
          }}
          onPlayTrack={(trackId, queueSongIds) => {
            void playbackCommands.playTrackInQueue(trackId, queueSongIds)
          }}
          onOpenNowPlaying={() => {
            setShowNowPlayingFullPage(true)
          }}
          isWindowFullScreen={appWindow.isWindowFullScreen}
          onToggleWindowFullScreen={appWindow.toggleWindowFullScreen}
          onEnterMiniMode={appWindow.enterMiniMode}
          onArtworkResolved={updateResolvedArtwork}
          onSaved={() => {
            void refresh()
          }}
        />
      </div>
      {isCreatePlaylistDialogOpen ? (
        <RenameDialog
          t={t}
          playlists={snapshot.playlists}
          defaultName={getNextPlaylistName(t('common.playlist'), snapshot.playlists, t)}
          onCancel={() => {
            setIsCreatePlaylistDialogOpen(false)
          }}
          onConfirm={(name) => {
            setIsCreatePlaylistDialogOpen(false)
            setPendingCreatedPlaylistName(name)
            void createPlaylist(name, [])
          }}
        />
      ) : null}
      {releaseNotesDialogVersion ? (
        <ReleaseNotesDialog
          t={t}
          preferredLanguage={snapshot.settings.preferredLanguage}
          onClose={async () => {
            await updateSettings({ lastReleaseNotesVersion: releaseNotesDialogVersion })
            setReleaseNotesDialogVersion('')
          }}
        />
      ) : null}
      <DialogHost t={t} />
      {moveProgress ? <MoveProgressOverlay progress={moveProgress} t={t} /> : null}
      <InAppNotificationWithButton />
    </div>
  )
}

function MoveProgressOverlay({
  progress,
  t,
}: {
  progress: NonNullable<ReturnType<typeof useLibraryStore.getState>['moveProgress']>
  t: ReturnType<typeof createTranslator>
}) {
  const percent = progress.max > 0
    ? Math.min(100, Math.max(0, Math.round((progress.progress / progress.max) * 100)))
    : 0
  const currentItem = progress.currentItem.split(/[\\/]/).filter(Boolean).pop() ?? progress.currentItem

  return (
    <div className="move-progress-overlay" role="status" aria-live="polite">
      <section className="move-progress-panel">
        <div className="move-progress-header">
          <span>{t('local.moveProgressTitle')}</span>
          <strong>{percent}%</strong>
        </div>
        <div className="move-progress-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="move-progress-current">
          <span>{t('local.moveProgressCurrent')}</span>
          <strong title={progress.currentItem}>{currentItem}</strong>
        </div>
      </section>
    </div>
  )
}

export default App
