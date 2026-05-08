import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams, type Location } from 'react-router-dom'

import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { AlbumsPage } from './pages/AlbumsPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar } from './components/Sidebar'
import { UndoableNotificationHost } from './components/UndoableNotificationHost'
import { usePlaybackController } from './hooks/usePlaybackController'
import { CollectionPage } from './pages/CollectionPage'
import { HiddenFoldersPage } from './pages/HiddenFoldersPage'
import { MusicLibraryPage } from './pages/MusicLibraryPage'
import { LocalPage, LocalTitleGrid } from './pages/LocalPage'
import { MyFavoritesPage } from './pages/MyFavoritesPage'
import { NowPlayingFullPage } from './pages/NowPlayingFullPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { RecentPage } from './pages/RecentPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { buildLocalRoute, decodeLocalRoute } from './pages/localPagePaths'
import type { LibraryCounts, LibraryFolder, LibraryPlaylist, LibrarySong, LocalFolderSortCriterion, PreferenceLevel, ScanLibraryResult } from './shared/contracts'
import { getDisplayArtists, getSongArtists } from './shared/artists'
import { createTranslator, resolveLocale, type Translator } from './shared/i18n'
import { sortLibrarySongs } from './shared/sorting'
import { addNextAndPlay as setQueueAddNextAndPlay, moveToMusicOrPlay as setQueueMoveToMusicOrPlay, playNext as setQueuePlayNext, quickPlay, setMusicAndPlayFromPlaylist } from './shared/mediaHelper'
import { ByArtistRequest, MatchType, VoiceAssistantHelper, type VolumeRequest } from './shared/VoiceAssistantHelper'
import { useLibraryStore } from './state/useLibraryStore'
import './App.css'

const RESTORABLE_ROUTES = new Set([
  '/songs',
  '/artists',
  '/albums',
  '/now-playing',
  '/recent',
  '/local',
  '/playlists',
  '/favorites',
])
const SCROLLBAR_HOST_SELECTOR = [
  '.sidebar',
  '.workspace-content',
  '.table-shell',
  '.albums-grid',
  '.artists-list',
  '.artists-detail',
  '.headered-playlist-control',
  '.library-context-menu',
  '.library-context-submenu-panel',
  '.local-scroll-shell',
  '.now-playing-list-shell',
  '.lyrics-scroll-shell',
  '.preference-page',
  '.playlists-page',
  '.recent-grid-shell',
  '.recent-search-list',
  '.recent-page',
  '.settings-page',
].join(',')
const SCROLLBAR_HOVER_CLASS = 'is-scrollbar-hovered'
const RESTORABLE_SCROLL_SELECTORS = [
  '.workspace-content',
  '.table-shell',
  '.albums-grid',
  '.artists-list',
  '.artists-detail',
  '.headered-playlist-control',
  '.local-scroll-shell',
  '.now-playing-list-shell',
  '.lyrics-scroll-shell',
  '.preference-page',
  '.playlists-page',
  '.recent-grid-shell',
  '.recent-search-list',
  '.recent-page',
  '.settings-page',
]

function resolveRestoredPage(lastPage: string) {
  const normalizedPath = lastPage.trim()

  if (RESTORABLE_ROUTES.has(normalizedPath)) {
    return normalizedPath
  }

  return '/songs'
}

function getRouteSection(pathname: string) {
  if (pathname.startsWith('/artists/')) {
    return '/artists'
  }

  if (pathname.startsWith('/albums/')) {
    return '/albums'
  }

  if (pathname.startsWith('/local/')) {
    return '/local'
  }

  if (pathname.startsWith('/playlists/')) {
    return '/playlists'
  }

  if (RESTORABLE_ROUTES.has(pathname)) {
    return pathname
  }

  return null
}

function isAlbumDetailRoute(pathname: string) {
  return pathname.startsWith('/albums/')
}

function getScrollElementKey(root: HTMLElement, element: HTMLElement) {
  if (element === root) {
    return 'workspace-content:0'
  }

  const selector = RESTORABLE_SCROLL_SELECTORS.find((item) => element.matches(item))
  if (!selector) {
    return null
  }

  const elements = Array.from(root.querySelectorAll(selector))
  const index = elements.indexOf(element)

  return `${selector}:${index}`
}

function KeepAlivePane({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <div className="keep-alive-pane" hidden={!active}>
      {children}
    </div>
  )
}

function KeepAliveRoutes({
  location,
  routeKey,
  children,
}: {
  location: Location
  routeKey: string
  children: ReactNode
}) {
  const [cachedLocations, setCachedLocations] = useState<Array<{ key: string; location: Location }>>([
    { key: routeKey, location },
  ])

  useEffect(() => {
    setCachedLocations((current) => {
      if (current.some((item) => item.key === routeKey)) {
        return current
      }

      return [...current, { key: routeKey, location }]
    })
  }, [location, routeKey])

  return (
    <>
      {cachedLocations.map((item) => (
        <KeepAlivePane active={item.key === routeKey} key={item.key}>
          <Routes location={item.location}>{children}</Routes>
        </KeepAlivePane>
      ))}
    </>
  )
}

