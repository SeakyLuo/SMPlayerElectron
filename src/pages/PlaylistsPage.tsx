import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import type { LibrarySnapshot } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
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
  onCreatePlaylist: (name: string) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongsFromPlaylist: (playlistId: number, songIds: number[]) => void
  onReorderPlaylistSongs: (playlistId: number, songIds: number[]) => void
}

function matchesSearch(searchQuery: string, ...parts: Array<string | number>) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return parts.join(' ').toLocaleLowerCase().includes(normalizedSearchQuery)
}

function movePlaylist(playlistIds: number[], playlistId: number, offset: -1 | 1) {
  const currentIndex = playlistIds.findIndex((value) => value === playlistId)
  const nextIndex = currentIndex + offset

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= playlistIds.length) {
    return null
  }

  const nextPlaylistIds = playlistIds.slice()
  ;[nextPlaylistIds[currentIndex], nextPlaylistIds[nextIndex]] = [
    nextPlaylistIds[nextIndex],
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
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onReorderPlaylists,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
}: PlaylistsPageProps) {
  const navigate = useNavigate()
  const params = useParams()
  const routePlaylistId = params.playlistId ? Number(params.playlistId) : null
  const [draftName, setDraftName] = useState('')
  const [selectedAvailableSongIds, setSelectedAvailableSongIds] = useState<number[]>([])
  const selectedPlaylistId =
    routePlaylistId != null && snapshot.playlists.some((playlist) => playlist.id === routePlaylistId)
      ? routePlaylistId
      : (snapshot.playlists.some((playlist) => playlist.id === initialPlaylistId)
          ? initialPlaylistId
          : snapshot.playlists[0]?.id ?? null)

  const selectedPlaylist =
    snapshot.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const fullPlaylistSongs = useMemo(
    () =>
      (selectedPlaylist?.songIds ?? [])
        .map((songId) => songsById.get(songId) ?? null)
        .filter((song) => song != null),
    [selectedPlaylist?.songIds, songsById],
  )
  const playlistSongs = useMemo(
    () =>
      fullPlaylistSongs.filter((song) =>
        matchesSearch(
          searchQuery,
          song.title,
          song.artist,
          ...song.artists,
          song.album,
          selectedPlaylist?.name ?? '',
        ),
      ),
    [fullPlaylistSongs, searchQuery, selectedPlaylist?.name],
  )
  const playlistDuration = fullPlaylistSongs.reduce((total, song) => total + song.duration, 0)
  const selectedSongIds = useMemo(
    () => new Set(fullPlaylistSongs.map((song) => song.id)),
    [fullPlaylistSongs],
  )
  const availableSongs = useMemo(
    () =>
      snapshot.songs.filter(
        (song) =>
          !selectedSongIds.has(song.id) &&
          matchesSearch(searchQuery, song.title, song.artist, ...song.artists, song.album, song.path),
      ),
    [searchQuery, selectedSongIds, snapshot.songs],
  )
  const visibleAvailableSongIds = availableSongs.slice(0, 18).map((song) => song.id)
  const effectiveSelectedAvailableSongIds = selectedAvailableSongIds.filter((songId) =>
    availableSongs.some((song) => song.id === songId),
  )
  const customPlaylistIds = snapshot.playlists
    .filter((playlist) => !playlist.isBuiltIn)
    .map((playlist) => playlist.id)

  function toggleSongSelection(
    setter: Dispatch<SetStateAction<number[]>>,
    songId: number,
  ) {
    setter((current) =>
      current.includes(songId)
        ? current.filter((value) => value !== songId)
        : [...current, songId],
    )
  }

  return (
    <section className="page-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('playlists.eyebrow')}</p>
          <h2>{t('common.playlists')}</h2>
          <p className="page-copy">{t('playlists.description')}</p>
        </div>
        <form
          className="playlist-create-form"
          onSubmit={(event) => {
            event.preventDefault()
            const nextName = draftName.trim()

            if (!nextName) {
              return
            }

            onCreatePlaylist(nextName)
            setDraftName('')
          }}
        >
          <input
            type="text"
            value={draftName}
            placeholder={t('playlists.newName')}
            onChange={(event) => {
              setDraftName(event.currentTarget.value)
            }}
          />
          <button className="action-button" type="submit" disabled={!draftName.trim()}>
            {t('playlists.create')}
          </button>
        </form>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="playlist-layout">
        <aside className="playlist-sidebar-panel">
          <div className="playlist-panel-header">
            <span className="summary-label">{t('playlists.available')}</span>
            <strong>{snapshot.playlists.length}</strong>
          </div>
          {snapshot.playlists.length === 0 ? (
            <div className="empty-state compact">
              <h3>{t('playlists.none')}</h3>
              <p>{t('playlists.noneCopy')}</p>
            </div>
          ) : (
            <div className="playlist-list">
              {snapshot.playlists.map((playlist) => {
                const isActiveSelection = playlist.id === selectedPlaylistId
                const customPlaylistIndex = customPlaylistIds.indexOf(playlist.id)
                const canMovePlaylistUp = customPlaylistIndex > 0
                const canMovePlaylistDown =
                  customPlaylistIndex >= 0 && customPlaylistIndex < customPlaylistIds.length - 1

                return (
                  <div
                    key={playlist.id}
                    className={`playlist-list-item-shell${isActiveSelection ? ' selected' : ''}`}
                  >
                    <button
                      type="button"
                      className={`playlist-list-item${isActiveSelection ? ' selected' : ''}`}
                      onClick={() => {
                        navigate(`/playlists/${playlist.id}`)
                        onSelectPlaylist(playlist.id)
                      }}
                    >
                      <span>{playlist.name}</span>
                      <small>
                        {t('playlists.songCount', {
                          count: playlist.songCount,
                        })}
                        {playlist.isBuiltIn ? ` - ${t('playlists.builtIn')}` : ''}
                      </small>
                    </button>
                    {!playlist.isBuiltIn ? (
                      <div className="playlist-list-actions">
                        <button
                          type="button"
                          className="table-action-button subtle"
                          disabled={!canMovePlaylistUp}
                          onClick={() => {
                            const nextPlaylistIds = movePlaylist(customPlaylistIds, playlist.id, -1)
                            if (nextPlaylistIds) {
                              onReorderPlaylists(nextPlaylistIds)
                            }
                          }}
                        >
                          {t('playlists.up')}
                        </button>
                        <button
                          type="button"
                          className="table-action-button subtle"
                          disabled={!canMovePlaylistDown}
                          onClick={() => {
                            const nextPlaylistIds = movePlaylist(customPlaylistIds, playlist.id, 1)
                            if (nextPlaylistIds) {
                              onReorderPlaylists(nextPlaylistIds)
                            }
                          }}
                        >
                          {t('playlists.down')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        <div className="playlist-detail-panel playlist-detail-panel-headered">
          {!selectedPlaylist ? (
            <div className="empty-state">
              <h3>{t('playlists.selectPlaylist')}</h3>
              <p>{t('playlists.selectPlaylistCopy')}</p>
            </div>
          ) : (
            <>
              <HeaderedPlaylistControl
                type={selectedPlaylist.isBuiltIn ? 'favorites' : 'playlist'}
                title={selectedPlaylist.name}
                subtitle={t('albums.albumSummary', {
                  songs: fullPlaylistSongs.length,
                  duration: formatDuration(playlistDuration),
                })}
                caption={selectedPlaylist.isBuiltIn ? t('playlists.builtIn') : t('common.playlists')}
                t={t}
                songs={playlistSongs}
                selectedTrackId={selectedTrackId}
                isPlaying={isPlaying}
                playlists={snapshot.playlists}
                artworkUrl={fullPlaylistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? ''}
                removable={!selectedPlaylist.isBuiltIn}
                showAlbum
                showArtist
                canRename={!selectedPlaylist.isBuiltIn}
                canDelete={!selectedPlaylist.isBuiltIn}
                canClear={fullPlaylistSongs.length > 0}
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
                  onRemoveSongsFromPlaylist(selectedPlaylist.id, fullPlaylistSongs.map((song) => song.id))
                }}
                onSortSongs={(songIds) => {
                  onReorderPlaylistSongs(selectedPlaylist.id, songIds)
                }}
                onArtistClick={(artist) => {
                  navigate(`/artists/${encodeURIComponent(artist)}`)
                }}
                onAlbumClick={(album) => {
                  navigate(`/albums/${encodeURIComponent(album)}`)
                }}
              />

              {!selectedPlaylist.isBuiltIn ? (
                <div className="table-shell playlist-add-shell">
                  <div className="subpanel-header">
                    <div>
                      <span className="summary-label">{t('playlists.addFromLibrary')}</span>
                      <strong>
                        {availableSongs.length}
                        {searchQuery ? ` ${t('nowPlaying.filtered')}` : ''}
                      </strong>
                    </div>
                    <div className="table-toolbar">
                      <span className="banner-hint">
                        {t('playlists.selectedCount', {
                          count: effectiveSelectedAvailableSongIds.length,
                        })}
                      </span>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={visibleAvailableSongIds.length === 0}
                        onClick={() => {
                          setSelectedAvailableSongIds(visibleAvailableSongIds)
                        }}
                      >
                        {t('playlists.selectVisible')}
                      </button>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={effectiveSelectedAvailableSongIds.length === 0}
                        onClick={() => {
                          setSelectedAvailableSongIds([])
                        }}
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        type="button"
                        className="table-action-button"
                        disabled={effectiveSelectedAvailableSongIds.length === 0}
                        onClick={() => {
                          onAddSongsToPlaylist(
                            selectedPlaylist.id,
                            effectiveSelectedAvailableSongIds,
                          )
                          setSelectedAvailableSongIds([])
                        }}
                      >
                        {t('playlists.addSelected')}
                      </button>
                    </div>
                  </div>
                  {availableSongs.length === 0 ? (
                    <div className="empty-state compact">
                      <h3>{t('playlists.noSongsAvailable')}</h3>
                      <p>
                        {searchQuery
                          ? t('playlists.noAvailableMatch', {
                              query: searchQuery,
                            })
                          : t('playlists.allAlreadyAdded')}
                      </p>
                    </div>
                  ) : (
                    <table className="music-table">
                      <thead>
                        <tr>
                          <th>{t('playlists.select')}</th>
                          <th>{t('common.name')}</th>
                          <th>{t('common.artist')}</th>
                          <th>{t('common.album')}</th>
                          <th>{t('common.duration')}</th>
                          <th>{t('local.action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availableSongs.slice(0, 18).map((song) => (
                          <tr key={`library-${song.id}`}>
                            <td>
                              <input
                                type="checkbox"
                                checked={effectiveSelectedAvailableSongIds.includes(song.id)}
                                onChange={() => {
                                  toggleSongSelection(setSelectedAvailableSongIds, song.id)
                                }}
                              />
                            </td>
                            <td>{song.title}</td>
                            <td>{getDisplayArtists(song)}</td>
                            <td>{song.album || t('common.albumUnknown')}</td>
                            <td>{formatDuration(song.duration)}</td>
                            <td>
                              <button
                                type="button"
                                className="table-action-button"
                                onClick={() => {
                                  onAddSongToPlaylist(selectedPlaylist.id, song.id)
                                }}
                              >
                                {t('playlists.add')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
