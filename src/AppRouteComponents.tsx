import { useLocation, useNavigate } from 'react-router-dom'

import { LoadingState } from './components/LoadingState'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { LocalPage } from './pages/LocalPage'
import type {
  LibraryFolder,
  LibraryPlaylist,
  LibrarySong,
  LocalFolderSortCriterion,
  PreferenceLevel,
  ScanLibraryProgress,
  ScanLibraryResult,
} from './shared/contracts'
import type { Translator } from './shared/i18n'
import { compareLocalText } from './shared/textCompare'

export function AlbumDetailRoute({
  albumName,
  songs,
  loading,
  t,
  selectedTrackId,
  isPlaying,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onToggleFavorite,
  playlists,
  favoritePlaylistId,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onSetAlbumPreferred,
  onRecordAlbumPlayed,
  onAlbumArtworkSaved,
}: {
  albumName?: string
  songs: LibrarySong[]
  loading: boolean
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onSetAlbumPreferred: (albumName: string, level: PreferenceLevel) => void
  onRecordAlbumPlayed: (albumName: string) => void
  onAlbumArtworkSaved: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const routeAlbumName = albumName ?? decodeURIComponent(location.pathname.slice('/albums/'.length))
  const albumSongs = songs
    .filter((song) => (song.album || t('common.albumUnknown')) === routeAlbumName)
    .sort((left, right) => compareLocalText(left.title, right.title))

  if (loading && songs.length === 0) {
    return (
      <section className="page-panel">
        <LoadingState t={t} />
      </section>
    )
  }

  if (!routeAlbumName || albumSongs.length === 0) {
    return (
      <section className="page-panel immersive-detail-page">
        <div className="empty-state">
          <h3>{t('collection.albumNotFound')}</h3>
          <p>{t('collection.albumNotFoundCopy')}</p>
        </div>
      </section>
    )
  }

  return (
    <AlbumDetailPage
      albumName={routeAlbumName}
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
      favoritePlaylistId={favoritePlaylistId}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onSetAlbumPreferred={onSetAlbumPreferred}
      onRecordAlbumPlayed={onRecordAlbumPlayed}
      onAlbumArtworkSaved={onAlbumArtworkSaved}
      onArtistClick={(artist) => {
        navigate(`/artists?artist=${encodeURIComponent(artist)}`)
      }}
      onAlbumClick={(album) => {
        navigate(`/albums?album=${encodeURIComponent(album)}`)
      }}
    />
  )
}

export function LocalPageRoute({
  songs,
  folders,
  playlists,
  favoritePlaylistId,
  t,
  rootPath,
  currentRelativePath,
  selectedTrackId,
  isPlaying,
  searchQuery,
  loading,
  scanning,
  scanProgress,
  error,
  onPickLibraryRoot,
  onOpenFolder,
  onRefreshFolder,
  onCancelRefreshFolder,
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
  onHiddenFoldersListButtonClick,
}: {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  rootPath: string
  currentRelativePath: string
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  loading: boolean
  scanning: boolean
  scanProgress: ScanLibraryProgress | null
  error: string | null
  onPickLibraryRoot: () => void
  onOpenFolder: (targetRelativePath: string) => void
  onRefreshFolder: (folderPath: string) => void | ScanLibraryResult | null | Promise<ScanLibraryResult | null | void>
  onCancelRefreshFolder: () => void
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
  onHiddenFoldersListButtonClick: () => void
}) {
  return (
    <LocalPage
      songs={songs}
      folders={folders}
      playlists={playlists}
      favoritePlaylistId={favoritePlaylistId}
      t={t}
      rootPath={rootPath}
      currentRelativePath={currentRelativePath}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      searchQuery={searchQuery}
      loading={loading}
      scanning={scanning}
      scanProgress={scanProgress}
      error={error}
      onPickLibraryRoot={onPickLibraryRoot}
      onOpenFolder={onOpenFolder}
      onRefreshFolder={onRefreshFolder}
      onCancelRefreshFolder={onCancelRefreshFolder}
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
      onHiddenFoldersListButtonClick={onHiddenFoldersListButtonClick}
    />
  )
}
