import clsx from 'clsx'
import { Link } from 'react-router-dom'

import type { LibrarySnapshot, LibrarySong } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'

interface LibraryPageProps {
  snapshot: LibrarySnapshot
  songs: LibrarySong[]
  loading: boolean
  scanning: boolean
  error: string | null
  selectedTrackId: number | null
  searchQuery: string
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}

export function LibraryPage({
  snapshot,
  songs,
  loading,
  scanning,
  error,
  selectedTrackId,
  searchQuery,
  onPickLibraryRoot,
  onScanLibrary,
  onPlayTrack,
  onToggleFavorite,
}: LibraryPageProps) {
  const { counts, settings } = snapshot
  const hasSongs = songs.length > 0
  const hasLibrary = snapshot.songs.length > 0
  const queueSongIds = songs.map((song) => song.id)

  return (
    <section className="page-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">Core playback surface</p>
          <h2>Music Library</h2>
          <p className="page-copy">
            This page is now backed by Electron IPC and SQLite. Choose a folder,
            scan it, and the table below will render the actual music library rather
            than seeded mock data.
          </p>
        </div>
        <div className="page-actions">
          <button className="action-button secondary" type="button" onClick={onPickLibraryRoot}>
            Choose Folder
          </button>
          <button
            className="action-button"
            type="button"
            onClick={onScanLibrary}
            disabled={scanning || !settings.rootPath}
          >
            {scanning ? 'Scanning...' : 'Scan Library'}
          </button>
        </div>
      </header>

      <div className="root-banner">
        <span className="summary-label">Library Root</span>
        <strong>{settings.rootPath || 'No folder selected yet'}</strong>
        {loading ? <span className="banner-hint">Refreshing library...</span> : null}
        {searchQuery ? (
          <span className="banner-hint">
            {songs.length} result{songs.length === 1 ? '' : 's'} for "{searchQuery}"
          </span>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Songs</span>
          <span className="summary-value">{counts.songs}</span>
          <p>Discovered audio files imported into the local SQLite cache.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Artists</span>
          <span className="summary-value">{counts.artists}</span>
          <p>Unique artists detected from metadata, ready for drilldown pages.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Albums</span>
          <span className="summary-value">{counts.albums}</span>
          <p>Albums parsed from tags and stored with the same schema direction as the UWP app.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Folders</span>
          <span className="summary-value">{counts.folders}</span>
          <p>The folder tree is tracked separately so local browsing can migrate cleanly.</p>
        </div>
      </div>

      {!hasSongs ? (
        <div className="empty-state">
          <h3>{hasLibrary ? `No songs match "${searchQuery}"` : 'Scan a music folder to begin'}</h3>
          <p>
            {hasLibrary
              ? 'Try another search term. Song filtering now matches title, artist, album, and file path.'
              : 'The current Electron build can already persist a chosen library root, walk subfolders, parse track metadata, and write the result into `SMPlayerSettings.db`.'}
          </p>
        </div>
      ) : (
        <div className="table-shell">
          <table className="music-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Artist</th>
                <th>Album</th>
                <th>Duration</th>
                <th>Favorite</th>
                <th>Play Count</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => {
                const isCurrent = song.id === selectedTrackId

                return (
                  <tr
                    key={song.id}
                    className={clsx({ 'is-current': isCurrent })}
                    onClick={() => {
                      void onPlayTrack(song.id, queueSongIds)
                    }}
                  >
                    <td>
                      <div className="cell-title">
                        {isCurrent ? <span className="play-indicator">ON</span> : null}
                        <span className="song-name">{song.title}</span>
                      </div>
                    </td>
                    <td>
                      {getSongArtists(song).map((artist, index) => (
                        <span key={artist}>
                          {index > 0 ? ', ' : null}
                          <Link
                            className="table-link"
                            to={`/artists/${encodeURIComponent(artist)}`}
                            onClick={(event) => {
                              event.stopPropagation()
                            }}
                          >
                            {artist}
                          </Link>
                        </span>
                      ))}
                    </td>
                    <td>
                      <Link
                        className="table-link"
                        to={`/albums/${encodeURIComponent(song.album || 'Unknown album')}`}
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                      >
                        {song.album || 'Unknown album'}
                      </Link>
                    </td>
                    <td>{formatDuration(song.duration)}</td>
                    <td>
                      <button
                        type="button"
                        className={clsx('favorite-pill', { 'is-active': song.favorite })}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleFavorite(song.id, !song.favorite)
                        }}
                      >
                        {song.favorite ? 'YES' : 'ADD'}
                      </button>
                    </td>
                    <td>{song.playCount || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
