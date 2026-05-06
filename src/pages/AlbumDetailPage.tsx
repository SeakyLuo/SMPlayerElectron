import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import type { LibraryPlaylist, LibrarySong, PreferenceLevel } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

interface AlbumDetailPageProps {
  albumName: string
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  playlists: LibraryPlaylist[]
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onSetAlbumPreferred: (albumName: string, level: PreferenceLevel) => void
  onEditAlbumArtwork: (albumName: string) => void
}

export function AlbumDetailPage({
  albumName,
  t,
  songs,
  selectedTrackId,
  playlists,
  onPlayTrack,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onToggleFavorite,
  onSetAlbumPreferred,
  onEditAlbumArtwork,
}: AlbumDetailPageProps) {
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''
  const artists = [...new Set(songs.flatMap((song) => getSongArtists(song)))].sort(
    (left, right) => left.localeCompare(right),
  )
  const subtitle = t('albums.albumSummary', {
    songs: songs.length,
    duration: formatDuration(songs.reduce((sum, song) => sum + song.duration, 0)),
  })
  const caption = artists.slice(0, 3).join(t('albums.artistSeparator')) || t('common.artistUnknown')

  return (
    <section className="page-panel immersive-detail-page">
      <HeaderedPlaylistControl
        type="album"
        title={albumName}
        subtitle={subtitle}
        caption={caption}
        t={t}
        songs={songs}
        selectedTrackId={selectedTrackId}
        playlists={playlists}
        artworkUrl={artworkUrl}
        showAlbum={false}
        showArtist
        canEditArtwork
        canSetPreferred
        preferenceType="album"
        preferenceItemId={albumName}
        onPlayTrack={onPlayTrack}
        onAddSongToPlaylist={onAddSongToPlaylist}
        onAddSongsToPlaylist={onAddSongsToPlaylist}
        onToggleFavorite={onToggleFavorite}
        onSetPreferred={(level) => {
          onSetAlbumPreferred(albumName, level)
        }}
        onEditArtwork={() => {
          onEditAlbumArtwork(albumName)
        }}
      />
    </section>
  )
}
