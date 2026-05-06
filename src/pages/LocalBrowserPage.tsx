import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { Icon } from '../components/icons'
import type { LibrarySong } from '../shared/contracts'
import { getDisplayArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { buildLocalRoute } from './localBrowserPaths'

type LocalSortMode = 'name' | 'folders' | 'songs'
type LocalViewMode = 'grid' | 'list'

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
  onCreateFolder: (relativePath: string, name: string) => void | Promise<void>
}

interface FolderNode {
  relativePath: string
  name: string
  artworkUrls: string[]
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
    artworkUrls: [],
    childPaths: [],
    directSongIds: [],
    subtreeSongIds: [],
  }
}

function addArtwork(node: FolderNode, artworkUrl: string) {
  if (artworkUrl && !node.artworkUrls.includes(artworkUrl) && node.artworkUrls.length < 4) {
    node.artworkUrls.push(artworkUrl)
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
      addArtwork(ancestorNode, song.artworkUrl)
    }
  }

  for (const node of nodes.values()) {
    node.childPaths.sort((left, right) => left.localeCompare(right))
    node.directSongIds.sort((left, right) => {
      const leftSong = songsById.get(left)!
      const rightSong = songsById.get(right)!
      return leftSong.title.localeCompare(rightSong.title)
    })
    node.subtreeSongIds.sort((left, right) => {
      const leftSong = songsById.get(left)!
      const rightSong = songsById.get(right)!
      return leftSong.path.localeCompare(rightSong.path)
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

function getParentPath(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.slice(0, -1).join('/')
}

function sortFolders(folders: FolderNode[], mode: LocalSortMode) {
  return folders.slice().sort((left, right) => {
    if (mode === 'folders') {
      return right.childPaths.length - left.childPaths.length || left.name.localeCompare(right.name)
    }

    if (mode === 'songs') {
      return right.subtreeSongIds.length - left.subtreeSongIds.length || left.name.localeCompare(right.name)
    }

    return left.name.localeCompare(right.name)
  })
}

function sortSongs(songs: LibrarySong[], mode: LocalSortMode) {
  return songs.slice().sort((left, right) => {
    if (mode === 'songs') {
      return right.playCount - left.playCount || left.title.localeCompare(right.title)
    }

    return left.title.localeCompare(right.title)
  })
}

function shuffleSongIds(songIds: number[]) {
  const shuffledSongIds = songIds.slice()

  for (let index = shuffledSongIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffledSongIds[index]
    shuffledSongIds[index] = shuffledSongIds[randomIndex]
    shuffledSongIds[randomIndex] = current
  }

  return shuffledSongIds
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
  onCreateFolder,
}: LocalBrowserPageProps) {
  const [sortMode, setSortMode] = useState<LocalSortMode>('name')
  const [viewMode, setViewMode] = useState<LocalViewMode>('grid')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<Set<string>>(new Set())
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [createdFolderPaths, setCreatedFolderPaths] = useState<Set<string>>(new Set())
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

    return sortSongs(
      sourceSongIds
        .map((songId) => songsById.get(songId)!)
        .filter((song) => matchesSongSearch(song, searchQuery)),
      sortMode,
    )
  }, [currentNode, searchQuery, songsById, sortMode])
  const childFolders = useMemo(() => {
    if (!currentNode) {
      return []
    }

    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    const createdChildren = [...createdFolderPaths]
      .filter((folderPath) => getParentPath(folderPath) === currentRelativePath)
      .filter((folderPath) => !currentNode.childPaths.includes(folderPath))
      .map((folderPath) => createFolderNode(folderPath, rootPath))

    return sortFolders(
      [
        ...currentNode.childPaths.map((childPath) => nodes.get(childPath)!),
        ...createdChildren,
      ].filter((child) => {
        if (!normalizedSearchQuery) {
          return true
        }

        if (child.name.toLocaleLowerCase().includes(normalizedSearchQuery)) {
          return true
        }

        return child.subtreeSongIds.some((songId) => {
          const song = songsById.get(songId)!
          return matchesSongSearch(song, searchQuery)
        })
      }),
      sortMode,
    )
  }, [createdFolderPaths, currentNode, currentRelativePath, nodes, rootPath, searchQuery, songsById, sortMode])
  const breadcrumbParts = currentRelativePath ? currentRelativePath.split('/') : []
  const queueSongIds = currentNode?.subtreeSongIds ?? []
  const visibleSongIds = currentSongs.map((song) => song.id)
  const effectiveSelectedFolderPaths = [...selectedFolderPaths].filter((folderPath) =>
    childFolders.some((folder) => folder.relativePath === folderPath),
  )
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => visibleSongIds.includes(songId))
  const selectedQueueSongIds = [
    ...effectiveSelectedSongIds,
    ...effectiveSelectedFolderPaths.flatMap((folderPath) => nodes.get(folderPath)?.subtreeSongIds ?? []),
  ].filter((songId, index, all) => all.indexOf(songId) === index)

  const playShuffled = () => {
    const shuffledSongIds = shuffleSongIds(queueSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const createFolder = async () => {
    const name = window.prompt(t('local.newFolderPrompt'))
    if (!name) {
      return
    }

    await onCreateFolder(currentRelativePath, name)
    const folderPath = currentRelativePath ? `${currentRelativePath}/${name}` : name
    setCreatedFolderPaths((current) => new Set(current).add(folderPath))
  }

  const toggleFolderSelection = (folderPath: string) => {
    setSelectedFolderPaths((current) => {
      const next = new Set(current)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  const toggleSongSelection = (songId: number) => {
    setSelectedSongIds((current) => {
      const next = new Set(current)
      if (next.has(songId)) {
        next.delete(songId)
      } else {
        next.add(songId)
      }
      return next
    })
  }

  if (!rootPath) {
    return (
      <section className="page-panel local-page">
        <header className="local-topbar">
          <div>
            <h2>{t('common.local')}</h2>
            <p>{t('local.descriptionNoRoot')}</p>
          </div>
          <button className="local-command" type="button" onClick={onPickLibraryRoot}>
            <Icon name="folder" />
            {t('library.chooseFolder')}
          </button>
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
      <section className="page-panel local-page">
        <header className="local-topbar">
          <div>
            <h2>{t('local.folderNotFound')}</h2>
            <p>{t('local.folderNotFoundDescription')}</p>
          </div>
          <Link className="local-command" to="/local">
            <Icon name="arrowLeft" />
            {t('local.backToRoot')}
          </Link>
        </header>
      </section>
    )
  }

  return (
    <section className="page-panel local-page">
      <header className="local-topbar">
        <div className="local-heading">
          <nav className="local-title-breadcrumbs" aria-label={t('local.path')}>
            <strong>{t('common.local')}</strong>
            <span>/</span>
            <Link to="/local">{getFolderDisplayName('', rootPath)}</Link>
            {breadcrumbParts.map((part, index) => {
              const relativePath = breadcrumbParts.slice(0, index + 1).join('/')

              return (
                <span key={relativePath} className="local-title-breadcrumb-item">
                  <span>/</span>
                  <Link to={buildLocalRoute(relativePath)}>{part}</Link>
                </span>
              )
            })}
          </nav>
          <p>
            {t('local.headerStats', {
              folders: childFolders.length,
              songs: currentSongs.length,
            })}
          </p>
        </div>
        <div className="local-commandbar">
          <button className="local-command" type="button" disabled={queueSongIds.length === 0} onClick={playShuffled}>
            <Icon name="shuffle" />
            {t('nowPlaying.randomPlay')}
          </button>
          <button className="local-command" type="button" onClick={onScanLibrary} disabled={scanning}>
            <Icon name="recent" />
            {scanning ? t('library.scanning') : t('local.updateFolder')}
          </button>
          <label className="local-command local-select-command">
            <Icon name="sort" />
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.currentTarget.value as LocalSortMode)
              }}
            >
              <option value="name">{t('local.sortName')}</option>
              <option value="folders">{t('local.sortFolders')}</option>
              <option value="songs">{t('local.sortSongs')}</option>
            </select>
          </label>
          <button className="local-command" type="button" onClick={createFolder}>
            <Icon name="folder" />
            {t('local.newFolder')}
          </button>
          <label className="local-command local-select-command">
            <Icon name="selectAll" />
            <select
              value={viewMode}
              onChange={(event) => {
                setViewMode(event.currentTarget.value as LocalViewMode)
              }}
            >
              <option value="grid">{t('local.viewGrid')}</option>
              <option value="list">{t('local.viewList')}</option>
            </select>
          </label>
          <button
            className={multiSelect ? 'local-command is-active' : 'local-command'}
            type="button"
            onClick={() => {
              setMultiSelect((current) => !current)
            }}
          >
            <Icon name="check" />
            {t('albums.multiSelect')}
          </button>
        </div>
      </header>

      {loading ? <div className="root-banner">{t('library.refreshing')}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {multiSelect ? (
        <div className="local-selection-bar">
          <strong>
            {t('albums.selectedCount', {
              count: effectiveSelectedFolderPaths.length + effectiveSelectedSongIds.length,
            })}
          </strong>
          <button type="button" disabled={selectedQueueSongIds.length === 0} onClick={() => onPlayTrack(selectedQueueSongIds[0]!, selectedQueueSongIds)}>
            <Icon name="play" />
            {t('albums.playSelected')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFolderPaths(new Set(childFolders.map((folder) => folder.relativePath)))
              setSelectedSongIds(new Set(visibleSongIds))
            }}
          >
            <Icon name="selectAll" />
            {t('albums.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFolderPaths(new Set())
              setSelectedSongIds(new Set())
            }}
          >
            <Icon name="clearSelection" />
            {t('albums.clearSelection')}
          </button>
        </div>
      ) : null}

      {childFolders.length === 0 && currentSongs.length === 0 ? (
        <div className="empty-state">
          <h3>
            {songs.length === 0
              ? t('local.noSongsScanned')
              : searchQuery.trim()
                ? t('local.noSongsBranch', { query: searchQuery })
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
      ) : viewMode === 'grid' ? (
        <div className="local-scroll-shell">
          {childFolders.length > 0 ? (
            <div className="local-folder-grid">
              {childFolders.map((folder) => (
                <LocalFolderCard
                  folder={folder}
                  key={folder.relativePath}
                  selected={selectedFolderPaths.has(folder.relativePath)}
                  multiSelect={multiSelect}
                  t={t}
                  onToggleSelection={toggleFolderSelection}
                />
              ))}
            </div>
          ) : null}
          {currentSongs.length > 0 ? (
            <div className="local-song-grid">
              {currentSongs.map((song) => (
                <LocalSongCard
                  key={song.id}
                  song={song}
                  selected={selectedSongIds.has(song.id)}
                  current={song.id === selectedTrackId}
                  multiSelect={multiSelect}
                  queueSongIds={queueSongIds}
                  t={t}
                  onPlayTrack={onPlayTrack}
                  onToggleSelection={toggleSongSelection}
                  onRevealSong={onRevealSong}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="table-shell local-table-shell">
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
              {childFolders.map((folder) => (
                <tr
                  key={folder.relativePath}
                  onClick={() => {
                    if (multiSelect) {
                      toggleFolderSelection(folder.relativePath)
                    }
                  }}
                >
                  <td>
                    {multiSelect ? (
                      <span className={selectedFolderPaths.has(folder.relativePath) ? 'local-check is-selected' : 'local-check'}>
                        {selectedFolderPaths.has(folder.relativePath) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    <Link className="table-link" to={buildLocalRoute(folder.relativePath)}>
                      {folder.name}
                    </Link>
                  </td>
                  <td>{t('common.folders')}</td>
                  <td>{t('local.childFolderCount', { count: folder.childPaths.length })}</td>
                  <td>{t('local.folderSongs', { count: folder.subtreeSongIds.length })}</td>
                  <td className="local-path-cell">{folder.relativePath || t('local.libraryRoot')}</td>
                  <td />
                </tr>
              ))}
              {currentSongs.map((song) => (
                <tr
                  key={`${currentNode.relativePath}-${song.id}`}
                  className={song.id === selectedTrackId ? 'is-current' : ''}
                  onClick={() => {
                    if (multiSelect) {
                      toggleSongSelection(song.id)
                    } else {
                      onPlayTrack(song.id, queueSongIds)
                    }
                  }}
                >
                  <td>
                    {multiSelect ? (
                      <span className={selectedSongIds.has(song.id) ? 'local-check is-selected' : 'local-check'}>
                        {selectedSongIds.has(song.id) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    {song.title}
                  </td>
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

function LocalFolderCard({
  folder,
  selected,
  multiSelect,
  t,
  onToggleSelection,
}: {
  folder: FolderNode
  selected: boolean
  multiSelect: boolean
  t: Translator
  onToggleSelection: (folderPath: string) => void
}) {
  const content = (
    <>
      <FolderArtwork folder={folder} />
      {multiSelect ? (
        <span className={selected ? 'local-card-check is-selected' : 'local-card-check'}>
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
      <strong>{folder.name}</strong>
      <span>
        {folder.childPaths.length > 0
          ? t('local.folderCardStats', { folders: folder.childPaths.length, songs: folder.subtreeSongIds.length })
          : t('local.folderSongsShort', { count: folder.subtreeSongIds.length })}
      </span>
    </>
  )

  if (multiSelect) {
    return (
      <button
        type="button"
        className={selected ? 'local-folder-card is-selected' : 'local-folder-card'}
        onClick={() => {
          onToggleSelection(folder.relativePath)
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <Link className="local-folder-card" to={buildLocalRoute(folder.relativePath)}>
      {content}
    </Link>
  )
}

function FolderArtwork({ folder }: { folder: FolderNode }) {
  if (folder.artworkUrls.length === 0) {
    return (
      <span className="local-folder-artwork local-folder-artwork-fallback">
        <Icon name="folder" />
      </span>
    )
  }

  return (
    <span className={`local-folder-artwork local-folder-artwork-${Math.min(folder.artworkUrls.length, 4)}`}>
      {folder.artworkUrls.slice(0, 4).map((artworkUrl) => (
        <ArtworkImage
          className="local-folder-artwork-image"
          key={artworkUrl}
          src={artworkUrl}
          title={folder.name}
          renderFallback={() => <span className="local-folder-artwork-image" />}
        />
      ))}
    </span>
  )
}

function LocalSongCard({
  song,
  selected,
  current,
  multiSelect,
  queueSongIds,
  t,
  onPlayTrack,
  onToggleSelection,
  onRevealSong,
}: {
  song: LibrarySong
  selected: boolean
  current: boolean
  multiSelect: boolean
  queueSongIds: number[]
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onToggleSelection: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
}) {
  return (
    <button
      type="button"
      className={selected ? 'local-song-card is-selected' : current ? 'local-song-card is-current' : 'local-song-card'}
      onClick={() => {
        if (multiSelect) {
          onToggleSelection(song.id)
        } else {
          onPlayTrack(song.id, queueSongIds)
        }
      }}
    >
      <ArtworkImage
        className="local-song-artwork"
        src={song.artworkUrl}
        title={song.title}
        renderFallback={() => (
          <span className="local-song-artwork local-song-artwork-fallback">
            <Icon name="songs" />
          </span>
        )}
      />
      {multiSelect ? (
        <span className={selected ? 'local-card-check is-selected' : 'local-card-check'}>
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
      <strong>{song.title}</strong>
      <span>{getDisplayArtists(song)}</span>
      <span className="local-song-card-actions">
        <span>{formatDuration(song.duration)}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation()
            onRevealSong(song.path)
          }}
        >
          {t('local.reveal')}
        </span>
      </span>
    </button>
  )
}
