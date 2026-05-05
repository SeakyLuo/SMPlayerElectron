import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { LibrarySnapshot, LibrarySong } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'

interface PlaylistsPageProps {
  snapshot: LibrarySnapshot
  selectedTrackId: number | null
  searchQuery: string
  error: string | null
  initialPlaylistId: number
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onSelectPlaylist: (playlistId: number) => void
  onCreatePlaylist: (name: string) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongFromPlaylist: (playlistId: number, songId: number) => void
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

function moveSong(songIds: number[], songId: number, offset: -1 | 1) {
  const currentIndex = songIds.findIndex((value) => value === songId)
  const nextIndex = currentIndex + offset

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= songIds.length) {
    return null
  }

  const nextSongIds = songIds.slice()
  ;[nextSongIds[currentIndex], nextSongIds[nextIndex]] = [
    nextSongIds[nextIndex],
    nextSongIds[currentIndex],
  ]

  return nextSongIds
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
  selectedTrackId,
  searchQuery,
  error,
  initialPlaylistId,
  onPlayTrack,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onReorderPlaylists,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongFromPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
}: PlaylistsPageProps) {
  const [draftName, setDraftName] = useState('')
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null)
  const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [selectedPlaylistSongIds, setSelectedPlaylistSongIds] = useState<number[]>([])
  const [selectedAvailableSongIds, setSelectedAvailableSongIds] = useState<number[]>([])
  const effectiveSelectedPlaylistId =
    selectedPlaylistId != null &&
    snapshot.playlists.some((playlist) => playlist.id === selectedPlaylistId)
      ? selectedPlaylistId
      : (snapshot.playlists.some((playlist) => playlist.id === initialPlaylistId)
          ? initialPlaylistId
          : snapshot.playlists[0]?.id ?? null)

  const selectedPlaylist =
    snapshot.playlists.find((playlist) => playlist.id === effectiveSelectedPlaylistId) ?? null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const fullPlaylistSongs = useMemo(
    () =>
      (selectedPlaylist?.songIds ?? [])
        .map((songId) => songsById.get(songId) ?? null)
        .filter((song): song is LibrarySong => song != null),
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
  const playlistQueueSongIds = fullPlaylistSongs.map((song) => song.id)
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
  const isEditingSelectedPlaylist =
    selectedPlaylist != null && editingPlaylistId === selectedPlaylist.id
  const visiblePlaylistSongIds = playlistSongs.map((song) => song.id)
  const visibleAvailableSongIds = availableSongs.slice(0, 18).map((song) => song.id)
  const effectiveSelectedPlaylistSongIds = selectedPlaylistSongIds.filter((songId) =>
    playlistQueueSongIds.includes(songId),
  )
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
          <p className="eyebrow">Custom and built-in playlists</p>
          <h2>Playlists</h2>
          <p className="page-copy">
            This view now reads playlist membership from SQLite. Custom playlists can be
            renamed here, and their song order is persisted directly in the playlist items.
          </p>
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
            placeholder="New playlist name"
            onChange={(event) => {
              setDraftName(event.currentTarget.value)
            }}
          />
          <button className="action-button" type="submit" disabled={!draftName.trim()}>
            Create
          </button>
        </form>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="playlist-layout">
        <aside className="playlist-sidebar-panel">
          <div className="playlist-panel-header">
            <span className="summary-label">Available Playlists</span>
            <strong>{snapshot.playlists.length}</strong>
          </div>
          {snapshot.playlists.length === 0 ? (
            <div className="empty-state compact">
              <h3>No playlists yet</h3>
              <p>Create a custom playlist or mark songs as favorites to populate this list.</p>
            </div>
          ) : (
            <div className="playlist-list">
              {snapshot.playlists.map((playlist) => {
                const isActiveSelection = playlist.id === effectiveSelectedPlaylistId
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
                        setSelectedPlaylistId(playlist.id)
                        onSelectPlaylist(playlist.id)
                      }}
                    >
                      <span>{playlist.name}</span>
                      <small>
                        {playlist.songCount} song{playlist.songCount === 1 ? '' : 's'}
                        {playlist.isBuiltIn ? ' - built-in' : ''}
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
                          Up
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
                          Down
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        <div className="playlist-detail-panel">
          {!selectedPlaylist ? (
            <div className="empty-state">
              <h3>Select a playlist</h3>
              <p>Choose a playlist from the left to inspect its songs and manage membership.</p>
            </div>
          ) : (
            <>
              <div className="playlist-detail-header">
                <div>
                  <span className="summary-label">Selected Playlist</span>
                  {isEditingSelectedPlaylist ? (
                    <form
                      className="playlist-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const nextName = renameDraft.trim()

                        if (!nextName) {
                          return
                        }

                        onRenamePlaylist(selectedPlaylist.id, nextName)
                        setEditingPlaylistId(null)
                      }}
                    >
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(event) => {
                          setRenameDraft(event.currentTarget.value)
                        }}
                      />
                      <button className="table-action-button" type="submit">
                        Save
                      </button>
                      <button
                        className="table-action-button subtle"
                        type="button"
                        onClick={() => {
                          setEditingPlaylistId(null)
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <h3>{selectedPlaylist.name}</h3>
                  )}
                  <p>
                    {selectedPlaylist.songCount} song
                    {selectedPlaylist.songCount === 1 ? '' : 's'} stored in this playlist.
                  </p>
                </div>
                <div className="playlist-detail-actions">
                  {!selectedPlaylist.isBuiltIn ? (
                    <>
                      <button
                        className="action-button secondary"
                        type="button"
                        onClick={() => {
                          setEditingPlaylistId(selectedPlaylist.id)
                          setRenameDraft(selectedPlaylist.name)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="action-button secondary danger"
                        type="button"
                        onClick={() => {
                          onDeletePlaylist(selectedPlaylist.id)
                        }}
                      >
                        Delete Playlist
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {fullPlaylistSongs.length > 1 ? (
                <div className="root-banner">
                  <span className="summary-label">Ordering</span>
                  <strong>Playlist order is persisted</strong>
                  <span className="banner-hint">
                    Use the up and down controls to reorder songs inside this playlist.
                  </span>
                </div>
              ) : null}

              <div className="playlist-content-grid">
                <div className="table-shell">
                  <div className="subpanel-header">
                    <div>
                      <span className="summary-label">Playlist Songs</span>
                      <strong>
                        {playlistSongs.length}
                        {searchQuery ? ' filtered' : ''}
                      </strong>
                    </div>
                    <div className="table-toolbar">
                      <span className="banner-hint">
                        {effectiveSelectedPlaylistSongIds.length} selected
                      </span>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={visiblePlaylistSongIds.length === 0}
                        onClick={() => {
                          setSelectedPlaylistSongIds(visiblePlaylistSongIds)
                        }}
                      >
                        Select Visible
                      </button>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={effectiveSelectedPlaylistSongIds.length === 0}
                        onClick={() => {
                          setSelectedPlaylistSongIds([])
                        }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="table-action-button"
                        disabled={effectiveSelectedPlaylistSongIds.length === 0}
                        onClick={() => {
                          onRemoveSongsFromPlaylist(
                            selectedPlaylist.id,
                            effectiveSelectedPlaylistSongIds,
                          )
                          setSelectedPlaylistSongIds([])
                        }}
                      >
                        Remove Selected
                      </button>
                    </div>
                  </div>
                  {playlistSongs.length === 0 ? (
                    <div className="empty-state compact">
                      <h3>No songs in view</h3>
                      <p>
                        {selectedPlaylist.songCount > 0 && searchQuery
                          ? `No playlist songs match "${searchQuery}".`
                          : 'Add songs from the library panel to start building this playlist.'}
                      </p>
                    </div>
                  ) : (
                    <table className="music-table">
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>#</th>
                          <th>Name</th>
                          <th>Artist</th>
                          <th>Album</th>
                          <th>Duration</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playlistSongs.map((song) => {
                          const fullIndex = playlistQueueSongIds.findIndex((id) => id === song.id)
                          const canMoveUp = fullIndex > 0
                          const canMoveDown = fullIndex >= 0 && fullIndex < playlistQueueSongIds.length - 1

                          return (
                            <tr
                              key={`${selectedPlaylist.id}-${song.id}`}
                              className={song.id === selectedTrackId ? 'is-current' : ''}
                              onClick={() => {
                                onPlayTrack(song.id, playlistQueueSongIds)
                              }}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={effectiveSelectedPlaylistSongIds.includes(song.id)}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                  }}
                                  onChange={() => {
                                    toggleSongSelection(setSelectedPlaylistSongIds, song.id)
                                  }}
                                />
                              </td>
                              <td>{fullIndex + 1}</td>
                              <td>{song.title}</td>
                              <td>{getDisplayArtists(song)}</td>
                              <td>{song.album || 'Unknown album'}</td>
                              <td>{formatDuration(song.duration)}</td>
                              <td>
                                <div className="table-action-group">
                                  <button
                                    type="button"
                                    className="table-action-button subtle"
                                    disabled={!canMoveUp}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      const nextSongIds = moveSong(playlistQueueSongIds, song.id, -1)
                                      if (nextSongIds) {
                                        onReorderPlaylistSongs(selectedPlaylist.id, nextSongIds)
                                      }
                                    }}
                                  >
                                    Up
                                  </button>
                                  <button
                                    type="button"
                                    className="table-action-button subtle"
                                    disabled={!canMoveDown}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      const nextSongIds = moveSong(playlistQueueSongIds, song.id, 1)
                                      if (nextSongIds) {
                                        onReorderPlaylistSongs(selectedPlaylist.id, nextSongIds)
                                      }
                                    }}
                                  >
                                    Down
                                  </button>
                                  <button
                                    type="button"
                                    className="table-action-button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      onRemoveSongFromPlaylist(selectedPlaylist.id, song.id)
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="table-shell">
                  <div className="subpanel-header">
                    <div>
                      <span className="summary-label">Add From Library</span>
                      <strong>
                        {availableSongs.length}
                        {searchQuery ? ' filtered' : ''}
                      </strong>
                    </div>
                    <div className="table-toolbar">
                      <span className="banner-hint">
                        {effectiveSelectedAvailableSongIds.length} selected
                      </span>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={visibleAvailableSongIds.length === 0}
                        onClick={() => {
                          setSelectedAvailableSongIds(visibleAvailableSongIds)
                        }}
                      >
                        Select Visible
                      </button>
                      <button
                        type="button"
                        className="table-action-button subtle"
                        disabled={effectiveSelectedAvailableSongIds.length === 0}
                        onClick={() => {
                          setSelectedAvailableSongIds([])
                        }}
                      >
                        Clear
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
                        Add Selected
                      </button>
                    </div>
                  </div>
                  {availableSongs.length === 0 ? (
                    <div className="empty-state compact">
                      <h3>No songs available</h3>
                      <p>
                        {searchQuery
                          ? `No library songs match "${searchQuery}" outside this playlist.`
                          : 'All imported songs are already present in this playlist.'}
                      </p>
                    </div>
                  ) : (
                    <table className="music-table">
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>Name</th>
                          <th>Artist</th>
                          <th>Album</th>
                          <th>Duration</th>
                          <th>Action</th>
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
                            <td>{song.album || 'Unknown album'}</td>
                            <td>{formatDuration(song.duration)}</td>
                            <td>
                              <button
                                type="button"
                                className="table-action-button"
                                onClick={() => {
                                  onAddSongToPlaylist(selectedPlaylist.id, song.id)
                                }}
                              >
                                Add
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
