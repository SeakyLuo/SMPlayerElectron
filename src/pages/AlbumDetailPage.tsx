import { useState } from 'react'

import { AlbumArtworkDialog } from '../components/AlbumArtworkDialog'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import type { LibraryPlaylist, LibrarySong, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface AlbumDetailPageProps {
  albumName: string
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  isPlaying: boolean
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
  onSetAlbumPreferred?: (albumName: string, level: PreferenceLevel) => void
  onAlbumArtworkSaved: () => void
  onArtistClick: (artist: string) => void
  onAlbumClick: (album: string) => void
  canEditArtwork?: boolean
  canSetPreferred?: boolean
}

export function AlbumDetailPage({
  albumName,
  t,
  songs,
  selectedTrackId,
  isPlaying,
  playlists,
  favoritePlaylistId,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onToggleFavorite,
  onSetAlbumPreferred,
  onAlbumArtworkSaved,
  onArtistClick,
  onAlbumClick,
  canEditArtwork = true,
  canSetPreferred = true,
}: AlbumDetailPageProps) {
  const [showArtworkDialog, setShowArtworkDialog] = useState(false)
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''

  return (
    <section className="page-panel immersive-detail-page">
      <HeaderedPlaylistControl
        type="album"
        title={albumName}
        t={t}
        songs={songs}
        selectedTrackId={selectedTrackId}
        isPlaying={isPlaying}
        playlists={playlists}
        favoritePlaylistId={favoritePlaylistId}
        artworkUrl={artworkUrl}
        showAlbum={false}
        showArtist
        canEditArtwork={canEditArtwork}
        canSetPreferred={canSetPreferred}
        preferenceType="album"
        preferenceItemId={albumName}
        onPlayTrack={onPlayTrack}
        onMoveToMusicOrPlay={onMoveToMusicOrPlay}
        onPlayNext={onPlayNext}
        onTogglePlayPause={onTogglePlayPause}
        onAddSongToPlaylist={onAddSongToPlaylist}
        onAddSongsToPlaylist={onAddSongsToPlaylist}
        onToggleFavorite={onToggleFavorite}
        onArtistClick={onArtistClick}
        onAlbumClick={onAlbumClick}
        onSetPreferred={(level) => {
          onSetAlbumPreferred?.(albumName, level)
        }}
        onEditArtwork={() => {
          setShowArtworkDialog(true)
        }}
      />
      {showArtworkDialog ? (
        <AlbumArtworkDialog
          albumName={albumName}
          artworkUrl={artworkUrl}
          t={t}
          onClose={() => {
            setShowArtworkDialog(false)
          }}
          onSaved={onAlbumArtworkSaved}
        />
      ) : null}
    </section>
  )
}
