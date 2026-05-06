import clsx from 'clsx'
import { Link } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import type { LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

interface ArtistDetailPageProps {
  artistName: string
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}

export function ArtistDetailPage({
  artistName,
  t,
  songs,
  selectedTrackId,
  onPlayTrack,
  onToggleFavorite,
}: ArtistDetailPageProps) {
  const queueSongIds = songs.map((song) => song.id)
  const artworkUrl = songs.find((song) => song.artworkUrl)?.artworkUrl ?? ''
  const albums = [...new Set(songs.map((song) => song.album || t('common.albumUnknown')))].sort((left, right) =>
    left.localeCompare(right),
  )
  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0)

  return (
    <section className="page-panel">
      <header className="detail-hero">
        <DetailArtwork title={artistName} artworkUrl={artworkUrl} />
        <div>
          <p className="eyebrow">{t('detail.artistEyebrow')}</p>
          <h2>{artistName}</h2>
          <p className="page-copy">
            {t(
              'detail.artistDescription',
            )}
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
            {t('detail.playArtist')}
          </button>
        </div>
      </header>

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">{t('common.songs')}</span>
          <span className="summary-value">{songs.length}</span>
          <p>{t('detail.artistSongsCopy')}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t('common.albums')}</span>
          <span className="summary-value">{albums.length}</span>
          <p>{t('detail.artistAlbumsCopy')}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t('detail.runtime')}</span>
          <span className="summary-value detail-metric-value">{formatDuration(totalDuration)}</span>
          <p>{t('detail.artistRuntimeCopy')}</p>
        </div>
      </div>

      {albums.length > 0 ? (
        <section className="detail-panel">
          <div className="subpanel-header">
            <span className="summary-label">{t('common.albums')}</span>
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
              <th>{t('common.name')}</th>
              <th>{t('common.album')}</th>
              <th>{t('common.duration')}</th>
              <th>{t('common.favorite')}</th>
              <th>{t('common.playCount')}</th>
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
                    {song.album || t('common.albumUnknown')}
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
                    {song.favorite ? t('common.yes') : t('common.add')}
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
  return (
    <ArtworkImage
      className="detail-artwork"
      src={artworkUrl}
      title={title}
      renderFallback={() => (
        <div className="detail-artwork detail-artwork-fallback" aria-hidden="true">
          <span>{title.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
    />
  )
}
