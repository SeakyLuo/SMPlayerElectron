import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import type { LibrarySong, LyricsRequestMode, LyricsSnapshot } from '../shared/contracts'
import { getDisplayArtists, getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'

interface NowPlayingPageProps {
  songs: LibrarySong[]
  currentTrack: LibrarySong | null
  autoLyrics: boolean
  selectedTrackId: number | null
  progressSeconds: number
  searchQuery: string
  error: string | null
  onPlayTrack: (trackId: number) => void
  onRemoveSong: (songId: number) => void
  onClearQueue: () => void
}

const emptyLyrics: LyricsSnapshot = {
  source: 'none',
  isSynced: false,
  rawText: '',
  lines: [],
}

function matchesSearch(song: LibrarySong, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return [song.title, song.artist, ...song.artists, song.album, song.path]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedSearchQuery)
}

function formatLyricsSource(source: LyricsSnapshot['source']) {
  switch (source) {
    case 'lrc-file':
      return 'Sidecar LRC'
    case 'text-file':
      return 'Sidecar Text'
    case 'music-file':
      return 'Embedded'
    case 'internet':
      return 'Internet'
    default:
      return 'Unavailable'
  }
}

function getActiveLyricsIndex(lyrics: LyricsSnapshot, progressSeconds: number) {
  if (!lyrics.isSynced) {
    return -1
  }

  const progressMs = Math.round(progressSeconds * 1000)
  let activeIndex = -1

  for (let index = 0; index < lyrics.lines.length; index += 1) {
    const line = lyrics.lines[index]
    if (line.timestampMs == null || line.timestampMs > progressMs) {
      break
    }

    activeIndex = index
  }

  return activeIndex
}

