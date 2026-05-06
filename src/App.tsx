import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'

import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { AlbumsPage } from './pages/AlbumsPage'
import { ArtistDetailPage } from './pages/ArtistDetailPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar } from './components/Sidebar'
import { usePlaybackController } from './hooks/usePlaybackController'
import { CollectionPage } from './pages/CollectionPage'
import { LibraryPage } from './pages/LibraryPage'
import { LocalBrowserPage } from './pages/LocalBrowserPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { RecentPage } from './pages/RecentPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { decodeLocalRoute } from './pages/localBrowserPaths'
import type { AppInfo, LibraryCounts, LibraryPlaylist, LibrarySong } from './shared/contracts'
import { getDisplayArtists, getSongArtists } from './shared/artists'
import { formatDuration } from './shared/formatters'
import { createTranslator, type Translator } from './shared/i18n'
import { sortLibrarySongs } from './shared/sorting'
import { playNext as setQueuePlayNext, setMusicAndPlayFromPlaylist } from './shared/mediaHelper'
import {
  buildFavoriteCards,
} from './shared/libraryViews'
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
  '.library-context-menu',
  '.library-context-submenu-panel',
  '.now-playing-list-shell',
  '.lyrics-scroll-shell',
  '.preference-page',
].join(',')
const SCROLLBAR_HOVER_CLASS = 'is-scrollbar-hovered'

function resolveRestoredPage(lastPage: string) {
  const normalizedPath = lastPage.trim()

  if (RESTORABLE_ROUTES.has(normalizedPath)) {
    return normalizedPath
  }

  return '/songs'
}