function hexToRgb(color: string) {
  const normalized = color.replace('#', '').trim()
  const hex = normalized.length === 3
    ? normalized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : normalized

  if (!/^[\da-f]{6}$/i.test(hex)) {
    return null
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function applyThemeColor(themeColor: string) {
  const rgb = hexToRgb(themeColor)
  if (!rgb) {
    return
  }

  const root = document.documentElement
  root.style.setProperty('--accent', themeColor)
  root.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
  root.style.setProperty('--accent-strong', `rgb(${Math.max(0, rgb.r - 18)} ${Math.max(0, rgb.g - 14)} ${Math.max(0, rgb.b - 10)})`)
  root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`)
  root.style.setProperty('--accent-surface', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`)
  root.style.setProperty('--accent-shadow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.26)`)
  root.style.setProperty('--focus', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.82)`)
}

function getSearchScore(query: string, candidate: string) {
  const trimmedQuery = query.trim()
  const trimmedCandidate = candidate.trim()

  if (!trimmedQuery || !trimmedCandidate) {
    return 0
  }

  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const normalizedCandidate = trimmedCandidate.toLocaleLowerCase()

  if (trimmedCandidate === trimmedQuery) {
    return 100
  }

  if (normalizedCandidate === normalizedQuery) {
    return 95
  }

  if (trimmedCandidate.startsWith(trimmedQuery)) {
    return 90
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 85
  }

  if (trimmedCandidate.includes(trimmedQuery)) {
    return 80
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return 75
  }

  if (normalizedQuery.includes(normalizedCandidate)) {
    return 70
  }

  const editDistance = getEditDistance(normalizedCandidate, normalizedQuery)
  const ratio = Math.floor((editDistance * 100) / Math.max(normalizedCandidate.length, normalizedQuery.length))
  return ratio <= 60 ? 70 - ratio : 0
}

function getEditDistance(target: string, given: string) {
  const dp = Array.from({ length: target.length + 1 }, (_, rowIndex) =>
    Array.from({ length: given.length + 1 }, (__, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  )

  for (let rowIndex = 1; rowIndex <= target.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= given.length; columnIndex += 1) {
      const replaceCost = target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1
      dp[rowIndex][columnIndex] = Math.min(
        dp[rowIndex - 1][columnIndex] + 1,
        dp[rowIndex][columnIndex - 1] + 1,
        dp[rowIndex - 1][columnIndex - 1] + replaceCost,
      )
    }
  }

  return dp[target.length][given.length]
}

function findBest<T>(items: T[], query: string, getCandidates: (item: T) => string[]) {
  let best: { item: T; score: number } | null = null

  for (const item of items) {
    const score = Math.max(...getCandidates(item).map((candidate) => getSearchScore(query, candidate)))
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score }
    }
  }

  return best
}

function getFolderName(path: string) {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) ?? path
}

function getSongFolder(path: string) {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(0, index) : ''
}

function findSongsInFolder(songs: LibrarySong[], folderPath: string) {
  return songs.filter((song) => getSongFolder(song.path) === folderPath)
}

function App() {
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('')
  const [searchResultQuery, setSearchResultQuery] = useState('')
  const [searchResultsLoading, setSearchResultsLoading] = useState(false)
  const [resolvedArtwork, setResolvedArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('smplayer:navigation-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const lastNotifiedTrackIdRef = useRef<number | null>(null)
  const hasSeenNavigationRef = useRef(false)
  const searchResultTimerRef = useRef<number | null>(null)
  const workspaceContentRef = useRef<HTMLElement | null>(null)
  const currentRouteScrollKeyRef = useRef('')
  const routeScrollPositionsRef = useRef(new Map<string, Map<string, { top: number; left: number }>>())
  const routeMemoryRef = useRef(new Map<string, string>())
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [navigationDepth, setNavigationDepth] = useState(0)
  const [showNowPlayingFullPage, setShowNowPlayingFullPage] = useState(false)

  const snapshot = useLibraryStore((state) => state.snapshot)
  const loading = useLibraryStore((state) => state.loading)
  const scanning = useLibraryStore((state) => state.scanning)
  const error = useLibraryStore((state) => state.error)
  const refresh = useLibraryStore((state) => state.refresh)
  const pickLibraryRoot = useLibraryStore((state) => state.pickLibraryRoot)
  const scanLibrary = useLibraryStore((state) => state.scanLibrary)
  const scanLocalFolder = useLibraryStore((state) => state.scanLocalFolder)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist)
  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const reorderPlaylistSongs = useLibraryStore((state) => state.reorderPlaylistSongs)
  const reorderPlaylists = useLibraryStore((state) => state.reorderPlaylists)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const deleteSongFromDisk = useLibraryStore((state) => state.deleteSongFromDisk)
  const hideLocalFolder = useLibraryStore((state) => state.hideLocalFolder)
  const renameLocalFolder = useLibraryStore((state) => state.renameLocalFolder)
  const deleteLocalFolder = useLibraryStore((state) => state.deleteLocalFolder)
  const clearNowPlaying = useLibraryStore((state) => state.clearNowPlaying)
  const saveSearchQuery = useLibraryStore((state) => state.saveSearchQuery)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const removeRecentSearches = useLibraryStore((state) => state.removeRecentSearches)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const removeRecentPlayed = useLibraryStore((state) => state.removeRecentPlayed)
  const clearRecentPlayed = useLibraryStore((state) => state.clearRecentPlayed)
  const updateSettings = useLibraryStore((state) => state.updateSettings)
  const saveViewState = useLibraryStore((state) => state.saveViewState)

  const playback = usePlaybackController(snapshot)
  const routeScrollKey = `${location.pathname}${location.search}`
  const currentRouteSection = getRouteSection(location.pathname)
  const isInAlbumDetail = isAlbumDetailRoute(location.pathname)

  if (currentRouteSection && currentRouteSection !== '/albums') {
    routeMemoryRef.current.set(currentRouteSection, location.pathname)
  }

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
    if (!root || !routePositions) {
      return
    }

    const restoreElement = (element: HTMLElement) => {
      const key = getScrollElementKey(root, element)
      const position = key ? routePositions.get(key) : undefined
      if (position) {
        element.scrollTo({ top: position.top, left: position.left })
      }
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
  const visibleSongs = useMemo(
    () => sortLibrarySongs(snapshot.songs, snapshot.settings.musicLibrarySort),
    [snapshot.settings.musicLibrarySort, snapshot.songs],
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
  const myFavoritesPlaylist = useMemo(
    () => snapshot.playlists.find((playlist) => playlist.isBuiltIn),
    [snapshot.playlists],
  )
  const favoriteSongs = useMemo(
    () =>
      myFavoritesPlaylist
        ? myFavoritesPlaylist.songIds
            .map((songId) => songsById.get(songId) ?? null)
            .filter((song): song is LibrarySong => song != null)
        : snapshot.songs.filter((song) => song.favorite),
    [myFavoritesPlaylist, snapshot.songs, songsById],
  )
  const showCount = snapshot.settings.showCount
  const playerTrack = playback.currentTrack
    ? {
        id: playback.currentTrack.id,
        title: playback.currentTrack.title,
        artist:
          playback.currentTrack.artist ||
          getDisplayArtists(playback.currentTrack) ||
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

  useEffect(() => {
    let isDisposed = false

    void refresh().finally(() => {
      if (!isDisposed) {
        setInitialLoadComplete(true)
      }
    })

    return () => {
      isDisposed = true
    }
  }, [refresh])

  useEffect(() => {
    return () => {
      if (searchResultTimerRef.current != null) {
        window.clearTimeout(searchResultTimerRef.current)
      }
    }
  }, [])

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

  useEffect(() => {
    let activeScrollbarHost: Element | null = null

    const setActiveScrollbarHost = (nextHost: Element | null) => {
      if (activeScrollbarHost === nextHost) {
        return
      }

      activeScrollbarHost?.classList.remove(SCROLLBAR_HOVER_CLASS)
      activeScrollbarHost = nextHost
      activeScrollbarHost?.classList.add(SCROLLBAR_HOVER_CLASS)
    }

    const updateScrollbarHover = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        setActiveScrollbarHost(null)
        return
      }

      const scrollbarHost = event.target.closest(SCROLLBAR_HOST_SELECTOR)
      if (!(scrollbarHost instanceof HTMLElement)) {
        setActiveScrollbarHost(null)
        return
      }

      const rect = scrollbarHost.getBoundingClientRect()
      const isVerticalScrollbarHovered =
        scrollbarHost.scrollHeight > scrollbarHost.clientHeight &&
        event.clientX >= rect.right - 12 &&
        event.clientX <= rect.right
      const isHorizontalScrollbarHovered =
        scrollbarHost.scrollWidth > scrollbarHost.clientWidth &&
        event.clientY >= rect.bottom - 12 &&
        event.clientY <= rect.bottom

      setActiveScrollbarHost(isVerticalScrollbarHovered || isHorizontalScrollbarHovered ? scrollbarHost : null)
    }

    const clearScrollbarHover = () => {
      setActiveScrollbarHost(null)
    }

    document.addEventListener('pointermove', updateScrollbarHover)
    document.addEventListener('pointerleave', clearScrollbarHover)

    return () => {
      document.removeEventListener('pointermove', updateScrollbarHover)
      document.removeEventListener('pointerleave', clearScrollbarHover)
      clearScrollbarHover()
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('smplayer:navigation-collapsed', String(isNavigationCollapsed))
    } catch {
      // Ignore storage failures in restricted renderer previews.
    }
  }, [isNavigationCollapsed])

  useEffect(() => {
    if (!playback.currentTrack || !window.smplayer) {
      return
    }

    if (lastNotifiedTrackIdRef.current == null) {
      lastNotifiedTrackIdRef.current = playback.currentTrack.id
      return
    }

    if (lastNotifiedTrackIdRef.current === playback.currentTrack.id) {
      return
    }

    lastNotifiedTrackIdRef.current = playback.currentTrack.id
    void window.smplayer.showTrackNotification({
      songId: playback.currentTrack.id,
      title: playback.currentTrack.title,
      artist: getDisplayArtists(playback.currentTrack),
      album: playback.currentTrack.album || 'Unknown album',
    })
  }, [playback.currentTrack])

  async function playTrackInQueue(trackId: number, queueSongIds: number[], queueIndex = -1) {
    const nextQueue = setMusicAndPlayFromPlaylist(
      snapshot.nowPlaying.songIds,
      queueSongIds,
      trackId,
      playback.mode === 'shuffle',
      queueIndex,
    )

    await replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playback.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  async function playNextInQueue(songId: number, queueIndex = -1) {
    await replaceNowPlaying(setQueuePlayNext(snapshot.nowPlaying.songIds, songId, playback.currentTrackId, queueIndex, playback.currentQueueIndex ?? -1))
  }

  async function addNextAndPlay(songId: number) {
    const nextQueue = setQueueAddNextAndPlay(snapshot.nowPlaying.songIds, songId, playback.currentTrackId, playback.currentQueueIndex ?? -1)
    await replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playback.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  async function moveToMusicOrPlayInQueue(songId: number, queueIndex = -1) {
    const nextQueue = setQueueMoveToMusicOrPlay(
      snapshot.nowPlaying.songIds,
      songId,
      queueIndex,
      playback.currentTrackId,
      playback.currentQueueIndex ?? -1,
    )
    await replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playback.playTrack(nextQueue.trackId, nextQueue.songIds, nextQueue.trackIndex ?? -1)
    }
  }

  async function playQuick() {
    const preferences = await window.smplayer!.getPreferenceSettings()
    const songIds = quickPlay({
      songs: snapshot.songs,
      recentSongs: snapshot.recentSongs,
      playlists: snapshot.playlists,
      folders: snapshot.folders,
      preferences,
    })
    await replaceNowPlaying(songIds)
    if (songIds[0] != null) {
      await playback.playTrack(songIds[0], songIds, 0)
    }
  }

  async function playVoiceSongIds(songIds: number[]) {
    await replaceNowPlaying(songIds)
    if (songIds[0] != null) {
      await playback.playTrack(songIds[0], songIds, 0)
    }
  }

  async function playVoiceSong(song: LibrarySong) {
    if (snapshot.nowPlaying.songIds.includes(song.id)) {
      await playback.playTrack(song.id, snapshot.nowPlaying.songIds)
      return
    }

    await addNextAndPlay(song.id)
  }

  function findVoiceArtist(query: string) {
    const artistGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      for (const artist of getSongArtists(song)) {
        artistGroups.set(artist, [...(artistGroups.get(artist) ?? []), song])
      }
    }

    return findBest([...artistGroups.entries()], query, ([artist]) => [artist])
  }

  function findRandomArtist() {
    const artistGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      for (const artist of getSongArtists(song)) {
        artistGroups.set(artist, [...(artistGroups.get(artist) ?? []), song])
      }
    }

    const artist = [...artistGroups.entries()][Math.floor(Math.random() * artistGroups.size)]
    return artist ? { item: artist, score: 100 } : null
  }

  function findVoiceAlbum(query: string) {
    const albumGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      const album = song.album || t('common.albumUnknown')
      albumGroups.set(album, [...(albumGroups.get(album) ?? []), song])
    }

    return findBest([...albumGroups.entries()], query, ([album]) => [album])
  }

  function findVoicePlaylist(query: string) {
    return findBest(snapshot.playlists, query, (playlist) => [playlist.name])
  }

  function findVoiceFolder(query: string) {
    return findBest(snapshot.folders, query, (folder) => [getFolderName(folder.path), folder.path])
  }

  function findRandomAlbum() {
    const albums = [...new Map(snapshot.songs.map((song) => [
      song.album || t('common.albumUnknown'),
      snapshot.songs.filter((item) => (item.album || t('common.albumUnknown')) === (song.album || t('common.albumUnknown'))),
    ])).entries()]

    const album = albums[Math.floor(Math.random() * albums.length)]
    return album ? { item: album, score: 100 } : null
  }

  function findRandomPlaylist() {
    const playlist = snapshot.playlists[Math.floor(Math.random() * snapshot.playlists.length)]
    return playlist ? { item: playlist, score: 100 } : null
  }

  function findRandomFolder() {
    const folder = snapshot.folders[Math.floor(Math.random() * snapshot.folders.length)]
    return folder ? { item: folder, score: 100 } : null
  }

  function findVoiceSong(query: string, songs = snapshot.songs) {
    return findBest(songs, query, (song) => [
      song.title,
      song.album,
      song.artist,
      getDisplayArtists(song),
      ...song.artists,
    ])
  }

  async function playVoiceSearch(query: string) {
    const song = findVoiceSong(query)
    const artist = findVoiceArtist(query)
    const album = findVoiceAlbum(query)
    const playlist = findVoicePlaylist(query)
    const folder = findVoiceFolder(query)
    const best = [
      song ? { type: 'song' as const, score: song.score, item: song.item } : null,
      artist ? { type: 'artist' as const, score: artist.score, item: artist.item } : null,
      album ? { type: 'album' as const, score: album.score, item: album.item } : null,
      playlist ? { type: 'playlist' as const, score: playlist.score, item: playlist.item } : null,
      folder ? { type: 'folder' as const, score: folder.score, item: folder.item } : null,
    ].filter((item): item is NonNullable<typeof item> => item != null)
      .sort((left, right) => right.score - left.score)[0]

    if (!best) {
      return t('voiceAssistant.noResults', { query })
    }

    if (best.type === 'song') {
      await playVoiceSong(best.item)
    } else if (best.type === 'artist' || best.type === 'album') {
      await playVoiceSongIds(best.item[1].map((song) => song.id))
    } else if (best.type === 'playlist') {
      await playVoiceSongIds(best.item.songIds)
    } else {
      await playVoiceSongIds(findSongsInFolder(snapshot.songs, best.item.path).map((song) => song.id))
    }

    return t('voiceAssistant.executed')
  }

  async function handleVoiceByArtist(request: ByArtistRequest, command: MatchType) {
    if (command === MatchType.PlayByArtistOrMusic) {
      const artist = findVoiceArtist(request.artist)
      if (artist) {
        await playVoiceSongIds(artist.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayByArtist || command === MatchType.PlayByArtistAndMusic) {
      const artist = findVoiceArtist(request.artist)
      const songs = artist ? artist.item[1] : snapshot.songs
      const song = findVoiceSong(request.item, songs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayByArtistAndAlbum) {
      const artist = findVoiceArtist(request.artist)
      const songs = artist ? artist.item[1] : snapshot.songs
      const album = findBest(
        [...new Map(songs.map((song) => [song.album || t('common.albumUnknown'), songs.filter((item) => (item.album || t('common.albumUnknown')) === (song.album || t('common.albumUnknown')))])).entries()],
        request.item,
        ([albumName]) => [albumName],
      )
      if (album) {
        await playVoiceSongIds(album.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayMusicInAlbum) {
      const album = findVoiceAlbum(request.artist)
      const song = album ? findVoiceSong(request.item, album.item[1]) : null
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    if (command === MatchType.PlayMusicInPlaylist) {
      const playlist = findVoicePlaylist(request.artist)
      const playlistSongs = playlist
        ? playlist.item.songIds
            .map((songId) => songsById.get(songId) ?? null)
            .filter((song): song is LibrarySong => song != null)
        : []
      const song = findVoiceSong(request.item, playlistSongs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    if (command === MatchType.PlayMusicInFolder || command === MatchType.PlayMusicIn) {
      const folder = findVoiceFolder(request.artist)
      const folderSongs = folder ? findSongsInFolder(snapshot.songs, folder.item.path) : snapshot.songs
      const song = findVoiceSong(request.item, folderSongs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    return playVoiceSearch(request.original)
  }

  async function executeVoiceCommand(text: string) {
    const command = VoiceAssistantHelper.handle(text, snapshot.settings.preferredLanguage)

    switch (command.type) {
      case MatchType.Play:
        await playback.togglePlayPause()
        return t('voiceAssistant.executed')
      case MatchType.PlayMusic: {
        const param = command.param as string | undefined
        if (!param) {
          await playQuick()
          return t('voiceAssistant.executed')
        }
        const song = findVoiceSong(param)
        if (!song) {
          return t('voiceAssistant.noResults', { query: param })
        }
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayArtist: {
        const param = command.param as string | undefined
        const artist = param ? findVoiceArtist(param) : findRandomArtist()
        const songIds = artist
          ? artist.item[1].map((song) => song.id)
          : []
        if (songIds.length === 0) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.artists') })
        }
        await playVoiceSongIds(songIds)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayAlbum: {
        const param = command.param as string | undefined
        const album = param ? findVoiceAlbum(param) : findRandomAlbum()
        if (!album) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.album') })
        }
        await playVoiceSongIds(album.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayPlaylist: {
        const param = command.param as string | undefined
        const playlist = param ? findVoicePlaylist(param) : findRandomPlaylist()
        if (!playlist) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.playlists') })
        }
        await playVoiceSongIds(playlist.item.songIds)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayFolder: {
        const param = command.param as string | undefined
        const folder = param ? findVoiceFolder(param) : findRandomFolder()
        if (!folder) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.local') })
        }
        await playVoiceSongIds(findSongsInFolder(snapshot.songs, folder.item.path).map((song) => song.id))
        return t('voiceAssistant.executed')
      }
      case MatchType.SearchAndPlay:
        return playVoiceSearch(command.param as string)
      case MatchType.QuickPlay:
        await playQuick()
        return t('voiceAssistant.executed')
      case MatchType.PlayByArtistOrMusic:
      case MatchType.PlayByArtist:
      case MatchType.PlayByArtistAndMusic:
      case MatchType.PlayByArtistAndAlbum:
      case MatchType.PlayMusicIn:
      case MatchType.PlayMusicInAlbum:
      case MatchType.PlayMusicInFolder:
      case MatchType.PlayMusicInPlaylist:
        return handleVoiceByArtist(command.param as ByArtistRequest, command.type)
      case MatchType.Pause:
        if (playback.isPlaying) {
          await playback.togglePlayPause()
        }
        return t('voiceAssistant.executed')
      case MatchType.Previous:
        await playback.playPrevious()
        return t('voiceAssistant.executed')
      case MatchType.Next:
        await playback.playNext()
        return t('voiceAssistant.executed')
      case MatchType.ChangeVolume: {
        const request = command.param as VolumeRequest
        handleVoiceVolume(request)
        return t('voiceAssistant.volume', { volume: getVoiceVolumeValue(request) })
      }
      case MatchType.Search: {
        const param = command.param as string | undefined
        if (!param) {
          return t('voiceAssistant.notUnderstood')
        }
        await commitSearchQuery(param)
        return t('voiceAssistant.executed')
      }
      case MatchType.Mute:
        playback.setMuted(true)
        return t('voiceAssistant.executed')
      case MatchType.UnMute:
        playback.setMuted(false)
        return t('voiceAssistant.executed')
      case MatchType.Help:
        return getVoiceHelpText()
      case MatchType.Nothing:
        return t('voiceAssistant.canceled')
      default:
        return t('voiceAssistant.notUnderstood')
    }
  }

  function getVoiceVolumeValue(request: VolumeRequest) {
    if (request.to) {
      return Math.min(Math.max(Math.round(request.value), 0), 100)
    }

    const delta = request.value * (request.percentage ? playback.volume / 100 : 1)
    const nextVolume = playback.volume + (request.turnUp ? delta : -delta)
    return Math.min(Math.max(Math.round(nextVolume), 0), 100)
  }

  function handleVoiceVolume(request: VolumeRequest) {
    playback.setVolumeLevel(getVoiceVolumeValue(request))
  }

  function getVoiceHint() {
    const songs = snapshot.songs
    const song = songs[Math.floor(Math.random() * songs.length)]
    if (song?.artist && song.artist.length <= 30) {
      return t('voiceAssistant.hintArtist', { artist: song.artist })
    }

    if (song?.album && song.album.length <= 30) {
      return t('voiceAssistant.hintAlbum', { album: song.album })
    }

    return t('voiceAssistant.hintQuickPlay')
  }

  function getVoiceHelpText() {
    return t('voiceAssistant.help')
  }

  async function handleVoiceCommand(text: string) {
    const message = await executeVoiceCommand(text)
    return {
      message,
      shouldContinue: message === t('voiceAssistant.notUnderstood'),
    }
  }

  async function commitSearchQuery(value: string) {
    const nextQuery = value.trim()

    if (searchResultTimerRef.current != null) {
      window.clearTimeout(searchResultTimerRef.current)
      searchResultTimerRef.current = null
    }

    setSearchInput(nextQuery)
    setSubmittedSearchQuery(nextQuery)

    if (!nextQuery) {
      setSearchResultsLoading(false)
      setSearchResultQuery('')
      await saveSearchQuery('')
      return
    }

    navigate('/search')
    setSearchResultsLoading(true)
    searchResultTimerRef.current = window.setTimeout(() => {
      setSearchResultQuery(nextQuery)
      setSearchResultsLoading(false)
      searchResultTimerRef.current = null
    }, 40)
    void addRecentSearch(nextQuery)
  }

  function commitDirectorySearchQuery(value: string, folderRelativePath: string) {
    const nextQuery = value.trim()
    if (!nextQuery) {
      return
    }

    if (searchResultTimerRef.current != null) {
      window.clearTimeout(searchResultTimerRef.current)
      searchResultTimerRef.current = null
    }

    setSearchInput(nextQuery)
    setSubmittedSearchQuery(nextQuery)
    setSearchResultQuery(nextQuery)
    setSearchResultsLoading(false)
    navigate(`/search?folder=${encodeURIComponent(folderRelativePath)}`)
    void addRecentSearch(nextQuery)
  }

  const isLocalRoute = location.pathname === '/local' || location.pathname.startsWith('/local/')
  const currentLocalRelativePath = isLocalRoute
    ? decodeLocalRoute(location.pathname.replace(/^\/local\/?/, ''))
    : ''
  const searchFolderRelativePath = new URLSearchParams(location.search).get('folder') ?? ''
  const searchFolderPath = getSearchFolderPath(snapshot.settings.rootPath, searchFolderRelativePath)
  const searchFolderName = getSearchFolderName(snapshot.settings.rootPath, searchFolderRelativePath)

  return (
    <div className={`app-shell${isNavigationCollapsed ? ' nav-collapsed' : ''}`}>
      <Sidebar
        t={t}
        collapsed={isNavigationCollapsed}
        appName={t('app.shell')}
        playlists={snapshot.playlists}
        canGoBack={navigationDepth > 0 || isInAlbumDetail}
        searchQuery={searchInput}
        recentSearches={snapshot.search.recentSearches}
        getRestoredNavTarget={getRestoredNavTarget}
        onGoBack={goBackFromSidebar}
        onNavigate={() => {
          setShowNowPlayingFullPage(false)
        }}
        onReorderPlaylists={(playlistIds) => {
          void reorderPlaylists(playlistIds)
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
          void removeRecentSearch(entryId)
        }}
        onRecentSearchesClear={() => {
          void clearRecentSearches()
        }}
        onToggleCollapsed={() => {
          setIsNavigationCollapsed((current) => !current)
        }}
      />
      <div className={
        location.pathname === '/recent'
          ? 'workspace is-headerless-route'
          : location.pathname.startsWith('/albums/') ||
            location.pathname.startsWith('/playlists/') ||
            location.pathname.startsWith('/favorites')
          ? 'workspace is-immersive-route'
          : isLocalRoute
            ? 'workspace is-local-route'
            : 'workspace'
      }>
        <header className="workspace-header">
          {isLocalRoute && snapshot.settings.rootPath ? (
            <LocalTitleGrid
              songs={snapshot.songs}
              folders={snapshot.folders}
              playlists={snapshot.playlists}
              t={t}
              rootPath={snapshot.settings.rootPath}
              currentRelativePath={currentLocalRelativePath}
              onHiddenFoldersListButtonClick={() => {
                navigate('/hidden-folders')
              }}
              onOpenFolder={(targetRelativePath) => {
                navigate(buildLocalRoute(targetRelativePath), { replace: true })
              }}
              onRevealFolder={(folderPath) => window.smplayer?.revealItemInFolder(folderPath)}
              onSearchDirectory={(query, folderRelativePath) => {
                commitDirectorySearchQuery(query, folderRelativePath)
              }}
              onPlayTrack={(trackId, queueSongIds) => {
                void playTrackInQueue(trackId, queueSongIds)
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
                await window.smplayer!.moveSongsToFolder(payload.songIds, targetFolderPath)
                for (const folderPath of payload.folderPaths) {
                  await window.smplayer!.moveLocalFolderToFolder(folderPath, targetFolderPath)
                }
                await refresh()
              }}
            />
          ) : (
            <div>
              <h1>
                {location.pathname === '/' && !initialLoadComplete
                  ? ''
                  : getPageTitle(
                    location.pathname,
                    snapshot.counts,
                    t,
                    showCount,
                    submittedSearchQuery,
                    searchFolderName,
                    snapshot.nowPlaying.songIds.length,
                  )}
              </h1>
            </div>
          )}
          <div className="status-pills">
            <span>{t('app.songsCached', { count: snapshot.counts.songs })}</span>
          </div>
        </header>

        <main
          ref={workspaceContentRef}
          className="workspace-content"
          onScrollCapture={(event) => {
            saveScrollElement(event.target as HTMLElement)
          }}
        >
          {initialLoadComplete ? (
            <KeepAliveRoutes location={location} routeKey={routeScrollKey}>
              <Route path="/" element={<Navigate to={resolveRestoredPage(snapshot.settings.lastPage)} replace />} />
            <Route
              path="/songs"
              element={
                <MusicLibraryPage
                  snapshot={snapshot}
                  t={t}
                  songs={visibleSongs}
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot()
                  }}
                  onScanLibrary={() => {
                    void scanLibrary()
                  }}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onAddNextAndPlay={(trackId) => {
                    void addNextAndPlay(trackId)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                  onUpdateSettings={(update) => {
                    return updateSettings(update)
                  }}
                />
              }
            />
            <Route
              path="/artists"
              element={
                <ArtistsPage
                  t={t}
                  songs={visibleSongs}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  playlists={snapshot.playlists}
                  loading={loading}
                  scanning={scanning}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                />
              }
            />
            <Route
              path="/albums"
              element={
                <AlbumsPage
                  songs={snapshot.songs}
                  playlists={snapshot.playlists}
                  t={t}
                  loading={loading}
                  scanning={scanning}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onUpdateSettings={(update) => {
                    void updateSettings(update)
                  }}
                />
              }
            />
            <Route
              path="/artists/:artistName"
              element={
                <ArtistsPage
                  t={t}
                  songs={visibleSongs}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  playlists={snapshot.playlists}
                  loading={loading}
                  scanning={scanning}
                  targetArtistName={decodeURIComponent(location.pathname.slice('/artists/'.length))}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                />
              }
            />
            <Route
              path="/albums/*"
              element={
                <AlbumDetailRoute
                  songs={snapshot.songs}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  playlists={snapshot.playlists}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onSetAlbumPreferred={(albumName, level) => {
                    void window.smplayer?.addPreferenceItem('album', albumName, albumName, level)
                  }}
                  onAlbumArtworkSaved={() => {
                    void refresh()
                  }}
                />
              }
            />
            <Route
              path="/now-playing"
              element={
                <NowPlayingPage
                  songs={nowPlayingSongs}
                  librarySongs={snapshot.songs}
                  recentSongs={snapshot.recentSongs}
                  playlists={snapshot.playlists}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  selectedQueueIndex={playback.currentQueueIndex}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayTrack={(trackId, queueSongIds, queueIndex) => {
                    void playback.playTrack(trackId, queueSongIds, queueIndex)
                  }}
                  onReplaceQueue={(songIds) => {
                    void replaceNowPlaying(songIds)
                  }}
                  onPlayNext={(songId, queueIndex) => {
                    void playNextInQueue(songId, queueIndex)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
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
                  onOpenImmersiveMode={() => {
                    setShowNowPlayingFullPage(true)
                  }}
                />
              }
            />
            <Route
              path="/recent"
              element={
                <RecentPage
                  songs={snapshot.songs}
                  recentSongs={snapshot.recentSongs}
                  recentSearches={snapshot.search.recentSearches}
                  playlists={snapshot.playlists}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  showCount={showCount}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onAddSongsToNowPlaying={(songIds: number[]) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onRevealSong={(songPath) => {
                    void window.smplayer?.revealItemInFolder(songPath)
                  }}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                  onRemoveRecentPlayed={(songIds) => {
                    void removeRecentPlayed(songIds)
                  }}
                  onClearRecentPlayed={() => {
                    void clearRecentPlayed()
                  }}
                  onRemoveRecentSearches={(entryIds) => {
                    void removeRecentSearches(entryIds)
                  }}
                  onClearRecentSearches={() => {
                    void clearRecentSearches()
                  }}
                  onSearch={(query) => {
                    void commitSearchQuery(query)
                  }}
                />
              }
            />
            <Route
              path="/local/*"
              element={
                <LocalPageRoute
                  songs={snapshot.songs}
                  folders={snapshot.folders}
                  playlists={snapshot.playlists}
                  t={t}
                  rootPath={snapshot.settings.rootPath}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot()
                  }}
                  onRefreshFolder={(folderPath) => scanLocalFolder(folderPath)}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
                  onRevealFolder={(folderPath) => window.smplayer?.revealItemInFolder(folderPath)}
                  onCreateFolder={async (relativePath, name) => {
                    await window.smplayer!.createLocalFolder(snapshot.settings.rootPath, relativePath, name)
                    await scanLocalFolder(relativePath ? getSearchFolderPath(snapshot.settings.rootPath, relativePath) : snapshot.settings.rootPath)
                  }}
                  onRenameFolder={async (folderPath, name) => {
                    await renameLocalFolder(folderPath, name)
                  }}
                  onDeleteFolder={async (folderPath) => {
                    await deleteLocalFolder(folderPath)
                  }}
                  onHideFolder={async (folderPath) => {
                    await hideLocalFolder(folderPath)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                  onMoveSongsToFolder={async (songIds, folderPath) => {
                    await window.smplayer!.moveSongsToFolder(songIds, folderPath)
                    await refresh()
                  }}
                  onMoveFolderToFolder={async (sourceFolderPath, targetFolderPath) => {
                    await window.smplayer!.moveLocalFolderToFolder(sourceFolderPath, targetFolderPath)
                    await refresh()
                  }}
                  onDeleteLocalItems={async (songIds, folderPaths) => {
                    await window.smplayer!.deleteLocalItems(songIds, folderPaths)
                    await refresh()
                  }}
                  onUpdateFolderSort={async (folderPath, sortCriterion) => {
                    await window.smplayer!.updateLocalFolderSort(folderPath, sortCriterion)
                    await refresh()
                  }}
                  onSearchDirectory={(query, folderRelativePath) => {
                    commitDirectorySearchQuery(query, folderRelativePath)
                  }}
                />
              }
            />
            <Route
              path="/hidden-folders"
              element={
                <HiddenFoldersPage
                  active={location.pathname === '/hidden-folders'}
                  t={t}
                  onResumeHiddenStorageItem={async (item) => {
                    await window.smplayer!.resumeHiddenStorageItem(item)
                    await scanLibrary()
                  }}
                />
              }
            />
            <Route
              path="/playlists/:playlistId?"
              element={
                <PlaylistsPage
                  snapshot={snapshot}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onSelectPlaylist={(playlistId) => {
                    void saveViewState({ lastPlaylistId: playlistId })
                  }}
                  onDeletePlaylist={(playlistId) => {
                    void deletePlaylist(playlistId)
                  }}
                  onRenamePlaylist={(playlistId, name) => {
                    void renamePlaylist(playlistId, name)
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onReorderPlaylists={(playlistIds) => {
                    void reorderPlaylists(playlistIds)
                  }}
                  onSetPlaylistPreferred={(playlistId, name, level) => {
                    void window.smplayer?.addPreferenceItem('playlist', String(playlistId), name, level)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRemoveSongsFromPlaylist={(playlistId, songIds) => {
                    void removeSongsFromPlaylist(playlistId, songIds)
                  }}
                  onReorderPlaylistSongs={(playlistId, songIds, sortCriterion) => {
                    void reorderPlaylistSongs(playlistId, songIds, sortCriterion)
                  }}
                />
              }
            />
            <Route
              path="/favorites"
              element={
                <MyFavoritesPage
                  songs={favoriteSongs}
                  playlists={snapshot.playlists}
                  sortCriterion={myFavoritesPlaylist!.sortCriterion}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRemoveSongsFromFavorites={(songIds) => {
                    void removeSongsFromPlaylist(myFavoritesPlaylist!.id, songIds)
                  }}
                  onSortFavorites={(songIds, sortCriterion) => {
                    void reorderPlaylistSongs(myFavoritesPlaylist!.id, songIds, sortCriterion)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onSetPreferred={(level) => {
                    void window.smplayer?.addPreferenceItem('my-favorites', '6', t('common.myFavorites'), level)
                  }}
                />
              }
            />
            <Route
              path="/search"
              element={
                <SearchPage
                  t={t}
                  query={searchResultQuery}
                  requestedQuery={submittedSearchQuery}
                  loading={searchResultsLoading}
                  songs={snapshot.songs}
                  folders={snapshot.folders}
                  playlists={snapshot.playlists}
                  rootPath={snapshot.settings.rootPath}
                  searchFolderPath={searchFolderPath}
                  searchFolderName={searchFolderName}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  showCount={showCount}
                  sortCriteria={{
                    artists: snapshot.settings.searchArtistsCriterion,
                    albums: snapshot.settings.searchAlbumsCriterion,
                    songs: snapshot.settings.searchSongsCriterion,
                    playlists: snapshot.settings.searchPlaylistsCriterion,
                    folders: snapshot.settings.searchFoldersCriterion,
                  }}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void moveToMusicOrPlayInQueue(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onAddSongsToNowPlaying={(songIds) => {
                    void replaceNowPlaying([...snapshot.nowPlaying.songIds, ...songIds])
                  }}
                  onCreatePlaylistWithSongs={(name, songIds) => {
                    void createPlaylist(name, songIds)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onRevealSong={(songPath) => {
                    void window.smplayer?.revealItemInFolder(songPath)
                  }}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songId)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onUpdateSettings={(update) => {
                    void updateSettings(update)
                  }}
                  onSearchDirectory={(query, folderRelativePath) => {
                    commitDirectorySearchQuery(query, folderRelativePath)
                  }}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  t={t}
                  snapshot={snapshot}
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot()
                  }}
                  onScanLibrary={() => {
                    void scanLibrary()
                  }}
                  onUpdateSettings={(update) => {
                    void updateSettings(update)
                  }}
                />
              }
            />
            </KeepAliveRoutes>
          ) : null}
        </main>
      </div>

      {showNowPlayingFullPage ? (
        <NowPlayingFullPage
          songs={nowPlayingSongs}
          librarySongs={snapshot.songs}
          recentSongs={snapshot.recentSongs}
          playlists={snapshot.playlists}
          currentSong={playback.currentTrack}
          t={t}
          selectedTrackId={playback.currentTrackId}
          selectedQueueIndex={playback.currentQueueIndex}
          isPlaying={playback.isPlaying}
          volume={playback.volume}
          isMuted={playback.isMuted}
          mode={playback.mode}
          resolvedArtworkUrl={
            playback.currentTrack && resolvedArtwork?.trackId === playback.currentTrack.id
              ? resolvedArtwork.artworkUrl
              : ''
          }
          error={error}
          onClose={() => {
            setShowNowPlayingFullPage(false)
          }}
          onTogglePlayPause={() => {
            void playback.togglePlayPause()
          }}
          onPrevious={() => {
            void playback.playPrevious()
          }}
          onNext={() => {
            void playback.playNext()
          }}
          onSeek={playback.seekToSeconds}
          onBeginSeek={playback.beginSeek}
          onEndSeek={playback.endSeek}
          onVolumeChange={playback.setVolumeLevel}
          onToggleMute={playback.toggleMute}
          onToggleShuffle={playback.toggleShuffle}
          onToggleRepeat={playback.toggleRepeat}
          onToggleRepeatOne={playback.toggleRepeatOne}
          onPlayTrack={(trackId, queueSongIds, queueIndex) => {
            void playback.playTrack(trackId, queueSongIds, queueIndex)
          }}
          onReplaceQueue={(songIds) => {
            void replaceNowPlaying(songIds)
          }}
          onPlayNext={(songId, queueIndex) => {
            void playNextInQueue(songId, queueIndex)
          }}
          onAddSongToPlaylist={(playlistId, songId) => {
            void addSongToPlaylist(playlistId, songId)
          }}
          onAddSongsToPlaylist={(playlistId, songIds) => {
            void addSongsToPlaylist(playlistId, songIds)
          }}
          onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
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

      {!showNowPlayingFullPage ? (
        <PlayerBar
          track={playerTrack}
          currentSong={playback.currentTrack}
          playlists={snapshot.playlists}
          queueSongIds={snapshot.nowPlaying.songIds}
          disabled={snapshot.nowPlaying.songIds.length === 0}
          isPlaying={playback.isPlaying}
          volume={playback.volume}
          isMuted={playback.isMuted}
          mode={playback.mode}
          t={t}
          onTogglePlayPause={() => {
            void playback.togglePlayPause()
          }}
          onPrevious={() => {
            void playback.playPrevious()
          }}
          onNext={() => {
            void playback.playNext()
          }}
          onSeek={playback.seekToSeconds}
          onBeginSeek={playback.beginSeek}
          onEndSeek={playback.endSeek}
          onVolumeChange={playback.setVolumeLevel}
          onToggleMute={playback.toggleMute}
          onToggleShuffle={playback.toggleShuffle}
          onToggleRepeat={playback.toggleRepeat}
          onToggleRepeatOne={playback.toggleRepeatOne}
          onToggleFavorite={() => {
            if (playback.currentTrack) {
              void setSongFavorite(playback.currentTrack.id, !playback.currentTrack.favorite)
            }
          }}
          onQuickPlay={() => {
            void playQuick()
          }}
          onVoiceCommand={handleVoiceCommand}
          getVoiceHint={getVoiceHint}
          getVoiceHelpText={getVoiceHelpText}
          voiceLanguage={resolveLocale(snapshot.settings.preferredLanguage)}
          onOpenNowPlaying={() => {
            setShowNowPlayingFullPage(true)
          }}
          onArtworkResolved={(trackId, artworkUrl) => {
            setResolvedArtwork({ trackId, artworkUrl })
          }}
        />
      ) : null}
      <UndoableNotificationHost />
    </div>
  )
}

function AlbumDetailRoute({
  songs,
  t,
  selectedTrackId,
  isPlaying,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onToggleFavorite,
  playlists,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onSetAlbumPreferred,
  onAlbumArtworkSaved,
}: {
  songs: LibrarySong[]
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  playlists: LibraryPlaylist[]
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onSetAlbumPreferred: (albumName: string, level: PreferenceLevel) => void
  onAlbumArtworkSaved: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const albumName = decodeURIComponent(location.pathname.slice('/albums/'.length))
  const albumSongs = songs
    .filter((song) => (song.album || t('common.albumUnknown')) === albumName)
    .sort((left, right) => left.title.localeCompare(right.title))

  if (!albumName || albumSongs.length === 0) {
    return (
      <CollectionPage
        title={t('collection.albumNotFound')}
        description={t(
          'collection.albumNotFoundDescription',
        )}
        items={[]}
        t={t}
        emptyTitle={t('collection.albumNotFound')}
        emptyCopy={t(
          'collection.albumNotFoundCopy',
        )}
      />
    )
  }

  return (
    <AlbumDetailPage
      albumName={albumName}
      t={t}
      songs={albumSongs}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      onPlayTrack={onPlayTrack}
      onMoveToMusicOrPlay={onMoveToMusicOrPlay}
      onPlayNext={onPlayNext}
      onTogglePlayPause={onTogglePlayPause}
      onToggleFavorite={onToggleFavorite}
      playlists={playlists}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onSetAlbumPreferred={onSetAlbumPreferred}
      onAlbumArtworkSaved={onAlbumArtworkSaved}
      onArtistClick={(artist) => {
        navigate(`/artists/${encodeURIComponent(artist)}`)
      }}
      onAlbumClick={(album) => {
        navigate(`/albums/${encodeURIComponent(album)}`)
      }}
    />
  )
}

function LocalPageRoute({
  songs,
  folders,
  playlists,
  t,
  rootPath,
  selectedTrackId,
  isPlaying,
  searchQuery,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onRefreshFolder,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onRevealSong,
  onRevealFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onHideFolder,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onToggleFavorite,
  onDeleteSongFromDisk,
  onMoveSongsToFolder,
  onMoveFolderToFolder,
  onDeleteLocalItems,
  onUpdateFolderSort,
  onSearchDirectory,
}: {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  t: Translator
  rootPath: string
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onRefreshFolder: (folderPath: string) => void | ScanLibraryResult | null | Promise<ScanLibraryResult | null | void>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onRevealFolder: (folderPath: string) => void | Promise<void>
  onCreateFolder: (relativePath: string, name: string) => void | Promise<void>
  onRenameFolder: (folderPath: string, name: string) => void | Promise<void>
  onDeleteFolder: (folderPath: string) => void | Promise<void>
  onHideFolder: (folderPath: string) => void | Promise<void>
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onDeleteSongFromDisk: (songId: number) => void
  onMoveSongsToFolder: (songIds: number[], folderPath: string) => void | Promise<void>
  onMoveFolderToFolder: (sourceFolderPath: string, targetFolderPath: string) => void | Promise<void>
  onDeleteLocalItems: (songIds: number[], folderPaths: string[]) => void | Promise<void>
  onUpdateFolderSort: (folderPath: string, sortCriterion: LocalFolderSortCriterion) => void | Promise<void>
  onSearchDirectory: (query: string, folderRelativePath: string) => void
}) {
  const params = useParams()
  const currentRelativePath = decodeLocalRoute(params['*'])

  return (
    <LocalPage
      songs={songs}
      folders={folders}
      playlists={playlists}
      t={t}
      rootPath={rootPath}
      currentRelativePath={currentRelativePath}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      searchQuery={searchQuery}
      loading={loading}
      scanning={scanning}
      error={error}
      onPickLibraryRoot={onPickLibraryRoot}
      onRefreshFolder={onRefreshFolder}
      onPlayTrack={onPlayTrack}
      onMoveToMusicOrPlay={onMoveToMusicOrPlay}
      onTogglePlayPause={onTogglePlayPause}
      onPlayNext={onPlayNext}
      onRevealSong={onRevealSong}
      onRevealFolder={onRevealFolder}
      onCreateFolder={onCreateFolder}
      onRenameFolder={onRenameFolder}
      onDeleteFolder={onDeleteFolder}
      onHideFolder={onHideFolder}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
      onAddSongsToNowPlaying={onAddSongsToNowPlaying}
      onToggleFavorite={onToggleFavorite}
      onDeleteSongFromDisk={onDeleteSongFromDisk}
      onMoveSongsToFolder={onMoveSongsToFolder}
      onMoveFolderToFolder={onMoveFolderToFolder}
      onDeleteLocalItems={onDeleteLocalItems}
      onUpdateFolderSort={onUpdateFolderSort}
      onSearchDirectory={onSearchDirectory}
    />
  )
}

export default App

function getPageTitle(
  pathname: string,
  counts: LibraryCounts,
  t: Translator,
  showCount: boolean,
  searchQuery: string,
  searchFolderName: string,
  nowPlayingCount: number,
) {
  if (pathname.startsWith('/artists/')) {
    return t('detail.artistEyebrow')
  }

  if (pathname.startsWith('/albums/')) {
    return ''
  }

  if (pathname.startsWith('/artists')) {
    return showCount
      ? t('library.allArtistsWithCount', { count: counts.artists })
      : t('library.allArtists')
  }

  if (pathname.startsWith('/albums')) {
    return showCount
      ? t('library.allAlbumsWithCount', { count: counts.albums })
      : t('library.allAlbums')
  }

  if (pathname.startsWith('/now-playing')) {
    return showCount
      ? t('nowPlaying.titleWithCount', { count: nowPlayingCount })
      : t('common.nowPlaying')
  }

  if (pathname.startsWith('/hidden-folders')) {
    return t('local.hiddenFolders')
  }

  if (pathname.startsWith('/recent')) {
    return ''
  }

  if (pathname.startsWith('/local')) {
    return t('common.local')
  }

  if (pathname.startsWith('/playlists')) {
    return t('common.playlists')
  }

  if (pathname.startsWith('/favorites')) {
    return t('common.myFavorites')
  }

  if (pathname.startsWith('/search')) {
    const query = searchQuery.trim()
    if (query && searchFolderName) {
      return t('search.directoryResultOf', { query, folder: searchFolderName })
    }
    return query ? t('search.resultOf', { query }) : t('search.resultTitle')
  }

  if (pathname.startsWith('/settings')) {
    return t('common.settings')
  }

  return showCount
    ? t('library.allSongsWithCount', { count: counts.songs })
    : t('library.allSongs')
}

function getSearchFolderPath(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return ''
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${folderRelativePath.split('/').join(separator)}`
}

function getSearchFolderName(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return ''
  }

  return folderRelativePath.split('/').filter(Boolean).at(-1) ?? rootPath.split(/[\\/]+/).filter(Boolean).at(-1) ?? ''
}
