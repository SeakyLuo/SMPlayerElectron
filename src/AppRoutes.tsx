import { useEffect, useMemo, type ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'

import { AlbumsPage } from './pages/AlbumsPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { HiddenFoldersPage } from './pages/HiddenFoldersPage'
import { MusicDataSourceMusicPage } from './pages/LibraryDataSourceMusicPage'
import { MyFavoritesPage } from './pages/MyFavoritesPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { RecentPage } from './pages/RecentPage'
import { RemoteLibraryPage } from './pages/RemoteLibraryPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { AlbumDetailRoute, LocalPageRoute } from './AppRouteComponents'
import { createLocalMusicDataSource } from './data/musicDataSource'
import { PlaybackCommands } from './shared/PlaybackCommands'
import { resolveRestoredPage } from './appModel'
import type { LibrarySong, MusicData } from './shared/contracts'
import type { Translator } from './shared/i18n'
import type { PlaybackController } from './hooks/usePlaybackController'
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

type LibraryStoreState = ReturnType<typeof useLibraryStore.getState>
type ShowUndoableNotification = ReturnType<typeof useUndoableNotificationStore.getState>['show']
type AppLocation = ReturnType<typeof useLocation>

interface AppRoutesContext {
  initialLoadComplete: boolean
  snapshot: MusicData
  t: Translator
  pageLoading: boolean
  scanning: boolean
  error: string | null
  playback: PlaybackController
  pickLibraryRoot: LibraryStoreState['pickLibraryRoot']
  scanLibrary: LibraryStoreState['scanLibrary']
  setSongFavorite: LibraryStoreState['setSongFavorite']
  addSongToPlaylist: LibraryStoreState['addSongToPlaylist']
  addSongsToPlaylist: LibraryStoreState['addSongsToPlaylist']
  replaceNowPlaying: LibraryStoreState['replaceNowPlaying']
  createPlaylist: LibraryStoreState['createPlaylist']
  revealItem: (itemPath: string) => void | Promise<void>
  deleteSongFromDisk: LibraryStoreState['deleteSongFromDisk']
  targetArtistQuery: string | null
  recordRecentAlbumPlayed: LibraryStoreState['recordRecentAlbumPlayed']
  recordRecentArtistPlayed: LibraryStoreState['recordRecentArtistPlayed']
  addRecentSearch: LibraryStoreState['addRecentSearch']
  setCompactArtistTitle: (title: string) => void
  targetAlbumQuery: string | null
  updateSettings: LibraryStoreState['updateSettings']
  clearNowPlaying: LibraryStoreState['clearNowPlaying']
  setShowNowPlayingFullPage: (show: boolean) => void
  showCount: boolean
  removeRecentPlayed: LibraryStoreState['removeRecentPlayed']
  restoreRecentPlayed: LibraryStoreState['restoreRecentPlayed']
  clearRecentPlayed: LibraryStoreState['clearRecentPlayed']
  removeRecentSearches: LibraryStoreState['removeRecentSearches']
  clearRecentSearches: LibraryStoreState['clearRecentSearches']
  commitSearchQuery: (query: string) => Promise<void>
  localRelativePath: string
  scanProgress: LibraryStoreState['scanProgress']
  scanLocalFolder: LibraryStoreState['scanLocalFolder']
  cancelLocalFolderScan: LibraryStoreState['cancelLocalFolderScan']
  setLocalRelativePath: (relativePath: string) => void
  createLocalFolder: LibraryStoreState['createLocalFolder']
  renameLocalFolder: LibraryStoreState['renameLocalFolder']
  deleteLocalFolder: LibraryStoreState['deleteLocalFolder']
  hideLocalFolder: LibraryStoreState['hideLocalFolder']
  moveSongsToFolder: LibraryStoreState['moveSongsToFolder']
  moveLocalFolderToFolder: LibraryStoreState['moveLocalFolderToFolder']
  deleteLocalItems: LibraryStoreState['deleteLocalItems']
  updateLocalFolderSort: LibraryStoreState['updateLocalFolderSort']
  commitDirectorySearchQuery: (query: string, folderRelativePath: string) => void
  navigate: NavigateFunction
  resumeHiddenStorageItem: LibraryStoreState['resumeHiddenStorageItem']
  saveViewState: LibraryStoreState['saveViewState']
  deletePlaylist: LibraryStoreState['deletePlaylist']
  showUndoableNotification: ShowUndoableNotification
  restorePlaylist: LibraryStoreState['restorePlaylist']
  renamePlaylist: LibraryStoreState['renamePlaylist']
  reorderPlaylists: LibraryStoreState['reorderPlaylists']
  recordRecentPlaylistPlayed: LibraryStoreState['recordRecentPlaylistPlayed']
  removeSongsFromPlaylist: LibraryStoreState['removeSongsFromPlaylist']
  reorderPlaylistSongs: LibraryStoreState['reorderPlaylistSongs']
  searchResultQuery: string
  submittedSearchQuery: string
  searchResultsLoading: boolean
  searchFolderPath: string
  searchFolderName: string
  location: AppLocation
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
  } = context
  const refresh = useLibraryStore((state) => state.refresh)
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
                    searchQuery=""
                    onPickLibraryRoot={() => {
                      void pickLibraryRoot()
                    }}
                    onScanLibrary={() => {
                      void scanLibrary()
                    }}
                    onPlayTrack={(trackId, queueSongIds) => {
                      void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                    }}
                    onAddNextAndPlay={(trackId) => {
                      void PlaybackCommands.addNextAndPlay(trackId)
                    }}
                    onMoveToMusicOrPlay={(songId) => {
                      void PlaybackCommands.moveToMusicOrPlay(songId)
                    }}
                    onTogglePlayPause={() => {
                      void playback.togglePlayPause()
                    }}
                    onPlayNext={(songId) => {
                      void PlaybackCommands.playNext(songId)
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
                      void deleteSongFromDisk(songId)
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
                  searchQuery=""
                  error={error}
                  playlists={snapshot.playlists}
                  favoritePlaylistId={snapshot.favorites.playlistId}
                  loading={pageLoading}
                  scanning={scanning}
                  targetArtistName={targetArtistQuery ?? undefined}
                  onPlayTrack={(trackId, queueSongIds) => {
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
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
                    void PlaybackCommands.playNext(songId)
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
                    void deleteSongFromDisk(songId)
                  }}
                  onRecordSearch={(query) => {
                    void addRecentSearch(query)
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
                      void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                    }}
                    onMoveToMusicOrPlay={(songId) => {
                      void PlaybackCommands.moveToMusicOrPlay(songId)
                    }}
                    onPlayNext={(songId) => {
                      void PlaybackCommands.playNext(songId)
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
                      void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
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
                    onRecordSearch={(query) => {
                      void addRecentSearch(query)
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
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
                    void replaceNowPlaying(snapshot.nowPlaying.songIds.filter((songId: number) => !songIds.includes(songId)))
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
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
                    void deleteSongFromDisk(songId)
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
                  onSearch={(query) => {
                    void commitSearchQuery(query)
                  }}
                  />
                </RequireLibraryData>
              }
            />
            <Route
              path="/local"
              element={
                <RequireLibraryData songs folders>
                  <LocalPageRoute
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
                  }}
                  onRevealSong={revealItem}
                  onRevealFolder={revealItem}
                  onCreateFolder={async (relativePath, name) => {
                    await createLocalFolder(snapshot.settings.rootPath, relativePath, name)
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
                    await moveSongsToFolder(songIds, folderPath)
                  }}
                  onMoveFolderToFolder={async (sourceFolderPath, targetFolderPath) => {
                    await moveLocalFolderToFolder(sourceFolderPath, targetFolderPath)
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
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
                    void PlaybackCommands.playTrackInQueue(trackId, queueSongIds)
                  }}
                  onMoveToMusicOrPlay={(songId) => {
                    void PlaybackCommands.moveToMusicOrPlay(songId)
                  }}
                  onTogglePlayPause={() => {
                    void playback.togglePlayPause()
                  }}
                  onPlayNext={(songId) => {
                    void PlaybackCommands.playNext(songId)
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
                    void deleteSongFromDisk(songId)
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
