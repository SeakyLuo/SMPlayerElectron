import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { GridViewHolder } from '../components/GridViewHolder'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import type { LibrarySnapshot, PlaylistSortCriterion, PreferenceLevel } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

interface PlaylistsPageProps {
  snapshot: LibrarySnapshot
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  initialPlaylistId: number
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onSelectPlaylist: (playlistId: number) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onSetPlaylistPreferred: (playlistId: number, name: string, level: PreferenceLevel) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongsFromPlaylist: (playlistId: number, songIds: number[]) => void
  onReorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => void
}

function movePlaylist(playlistIds: number[], playlistId: number, offset: -1 | 1) {
  const currentIndex = playlistIds.findIndex((value) => value === playlistId)
  const nextPlaylistIds = playlistIds.slice()
  ;[nextPlaylistIds[currentIndex], nextPlaylistIds[currentIndex + offset]] = [
    nextPlaylistIds[currentIndex + offset],
    nextPlaylistIds[currentIndex],
  ]

  return nextPlaylistIds
}

export function PlaylistsPage({
  snapshot,
  t,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  initialPlaylistId,
  onPlayTrack,
  onTogglePlayPause,
  onSelectPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onReorderPlaylists,
  onSetPlaylistPreferred,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
}: PlaylistsPageProps) {
  const navigate = useNavigate()
  const params = useParams()
  const routePlaylistId = params.playlistId ? Number(params.playlistId) : null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const visiblePlaylists = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return snapshot.playlists
    }

    return snapshot.playlists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedSearchQuery))
  }, [searchQuery, snapshot.playlists])
  const selectedPlaylistId =
    routePlaylistId != null && snapshot.playlists.some((playlist) => playlist.id === routePlaylistId)
      ? routePlaylistId
      : snapshot.playlists.some((playlist) => playlist.id === initialPlaylistId)
        ? initialPlaylistId
        : (snapshot.playlists[0]?.id ?? 0)
  const selectedPlaylist = snapshot.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const customPlaylistIds = snapshot.playlists
    .filter((playlist) => !playlist.isBuiltIn)
    .map((playlist) => playlist.id)
  const selectedPlaylistSongs = useMemo(
    () =>
      (selectedPlaylist?.songIds ?? [])
        .map((songId) => songsById.get(songId))
        .filter((song) => song !== undefined),
    [selectedPlaylist?.songIds, songsById],
  )
  const filteredPlaylistSongs = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return selectedPlaylistSongs
    }

    return selectedPlaylistSongs.filter((song) =>
      [song.title, song.artist, ...song.artists, song.album].join(' ').toLocaleLowerCase().includes(normalizedSearchQuery),
    )
  }, [searchQuery, selectedPlaylistSongs])
  const playlistDuration = selectedPlaylistSongs.reduce((total, song) => total + song.duration, 0)

  if (routePlaylistId != null && selectedPlaylist) {
    return (
      <section className="playlists-page page-panel">
        {error ? <div className="error-banner">{error}</div> : null}
        <HeaderedPlaylistControl
          type={selectedPlaylist.isBuiltIn ? 'favorites' : 'playlist'}
          title={selectedPlaylist.name}
          subtitle={t('albums.albumSummary', {
            songs: selectedPlaylistSongs.length,
            duration: formatDuration(playlistDuration),
          })}
          caption={selectedPlaylist.isBuiltIn ? t('playlists.builtIn') : t('common.playlists')}
          t={t}
          songs={filteredPlaylistSongs}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          playlists={snapshot.playlists}
          artworkUrl={selectedPlaylistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? ''}
          removable
          showAlbum
          showArtist
          canRename={!selectedPlaylist.isBuiltIn}
          canDelete={!selectedPlaylist.isBuiltIn}
          canClear={selectedPlaylistSongs.length > 0}
          canSetPreferred
          sortCriterion={selectedPlaylist.sortCriterion}
          preferenceType={selectedPlaylist.isBuiltIn ? 'my-favorites' : 'playlist'}
          preferenceItemId={selectedPlaylist.isBuiltIn ? '6' : String(selectedPlaylist.id)}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onRemoveSongs={(songIds) => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, songIds)
          }}
          onRename={(name) => {
            onRenamePlaylist(selectedPlaylist.id, name)
          }}
          onDelete={() => {
            onDeletePlaylist(selectedPlaylist.id)
            navigate('/playlists')
          }}
          onClear={() => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, selectedPlaylistSongs.map((song) => song.id))
          }}
          onSetPreferred={(level) => {
            onSetPlaylistPreferred(selectedPlaylist.id, selectedPlaylist.name, level)
          }}
          onSortSongs={(songIds, sortCriterion) => {
            onReorderPlaylistSongs(selectedPlaylist.id, songIds, sortCriterion)
          }}
          onArtistClick={(artist) => {
            navigate(`/artists/${encodeURIComponent(artist)}`)
          }}
          onAlbumClick={(album) => {
            navigate(`/albums/${encodeURIComponent(album)}`)
          }}
        />
      </section>
    )
  }

  return (
    <section className="playlists-page page-panel">
      <header className="playlists-header">
        <h2>{t('common.playlists')}</h2>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {visiblePlaylists.length === 0 ? (
        <div className="empty-state compact">
          <h3>{t('playlists.none')}</h3>
          <p>{t('playlists.noneCopy')}</p>
        </div>
      ) : (
        <div className="grid-view-holder-grid">
          {visiblePlaylists.map((playlist) => {
            const playlistSongs = playlist.songIds
              .map((songId) => songsById.get(songId))
              .filter((song) => song !== undefined)
            const customPlaylistIndex = customPlaylistIds.indexOf(playlist.id)
            const canMovePlaylistUp = customPlaylistIndex > 0
            const canMovePlaylistDown =
              customPlaylistIndex >= 0 && customPlaylistIndex < customPlaylistIds.length - 1

            return (
              <GridViewHolder
                key={playlist.id}
                playlist={playlist}
                songs={playlistSongs}
                selected={playlist.id === selectedPlaylistId}
                t={t}
                canMoveUp={canMovePlaylistUp}
                canMoveDown={canMovePlaylistDown}
                onOpen={() => {
                  navigate(`/playlists/${playlist.id}`)
                  onSelectPlaylist(playlist.id)
                }}
                onPlay={() => {
                  const [firstSong] = playlistSongs
                  if (firstSong) {
                    onPlayTrack(firstSong.id, playlistSongs.map((song) => song.id))
                  }
                }}
                onMoveUp={() => {
                  onReorderPlaylists(movePlaylist(customPlaylistIds, playlist.id, -1))
                }}
                onMoveDown={() => {
                  onReorderPlaylists(movePlaylist(customPlaylistIds, playlist.id, 1))
                }}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
