import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { LibrarySong } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import { buildLocalRoute } from './localBrowserPaths'

interface LocalBrowserPageProps {
  songs: LibrarySong[]
  rootPath: string
  currentRelativePath: string
  searchQuery: string
  selectedTrackId: number | null
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onRevealSong: (songPath: string) => void
}

interface FolderNode {
  relativePath: string
  name: string
  artworkUrl: string
  childPaths: string[]
  directSongIds: number[]
  subtreeSongIds: number[]
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function getSongFolderRelativePath(songPath: string, rootPath: string) {
  const normalizedSongPath = normalizePath(songPath)
  const normalizedRootPath = normalizePath(rootPath)
  const relativePath = normalizedSongPath.startsWith(`${normalizedRootPath}/`)
    ? normalizedSongPath.slice(normalizedRootPath.length + 1)
    : normalizedSongPath
  const segments = relativePath.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return ''
  }

  return segments.slice(0, -1).join('/')
}

function getFolderDisplayName(relativePath: string, rootPath: string) {
  if (!relativePath) {
    const normalizedRootPath = normalizePath(rootPath)
    return normalizedRootPath.split('/').filter(Boolean).at(-1) ?? 'Library root'
  }

  return relativePath.split('/').at(-1) ?? relativePath
}

function createFolderNode(relativePath: string, rootPath: string): FolderNode {
  return {
    relativePath,
    name: getFolderDisplayName(relativePath, rootPath),
    artworkUrl: '',
    childPaths: [],
    directSongIds: [],
    subtreeSongIds: [],
  }
}

function buildFolderIndex(songs: LibrarySong[], rootPath: string) {
  const nodes = new Map<string, FolderNode>()
  const songsById = new Map(songs.map((song) => [song.id, song]))

  nodes.set('', createFolderNode('', rootPath))

  for (const song of songs) {
    const relativeFolderPath = getSongFolderRelativePath(song.path, rootPath)
    const segments = relativeFolderPath ? relativeFolderPath.split('/') : []
    const ancestorPaths = ['']
    let currentPath = ''

    for (const segment of segments) {
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment
      const parentNode = nodes.get(currentPath) ?? createFolderNode(currentPath, rootPath)
      const nextNode = nodes.get(nextPath) ?? createFolderNode(nextPath, rootPath)

      if (!nodes.has(currentPath)) {
        nodes.set(currentPath, parentNode)
      }
      if (!nodes.has(nextPath)) {
        nodes.set(nextPath, nextNode)
      }
      if (!parentNode.childPaths.includes(nextPath)) {
        parentNode.childPaths.push(nextPath)
      }

      currentPath = nextPath
      ancestorPaths.push(currentPath)
    }

    const folderNode = nodes.get(currentPath) ?? createFolderNode(currentPath, rootPath)
    if (!nodes.has(currentPath)) {
      nodes.set(currentPath, folderNode)
    }

    folderNode.directSongIds.push(song.id)

    for (const ancestorPath of ancestorPaths) {
      const ancestorNode = nodes.get(ancestorPath) ?? createFolderNode(ancestorPath, rootPath)
      if (!nodes.has(ancestorPath)) {
        nodes.set(ancestorPath, ancestorNode)
      }

      ancestorNode.subtreeSongIds.push(song.id)
      if (!ancestorNode.artworkUrl && song.artworkUrl) {
        ancestorNode.artworkUrl = song.artworkUrl
      }
    }
  }

  for (const node of nodes.values()) {
    node.childPaths.sort((left, right) => left.localeCompare(right))
    node.directSongIds.sort((left, right) => {
      const leftSong = songsById.get(left)
      const rightSong = songsById.get(right)
      return (leftSong?.title ?? '').localeCompare(rightSong?.title ?? '')
    })
    node.subtreeSongIds.sort((left, right) => {
      const leftSong = songsById.get(left)
      const rightSong = songsById.get(right)
      return (leftSong?.path ?? '').localeCompare(rightSong?.path ?? '')
    })
  }

  return { nodes, songsById }
}

function matchesSongSearch(song: LibrarySong, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return [song.title, song.artist, ...song.artists, song.album, song.path]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedSearchQuery)
}