function withOptionalCount(label: string, count: number, showCount: boolean) {
  return showCount ? `${label} (${count})` : label
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

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>({
    platform: 'web',
    version: '0.1.0',
    isPackaged: false,
    userDataPath: 'Renderer preview',
  })
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
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [navigationDepth, setNavigationDepth] = useState(0)

  const snapshot = useLibraryStore((state) => state.snapshot)
  const loading = useLibraryStore((state) => state.loading)
  const scanning = useLibraryStore((state) => state.scanning)
  const error = useLibraryStore((state) => state.error)
  const refresh = useLibraryStore((state) => state.refresh)
  const pickLibraryRoot = useLibraryStore((state) => state.pickLibraryRoot)
  const scanLibrary = useLibraryStore((state) => state.scanLibrary)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist)
  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist)
  const reorderPlaylists = useLibraryStore((state) => state.reorderPlaylists)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const reorderPlaylistSongs = useLibraryStore((state) => state.reorderPlaylistSongs)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const deleteSongFromDisk = useLibraryStore((state) => state.deleteSongFromDisk)
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
        .filter((song): song is (typeof snapshot.songs)[number] => song != null),
    [snapshot.nowPlaying.songIds, songsById],
  )
  const favoriteItems = useMemo(
    () => buildFavoriteCards(snapshot.songs, t),
    [snapshot.songs, t],
  )
  const favoriteCount = useMemo(
    () => snapshot.songs.filter((song) => song.favorite).length,
    [snapshot.songs],
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
        elapsedLabel: formatDuration(playback.progressSeconds),
        durationLabel: formatDuration(
          playback.durationSeconds || playback.currentTrack.duration,
        ),
        progressSeconds: playback.progressSeconds,
        durationSeconds: playback.durationSeconds || playback.currentTrack.duration,
        progressRatio:
          playback.durationSeconds > 0
            ? playback.progressSeconds / playback.durationSeconds
            : 0,
        isReady: playback.durationSeconds > 0 || playback.currentTrack.duration > 0,
        favorite: playback.currentTrack.favorite,
      }
    : {
        id: null,
        title: snapshot.songs.length > 0 ? t('app.selectTrack') : t('app.libraryEmpty'),
        artist: snapshot.settings.rootPath
          ? t('app.chooseSong')
          : t('app.chooseFolderFirst'),
        artworkUrl: '',
        elapsedLabel: '0:00',
        durationLabel: '0:00',
        progressSeconds: 0,
        durationSeconds: 0,
        progressRatio: 0,
        isReady: false,
        favorite: false,
      }

  useEffect(() => {
    let isDisposed = false

    window.smplayer
      ?.getAppInfo()
      .then(setAppInfo)
      .catch(() => {
        // Keep the browser fallback when the renderer is opened without Electron.
      })

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

  async function playTrackInQueue(trackId: number, queueSongIds: number[]) {
    const nextQueue = setMusicAndPlayFromPlaylist(
      snapshot.nowPlaying.songIds,
      queueSongIds,
      trackId,
      playback.mode === 'shuffle',
    )

    await replaceNowPlaying(nextQueue.songIds)
    if (nextQueue.trackId != null) {
      await playback.playTrack(nextQueue.trackId, nextQueue.songIds)
    }
  }

  async function playNextInQueue(songId: number) {
    await replaceNowPlaying(setQueuePlayNext(snapshot.nowPlaying.songIds, songId, playback.currentTrackId))
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

  return (
    <div className={`app-shell${isNavigationCollapsed ? ' nav-collapsed' : ''}`}>
      <Sidebar
        t={t}
        collapsed={isNavigationCollapsed}
        appName={t('app.shell')}
        canGoBack={navigationDepth > 0}
        searchQuery={searchInput}
        recentSearches={snapshot.search.recentSearches}
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
        location.pathname.startsWith('/albums/') ||
        location.pathname.startsWith('/playlists') ||
        location.pathname.startsWith('/recent')
          ? 'workspace is-immersive-route'
          : 'workspace'
      }>
        <header className="workspace-header">
          <div>
            <h1>
              {location.pathname === '/' && !initialLoadComplete
                ? ''
                : getPageTitle(location.pathname, snapshot.counts, t, showCount, submittedSearchQuery)}
            </h1>
          </div>
          <div className="status-pills">
            <span>{appInfo.platform}</span>
            <span>{appInfo.isPackaged ? t('app.packaged') : t('app.development')}</span>
            <span>{t('app.songsCached', { count: snapshot.counts.songs })}</span>
          </div>
        </header>

        <main className="workspace-content">
          {initialLoadComplete ? (
            <Routes>
              <Route path="/" element={<Navigate to={resolveRestoredPage(snapshot.settings.lastPage)} replace />} />
            <Route
              path="/songs"
              element={
                <LibraryPage
                  snapshot={snapshot}
                  t={t}
                  songs={visibleSongs}
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  selectedTrackId={playback.currentTrackId}
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
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
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
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
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
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                />
              }
            />
            <Route
              path="/artists/:artistName"
              element={
                <ArtistDetailRoute
                  songs={snapshot.songs}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                />
              }
            />
            <Route
              path="/albums/:albumName"
              element={
                <AlbumDetailRoute
                  songs={snapshot.songs}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
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
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playback.playTrack(trackId, queueSongIds)
                  }}
                  onReplaceQueue={(songIds) => {
                    void replaceNowPlaying(songIds)
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
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
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
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
                <LocalBrowserRoute
                  songs={snapshot.songs}
                  t={t}
                  rootPath={snapshot.settings.rootPath}
                  selectedTrackId={playback.currentTrackId}
                  searchQuery=""
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot()
                  }}
                  onScanLibrary={() => {
                    void scanLibrary()
                  }}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onRevealSong={(songPath) => window.smplayer?.revealItemInFolder(songPath)}
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
                  initialPlaylistId={snapshot.settings.lastPlaylistId}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onSelectPlaylist={(playlistId) => {
                    void saveViewState({ lastPlaylistId: playlistId })
                  }}
                  onCreatePlaylist={(name) => {
                    void createPlaylist(name)
                  }}
                  onDeletePlaylist={(playlistId) => {
                    void deletePlaylist(playlistId)
                  }}
                  onRenamePlaylist={(playlistId, name) => {
                    void renamePlaylist(playlistId, name)
                  }}
                  onReorderPlaylists={(playlistIds) => {
                    void reorderPlaylists(playlistIds)
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
                  onReorderPlaylistSongs={(playlistId, songIds) => {
                    void reorderPlaylistSongs(playlistId, songIds)
                  }}
                />
              }
            />
            <Route
              path="/favorites"
              element={
                <CollectionPage
                  title={withOptionalCount(t('common.myFavorites'), favoriteCount, showCount)}
                  eyebrow={t('collection.favoritesEyebrow')}
                  description={t(
                    'collection.favoritesDescription',
                  )}
                  items={favoriteItems}
                  t={t}
                  emptyTitle={t('collection.noFavorites')}
                  emptyCopy={
                    t(
                      'collection.favoritesEmpty',
                    )
                  }
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
                  playlists={snapshot.playlists}
                  rootPath={snapshot.settings.rootPath}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  showCount={showCount}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playNextInQueue(songId)
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
            </Routes>
          ) : null}
        </main>
      </div>

      <PlayerBar
        track={playerTrack}
        disabled={!playback.currentTrack}
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
        onOpenNowPlaying={() => {
          navigate('/now-playing?full=1')
        }}
        onArtworkResolved={(trackId, artworkUrl) => {
          setResolvedArtwork({ trackId, artworkUrl })
        }}
      />
    </div>
  )
}

function ArtistDetailRoute({
  songs,
  t,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: {
  songs: LibrarySong[]
  t: Translator
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}) {
  const params = useParams()
  const artistName = decodeURIComponent(params.artistName ?? '')
  const artistSongs = songs.filter((song) => getSongArtists(song).includes(artistName))

  if (!artistName || artistSongs.length === 0) {
    return (
      <CollectionPage
        title={t('collection.artistNotFound')}
        description={t(
          'collection.artistNotFoundDescription',
        )}
        items={[]}
        t={t}
        emptyTitle={t('collection.artistNotFound')}
        emptyCopy={t(
          'collection.artistNotFoundCopy',
        )}
      />
    )
  }

  return (
    <ArtistDetailPage
      artistName={artistName}
      t={t}
      songs={artistSongs}
      selectedTrackId={selectedTrackId}
      onPlayTrack={onPlayTrack}
      onToggleFavorite={onToggleFavorite}
    />
  )
}

function AlbumDetailRoute({
  songs,
  t,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
  playlists,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
}: {
  songs: LibrarySong[]
  t: Translator
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  playlists: LibraryPlaylist[]
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
}) {
  const params = useParams()
  const albumName = decodeURIComponent(params.albumName ?? '')
  const albumSongs = songs.filter((song) => (song.album || 'Unknown album') === albumName)

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
      onPlayTrack={onPlayTrack}
      onToggleFavorite={onToggleFavorite}
      playlists={playlists}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
    />
  )
}

function LocalBrowserRoute({
  songs,
  t,
  rootPath,
  selectedTrackId,
  searchQuery,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onScanLibrary,
  onPlayTrack,
  onRevealSong,
}: {
  songs: LibrarySong[]
  t: Translator
  rootPath: string
  selectedTrackId: number | null
  searchQuery: string
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
}) {
  const params = useParams()
  const currentRelativePath = decodeLocalRoute(params['*'])

  return (
    <LocalBrowserPage
      songs={songs}
      t={t}
      rootPath={rootPath}
      currentRelativePath={currentRelativePath}
      selectedTrackId={selectedTrackId}
      searchQuery={searchQuery}
      loading={loading}
      scanning={scanning}
      error={error}
      onPickLibraryRoot={onPickLibraryRoot}
      onScanLibrary={onScanLibrary}
      onPlayTrack={onPlayTrack}
      onRevealSong={onRevealSong}
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
      : t('common.albums')
  }

  if (pathname.startsWith('/now-playing')) {
    return t('common.nowPlaying')
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
    return query ? t('search.resultOf', { query }) : t('search.resultTitle')
  }

  if (pathname.startsWith('/settings')) {
    return t('common.settings')
  }

  return showCount
    ? t('library.allSongsWithCount', { count: counts.songs })
    : t('library.allSongs')
}
