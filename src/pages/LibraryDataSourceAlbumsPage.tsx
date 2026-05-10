import { useEffect, useState } from 'react'

import { LoadingState } from '../components/LoadingState'
import { getLibrarySnapshotFromDataSource, type LibraryDataSource } from '../data/libraryDataSource'
import type { AppSettingsUpdate, LibrarySnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { AlbumsPage } from './AlbumsPage'

interface LibraryDataSourceAlbumsPageProps {
  dataSource: LibraryDataSource
  t: Translator
  error: string | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onUpdateSettings?: (update: AppSettingsUpdate) => void | Promise<void>
}

export function LibraryDataSourceAlbumsPage({
  dataSource,
  t,
  error,
  onPlayTrack,
  onAddSongsToPlaylist,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onUpdateSettings,
}: LibraryDataSourceAlbumsPageProps) {
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
    />
  )
}

function distinctSongs(songs: LibrarySnapshot['songs']) {
  const songsById = new Map(songs.map((song) => [song.id, song]))
  return [...songsById.values()]
}
