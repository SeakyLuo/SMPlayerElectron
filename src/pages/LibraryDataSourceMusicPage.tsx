import { useEffect, useState } from 'react'

import { LoadingState } from '../components/LoadingState'
import { getMusicDataFromDataSource, type MusicDataSource } from '../data/musicDataSource'
import type { AppSettingsUpdate, MusicData } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { sortLibrarySongs } from '../shared/sorting'
import { MusicLibraryPage } from './MusicLibraryPage'

interface MusicDataSourceMusicPageProps {
  dataSource: MusicDataSource
  t: Translator
  loading: boolean
  scanning: boolean
  error: string | null
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddNextAndPlay: (trackId: number) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onUpdateSettings?: (update: AppSettingsUpdate) => void | Promise<void>
  readOnly?: boolean
  resolveArtwork?: boolean
  routeBase?: string
}

export function MusicDataSourceMusicPage({
  dataSource,
  t,
  loading,
  scanning,
  error,
  selectedTrackId,
  isPlaying,
  searchQuery,
  onPickLibraryRoot,
  onScanLibrary,
  onPlayTrack,
  onAddNextAndPlay,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onRevealSong,
  onDeleteSongFromDisk,
  onUpdateSettings,
  readOnly = false,
  resolveArtwork = true,
  routeBase = '',
}: MusicDataSourceMusicPageProps) {
  const [snapshot, setSnapshot] = useState<MusicData | null>(null)
  const [sourceLoading, setSourceLoading] = useState(true)
  const [sourceError, setSourceError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setSourceLoading(true)
    setSourceError(null)

    getMusicDataFromDataSource(dataSource)
      .then((nextData) => {
        if (!disposed) {
          setSnapshot(nextData)
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

  if (!snapshot) {
    return (
      <section className="page-panel library-page">
        {sourceError || error ? <div className="error-banner">{sourceError ?? error}</div> : <LoadingState t={t} />}
      </section>
    )
  }

  return (
    <MusicLibraryPage
      snapshot={snapshot}
      t={t}
      songs={sortLibrarySongs(snapshot.songs, snapshot.settings.musicLibrarySort)}
      loading={loading || sourceLoading}
      scanning={scanning}
      error={sourceError ?? error}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      searchQuery={searchQuery}
      onPickLibraryRoot={onPickLibraryRoot}
      onScanLibrary={onScanLibrary}
      onPlayTrack={onPlayTrack}
      onAddNextAndPlay={onAddNextAndPlay}
      onMoveToMusicOrPlay={onMoveToMusicOrPlay}
      onTogglePlayPause={onTogglePlayPause}
      onPlayNext={onPlayNext}
      onToggleFavorite={onToggleFavorite}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onAddSongsToNowPlaying={onAddSongsToNowPlaying}
      onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
      onRevealSong={onRevealSong}
      onDeleteSongFromDisk={onDeleteSongFromDisk}
      onUpdateSettings={(update) => {
        void dataSource.updateSettings(update).then(async () => {
          await onUpdateSettings?.(update)
          setSnapshot(await getMusicDataFromDataSource(dataSource))
        })
      }}
      readOnly={readOnly}
      resolveArtwork={resolveArtwork}
      routeBase={routeBase}
    />
  )
}
