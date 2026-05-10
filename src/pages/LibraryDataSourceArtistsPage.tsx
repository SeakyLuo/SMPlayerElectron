import { useEffect, useState } from 'react'

import { LoadingState } from '../components/LoadingState'
import { getLibrarySnapshotFromDataSource, type LibraryDataSource } from '../data/libraryDataSource'
import type { LibrarySnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { ArtistsPage } from './ArtistsPage'

interface LibraryDataSourceArtistsPageProps {
  dataSource: LibraryDataSource
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  targetArtistName?: string
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
}

export function LibraryDataSourceArtistsPage({
  dataSource,
  t,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  targetArtistName,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onTogglePlayPause,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onDeleteSongFromDisk,
}: LibraryDataSourceArtistsPageProps) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null)
  const [songs, setSongs] = useState<LibrarySnapshot['songs']>([])
  const [sourceLoading, setSourceLoading] = useState(true)
  const [sourceError, setSourceError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setSourceLoading(true)
    setSourceError(null)

    Promise.all([getLibrarySnapshotFromDataSource(dataSource), dataSource.getArtists()])
      .then(([nextSnapshot, artists]) => {
        if (!disposed) {
          setSnapshot(nextSnapshot)
          setSongs(distinctSongs(artists.flatMap((artist) => artist.songs)))
        }
      })
      .catch(() => {
        if (!disposed) {
          setSourceError(t('remoteShare.libraryLoadFailed'))
        }
      })
      .finally(() => {
        if (!disposed) {
          setSourceLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [dataSource, t])

  if (sourceLoading || !snapshot) {
    return (
      <section className="page-panel artists-page">
        {sourceError || error ? <div className="error-banner">{sourceError ?? error}</div> : <LoadingState t={t} />}
      </section>
    )
  }

  return (
    <ArtistsPage
      t={t}
      songs={songs}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      searchQuery={searchQuery}
      error={sourceError ?? error}
      playlists={snapshot.playlists}
      favoritePlaylistId={snapshot.favorites.playlistId}
      loading={false}
      scanning={false}
      targetArtistName={targetArtistName}
      onPlayTrack={onPlayTrack}
      onMoveToMusicOrPlay={onMoveToMusicOrPlay}
      onAddSongsToNowPlaying={onAddSongsToNowPlaying}
      onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
      onTogglePlayPause={onTogglePlayPause}
      onPlayNext={onPlayNext}
      onToggleFavorite={onToggleFavorite}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onRevealSong={onRevealSong}
      onDeleteSongFromDisk={onDeleteSongFromDisk}
    />
  )
}

function distinctSongs(songs: LibrarySnapshot['songs']) {
  const songsById = new Map(songs.map((song) => [song.id, song]))
  return [...songsById.values()]
}
