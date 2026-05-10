import { useNavigate } from 'react-router-dom'

import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import { LoadingState } from '../components/LoadingState'
import type { LibraryPlaylist, LibrarySong, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface MyFavoritesPageProps {
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  sortCriterion: LibraryPlaylist['sortCriterion']
  t: Translator
  loading: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongsFromFavorites: (songIds: number[]) => void
  onSortFavorites: (songIds: number[], sortCriterion: LibraryPlaylist['sortCriterion']) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onSetPreferred: (level: PreferenceLevel) => void
}

export function MyFavoritesPage({
  songs,
  playlists,
  favoritePlaylistId,
  sortCriterion,
  t,
  loading,
  selectedTrackId,
  isPlaying,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromFavorites,
  onSortFavorites,
  onToggleFavorite,
  onSetPreferred,
}: MyFavoritesPageProps) {
  const navigate = useNavigate()
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''

  if (loading && songs.length === 0) {
    return (
      <section className="page-panel immersive-detail-page">
        <LoadingState t={t} />
      </section>
    )
  }

  return (
    <section className="page-panel immersive-detail-page">
      <HeaderedPlaylistControl
        type="favorites"
        title={t('common.myFavorites')}
        t={t}
        songs={songs}
        selectedTrackId={selectedTrackId}
        isPlaying={isPlaying}
        playlists={playlists}
        favoritePlaylistId={favoritePlaylistId}
        artworkUrl={artworkUrl}
        removable
        showAlbum
        showArtist
        canClear={songs.length > 0}
        canSetPreferred
        sortCriterion={sortCriterion}
        preferenceType="my-favorites"
        preferenceItemId="6"
        onPlayTrack={onPlayTrack}
        onMoveToMusicOrPlay={onMoveToMusicOrPlay}
        onPlayNext={onPlayNext}
        onTogglePlayPause={onTogglePlayPause}
        onAddSongToPlaylist={onAddSongToPlaylist}
        onAddSongsToPlaylist={onAddSongsToPlaylist}
        onRemoveSongs={onRemoveSongsFromFavorites}
        onClear={() => {
          onRemoveSongsFromFavorites(songs.map((song) => song.id))
        }}
        onSetPreferred={onSetPreferred}
        onSortSongs={onSortFavorites}
        onArtistClick={(artist) => {
          navigate(`/artists?artist=${encodeURIComponent(artist)}`)
        }}
        onAlbumClick={(album) => {
          navigate(`/albums?album=${encodeURIComponent(album)}`)
        }}
        onToggleFavorite={onToggleFavorite}
      />
    </section>
  )
}
