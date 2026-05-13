import { useEffect, useMemo, type ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AlbumsPage } from './pages/AlbumsPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { HiddenFoldersPage } from './pages/HiddenFoldersPage'
import { LocalPage } from './pages/LocalPage'
import { MusicDataSourceMusicPage } from './pages/LibraryDataSourceMusicPage'
import { MyFavoritesPage } from './pages/MyFavoritesPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { RecentPage } from './pages/RecentPage'
import { RemoteLibraryPage } from './pages/RemoteLibraryPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { AlbumDetailRoute } from './AppRouteComponents'
import { createLocalMusicDataSource } from './data/musicDataSource'
import { resolveRestoredPage } from './appModel'
import type { LibrarySong, MusicData, SearchHistoryType } from './shared/contracts'
import type { Translator } from './shared/i18n'
import type { PlaybackCommands } from './hooks/usePlaybackCommands'
import type { PlaybackController } from './hooks/usePlaybackController'
import { useDeleteSongFromDisk } from './hooks/useDeleteSongFromDisk'
import { useDeleteLocalItems } from './hooks/useDeleteLocalItems'
import { useLibraryStore } from './state/useLibraryStore'
import { useUndoableNotificationStore } from './state/useUndoableNotificationStore'
import { usePreferenceStore } from './state/usePreferenceStore'
import { sortLibrarySongs } from './shared/sorting'

interface StartupRedirectProps {
  ready: boolean
  lastPage: string
}

function StartupRedirect({ ready, lastPage }: StartupRedirectProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (ready) {
      navigate(resolveRestoredPage(lastPage), { replace: true })
    }
  }, [lastPage, navigate, ready])

  return null
}

function LegacyArtistRouteRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const artistRouteValue = location.pathname.slice('/artists/'.length)
    navigate(artistRouteValue ? `/artists?artist=${artistRouteValue}` : '/artists', { replace: true })
  }, [location.pathname, navigate])

  return null
}

interface RequireLibraryDataProps {
  songs?: boolean
  folders?: boolean
  recent?: boolean
  children: ReactNode
}

function RequireLibraryData({ songs, folders, recent, children }: RequireLibraryDataProps) {
  const loadRequiredData = useLibraryStore((state) => state.loadRequiredData)

  useEffect(() => {
    void loadRequiredData({ songs, folders, recent })
  }, [folders, loadRequiredData, recent, songs])

  return children
}

interface AppRoutesContext {
  initialLoadComplete: boolean
  snapshot: MusicData
  t: Translator
  pageLoading: boolean
  scanning: boolean
  error: string | null
  playback: PlaybackController
  playbackCommands: PlaybackCommands
  revealItem: (itemPath: string) => void | Promise<void>
  setCompactArtistTitle: (title: string) => void
  setShowNowPlayingFullPage: (show: boolean) => void
  showCount: boolean
  commitSearchQuery: (query: string, type?: SearchHistoryType) => Promise<void>
  localRelativePath: string
  setLocalRelativePath: (relativePath: string) => void
  commitDirectorySearchQuery: (query: string, folderRelativePath: string) => void
  searchResultQuery: string
  submittedSearchQuery: string
  searchResultsLoading: boolean
  searchFolderPath: string
}

interface AppRoutesProps {
  context: AppRoutesContext
}

