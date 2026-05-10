import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LoadingState } from '../components/LoadingState'
import { getLibrarySnapshotFromDataSource, type LibraryDataSource } from '../data/libraryDataSource'
import type { AppSettingsUpdate, LibrarySnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { AlbumDetailPage } from './AlbumDetailPage'
import { AlbumsPage } from './AlbumsPage'

interface LibraryDataSourceAlbumsPageProps {
  dataSource: LibraryDataSource
  t: Translator
  error: string | null
  selectedTrackId?: number | null
  isPlaying?: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay?: (songId: number) => void
  onPlayNext?: (songId: number) => void
  onTogglePlayPause?: () => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongToPlaylist?: (playlistId: number, songId: number) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
  onUpdateSettings?: (update: AppSettingsUpdate) => void | Promise<void>
  routeBase?: string
  targetAlbumName?: string
}

export function LibraryDataSourceAlbumsPage({
  dataSource,
  t,
  error,
  selectedTrackId = null,
  isPlaying = false,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onAddSongsToPlaylist,
  onAddSongToPlaylist,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onToggleFavorite,
  onUpdateSettings,
  routeBase = '',
  targetAlbumName,
}: LibraryDataSourceAlbumsPageProps) {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null)
  const [songs, setSongs] = useState<LibrarySnapshot['songs']>([])
  const [sourceLoading, setSourceLoading] = useState(true)
  const [sourceError, setSourceError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setSourceLoading(true)
    setSourceError(null)

    Promise.all([getLibrarySnapshotFromDataSource(dataSource), dataSource.getAlbums()])
      .then(([nextSnapshot, albums]) => {
        if (!disposed) {
          setSnapshot(nextSnapshot)
          setSongs(distinctSongs(albums.flatMap((album) => album.songs)))
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
      <section className="page-panel albums-page">
        {sourceError || error ? <div className="error-banner">{sourceError ?? error}</div> : <LoadingState t={t} />}
      </section>
    )
  }

  if (targetAlbumName) {
    const albumSongs = snapshot.songs.filter((song) => song.album === targetAlbumName)
    return (
      <AlbumDetailPage
        albumName={targetAlbumName}
        t={t}
        songs={albumSongs}
        selectedTrackId={selectedTrackId}
        isPlaying={isPlaying}
        playlists={snapshot.playlists}
        favoritePlaylistId={snapshot.favorites.playlistId}
        onPlayTrack={onPlayTrack}
        onMoveToMusicOrPlay={(songId) => {
          onMoveToMusicOrPlay?.(songId)
        }}
        onPlayNext={(songId) => {
          onPlayNext?.(songId)
        }}
        onTogglePlayPause={() => {
          onTogglePlayPause?.()
        }}
        onAddSongToPlaylist={(playlistId, songId) => {
          onAddSongToPlaylist?.(playlistId, songId)
        }}
        onAddSongsToPlaylist={onAddSongsToPlaylist}
        onToggleFavorite={onToggleFavorite}
        onAlbumArtworkSaved={() => {}}
        onArtistClick={(artist) => {
          navigate(getArtistRoute(routeBase, artist))
        }}
        onAlbumClick={(album) => {
          navigate(getAlbumRoute(routeBase, album))
        }}
        canEditArtwork={dataSource.kind === 'local'}
        canSetPreferred={dataSource.kind === 'local'}
      />
    )
  }

  return (
    <AlbumsPage
      songs={songs}
      playlists={snapshot.playlists}
      favoritePlaylistId={snapshot.favorites.playlistId}
      t={t}
      loading={false}
      scanning={false}
      onPlayTrack={onPlayTrack}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onAddSongsToNowPlaying={onAddSongsToNowPlaying}
      onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
      onUpdateSettings={(update) => {
        void dataSource.updateSettings(update).then(async () => {
          await onUpdateSettings?.(update)
          setSnapshot(await getLibrarySnapshotFromDataSource(dataSource))
        })
      }}
      routeBase={routeBase}
    />
  )
}

function getArtistRoute(routeBase: string, artistName: string) {
  const encodedArtist = encodeURIComponent(artistName)
  return routeBase ? `${routeBase}/artists/${encodedArtist}` : `/artists?artist=${encodedArtist}`
}

function getAlbumRoute(routeBase: string, albumName: string) {
  const encodedAlbum = encodeURIComponent(albumName)
  return routeBase ? `${routeBase}/albums/${encodedAlbum}` : `/albums?album=${encodedAlbum}`
}

function distinctSongs(songs: LibrarySnapshot['songs']) {
  const songsById = new Map(songs.map((song) => [song.id, song]))
  return [...songsById.values()]
}
