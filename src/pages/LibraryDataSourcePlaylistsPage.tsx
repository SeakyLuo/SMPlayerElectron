import { useEffect, useState } from 'react'

import { LoadingState } from '../components/LoadingState'
import { getMusicDataFromDataSource, type MusicDataSource } from '../data/musicDataSource'
import type { MusicData, PlaylistSortCriterion, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { PlaylistsPage } from './PlaylistsPage'

interface MusicDataSourcePlaylistsPageProps {
  dataSource: MusicDataSource
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onSelectPlaylist: (playlistId: number) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onSetPlaylistPreferred: (playlistId: number, name: string, level: PreferenceLevel) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongsFromPlaylist: (playlistId: number, songIds: number[]) => void
  onReorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => void
  routeBase?: string
  routePlaylistId?: number | null
}

export function MusicDataSourcePlaylistsPage({
  dataSource,
  t,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onSelectPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onReorderPlaylists,
  onSetPlaylistPreferred,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onToggleFavorite,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
  routeBase = '',
  routePlaylistId = null,
}: MusicDataSourcePlaylistsPageProps) {
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

  if (sourceLoading || !snapshot) {
    return (
      <section className="page-panel playlists-page">
        {sourceError || error ? <div className="error-banner">{sourceError ?? error}</div> : <LoadingState t={t} />}
      </section>
    )
  }

  return (
    <PlaylistsPage
      snapshot={snapshot}
      t={t}
      loading={false}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      searchQuery={searchQuery}
      error={sourceError ?? error}
      onPlayTrack={onPlayTrack}
      onMoveToMusicOrPlay={onMoveToMusicOrPlay}
      onPlayNext={onPlayNext}
      onTogglePlayPause={onTogglePlayPause}
      onSelectPlaylist={onSelectPlaylist}
      onDeletePlaylist={onDeletePlaylist}
      onRenamePlaylist={onRenamePlaylist}
      onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
      onAddSongsToNowPlaying={onAddSongsToNowPlaying}
      onReorderPlaylists={onReorderPlaylists}
      onSetPlaylistPreferred={onSetPlaylistPreferred}
      onRecordPlaylistPlayed={() => {}}
      onAddSongToPlaylist={onAddSongToPlaylist}
      onAddSongsToPlaylist={onAddSongsToPlaylist}
      onToggleFavorite={onToggleFavorite}
      onRemoveSongsFromPlaylist={onRemoveSongsFromPlaylist}
      onReorderPlaylistSongs={onReorderPlaylistSongs}
      routeBase={routeBase}
      routePlaylistId={routePlaylistId}
    />
  )
}