export function LocalBrowserPage({
  songs,
  rootPath,
  currentRelativePath,
  searchQuery,
  selectedTrackId,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onScanLibrary,
  onPlayTrack,
  onRevealSong,
}: LocalBrowserPageProps) {
  const { nodes, songsById } = useMemo(
    () => buildFolderIndex(songs, rootPath),
    [songs, rootPath],
  )
  const currentNode = nodes.get(currentRelativePath) ?? null
  const currentSongs = useMemo(() => {
    if (!currentNode) {
      return []
    }

    const sourceSongIds = searchQuery.trim()
      ? currentNode.subtreeSongIds
      : currentNode.directSongIds

    return sourceSongIds
      .map((songId) => songsById.get(songId) ?? null)
      .filter((song): song is LibrarySong => song != null)
      .filter((song) => matchesSongSearch(song, searchQuery))
  }, [currentNode, searchQuery, songsById])
  const childFolders = useMemo(() => {
    if (!currentNode) {
      return []
    }

    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()

    return currentNode.childPaths
      .map((childPath) => nodes.get(childPath) ?? null)
      .filter((child): child is FolderNode => child != null)
      .filter((child) => {
        if (!normalizedSearchQuery) {
          return true
        }

        if (child.name.toLocaleLowerCase().includes(normalizedSearchQuery)) {
          return true
        }

        return child.subtreeSongIds.some((songId) => {
          const song = songsById.get(songId)
          return song ? matchesSongSearch(song, searchQuery) : false
        })
      })
  }, [currentNode, nodes, searchQuery, songsById])
  const breadcrumbParts = currentRelativePath ? currentRelativePath.split('/') : []
  const queueSongIds = currentNode?.subtreeSongIds ?? []

  if (!rootPath) {
    return (
      <section className="page-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">Local browser</p>
            <h2>Local</h2>
            <p className="page-copy">
              This page now targets a real folder browser. Pick a library root first so the
              Electron app can build a navigable local tree from scanned songs.
            </p>
          </div>
          <div className="page-actions">
            <button className="action-button secondary" type="button" onClick={onPickLibraryRoot}>
              Choose Folder
            </button>
          </div>
        </header>
        <div className="empty-state">
          <h3>No library root configured</h3>
          <p>Select a music folder in settings or from here, then run a scan.</p>
        </div>
      </section>
    )
  }

  if (!currentNode) {
    return (
      <section className="page-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">Local browser</p>
            <h2>Folder Not Found</h2>
            <p className="page-copy">
              The requested folder path does not exist in the current scanned library snapshot.
            </p>
          </div>
          <div className="page-actions">
            <Link className="action-button secondary" to="/local">
              Back To Root
            </Link>
          </div>
        </header>
      </section>
    )
  }

  return (
    <section className="page-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local browser</p>
          <h2>{currentNode.name}</h2>
          <p className="page-copy">
            Browse the scanned folder tree directly. This replaces the old placeholder folder
            cards with a routeable local browser backed by imported library paths.
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
            disabled={scanning || !rootPath}
          >
            {scanning ? 'Scanning...' : 'Rescan Library'}
          </button>
          <button
            className="action-button secondary"
            type="button"
            disabled={queueSongIds.length === 0}
            onClick={() => {
              if (queueSongIds[0] != null) {
                onPlayTrack(queueSongIds[0], queueSongIds)
              }
            }}
          >
            Play Folder
          </button>
        </div>
      </header>

      <div className="root-banner">
        <span className="summary-label">Path</span>
        <div className="local-breadcrumbs">
          <Link className="table-link" to="/local">
            {getFolderDisplayName('', rootPath)}
          </Link>
          {breadcrumbParts.map((part, index) => {
            const relativePath = breadcrumbParts.slice(0, index + 1).join('/')

            return (
              <span key={relativePath} className="local-breadcrumb-item">
                <span>/</span>
                <Link className="table-link" to={buildLocalRoute(relativePath)}>
                  {part}
                </Link>
              </span>
            )
          })}
        </div>
        {loading ? <span className="banner-hint">Refreshing library...</span> : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Child Folders</span>
          <span className="summary-value">{currentNode.childPaths.length}</span>
          <p>Immediate folders nested under the current location.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Direct Songs</span>
          <span className="summary-value">{currentNode.directSongIds.length}</span>
          <p>Tracks stored directly inside this folder.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Subtree Songs</span>
          <span className="summary-value">{currentNode.subtreeSongIds.length}</span>
          <p>Total playable tracks including descendant folders.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Search Scope</span>
          <span className="summary-value settings-mode-value">
            {searchQuery.trim() ? 'Subtree' : 'Current folder'}
          </span>
          <p>Search expands songs to the whole subtree so nested matches stay visible.</p>
        </div>
      </div>

      {childFolders.length > 0 ? (
        <section className="detail-panel">
          <div className="subpanel-header">
            <span className="summary-label">Folders</span>
            <strong>
              {childFolders.length}
              {searchQuery.trim() ? ' matching' : ''}
            </strong>
          </div>
          <div className="collection-grid">
            {childFolders.map((folder) => (
              <Link
                className="collection-card collection-card-link"
                key={folder.relativePath || 'root'}
                to={buildLocalRoute(folder.relativePath)}
              >
                {folder.artworkUrl ? (
                  <img
                    className="collection-artwork"
                    src={folder.artworkUrl}
                    alt={`${folder.name} artwork`}
                  />
                ) : (
                  <div className="collection-artwork collection-artwork-fallback" aria-hidden="true">
                    <span>{folder.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
                <h3>{folder.name}</h3>
                <p className="collection-subtitle">
                  {folder.subtreeSongIds.length} song{folder.subtreeSongIds.length === 1 ? '' : 's'} in
                  this branch
                </p>
                <p className="collection-detail">
                  {folder.childPaths.length} child folder{folder.childPaths.length === 1 ? '' : 's'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {currentSongs.length === 0 ? (
        <div className="empty-state">
          <h3>
            {songs.length === 0
              ? 'No songs scanned yet'
              : searchQuery.trim()
                ? `No songs match "${searchQuery}" in this branch`
                : 'No songs directly inside this folder'}
          </h3>
          <p>
            {songs.length === 0
              ? 'Run a library scan to populate the folder browser.'
              : searchQuery.trim()
                ? 'Try a broader keyword. Local search matches title, artist, album, and file path.'
                : 'Open a child folder or use search to inspect the full subtree.'}
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
                <th>Location</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentSongs.map((song) => (
                <tr
                  key={`${currentNode.relativePath}-${song.id}`}
                  className={song.id === selectedTrackId ? 'is-current' : ''}
                  onClick={() => {
                    onPlayTrack(song.id, queueSongIds)
                  }}
                >
                  <td>{song.title}</td>
                  <td>{getDisplayArtists(song)}</td>
                  <td>{song.album || 'Unknown album'}</td>
                  <td>{formatDuration(song.duration)}</td>
                  <td className="local-path-cell">
                    {normalizePath(song.path)
                      .replace(`${normalizePath(rootPath)}/`, '')
                      .split('/')
                      .slice(0, -1)
                      .join('/') || 'Library root'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-button subtle"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRevealSong(song.path)
                      }}
                    >
                      Reveal
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