export function NowPlayingPage({
  songs,
  currentTrack,
  autoLyrics,
  selectedTrackId,
  progressSeconds,
  searchQuery,
  error,
  onPlayTrack,
  onRemoveSong,
  onClearQueue,
}: NowPlayingPageProps) {
  const [lyricsMode, setLyricsMode] = useState<LyricsRequestMode>('auto')
  const [lyrics, setLyrics] = useState<LyricsSnapshot>(emptyLyrics)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsError, setLyricsError] = useState<string | null>(null)
  const activeLyricsLineRef = useRef<HTMLParagraphElement | null>(null)
  const visibleSongs = songs.filter((song) => matchesSearch(song, searchQuery))
  const currentQueueIndex = currentTrack ? songs.findIndex((song) => song.id === currentTrack.id) : -1
  const remainingTracks = currentQueueIndex >= 0 ? Math.max(songs.length - currentQueueIndex - 1, 0) : songs.length
  const displayedLyrics = currentTrack ? lyrics : emptyLyrics
  const displayedLyricsError = currentTrack ? lyricsError : null
  const displayedLyricsLoading = currentTrack ? lyricsLoading : false
  const activeLyricsIndex = useMemo(
    () => getActiveLyricsIndex(displayedLyrics, progressSeconds),
    [displayedLyrics, progressSeconds],
  )

  useEffect(() => {
    setLyricsMode('auto')
  }, [currentTrack?.id])

  useEffect(() => {
    let disposed = false

    if (!currentTrack || !window.smplayer) {
      return () => {
        disposed = true
      }
    }

    const smplayer = window.smplayer

    void (async () => {
      setLyricsLoading(true)
      setLyricsError(null)

      try {
        const snapshot = await smplayer.getLyrics(currentTrack.id, lyricsMode)
        if (!disposed) {
          setLyrics(snapshot)
        }
      } catch (requestError: unknown) {
        if (!disposed) {
          setLyrics(emptyLyrics)
          setLyricsError(
            requestError instanceof Error ? requestError.message : 'Failed to load lyrics.',
          )
        }
      } finally {
        if (!disposed) {
          setLyricsLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [currentTrack, lyricsMode])

  useEffect(() => {
    if (activeLyricsIndex < 0 || !activeLyricsLineRef.current) {
      return
    }

    activeLyricsLineRef.current.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, [activeLyricsIndex])

  return (
    <section className="page-panel">
      <header className="now-playing-hero">
        {currentTrack?.artworkUrl ? (
          <img
            className="now-playing-artwork"
            src={currentTrack.artworkUrl}
            alt={`${currentTrack.title} artwork`}
          />
        ) : (
          <div className="now-playing-artwork now-playing-artwork-fallback" aria-hidden="true">
            <span>{(currentTrack?.title ?? 'NP').slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <div className="now-playing-hero-copy">
          <p className="eyebrow">Now Playing Full</p>
          <h2>{currentTrack?.title ?? 'Now Playing'}</h2>
          <p className="page-copy">
            {currentTrack
              ? 'Queue, artwork, and lyrics now live on one page instead of a bare list. Lyrics prefer sidecar `.lrc` files and then fall back to embedded tags.'
              : 'Start playback from the library or a playlist to populate the persisted queue, artwork, and lyrics panes.'}
          </p>
          {currentTrack ? (
            <div className="now-playing-meta-row">
              <Link
                className="detail-chip"
                to={`/artists/${encodeURIComponent(getSongArtists(currentTrack)[0])}`}
              >
                {getDisplayArtists(currentTrack)}
              </Link>
              <Link
                className="detail-chip"
                to={`/albums/${encodeURIComponent(currentTrack.album || 'Unknown album')}`}
              >
                {currentTrack.album || 'Unknown album'}
              </Link>
              <span className="detail-chip">{formatDuration(currentTrack.duration)}</span>
            </div>
          ) : null}
        </div>
        <div className="page-actions">
          <button
            className="action-button secondary danger"
            type="button"
            disabled={songs.length === 0}
            onClick={onClearQueue}
          >
            Clear Queue
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Queue</span>
          <span className="summary-value">{songs.length}</span>
          <p>Tracks persisted in the built-in now-playing playlist.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Current Slot</span>
          <span className="summary-value">{currentQueueIndex >= 0 ? currentQueueIndex + 1 : '-'}</span>
          <p>Playback follows the stored queue order rather than a library-wide sort.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Up Next</span>
          <span className="summary-value">{remainingTracks}</span>
          <p>Tracks still queued after the current selection.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Lyrics</span>
          <span className="summary-value settings-mode-value">
            {formatLyricsSource(displayedLyrics.source)}
          </span>
          <p>Source priority: sidecar `.lrc`, sidecar `.txt`, then embedded music tags.</p>
        </div>
      </div>

      <div className="now-playing-layout">
        <section className="detail-panel now-playing-lyrics-panel">
          <div className="subpanel-header">
            <div>
              <span className="summary-label">Lyrics</span>
              <strong>
                {displayedLyricsLoading ? 'Loading...' : formatLyricsSource(displayedLyrics.source)}
              </strong>
            </div>
            <div className="table-toolbar">
              <button
                type="button"
                className={`table-action-button subtle${lyricsMode === 'auto' ? ' is-selected' : ''}`}
                onClick={() => {
                  setLyricsMode('auto')
                }}
              >
                Auto
              </button>
              <button
                type="button"
                className={`table-action-button subtle${lyricsMode === 'local' ? ' is-selected' : ''}`}
                onClick={() => {
                  setLyricsMode('local')
                }}
              >
                Local
              </button>
              <button
                type="button"
                className={`table-action-button subtle${lyricsMode === 'internet' ? ' is-selected' : ''}`}
                onClick={() => {
                  setLyricsMode('internet')
                }}
              >
                Internet
              </button>
            </div>
          </div>

          <div className="root-banner">
            <span className="summary-label">Mode</span>
            <strong>
              {lyricsMode === 'auto'
                ? autoLyrics
                  ? 'Auto: local then internet then embedded'
                  : 'Auto: local then embedded'
                : lyricsMode === 'local'
                  ? 'Local-only lyrics'
                  : 'Internet-only lyrics'}
            </strong>
            {displayedLyrics.isSynced ? (
              <span className="banner-hint">Synced to playback position</span>
            ) : null}
          </div>

          {displayedLyricsError ? <div className="error-banner">{displayedLyricsError}</div> : null}

          {!currentTrack ? (
            <div className="empty-state compact">
              <h3>No active track</h3>
              <p>Play a song to load its local or embedded lyrics.</p>
            </div>
          ) : displayedLyricsLoading ? (
            <div className="empty-state compact">
              <h3>Loading lyrics</h3>
              <p>Reading sidecar files and embedded tags for the current song.</p>
            </div>
          ) : displayedLyrics.lines.length === 0 ? (
            <div className="empty-state compact">
              <h3>No lyrics found</h3>
              <p>
                No sidecar `.lrc` or `.txt` file was found next to this song, and no embedded
                lyrics were detected in the media tags.
              </p>
            </div>
          ) : (
            <div className="lyrics-scroll-shell">
              {displayedLyrics.lines.map((line, index) => (
                <p
                  key={line.id}
                  ref={index === activeLyricsIndex ? activeLyricsLineRef : null}
                  className={clsx('lyrics-line', {
                    'is-active': index === activeLyricsIndex,
                    'is-past': activeLyricsIndex > index,
                  })}
                >
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="table-shell now-playing-queue-shell">
          <div className="subpanel-header">
            <div>
              <span className="summary-label">Queue</span>
              <strong>
                {visibleSongs.length}
                {searchQuery ? ' filtered' : ''}
              </strong>
            </div>
            {searchQuery ? (
              <span className="banner-hint">
                {visibleSongs.length} result{visibleSongs.length === 1 ? '' : 's'} for "{searchQuery}"
              </span>
            ) : null}
          </div>

          {visibleSongs.length === 0 ? (
            <div className="empty-state compact">
              <h3>{songs.length > 0 ? `No queue items match "${searchQuery}"` : 'Queue is empty'}</h3>
              <p>
                {songs.length > 0
                  ? 'Try a broader keyword. Search matches title, artist, album, and file path.'
                  : 'Start playback from the library or a playlist to persist a real now-playing queue.'}
              </p>
            </div>
          ) : (
            <table className="music-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleSongs.map((song) => {
                  const queueIndex = songs.findIndex((queueSong) => queueSong.id === song.id)

                  return (
                    <tr
                      key={`queue-${queueIndex}-${song.id}`}
                      className={clsx({ 'is-current': song.id === selectedTrackId })}
                      onClick={() => {
                        onPlayTrack(song.id)
                      }}
                    >
                      <td>{queueIndex + 1}</td>
                      <td>{song.title}</td>
                      <td>{getDisplayArtists(song)}</td>
                      <td>{song.album || 'Unknown album'}</td>
                      <td>{formatDuration(song.duration)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemoveSong(song.id)
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  )
}
