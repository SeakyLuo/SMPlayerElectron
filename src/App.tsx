import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

import { AppBar, APPBAR_PAGE_ACTIONS_ID } from './components/AppBar'
import { CustomScrollbar } from './components/CustomScrollbar'
import { DialogHost } from './components/DialogHost'
import { MediaControl } from './components/MediaControl'
import { RenameDialog } from './components/RenameDialog'
import { ReleaseNotesDialog } from './components/ReleaseNotesDialog'
import { Sidebar } from './components/Sidebar'
import { Icon } from './components/icons'
import { InAppNotificationWithButton } from './components/InAppNotificationWithButton'
import { useOpenFilesPlayback } from './hooks/useOpenFilesPlayback'
import { usePlaybackController } from './hooks/usePlaybackController'
import { useRevealItem } from './hooks/useRevealItem'
import { useScrollbarHoverClass } from './hooks/useScrollbarHoverClass'
import { useCustomScrollbar } from './hooks/useCustomScrollbar'
import { useSearchController } from './hooks/useSearchController'
import { useTrackNotification } from './hooks/useTrackNotification'
import { useVoiceAssistantController } from './hooks/useVoiceAssistantController'
import { useUndoableNotificationStore } from './state/useUndoableNotificationStore'
import { LocalTitleGrid } from './pages/LocalTitleGrid'
import { MiniModePage } from './pages/MiniModePage'
import { NowPlayingFullPage } from './pages/NowPlayingFullPage'
import type { LibrarySong } from './shared/contracts'
import { getDisplayArtists } from './shared/artists'
import { createTranslator, resolveLocale } from './shared/i18n'
import { getNextPlaylistName } from './shared/playlistNames'
import { PlaybackCommands } from './shared/PlaybackCommands'
import { quickPlay } from './shared/QuickPlayHelper'
import { AppRoutes } from './AppRoutes'
import {
  applyThemeColor,
  compareAppVersions,
  getClockMinute,
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
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [resolvedArtwork, setResolvedArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
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
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false)
  const [isMiniMode, setIsMiniMode] = useState(false)
  const [startupNightModeActive] = useState(() =>
    document.body.classList.contains('night-mode') || document.documentElement.classList.contains('night-mode'),
  )
  const [windowControlClockMinute, setWindowControlClockMinute] = useState(getClockMinute)
  const [isCreatePlaylistDialogOpen, setIsCreatePlaylistDialogOpen] = useState(false)
  const [pendingCreatedPlaylistName, setPendingCreatedPlaylistName] = useState('')
  const [releaseNotesDialogVersion, setReleaseNotesDialogVersion] = useState('')
  const [compactArtistTitle, setCompactArtistTitle] = useState('')
  const [immersiveHeaderTitle, setImmersiveHeaderTitle] = useState('')
  const [isLibraryQuickJumpOpen, setIsLibraryQuickJumpOpen] = useState(false)
  const releaseNotesCheckedRef = useRef(false)
  const revealItem = useRevealItem()

  const snapshot = useLibraryStore((state) => state.snapshot)
  const loading = useLibraryStore((state) => state.loading)
  const pageLoading = loading || !initialLoadComplete
  const scanning = useLibraryStore((state) => state.scanning)
  const scanProgress = useLibraryStore((state) => state.scanProgress)
  const error = useLibraryStore((state) => state.error)
  const refresh = useLibraryStore((state) => state.refresh)
  const refreshShell = useLibraryStore((state) => state.refreshShell)
  const loadFolders = useLibraryStore((state) => state.loadFolders)
  const loadRecent = useLibraryStore((state) => state.loadRecent)
  const loadSongs = useLibraryStore((state) => state.loadSongs)
  const pickLibraryRoot = useLibraryStore((state) => state.pickLibraryRoot)
  const scanLibrary = useLibraryStore((state) => state.scanLibrary)
  const scanLocalFolder = useLibraryStore((state) => state.scanLocalFolder)
  const cancelLocalFolderScan = useLibraryStore((state) => state.cancelLocalFolderScan)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist)
  const restorePlaylist = useLibraryStore((state) => state.restorePlaylist)
  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const reorderPlaylistSongs = useLibraryStore((state) => state.reorderPlaylistSongs)
  const reorderPlaylists = useLibraryStore((state) => state.reorderPlaylists)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const deleteSongFromDisk = useLibraryStore((state) => state.deleteSongFromDisk)
  const createLocalFolder = useLibraryStore((state) => state.createLocalFolder)
  const moveSongsToFolder = useLibraryStore((state) => state.moveSongsToFolder)
  const moveLocalFolderToFolder = useLibraryStore((state) => state.moveLocalFolderToFolder)
  const moveLocalItemsToFolder = useLibraryStore((state) => state.moveLocalItemsToFolder)
  const deleteLocalItems = useLibraryStore((state) => state.deleteLocalItems)
  const updateLocalFolderSort = useLibraryStore((state) => state.updateLocalFolderSort)
  const hideLocalFolder = useLibraryStore((state) => state.hideLocalFolder)
  const renameLocalFolder = useLibraryStore((state) => state.renameLocalFolder)
  const deleteLocalFolder = useLibraryStore((state) => state.deleteLocalFolder)
  const resumeHiddenStorageItem = useLibraryStore((state) => state.resumeHiddenStorageItem)
  const clearNowPlaying = useLibraryStore((state) => state.clearNowPlaying)
  const saveSearchQuery = useLibraryStore((state) => state.saveSearchQuery)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const removeRecentSearches = useLibraryStore((state) => state.removeRecentSearches)
  const restoreRecentSearch = useLibraryStore((state) => state.restoreRecentSearch)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const recordRecentPlaylistPlayed = useLibraryStore((state) => state.recordRecentPlaylistPlayed)
  const recordRecentAlbumPlayed = useLibraryStore((state) => state.recordRecentAlbumPlayed)
  const recordRecentArtistPlayed = useLibraryStore((state) => state.recordRecentArtistPlayed)
  const removeRecentPlayed = useLibraryStore((state) => state.removeRecentPlayed)
  const restoreRecentPlayed = useLibraryStore((state) => state.restoreRecentPlayed)
  const clearRecentPlayed = useLibraryStore((state) => state.clearRecentPlayed)
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
  const settingsNightModeActive = snapshot.settings.nightMode === 'on' || (
    snapshot.settings.nightMode === 'auto' &&
    isClockMinuteInRange(
      windowControlClockMinute,
      settingsTimeToMinute(snapshot.settings.nightModeStartTime),
      settingsTimeToMinute(snapshot.settings.nightModeEndTime),
    )
  )
  const nightModeActive = initialLoadComplete ? settingsNightModeActive : startupNightModeActive
  const isRouteImmersiveForWindowControls = isAlbumDetailRoute(location.pathname) ||
    isPlaylistDetailRoute(location.pathname) ||
    (location.pathname === '/albums' && new URLSearchParams(location.search).has('album'))
  const usesLightWindowControls = isMiniMode || nightModeActive || (isNavigationMinimal && isRouteImmersiveForWindowControls)

  useEffect(() => {
    document.documentElement.classList.toggle('night-mode', nightModeActive)
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
    void window.smplayer?.setWindowControlsLight(usesLightWindowControls)
  }, [usesLightWindowControls])

  useEffect(() => {
    void window.smplayer?.getWindowFullScreen().then(setIsWindowFullScreen)
    return window.smplayer?.onWindowFullScreenChange(setIsWindowFullScreen)
  }, [])

  useEffect(() => {
    void window.smplayer?.getWindowMiniMode().then((miniMode) => {
      setIsMiniMode(miniMode)
      if (miniMode) {
        setShowNowPlayingFullPage(false)
      }
    })
    return window.smplayer?.onWindowMiniModeChange((miniMode) => {
      setIsMiniMode(miniMode)
      if (miniMode) {
        setShowNowPlayingFullPage(false)
      }
    })
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setWindowControlClockMinute(getClockMinute())
    }, 60_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    return window.smplayer?.onTrayCommand((command) => {
      if (command === 'scan-library') {
        void scanLibrary()
      }
    })
  }, [scanLibrary])

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

  useEffect(() => {
    if (!initialLoadComplete || releaseNotesCheckedRef.current) {
      return
    }

    releaseNotesCheckedRef.current = true
    void window.smplayer?.getAppInfo().then((appInfo) => {
      if (
        snapshot.settings.lastReleaseNotesVersion &&
        compareAppVersions(appInfo.version, snapshot.settings.lastReleaseNotesVersion) > 0
      ) {
        setReleaseNotesDialogVersion(appInfo.version)
      }
    })
  }, [initialLoadComplete, snapshot.settings.lastReleaseNotesVersion])

  const playback = usePlaybackController(snapshot, initialLoadComplete)
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
  const targetArtistQuery = routeSearchParams.get('artist')
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
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const nowPlayingSongs = useMemo(
    () =>
      snapshot.nowPlaying.songIds
        .map((songId) => songsById.get(songId) ?? null)
        .filter((song): song is LibrarySong => song != null),
    [snapshot.nowPlaying.songIds, songsById],
  )
  const showCount = snapshot.settings.showCount
  const playerTrack = playback.currentTrack
    ? {
        id: playback.currentTrack.id,
        title: playback.currentTrack.title,
        artist:
          playback.currentTrack.artist ||
          getDisplayArtists(playback.currentTrack, t('common.artistUnknown')) ||
          playback.currentTrack.album ||
          t('common.artistUnknown'),
        artworkUrl:
          playback.currentTrack.artworkUrl ||
          (resolvedArtwork?.trackId === playback.currentTrack.id ? resolvedArtwork.artworkUrl : ''),
        isLoading: playback.status === 'loading' || playback.status === 'buffering',
        favorite: playback.currentTrack.favorite,
      }
    : {
        id: null,
        title: '',
        artist: '',
        artworkUrl: '',
        isLoading: false,
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
    playTrack: PlaybackCommands.playTrack,
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
      setIsNavigationOverlay(width >= NAVIGATION_MINIMAL_BREAKPOINT && width < NAVIGATION_OVERLAY_BREAKPOINT)
      setIsNavigationMinimal(nextIsMinimal)
      if (!nextIsMinimal) {
        setIsMinimalNavigationOpen(false)
      }
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

  useTrackNotification(playback.currentTrack, t)

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
    await PlaybackCommands.setMusicAndPlay(songIds)
  }

  async function quickPlayPlaylist(playlistId: number) {
    const playlist = snapshot.playlists.find((item) => item.id === playlistId)!
    await PlaybackCommands.setMusicAndPlay(playlist.songIds)
  }

  const voiceAssistant = useVoiceAssistantController({
    snapshot,
    songsById,
    playback,
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

    event.currentTarget.setPointerCapture(event.pointerId)
    void window.smplayer?.startWindowDrag()
  }

  const stopMinimalTitlebarDrag = () => {
    void window.smplayer?.stopWindowDrag()
  }

  const enterMiniMode = () => {
    setShowNowPlayingFullPage(false)
    setIsMiniMode(true)
    void window.smplayer?.setWindowMiniMode(true)
  }

  const exitMiniMode = () => {
    setIsMiniMode(false)
    void window.smplayer?.setWindowMiniMode(false)
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

  if (isMiniMode) {
    return (
      <MiniModePage
        track={playerTrack}
        currentSong={playback.currentTrack}
        disabled={snapshot.nowPlaying.songIds.length === 0}
        playerLyricsSource={snapshot.settings.playerLyricsSource}
        t={t}
        {...playerControlBindings}
        onQuickPlay={() => {
          void playQuick()
        }}
        onToggleFavorite={() => {
          if (playback.currentTrack) {
            void setSongFavorite(playback.currentTrack.id, !playback.currentTrack.favorite)
          }
        }}
        onExitMiniMode={exitMiniMode}
        onArtworkResolved={(trackId, artworkUrl) => {
          setResolvedArtwork({ trackId, artworkUrl })
        }}
      />
    )
  }

  return (
    <div
      className={`app-shell${isNavigationRail ? ' nav-collapsed' : ''}${isNavigationOverlay ? ' nav-overlay' : ''}${isNavigationOverlayOpen && !isNavigationMinimal ? ' nav-overlay-open' : ''}${isNavigationMinimal ? ' nav-minimal' : ''}${isNavigationMinimal && isMinimalNavigationOpen ? ' nav-minimal-open' : ''}${isHeaderedPlaylistRoute ? ' is-headered-playlist-route' : ''}`}
    >
      {isNavigationMinimal ? (
        <div
          className="minimal-titlebar"
          onPointerDownCapture={startMinimalTitlebarDrag}
          onPointerUpCapture={stopMinimalTitlebarDrag}
          onPointerCancelCapture={stopMinimalTitlebarDrag}
          onLostPointerCapture={stopMinimalTitlebarDrag}
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
        onQuickPlayPlaylist={(playlistId) => {
          void quickPlayPlaylist(playlistId)
        }}
        onSearchChange={setSearchInput}
        onSearchCommit={(value) => {
          void commitSearchQuery(value)
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
                  void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
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
                  void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
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
              />
            ) : (
              <div>
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
              pickLibraryRoot,
              scanLibrary,
              setSongFavorite,
              addSongToPlaylist,
              addSongsToPlaylist,
              replaceNowPlaying,
              createPlaylist,
              revealItem,
              deleteSongFromDisk,
              targetArtistQuery,
              recordRecentAlbumPlayed,
              recordRecentArtistPlayed,
              addRecentSearch,
              setCompactArtistTitle,
              targetAlbumQuery,
              updateSettings,
              clearNowPlaying,
              setShowNowPlayingFullPage,
              showCount,
              removeRecentPlayed,
              restoreRecentPlayed,
              clearRecentPlayed,
              removeRecentSearches,
              clearRecentSearches,
              commitSearchQuery,
              localRelativePath,
              scanProgress,
              scanLocalFolder,
              cancelLocalFolderScan,
              setLocalRelativePath,
              createLocalFolder,
              renameLocalFolder,
              deleteLocalFolder,
              hideLocalFolder,
              moveSongsToFolder,
              moveLocalFolderToFolder,
              deleteLocalItems,
              updateLocalFolderSort,
              commitDirectorySearchQuery,
              navigate,
              resumeHiddenStorageItem,
              saveViewState,
              deletePlaylist,
              showUndoableNotification,
              restorePlaylist,
              renamePlaylist,
              reorderPlaylists,
              recordRecentPlaylistPlayed,
              removeSongsFromPlaylist,
              reorderPlaylistSongs,
              searchResultQuery,
              submittedSearchQuery,
              searchResultsLoading,
              searchFolderPath,
              searchFolderName,
              location,
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
          currentSong={playback.currentTrack}
          t={t}
          selectedTrackId={playback.currentTrackId}
          selectedQueueIndex={playback.currentQueueIndex}
          loading={pageLoading}
          {...playerControlBindings}
          resolvedArtworkUrl={
            playback.currentTrack && resolvedArtwork?.trackId === playback.currentTrack.id
              ? resolvedArtwork.artworkUrl
              : ''
          }
          error={error}
          onClose={() => {
            setShowNowPlayingFullPage(false)
          }}
          onPlayTrack={(trackId, queueSongIds, queueIndex) => {
            void PlaybackCommands.playTrack(trackId, queueSongIds, queueIndex)
          }}
          onReplaceQueue={(songIds) => {
            void replaceNowPlaying(songIds)
          }}
          onPlayNext={(songId, queueIndex) => {
            void PlaybackCommands.playNext(songId, queueIndex)
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
            void deleteSongFromDisk(songId)
          }}
          onClearQueue={() => {
            void clearNowPlaying()
          }}
          onArtworkResolved={(trackId, artworkUrl) => {
            setResolvedArtwork({ trackId, artworkUrl })
          }}
          onRefresh={() => {
            void refresh()
          }}
        />
      ) : null}

      <div className={showNowPlayingFullPage ? 'media-control-host is-hidden' : 'media-control-host'}>
        <MediaControl
          track={playerTrack}
          currentSong={playback.currentTrack}
          playlists={snapshot.playlists}
          queueSongIds={snapshot.nowPlaying.songIds}
          disabled={snapshot.nowPlaying.songIds.length === 0}
          t={t}
          {...playerControlBindings}
          onToggleFavorite={() => {
            if (playback.currentTrack) {
              void setSongFavorite(playback.currentTrack.id, !playback.currentTrack.favorite)
            }
          }}
          onQuickPlay={() => {
            void playQuick()
          }}
          onPlayTrack={(trackId, queueSongIds) => {
            void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
          }}
          onOpenNowPlaying={() => {
            setShowNowPlayingFullPage(true)
          }}
          isWindowFullScreen={isWindowFullScreen}
          onToggleWindowFullScreen={() => {
            const nextFullScreen = !isWindowFullScreen
            setIsWindowFullScreen(nextFullScreen)
            void window.smplayer?.setWindowFullScreen(nextFullScreen)
          }}
          onEnterMiniMode={enterMiniMode}
          onArtworkResolved={(trackId, artworkUrl) => {
            setResolvedArtwork({ trackId, artworkUrl })
          }}
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
      <InAppNotificationWithButton />
    </div>
  )
}

export default App
