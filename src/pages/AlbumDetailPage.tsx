import clsx from 'clsx'
import { Link } from 'react-router-dom'

import type { LibrarySong } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'

interface AlbumDetailPageProps {
  albumName: string
  songs: LibrarySong[]
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}

export function AlbumDetailPage({
  albumName,
  songs,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: AlbumDetailPageProps) {
  const queueSongIds = songs.map((song) => song.id)
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''
  const artists = [...new Set(songs.flatMap((song) => getSongArtists(song)))].sort(
    (left, right) => left.localeCompare(right),
  )
  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0)

  return (
    <section className="page-panel">
      <header className="detail-hero">
        <DetailArtwork title={albumName} artworkUrl={artworkUrl} />
        <div>
          <p className="eyebrow">Album Detail</p>
          <h2>{albumName}</h2>
          <p className="page-copy">
            This album route replaces the old placeholder card with a real track list sourced from
            the imported SQLite snapshot.
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
            Play Album
          </button>
        </div>
      </header>

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Tracks</span>
          <span className="summary-value">{songs.length}</span>
          <p>Tracks indexed in this album group.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Artists</span>
          <span className="summary-value">{artists.length}</span>
          <p>Artists contributing to this album name.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Runtime</span>
          <span className="summary-value detail-metric-value">{formatDuration(totalDuration)}</span>
          <p>Total album runtime based on imported metadata.</p>
        </div>
      </div>

      {artists.length > 0 ? (
        <section className="detail-panel">
          <div className="subpanel-header">
            <span className="summary-label">Artists</span>
            <strong>{artists.length}</strong>
          </div>
          <div className="detail-chip-grid">
            {artists.map((artist) => (
              <Link
                key={artist}
                className="detail-chip"
                to={`/artists/${encodeURIComponent(artist)}`}
              >
                {artist}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="table-shell">
        <table className="music-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Artist</th>
              <th>Duration</th>
              <th>Favorite</th>
              <th>Play Count</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song, index) => (
              <tr
                key={song.id}
                className={clsx({ 'is-current': song.id === selectedTrackId })}
                onClick={() => {
                  onPlayTrack(song.id, queueSongIds)
                }}
              >
                <td>{index + 1}</td>
                <td>{song.title}</td>
                <td>
                  {getSongArtists(song).map((artist, artistIndex) => (
                    <span key={artist}>
                      {artistIndex > 0 ? ', ' : null}
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
