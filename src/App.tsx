import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'

import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { ArtistDetailPage } from './pages/ArtistDetailPage'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar } from './components/Sidebar'
import { usePlaybackController } from './hooks/usePlaybackController'
import { CollectionPage } from './pages/CollectionPage'
import { LibraryPage } from './pages/LibraryPage'
import { LocalBrowserPage } from './pages/LocalBrowserPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { SettingsPage } from './pages/SettingsPage'
import { decodeLocalRoute } from './pages/localBrowserPaths'
import type { AppInfo, LibrarySong } from './shared/contracts'
import { getDisplayArtists, getSongArtists } from './shared/artists'
import { formatDuration } from './shared/formatters'
import {
  buildAlbumCards,
  buildArtistCards,
  buildFavoriteCards,
  buildRecentCards,
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
  '/settings',
])

function resolveRestoredPage(lastPage: string) {
  const normalizedPath = lastPage.trim()

  if (
    RESTORABLE_ROUTES.has(normalizedPath) ||
    normalizedPath.startsWith('/local/') ||
    normalizedPath.startsWith('/artists/') ||
    normalizedPath.startsWith('/albums/')
  ) {
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
  const [searchDraft, setSearchDraft] = useState<string | null>(null)
  const lastNotifiedTrackIdRef = useRef<number | null>(null)
  const location = useLocation()

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
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const reorderPlaylistSongs = useLibraryStore((state) => state.reorderPlaylistSongs)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromNowPlaying = useLibraryStore((state) => state.removeSongFromNowPlaying)
  const clearNowPlaying = useLibraryStore((state) => state.clearNowPlaying)
  const saveSearchQuery = useLibraryStore((state) => state.saveSearchQuery)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const updateSettings = useLibraryStore((state) => state.updateSettings)
  const saveViewState = useLibraryStore((state) => state.saveViewState)

  const playback = usePlaybackController(snapshot)
  const searchQuery = searchDraft ?? snapshot.search.lastQuery
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase()
  const visibleSongs = normalizedSearchQuery
    ? snapshot.songs.filter((song) =>
        [
          song.title,
          song.artist,
          ...song.artists,
          song.album,
          song.path,
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedSearchQuery),
      )
    : snapshot.songs
  const filterCollectionItems = <T extends { title: string; subtitle: string; detail: string }>(
    items: T[],
  ) =>
    normalizedSearchQuery
      ? items.filter((item) =>
          `${item.title} ${item.subtitle} ${item.detail}`
            .toLocaleLowerCase()
            .includes(normalizedSearchQuery),
        )
      : items
  const artistItems = filterCollectionItems(buildArtistCards(snapshot.songs))
  const albumItems = filterCollectionItems(buildAlbumCards(snapshot.songs))
  const songsById = new Map(snapshot.songs.map((song) => [song.id, song]))
  const nowPlayingSongs = snapshot.nowPlaying.songIds
    .map((songId) => songsById.get(songId) ?? null)
    .filter((song): song is (typeof snapshot.songs)[number] => song != null)
  const recentItems = filterCollectionItems(buildRecentCards(snapshot.recentSongs))
  const favoriteItems = filterCollectionItems(buildFavoriteCards(snapshot.songs))
  const favoriteCount = snapshot.songs.filter((song) => song.favorite).length
  const showCount = snapshot.settings.showCount
  const noSearchResultsCopy = normalizedSearchQuery
    ? `No items match "${searchQuery}". Try a broader keyword.`
    : undefined
  const defaultCollectionEmptyCopy =
    'Scan a library first. This page will then populate from the imported SQLite-backed data.'

  const playerTrack = playback.currentTrack
    ? {
        title: playback.currentTrack.title,
        artist:
          playback.currentTrack.artist ||
          getDisplayArtists(playback.currentTrack) ||
          playback.currentTrack.album ||
          'Unknown artist',
        artworkUrl: playback.currentTrack.artworkUrl,
        elapsedLabel: formatDuration(playback.progressSeconds),
        durationLabel: formatDuration(
          playback.durationSeconds || playback.currentTrack.duration,
        ),
        progressRatio:
          playback.durationSeconds > 0
            ? playback.progressSeconds / playback.durationSeconds
            : 0,
      }
    : {
        title: snapshot.songs.length > 0 ? 'Select a track' : 'Library is empty',
        artist: snapshot.settings.rootPath
          ? 'Choose a song from the library to start playback.'
          : 'Choose a library folder and scan it first.',
        artworkUrl: '',
        elapsedLabel: '0:00',
        durationLabel: '0:00',
        progressRatio: 0,
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
    if (searchDraft == null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void saveSearchQuery(searchDraft)
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [saveSearchQuery, searchDraft])

  useEffect(() => {
    if (location.pathname === '/') {
      return
    }

    void saveViewState({ lastPage: location.pathname })
  }, [location.pathname, saveViewState])

  useEffect(() => {
    applyThemeColor(snapshot.settings.themeColor)
  }, [snapshot.settings.themeColor])

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
    await replaceNowPlaying(queueSongIds)
    await playback.playTrack(trackId, queueSongIds)
  }

  async function commitSearchQuery(value: string) {
    const nextQuery = value.trim()

    setSearchDraft(nextQuery)

    if (!nextQuery) {
      await saveSearchQuery('')
      return
    }

    await addRecentSearch(nextQuery)
  }

  return (
    <div className="app-shell">
      <Sidebar
        appInfo={appInfo}
        searchQuery={searchQuery}
        recentSearches={snapshot.search.recentSearches}
        onSearchChange={setSearchDraft}
        onSearchCommit={(value) => {
          void commitSearchQuery(value)
        }}
        onRecentSearchRemove={(entryId) => {
          void removeRecentSearch(entryId)
        }}
        onRecentSearchesClear={() => {
          void clearRecentSearches()
        }}
      />
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Electron migration shell</p>
            <h1>SMPlayer</h1>
          </div>
          <div className="status-pills">
            <span>{appInfo.platform}</span>
            <span>{appInfo.isPackaged ? 'packaged' : 'development'}</span>
            <span>{snapshot.counts.songs} songs cached</span>
          </div>
        </header>

        <main className="workspace-content">
          <Routes>
            <Route
              path="/"
              element={
                initialLoadComplete ? (
                  <Navigate
                    to={resolveRestoredPage(snapshot.settings.lastPage)}
                    replace
                  />
                ) : null
              }
            />
            <Route
              path="/songs"
              element={
                <LibraryPage
                  snapshot={snapshot}
                  songs={visibleSongs}
                  loading={loading}
                  scanning={scanning}
                  error={error}
                  selectedTrackId={playback.currentTrackId}
                  searchQuery={searchQuery}
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot()
                  }}
                  onScanLibrary={() => {
                    void scanLibrary()
                  }}
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
              path="/artists"
              element={
                <CollectionPage
                  title={withOptionalCount('Artists', artistItems.length, showCount)}
                  eyebrow="Live metadata index"
                  description="Artist groups are now derived from the imported library snapshot. Artwork, artist aliases, and album-artist reconciliation are still pending."
                  items={artistItems}
                  getItemPath={(item) => `/artists/${encodeURIComponent(item.title)}`}
                  emptyTitle="No artists indexed yet"
                  emptyCopy={noSearchResultsCopy ?? defaultCollectionEmptyCopy}
                />
              }
            />
            <Route
              path="/albums"
              element={
                <CollectionPage
                  title={withOptionalCount('Albums', albumItems.length, showCount)}
                  eyebrow="Live album index"
                  description="Album groups are now built from the imported SQLite-backed library. Artwork, release sorting, and album detail drilldowns are next."
                  items={albumItems}
                  getItemPath={(item) => `/albums/${encodeURIComponent(item.title)}`}
                  emptyTitle="No albums indexed yet"
                  emptyCopy={noSearchResultsCopy ?? defaultCollectionEmptyCopy}
                />
              }
            />
            <Route
              path="/artists/:artistName"
              element={
                <ArtistDetailRoute
                  songs={snapshot.songs}
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
              path="/now-playing"
              element={
                <NowPlayingPage
                  songs={nowPlayingSongs}
                  currentTrack={playback.currentTrack}
                  autoLyrics={snapshot.settings.autoLyrics}
                  selectedTrackId={playback.currentTrackId}
                  progressSeconds={playback.progressSeconds}
                  searchQuery={searchQuery}
                  error={error}
                  onPlayTrack={(trackId) => {
                    void playback.playTrack(trackId, snapshot.nowPlaying.songIds)
                  }}
                  onRemoveSong={(songId) => {
                    void removeSongFromNowPlaying(songId)
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
                <CollectionPage
                  title={withOptionalCount('Recent', recentItems.length, showCount)}
                  eyebrow="SQLite playback history"
                  description="Recent playback now comes from the migrated `RecentRecord` table. Search history and last-page restoration still need their own views."
                  items={recentItems}
                  emptyTitle="No recent playback yet"
                  emptyCopy={
                    noSearchResultsCopy ??
                    'Play a few tracks and this page will start reflecting the actual recent-history table.'
                  }
                />
              }
            />
            <Route
              path="/local/*"
              element={
                <LocalBrowserRoute
                  songs={snapshot.songs}
                  rootPath={snapshot.settings.rootPath}
                  selectedTrackId={playback.currentTrackId}
                  searchQuery={searchQuery}
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
                  onRevealSong={(songPath) => {
                    void window.smplayer?.revealItemInFolder(songPath)
                  }}
                />
              }
            />
            <Route
              path="/playlists"
              element={
                <PlaylistsPage
                  snapshot={snapshot}
                  selectedTrackId={playback.currentTrackId}
                  searchQuery={searchQuery}
                  error={error}
                  initialPlaylistId={snapshot.settings.lastPlaylistId}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playTrackInQueue(trackId, queueSongIds)
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
                  onRemoveSongFromPlaylist={(playlistId, songId) => {
                    void removeSongFromPlaylist(playlistId, songId)
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
                  title={withOptionalCount('My Favorites', favoriteCount, showCount)}
                  eyebrow="Favorite songs"
                  description="Favorites still map to a dedicated playlist, matching the old app model. The remaining work here is the actual favorite-toggle UI."
                  items={favoriteItems}
                  emptyTitle="No favorites yet"
                  emptyCopy={
                    noSearchResultsCopy ??
                    'Favorite tracks are already recognized from the playlist table. The UI for toggling them is still to be migrated.'
                  }
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  appInfo={appInfo}
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
        </main>

        <PlayerBar
          track={playerTrack}
          disabled={!playback.currentTrack}
          isPlaying={playback.isPlaying}
          volume={playback.volume}
          isMuted={playback.isMuted}
          mode={playback.mode}
          onTogglePlayPause={() => {
            void playback.togglePlayPause()
          }}
          onPrevious={() => {
            void playback.playPrevious()
          }}
          onNext={() => {
            void playback.playNext()
          }}
          onSeek={playback.seekToRatio}
          onVolumeChange={playback.setVolumeLevel}
          onToggleMute={playback.toggleMute}
          onToggleShuffle={playback.toggleShuffle}
          onCycleRepeatMode={playback.cycleRepeatMode}
        />
      </div>
    </div>
  )
}

function ArtistDetailRoute({
  songs,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: {
  songs: LibrarySong[]
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
        title="Artist Not Found"
        description="The selected artist could not be resolved from the current library snapshot."
        items={[]}
        emptyTitle="Artist not found"
        emptyCopy="Rescan the library or pick a different artist from the artists index."
      />
    )
  }

  return (
    <ArtistDetailPage
      artistName={artistName}
      songs={artistSongs}
      selectedTrackId={selectedTrackId}
      onPlayTrack={onPlayTrack}
      onToggleFavorite={onToggleFavorite}
    />
  )
}

function AlbumDetailRoute({
  songs,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: {
  songs: LibrarySong[]
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}) {
  const params = useParams()
  const albumName = decodeURIComponent(params.albumName ?? '')
  const albumSongs = songs.filter((song) => (song.album || 'Unknown album') === albumName)

  if (!albumName || albumSongs.length === 0) {
    return (
      <CollectionPage
        title="Album Not Found"
        description="The selected album could not be resolved from the current library snapshot."
        items={[]}
        emptyTitle="Album not found"
        emptyCopy="Rescan the library or pick a different album from the albums index."
      />
    )
  }

  return (
    <AlbumDetailPage
      albumName={albumName}
      songs={albumSongs}
      selectedTrackId={selectedTrackId}
      onPlayTrack={onPlayTrack}
      onToggleFavorite={onToggleFavorite}
    />
  )
}

function LocalBrowserRoute({
  songs,
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
  rootPath: string
  selectedTrackId: number | null
  searchQuery: string
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onRevealSong: (songPath: string) => void
}) {
  const params = useParams()
  const currentRelativePath = decodeLocalRoute(params['*'])

  return (
    <LocalBrowserPage
      songs={songs}
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
