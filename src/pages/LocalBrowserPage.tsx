import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import type { LibrarySong } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { buildLocalRoute } from './localBrowserPaths'

interface LocalBrowserPageProps {
  songs: LibrarySong[]
  t: Translator
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
  onRevealSong: (songPath: string) => void | Promise<void>
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
  t,
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
            <p className="eyebrow">{t('local.eyebrow')}</p>
            <h2>{t('common.local')}</h2>
            <p className="page-copy">
              {t(
                'local.descriptionNoRoot',
              )}
            </p>
          </div>
          <div className="page-actions">
            <button className="action-button secondary" type="button" onClick={onPickLibraryRoot}>
              {t('library.chooseFolder')}
            </button>
          </div>
        </header>
        <div className="empty-state">
          <h3>{t('local.noRoot')}</h3>
          <p>{t('local.noRootCopy')}</p>
        </div>
      </section>
    )
  }

  if (!currentNode) {
    return (
      <section className="page-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('local.eyebrow')}</p>
            <h2>{t('local.folderNotFound')}</h2>
            <p className="page-copy">
              {t(
                'local.folderNotFoundDescription',
              )}
            </p>
          </div>
          <div className="page-actions">
            <Link className="action-button secondary" to="/local">
              {t('local.backToRoot')}
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
          <p className="eyebrow">{t('local.eyebrow')}</p>
          <h2>{currentNode.name}</h2>
          <p className="page-copy">
            {t(
              'local.description',
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="action-button secondary" type="button" onClick={onPickLibraryRoot}>
            {t('library.chooseFolder')}
          </button>
          <button
            className="action-button"
            type="button"
            onClick={onScanLibrary}
            disabled={scanning || !rootPath}
          >
            {scanning ? t('library.scanning') : t('local.rescan')}
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
            {t('local.playFolder')}
          </button>
        </div>
      </header>

      <div className="root-banner">
        <span className="summary-label">{t('local.path')}</span>
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
        {loading ? <span className="banner-hint">{t('library.refreshing')}</span> : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">{t('local.childFolders')}</span>
          <span className="summary-value">{currentNode.childPaths.length}</span>
          <p>{t('local.childFoldersCopy')}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t('local.directSongs')}</span>
          <span className="summary-value">{currentNode.directSongIds.length}</span>
          <p>{t('local.directSongsCopy')}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t('local.subtreeSongs')}</span>
          <span className="summary-value">{currentNode.subtreeSongIds.length}</span>
          <p>{t('local.subtreeSongsCopy')}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t('local.searchScope')}</span>
          <span className="summary-value settings-mode-value">
            {searchQuery.trim() ? t('local.scopeSubtree') : t('local.scopeCurrent')}
          </span>
          <p>{t('local.searchScopeCopy')}</p>
        </div>
      </div>

      {childFolders.length > 0 ? (
        <section className="detail-panel">
          <div className="subpanel-header">
            <span className="summary-label">{t('common.folders')}</span>
            <strong>
              {childFolders.length}
              {searchQuery.trim() ? t('local.matching') : ''}
            </strong>
          </div>
          <div className="collection-grid">
            {childFolders.map((folder) => (
              <Link
                className="collection-card collection-card-link"
                key={folder.relativePath || 'root'}
                to={buildLocalRoute(folder.relativePath)}
              >
                <ArtworkImage
                  className="collection-artwork"
                  src={folder.artworkUrl}
                  title={folder.name}
                  renderFallback={() => (
                    <div className="collection-artwork collection-artwork-fallback" aria-hidden="true">
                      <span>{folder.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                />
                <h3>{folder.name}</h3>
                <p className="collection-subtitle">
                  {t('local.folderSongs', {
                    count: folder.subtreeSongIds.length,
                  })}
                </p>
                <p className="collection-detail">
                  {t('local.childFolderCount', {
                    count: folder.childPaths.length,
                  })}
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
              ? t('local.noSongsScanned')
              : searchQuery.trim()
                ? t('local.noSongsBranch', {
                    query: searchQuery,
                  })
                : t('local.noDirectSongs')}
          </h3>
          <p>
            {songs.length === 0
              ? t('local.scanPopulate')
              : searchQuery.trim()
                ? t('local.searchHelp')
                : t('local.openChildHelp')}
          </p>
        </div>
      ) : (
        <div className="table-shell">
          <table className="music-table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.artist')}</th>
                <th>{t('common.album')}</th>
                <th>{t('common.duration')}</th>
                <th>{t('local.location')}</th>
                <th>{t('local.action')}</th>
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
                  <td>{song.album || t('common.albumUnknown')}</td>
                  <td>{formatDuration(song.duration)}</td>
                  <td className="local-path-cell">
                    {normalizePath(song.path)
                      .replace(`${normalizePath(rootPath)}/`, '')
                      .split('/')
                      .slice(0, -1)
                      .join('/') || t('local.libraryRoot')}
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
                      {t('local.reveal')}
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