export function AppRoutes({ context }: AppRoutesProps) {
  const {
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
  } = context
  const location = useLocation()
  const navigate = useNavigate()
  const refresh = useLibraryStore((state) => state.refresh)
  const pickLibraryRoot = useLibraryStore((state) => state.pickLibraryRoot)
  const scanLibrary = useLibraryStore((state) => state.scanLibrary)
  const scanProgress = useLibraryStore((state) => state.scanProgress)
  const scanLocalFolder = useLibraryStore((state) => state.scanLocalFolder)
  const cancelLocalFolderScan = useLibraryStore((state) => state.cancelLocalFolderScan)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const addSongToPlaylist = useLibraryStore((state) => state.addSongToPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const recordRecentAlbumPlayed = useLibraryStore((state) => state.recordRecentAlbumPlayed)
  const recordRecentArtistPlayed = useLibraryStore((state) => state.recordRecentArtistPlayed)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const updateSettings = useLibraryStore((state) => state.updateSettings)
  const clearNowPlaying = useLibraryStore((state) => state.clearNowPlaying)
  const removeRecentPlayed = useLibraryStore((state) => state.removeRecentPlayed)
  const restoreRecentPlayed = useLibraryStore((state) => state.restoreRecentPlayed)
  const clearRecentPlayed = useLibraryStore((state) => state.clearRecentPlayed)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const removeRecentSearches = useLibraryStore((state) => state.removeRecentSearches)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const createLocalFolder = useLibraryStore((state) => state.createLocalFolder)
  const renameLocalFolder = useLibraryStore((state) => state.renameLocalFolder)
  const hideLocalFolder = useLibraryStore((state) => state.hideLocalFolder)
  const moveLocalItemsToFolder = useLibraryStore((state) => state.moveLocalItemsToFolder)
  const updateLocalFolderSort = useLibraryStore((state) => state.updateLocalFolderSort)
  const resumeHiddenStorageItem = useLibraryStore((state) => state.resumeHiddenStorageItem)
  const saveViewState = useLibraryStore((state) => state.saveViewState)
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist)
  const restorePlaylist = useLibraryStore((state) => state.restorePlaylist)
  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist)
  const reorderPlaylists = useLibraryStore((state) => state.reorderPlaylists)
  const recordRecentPlaylistPlayed = useLibraryStore((state) => state.recordRecentPlaylistPlayed)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const reorderPlaylistSongs = useLibraryStore((state) => state.reorderPlaylistSongs)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const deleteSongFromDisk = useDeleteSongFromDisk(t)
  const deleteLocalItems = useDeleteLocalItems(t)
  const routeSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const targetArtistQuery = routeSearchParams.get('artist')
  const targetAlbumQuery = routeSearchParams.get('album')
  const pageSearchQuery = routeSearchParams.get('search') ?? ''
  const localMusicDataSource = useMemo(
    () => createLocalMusicDataSource(snapshot, updateSettings),
    [snapshot, updateSettings],
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
  const favoriteSongs = useMemo(
    () =>
      snapshot.favorites.songIds
        .map((songId) => songsById.get(songId) ?? null)
        .filter((song): song is LibrarySong => song != null),
    [snapshot.favorites.songIds, songsById],
  )

  return (
          <Routes>
            <Route
              path="/"
              element={<StartupRedirect ready={initialLoadComplete} lastPage={snapshot.settings.lastPage} />}
            />
            <Route
              path="/songs"
              element={
                <RequireLibraryData songs>
                  <MusicDataSourceMusicPage
                    dataSource={localMusicDataSource}
                    t={t}
                    loading={pageLoading}
                    scanning={scanning}
                    error={error}
                    selectedTrackId={playback.currentTrackId}
                    isPlaying={playback.isPlaying}
                    searchQuery={pageSearchQuery}
                    onPickLibraryRoot={() => {
                      void pickLibraryRoot()
                    }}
                    onScanLibrary={() => {
                      void scanLibrary()
                    }}
                    onPlayTrack={(trackId, queueSongIds) => {
                      void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                    }}
                    onAddNextAndPlay={(trackId) => {
                      void playbackCommands.addNextAndPlay(trackId)
                    }}
                    onMoveToMusicOrPlay={(songId) => {
                      void playbackCommands.moveToMusicOrPlay(songId)
                    }}
                    onTogglePlayPause={() => {
                      void playback.togglePlayPause()
                    }}
                    onPlayNext={(songId) => {
                      void playbackCommands.playNext(songId)
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
                    onRevealSong={revealItem}
                    onDeleteSongFromDisk={(songId) => {
                      void deleteSongFromDisk(songsById.get(songId)!)
                    }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/artists"
              element={
                <RequireLibraryData songs>
                  <ArtistsPage
                  t={t}
                  songs={visibleSongs}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery={pageSearchQuery}
                  error={error}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  loading={pageLoading}
                  scanning={scanning}
                  targetArtistName={targetArtistQuery ?? undefined}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
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
                    void playbackCommands.playNext(songId)
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
                  onRecordAlbumPlayed={(album) => {
                    void recordRecentAlbumPlayed(album)
                  }}
                  onRecordArtistPlayed={(artist) => {
                    void recordRecentArtistPlayed(artist)
                  }}
                  onRevealSong={revealItem}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songsById.get(songId)!)
                  }}
                  recentSearches={snapshot.search.recentSearches}
                  onRecordSearch={(query) => {
                    void addRecentSearch(query, 'artists')
                  }}
                  onRemoveRecentSearch={(entryId) => {
                    void removeRecentSearch(entryId)
                  }}
                  onRemoveRecentSearches={(entryIds) => {
                    void removeRecentSearches(entryIds)
                  }}
                  onCompactTitleChange={setCompactArtistTitle}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/albums"
              element={
                <RequireLibraryData songs>
                  {targetAlbumQuery ? (
                    <AlbumDetailRoute
                    albumName={targetAlbumQuery}
                    songs={snapshot.songs}
                    loading={pageLoading}
                    t={t}
                    selectedTrackId={playback.currentTrackId}
                    isPlaying={playback.isPlaying}
                    onPlayTrack={(trackId, queueSongIds) => {
                      void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                    }}
                    onMoveToMusicOrPlay={(songId) => {
                      void playbackCommands.moveToMusicOrPlay(songId)
                    }}
                    onPlayNext={(songId) => {
                      void playbackCommands.playNext(songId)
                    }}
                    onTogglePlayPause={() => {
                      void playback.togglePlayPause()
                    }}
                    onToggleFavorite={(songId, favorite) => {
                      void setSongFavorite(songId, favorite)
                    }}
                    playlists={snapshot.playlists}
                    favoritePlaylistId={snapshot.favorites.playlistId}
                    onAddSongToPlaylist={(playlistId, songId) => {
                      void addSongToPlaylist(playlistId, songId)
                    }}
                    onAddSongsToPlaylist={(playlistId, songIds) => {
                      void addSongsToPlaylist(playlistId, songIds)
                    }}
                    onSetAlbumPreferred={(albumName, level) => {
                      void usePreferenceStore.getState().addItem('album', albumName, albumName, level)
                    }}
                    onRecordAlbumPlayed={(albumName) => {
                      void recordRecentAlbumPlayed(albumName)
                    }}
                    onAlbumArtworkSaved={() => {
                      void refresh()
                    }}
                    />
                  ) : (
                    <AlbumsPage
                    songs={snapshot.songs}
                    playlists={snapshot.playlists}
                    favoritePlaylistId={snapshot.favorites.playlistId}
                    t={t}
                    loading={pageLoading}
                    scanning={scanning}
                    onPlayTrack={(trackId, queueSongIds) => {
                      void playbackCommands.playTrackInQueue(trackId, queueSongIds)
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
                    onRecordAlbumPlayed={(album) => {
                      void recordRecentAlbumPlayed(album)
                    }}
                    recentSearches={snapshot.search.recentSearches}
                    onRecordSearch={(query) => {
                      void addRecentSearch(query, 'albums')
                    }}
                    onRemoveRecentSearch={(entryId) => {
                      void removeRecentSearch(entryId)
                    }}
                    onRemoveRecentSearches={(entryIds) => {
                      void removeRecentSearches(entryIds)
                    }}
                    />
                  )}
                </RequireLibraryData>
              }
            />
            <Route
              path="/artists/:artistName"
              element={<LegacyArtistRouteRedirect />}
            />
            <Route
              path="/albums/*"
              element={
                <RequireLibraryData songs>
                  <AlbumDetailRoute
                  albumName={targetAlbumQuery ?? undefined}
                  songs={snapshot.songs}
                  loading={pageLoading}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  onAddSongToPlaylist={(playlistId, songId) => {
                    void addSongToPlaylist(playlistId, songId)
                  }}
                  onAddSongsToPlaylist={(playlistId, songIds) => {
                    void addSongsToPlaylist(playlistId, songIds)
                  }}
                  onSetAlbumPreferred={(albumName, level) => {
                    void usePreferenceStore.getState().addItem('album', albumName, albumName, level)
                  }}
                  onRecordAlbumPlayed={(albumName) => {
                    void recordRecentAlbumPlayed(albumName)
                  }}
                  onAlbumArtworkSaved={() => {
                    void refresh()
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/now-playing"
              element={
                <RequireLibraryData songs recent>
                  <NowPlayingPage
                  songs={nowPlayingSongs}
                  loading={pageLoading}
                  librarySongs={snapshot.songs}
                  recentSongs={snapshot.recentSongs}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
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
                    void replaceNowPlaying(snapshot.nowPlaying.songIds.filter((songId: number) => !songIds.includes(songId)))
                  }}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songsById.get(songId)!)
                  }}
                  onClearQueue={() => {
                    void clearNowPlaying()
                  }}
                  onOpenImmersiveMode={() => {
                    setShowNowPlayingFullPage(true)
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/recent"
              element={
                <RequireLibraryData songs recent>
                  <RecentPage
                  songs={snapshot.songs}
                  recentSongs={snapshot.recentSongs}
                  recentPlaylists={snapshot.recentPlaylists}
                  recentAlbums={snapshot.recentAlbums}
                  recentArtists={snapshot.recentArtists}
                  recentSearches={snapshot.search.recentSearches}
                  loading={pageLoading}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  favoriteSongIds={snapshot.favorites.songIds}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  showCount={showCount}
                  preferredLanguage={snapshot.settings.preferredLanguage}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onAddNextAndPlay={(songId) => {
                    void playbackCommands.addNextAndPlay(songId)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
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
                  onRevealSong={revealItem}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songsById.get(songId)!)
                  }}
                  onRemoveRecentPlayed={(songIds) => {
                    void removeRecentPlayed(songIds)
                  }}
                  onRestoreRecentPlayed={(songIds) => {
                    void restoreRecentPlayed(songIds)
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
                  onSearch={(entry) => {
                    void commitSearchQuery(entry.query, entry.type)
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/local"
              element={
                <RequireLibraryData songs folders>
                  <LocalPage
                  songs={snapshot.songs}
                  folders={snapshot.folders}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  t={t}
                  rootPath={snapshot.settings.rootPath}
                  currentRelativePath={localRelativePath}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  loading={pageLoading}
                  scanning={scanning}
                  scanProgress={scanProgress}
                  error={error}
                  onPickLibraryRoot={() => {
                    void pickLibraryRoot().then((picked: boolean) => {
                      if (picked) {
                        void scanLibrary()
                      }
                    })
                  }}
                  onOpenFolder={setLocalRelativePath}
                  onRefreshFolder={(folderPath) => scanLocalFolder(folderPath)}
                  onCancelRefreshFolder={() => {
                    void cancelLocalFolderScan()
                  }}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
                  }}
                  onAddNextAndPlay={(songId) => {
                    void playbackCommands.addNextAndPlay(songId)
                  }}
                  onRevealSong={revealItem}
                  onRevealFolder={revealItem}
                  onCreateFolder={async (relativePath, name) => {
                    await createLocalFolder(snapshot.settings.rootPath, relativePath, name)
                  }}
                  onRenameFolder={async (folderPath, name) => {
                    await renameLocalFolder(folderPath, name)
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
                    void deleteSongFromDisk(songsById.get(songId)!)
                  }}
                  onMoveLocalItemsToFolder={async (songIds, folderPaths, targetFolderPath) => {
                    await moveLocalItemsToFolder(songIds, folderPaths, targetFolderPath)
                  }}
                  onDeleteLocalItems={async (songIds, folderPaths) => {
                    await deleteLocalItems(songIds, folderPaths)
                  }}
                  onUpdateFolderSort={async (folderPath, sortCriterion) => {
                    await updateLocalFolderSort(folderPath, sortCriterion)
                  }}
                  onSearchDirectory={(query, folderRelativePath) => {
                    commitDirectorySearchQuery(query, folderRelativePath)
                  }}
                  onHiddenFoldersListButtonClick={() => {
                    navigate('/hidden-folders')
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/hidden-folders"
              element={
                <HiddenFoldersPage
                  active={location.pathname === '/hidden-folders'}
                  t={t}
                  loading={pageLoading}
                  onResumeHiddenStorageItem={async (item) => {
                    await resumeHiddenStorageItem(item)
                  }}
                />
              }
            />
            <Route
              path="/remote/:hostId/*"
              element={<RemoteLibraryPage t={t} />}
            />
            <Route
              path="/playlists/:playlistId?"
              element={
                <RequireLibraryData songs>
                  <PlaylistsPage
                  snapshot={snapshot}
                  loading={pageLoading}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  searchQuery=""
                  error={error}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onSelectPlaylist={(playlistId) => {
                    void saveViewState({ lastPlaylistId: playlistId })
                  }}
                  onDeletePlaylist={(playlistId) => {
                    const playlistIndex = snapshot.playlists.findIndex((item: { id: number }) => item.id === playlistId)
                    const playlist = snapshot.playlists[playlistIndex]!
                    void deletePlaylist(playlistId)
                    showUndoableNotification(t('notification.playlistRemoved', { name: playlist.name }), t('common.undo'), () =>
                      restorePlaylist(playlist, playlistIndex),
                    )
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
                    void usePreferenceStore.getState().addItem('playlist', String(playlistId), name, level)
                  }}
                  onRecordPlaylistPlayed={(playlistId) => {
                    void recordRecentPlaylistPlayed(playlistId)
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
                </RequireLibraryData>
              }
            />
            <Route
              path="/favorites"
              element={
                <RequireLibraryData songs>
                  <MyFavoritesPage
                  songs={favoriteSongs}
                  loading={pageLoading}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  sortCriterion={snapshot.favorites.sortCriterion}
                  t={t}
                  selectedTrackId={playback.currentTrackId}
                  isPlaying={playback.isPlaying}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
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
                    void removeSongsFromPlaylist(snapshot.favorites.playlistId, songIds)
                  }}
                  onSortFavorites={(songIds, sortCriterion) => {
                    void reorderPlaylistSongs(snapshot.favorites.playlistId, songIds, sortCriterion)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onSetPreferred={(level) => {
                    void usePreferenceStore.getState().addItem('my-favorites', '6', t('common.myFavorites'), level)
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/search"
              element={
                <RequireLibraryData songs folders>
                  <SearchPage
                  t={t}
                  query={searchResultQuery}
                  requestedQuery={submittedSearchQuery}
                  loading={searchResultsLoading || pageLoading}
                  songs={snapshot.songs}
                  folders={snapshot.folders}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  rootPath={snapshot.settings.rootPath}
                  searchFolderPath={searchFolderPath}
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
                    void playbackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void playbackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void playbackCommands.playNext(songId)
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
                  onRevealSong={revealItem}
                  onDeleteSongFromDisk={(songId) => {
                    void deleteSongFromDisk(songsById.get(songId)!)
                  }}
                  onToggleFavorite={(songId, favorite) => {
                    void setSongFavorite(songId, favorite)
                  }}
                  onUpdateSettings={(update) => {
                    void updateSettings(update)
                  }}
                  onOpenLocalFolder={(folderRelativePath) => {
                    setLocalRelativePath(folderRelativePath)
                  }}
                  onSearchDirectory={(query, folderRelativePath) => {
                    commitDirectorySearchQuery(query, folderRelativePath)
                  }}
                  onRecordArtistPlayed={(artist) => {
                    void recordRecentArtistPlayed(artist)
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireLibraryData songs>
                  <SettingsPage
                  t={t}
                  snapshot={snapshot}
                  loading={pageLoading}
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
                </RequireLibraryData>
              }
            />
          </Routes>
  )
}
