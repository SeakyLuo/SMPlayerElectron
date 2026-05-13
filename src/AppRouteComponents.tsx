import { useLocation, useNavigate } from 'react-router-dom'

import { LoadingState } from './components/LoadingState'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import type {
  LibraryPlaylist,
  LibrarySong,
  PreferenceLevel,
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
