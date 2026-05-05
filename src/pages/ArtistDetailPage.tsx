import clsx from 'clsx'
import { Link } from 'react-router-dom'

import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'

interface ArtistDetailPageProps {
  artistName: string
  songs: LibrarySong[]
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}

export function ArtistDetailPage({
  artistName,
  songs,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: ArtistDetailPageProps) {
  const queueSongIds = songs.map((song) => song.id)
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''
  const albums = [...new Set(songs.map((song) => song.album || 'Unknown album'))].sort((left, right) =>
    left.localeCompare(right),
  )
  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0)

  return (
    <section className="page-panel">
      <header className="detail-hero">
        <DetailArtwork title={artistName} artworkUrl={artworkUrl} />
        <div>
          <p className="eyebrow">Artist Detail</p>
          <h2>{artistName}</h2>
          <p className="page-copy">
            This artist view now comes from the scanned library instead of a static summary card.
            It groups the artist catalog into albums and gives you direct playback entry points.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="action-button"
            type="button"
            disabled={songs.length === 0}
            onClick={() => {
              if (songs[0]) {
                onPlayTrack(songs[0].id, queueSongIds)
              }
            }}
          >
            Play Artist
          </button>
        </div>
      </header>

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Songs</span>
          <span className="summary-value">{songs.length}</span>
          <p>Tracks currently indexed for this artist.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Albums</span>
          <span className="summary-value">{albums.length}</span>
          <p>Distinct album groups found in the local library.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Runtime</span>
          <span className="summary-value detail-metric-value">{formatDuration(totalDuration)}</span>
          <p>Total playable duration for this artist selection.</p>
        </div>
      </div>

      {albums.length > 0 ? (
        <section className="detail-panel">
          <div className="subpanel-header">
            <span className="summary-label">Albums</span>
            <strong>{albums.length}</strong>
          </div>
          <div className="detail-chip-grid">
            {albums.map((album) => (
              <Link
                key={album}
                className="detail-chip"
                to={`/albums/${encodeURIComponent(album)}`}
              >
                {album}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="table-shell">
        <table className="music-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Album</th>
              <th>Duration</th>
              <th>Favorite</th>
              <th>Play Count</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr
                key={song.id}
                className={clsx({ 'is-current': song.id === selectedTrackId })}
                onClick={() => {
                  onPlayTrack(song.id, queueSongIds)
                }}
              >
                <td>{song.title}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DetailArtwork({
  title,
  artworkUrl,
}: {
  title: string
  artworkUrl: string
}) {
  return artworkUrl ? (
    <img className="detail-artwork" src={artworkUrl} alt={`${title} artwork`} />
  ) : (
    <div className="detail-artwork detail-artwork-fallback" aria-hidden="true">
      <span>{title.slice(0, 2).toUpperCase()}</span>
    </div>
  )
}
