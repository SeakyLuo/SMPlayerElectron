import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { GridArtworkCardContent } from '../components/GridArtworkCardContent'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout } from '../components/MusicMenuFlyout'
import type { LibraryFolder, LibraryPlaylist, LibrarySong, LocalFolderSortCriterion, PreferenceItemSnapshot, PreferenceLevel, ScanLibraryResult } from '../shared/contracts'
import { getDisplayArtists, getSongArtists } from '../shared/artists'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { buildLocalRoute } from './localPagePaths'

type LocalSortMode = LocalFolderSortCriterion
type LocalViewMode = 'grid' | 'list'

interface LocalPageProps {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  t: Translator
  rootPath: string
  currentRelativePath: string
  searchQuery: string
  selectedTrackId: number | null
  isPlaying: boolean
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onRefreshFolder: (folderPath: string) => void | ScanLibraryResult | null | Promise<ScanLibraryResult | null | void>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onRevealFolder: (folderPath: string) => void | Promise<void>
  onCreateFolder: (relativePath: string, name: string) => void | Promise<void>
  onRenameFolder: (folderPath: string, name: string) => void | Promise<void>
  onDeleteFolder: (folderPath: string) => void | Promise<void>
  onHideFolder: (folderPath: string) => void | Promise<void>
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onDeleteSongFromDisk: (songId: number) => void
  onMoveSongsToFolder: (songIds: number[], folderPath: string) => void | Promise<void>
  onMoveFolderToFolder: (sourceFolderPath: string, targetFolderPath: string) => void | Promise<void>
  onDeleteLocalItems: (songIds: number[], folderPaths: string[]) => void | Promise<void>
  onUpdateFolderSort: (folderPath: string, sortCriterion: LocalSortMode) => void | Promise<void>
  onSearchDirectory: (query: string, folderRelativePath: string) => void
}

interface FolderNode {
  id: number
  relativePath: string
  path: string
  name: string
  thumbnailUrls: string[]
  childPaths: string[]
  directSongIds: number[]
  subtreeSongIds: number[]
  criterion: number
}

const localTextCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

function getLocalTextSortBucket(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return 0
  }

  return /^[0-9A-Za-z]/.test(trimmedValue) ? 1 : 2
}

interface FolderChainItem {
  name: string
  path: string
  isLastItem: boolean
  isCurrentItem: boolean
  children: FolderChainChildItem[]
}

interface FolderChainChildItem {
  name: string
  path: string
  isHighlighted: boolean
}

interface FolderChainDropPayload {
  songIds: number[]
  folderPaths: string[]
}

interface FolderChainMenuState extends MenuFlyoutPosition {
  folder: FolderNode
}

interface LocalFolderMenuState extends MenuFlyoutPosition {
  folder: FolderNode
}

interface LocalSongMenuState extends MenuFlyoutPosition {
  song: LibrarySong
}

interface LocalSongAddMenuState extends MenuFlyoutPosition {
  song: LibrarySong
}

type LocalSelectionAddMenuState = MenuFlyoutPosition

interface LocalToolbarMenuState extends MenuFlyoutPosition {
  kind: 'sort' | 'view'
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

function getFolderAbsolutePath(relativePath: string, rootPath: string) {
  if (!relativePath) {
    return rootPath
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${relativePath.split('/').join(separator)}`
}

function createFolderNode(relativePath: string, rootPath: string): FolderNode {
  return {
    relativePath,
    id: 0,
    path: getFolderAbsolutePath(relativePath, rootPath),
    name: getFolderDisplayName(relativePath, rootPath),
    thumbnailUrls: [],
    childPaths: [],
    directSongIds: [],
    subtreeSongIds: [],
    criterion: 0,
  }
}

function addOriginalFolderThumbnails(thumbnailUrls: string[], songIds: number[], songsById: Map<number, LibrarySong>) {
  const albumSongs = new Map<string, LibrarySong[]>()

  for (const songId of songIds) {
    const song = songsById.get(songId)!
    albumSongs.set(song.album, [...(albumSongs.get(song.album) ?? []), song])
  }

  for (const groupSongs of albumSongs.values()) {
    const songWithThumbnail = groupSongs.find((song) => song.artworkUrl)
    if (songWithThumbnail) {
      thumbnailUrls.push(songWithThumbnail.artworkUrl)
    }
    if (thumbnailUrls.length === 4) {
      return true
    }
  }

  return false
}

function getOriginalFolderThumbnailUrls(node: FolderNode, nodes: Map<string, FolderNode>, songsById: Map<number, LibrarySong>) {
  const thumbnailUrls: string[] = []

  if (addOriginalFolderThumbnails(thumbnailUrls, node.directSongIds, songsById)) {
    return thumbnailUrls
  }

  for (const childPath of node.childPaths) {
    const childNode = nodes.get(childPath)!
    if (addOriginalFolderThumbnails(thumbnailUrls, childNode.subtreeSongIds, songsById)) {
      return thumbnailUrls
    }
  }

  return thumbnailUrls
}

function compareLocalText(left: string, right: string) {
  const leftBucket = getLocalTextSortBucket(left)
  const rightBucket = getLocalTextSortBucket(right)

  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket
  }

  return localTextCollator.compare(left, right)
}

function getFolderFlattenedSongIds(node: FolderNode, nodes: Map<string, FolderNode>): number[] {
  return [
    ...node.childPaths.flatMap((childPath) => getFolderFlattenedSongIds(nodes.get(childPath)!, nodes)),
    ...node.directSongIds,
  ]
}

function compareSongByFolderCriterion(left: LibrarySong, right: LibrarySong, criterion: number): number {
  switch (criterion) {
    case 1:
      return compareLocalText(getDisplayArtists(left), getDisplayArtists(right))
    case 2:
      return compareLocalText(left.album, right.album)
    case 3:
      return left.duration - right.duration
    case 4:
      return left.playCount - right.playCount
    case 5:
      return left.dateAdded.localeCompare(right.dateAdded)
    case 7:
      return -compareSongByFolderCriterion(left, right, 0)
    case 0:
    case 6:
      return compareLocalText(left.title, right.title)
    default:
      return left.id - right.id
  }
}

function getFolderRelativePath(folderPath: string, rootPath: string) {
  const normalizedFolderPath = normalizePath(folderPath)
  const normalizedRootPath = normalizePath(rootPath)

  if (normalizedFolderPath === normalizedRootPath) {
    return ''
  }

  return normalizedFolderPath.slice(normalizedRootPath.length + 1)
}

function buildFolderIndex(songs: LibrarySong[], folders: LibraryFolder[], rootPath: string) {
  const nodes = new Map<string, FolderNode>()
  const songsById = new Map(songs.map((song) => [song.id, song]))

  nodes.set('', createFolderNode('', rootPath))

  for (const folder of folders) {
    const relativePath = getFolderRelativePath(folder.path, rootPath)
    if (!nodes.has(relativePath)) {
      nodes.set(relativePath, createFolderNode(relativePath, rootPath))
    }
    nodes.get(relativePath)!.criterion = folder.criterion
    nodes.get(relativePath)!.id = folder.id
  }

  for (const relativePath of nodes.keys()) {
    if (!relativePath) {
      continue
    }

    const parentPath = getParentPath(relativePath)
    const parentNode = nodes.get(parentPath) ?? createFolderNode(parentPath, rootPath)
    if (!nodes.has(parentPath)) {
      nodes.set(parentPath, parentNode)
    }
    if (!parentNode.childPaths.includes(relativePath)) {
      parentNode.childPaths.push(relativePath)
    }
  }

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
    }
  }

  for (const node of nodes.values()) {
    node.childPaths.sort((left, right) => compareLocalText(nodes.get(left)!.name, nodes.get(right)!.name))
    node.directSongIds.sort((left, right) => {
      const leftSong = songsById.get(left)!
      const rightSong = songsById.get(right)!
      return compareSongByFolderCriterion(leftSong, rightSong, node.criterion)
    })
  }

  for (const node of nodes.values()) {
    node.subtreeSongIds = getFolderFlattenedSongIds(node, nodes)
  }

  for (const node of nodes.values()) {
    node.thumbnailUrls = getOriginalFolderThumbnailUrls(node, nodes, songsById)
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

function getFolderListItemKey(folderPath: string) {
  return `folder:${folderPath}`
}

function getSongListItemKey(songId: number) {
  return `song:${songId}`
}

function joinClassNames(...classNames: Array<string | false>) {
  return classNames.filter(Boolean).join(' ')
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  return left.size === right.size && [...left].every((item) => right.has(item))
}

function getFileTitle(filePath: string) {
  const fileName = normalizePath(filePath).split('/').at(-1) ?? filePath
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
}

function getRefreshChangeMessage(
  paths: string[],
  singleKey: string,
  multipleKey: string,
  t: Translator,
) {
  if (paths.length === 0) {
    return ''
  }

  return paths.length === 1
    ? t(singleKey, { name: getFileTitle(paths[0]!) })
    : t(multipleKey, { count: paths.length })
}

function getRefreshResultMessage(result: ScanLibraryResult, t: Translator) {
  const messages = [
    getRefreshChangeMessage(result.filesAdded, 'local.refreshAddedOne', 'local.refreshAddedMultiple', t),
    getRefreshChangeMessage(result.filesRemoved, 'local.refreshRemovedOne', 'local.refreshRemovedMultiple', t),
    getRefreshChangeMessage(result.filesMoved, 'local.refreshMovedOne', 'local.refreshMovedMultiple', t),
  ].filter(Boolean)

  return messages.length > 0 ? messages.join(t('common.comma')) : t('local.refreshNoChange')
}

function buildFolderChain(
  currentRelativePath: string,
  nodes: Map<string, FolderNode>,
): FolderChainItem[] {
  const rootNode = nodes.get('')!
  const relativeSegments = currentRelativePath.split('/').filter(Boolean)
  const currentPaths = [
    '',
    ...relativeSegments.map((_, index) => relativeSegments.slice(0, index + 1).join('/')),
  ]

  return currentPaths.map((path, index) => {
    const node = path ? nodes.get(path) : rootNode
    const isCurrentItem = index === currentPaths.length - 1

    return {
      name: node?.name ?? relativeSegments[index - 1]!,
      path,
      isLastItem: !isCurrentItem,
      isCurrentItem,
      children: (node?.childPaths ?? []).map((childPath) => {
        const child = nodes.get(childPath)!

        return {
          name: child.name,
          path: child.relativePath,
          isHighlighted: currentRelativePath === child.relativePath || currentRelativePath.startsWith(`${child.relativePath}/`),
        }
      }),
    }
  })
}

function scrollCurrentFolderToTop() {
  document.querySelector<HTMLElement>('.local-scroll-shell, .local-table-shell')?.scrollTo({
    top: 0,
  })
}

export function FolderChainListView({
  songs,
  folders,
  t,
  rootPath,
  currentRelativePath,
  onDropLocalItems,
  onOpenFolder,
  onOpenFolderMenu,
}: {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  t: Translator
  rootPath: string
  currentRelativePath: string
  onDropLocalItems?: (payload: FolderChainDropPayload, targetRelativePath: string) => void | Promise<void>
  onOpenFolder: (targetRelativePath: string) => void
  onOpenFolderMenu?: (targetRelativePath: string, x: number, y: number) => void
}) {
  const [openedFolderChainItemPath, setOpenedFolderChainItemPath] = useState<string | null>(null)
  const { nodes } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const folderChain = useMemo(
    () => buildFolderChain(currentRelativePath, nodes),
    [currentRelativePath, nodes],
  )
  const dropLocalItems = (event: DragEvent, targetRelativePath: string) => {
    if (!onDropLocalItems) {
      return
    }

    const rawPayload = event.dataTransfer.getData('application/x-smplayer-local-items')
    if (!rawPayload) {
      return
    }

    event.preventDefault()
    void onDropLocalItems(JSON.parse(rawPayload) as FolderChainDropPayload, targetRelativePath)
    setOpenedFolderChainItemPath(null)
  }

  return (
    <>
      {openedFolderChainItemPath != null ? (
        <button
          aria-label={t('local.path')}
          className="folder-chain-flyout-overlay"
          type="button"
          onClick={() => {
            setOpenedFolderChainItemPath(null)
          }}
        />
      ) : null}
      <nav className="folder-chain-list-view" aria-label={t('local.path')}>
        {folderChain.map((folderChainItem) => {
          const isFlyoutOpen = openedFolderChainItemPath === folderChainItem.path
          const segmentClassName = [
            'folder-chain-item',
            folderChainItem.isCurrentItem ? 'is-current' : '',
            isFlyoutOpen ? 'is-open' : '',
          ].filter(Boolean).join(' ')

          return (
            <span
              className={segmentClassName}
              key={folderChainItem.path || rootPath}
            >
              {folderChainItem.isCurrentItem ? (
                <button
                  className="folder-chain-item-path-button"
                  type="button"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onOpenFolderMenu?.(folderChainItem.path, event.clientX, event.clientY)
                  }}
                  onClick={scrollCurrentFolderToTop}
                >
                  {folderChainItem.name}
                </button>
              ) : (
                <button
                  className="folder-chain-item-path-button"
                  type="button"
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => dropLocalItems(event, folderChainItem.path)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onOpenFolderMenu?.(folderChainItem.path, event.clientX, event.clientY)
                  }}
                  onClick={() => {
                    onOpenFolder(folderChainItem.path)
                  }}
                >
                  {folderChainItem.name}
                </button>
              )}
              <button
                aria-label={folderChainItem.name}
                className="folder-chain-item-dropdown-button"
                type="button"
                onClick={() => {
                  setOpenedFolderChainItemPath((current) =>
                    current === folderChainItem.path ? null : folderChainItem.path,
                  )
                }}
              >
                <Icon name={isFlyoutOpen ? 'chevronDown' : 'chevronRight'} />
              </button>
              {isFlyoutOpen ? (
                <div className="folder-chain-item-flyout">
                  {folderChainItem.children.map((child) => (
                    <button
                      className={child.isHighlighted ? 'folder-chain-item-flyout-button is-highlighted' : 'folder-chain-item-flyout-button'}
                      key={child.path}
                      title={child.path}
                      type="button"
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => dropLocalItems(event, child.path)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        onOpenFolderMenu?.(child.path, event.clientX, event.clientY)
                      }}
                      onClick={() => {
                        onOpenFolder(child.path)
                        setOpenedFolderChainItemPath(null)
                      }}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
          )
        })}
      </nav>
    </>
  )
}

export function LocalTitleGrid({
  songs,
  folders,
  playlists,
  t,
  rootPath,
  currentRelativePath,
  onHiddenFoldersListButtonClick,
  onDropLocalItems,
  onOpenFolder,
  onRevealFolder,
  onSearchDirectory,
  onPlayTrack,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onAddSongsToPlaylist,
}: {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  t: Translator
  rootPath: string
  currentRelativePath: string
  onHiddenFoldersListButtonClick: () => void
  onDropLocalItems?: (payload: FolderChainDropPayload, targetRelativePath: string) => void | Promise<void>
  onOpenFolder: (targetRelativePath: string) => void
  onRevealFolder: (folderPath: string) => void | Promise<void>
  onSearchDirectory: (query: string, folderRelativePath: string) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
}) {
  const [folderChainMenu, setFolderChainMenu] = useState<FolderChainMenuState | null>(null)
  const [folderPreferenceItems, setFolderPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const { nodes } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, rootPath, songs],
  )
  const refreshFolderPreferenceItems = async () => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setFolderPreferenceItems(new Map(settings.folders.map((item) => [item.itemId, item])))
  }
  const searchDirectory = (folder: FolderNode) => {
    const query = window.prompt(t('local.searchDirectoryPrompt', { name: folder.name }))
    if (!query?.trim()) {
      return
    }

    onSearchDirectory(query, folder.relativePath)
    setFolderChainMenu(null)
  }
  const playablePlaylists = playlists.filter((playlist) => !playlist.isBuiltIn || playlist.name === t('common.myFavorites'))
  const favoritePlaylist = playlists.find((playlist) => playlist.isBuiltIn)!
  const getFolderPreferenceMenuItem = (folder: FolderNode, keyPrefix: string): MenuFlyoutItem => {
    const preferenceItem = folderPreferenceItems.get(String(folder.id))

    return {
      key: `${keyPrefix}-folder-preference`,
      text: t('settings.preferenceSettings'),
      icon: 'star',
      submenu: [
        ...(preferenceItem
          ? [
              {
                key: `${keyPrefix}-folder-preference-undo`,
                text: t('preferences.undoPrefer'),
                onClick: () => {
                  void window.smplayer?.removePreferenceItem(preferenceItem.id).then(refreshFolderPreferenceItems)
                },
              },
              { key: `${keyPrefix}-folder-preference-undo-separator`, text: '', separator: true },
            ] satisfies MenuFlyoutItem[]
          : []),
        ...([
          'very-high',
          'higher',
          'high',
          'normal',
          'dislike',
          'do-not-appear',
        ] as PreferenceLevel[]).map((level) => ({
          key: `${keyPrefix}-folder-preference-${level}`,
          text: t(`preferences.level.${level}`),
          icon: preferenceItem?.level === level ? 'check' as const : undefined,
          onClick: () => {
            void window.smplayer?.addPreferenceItem('folder', String(folder.id), folder.name, level).then(refreshFolderPreferenceItems)
          },
        })),
      ],
    }
  }

  useEffect(() => {
    void refreshFolderPreferenceItems()
  }, [])

  return (
    <div className="local-title-grid">
      <div className="current-path-grid">
        <span className="current-path-text-block">{t('local.currentPath')}</span>
      </div>
      <FolderChainListView
        songs={songs}
        folders={folders}
        t={t}
        rootPath={rootPath}
        currentRelativePath={currentRelativePath}
        onDropLocalItems={onDropLocalItems}
        onOpenFolder={onOpenFolder}
        onOpenFolderMenu={(targetRelativePath, x, y) => {
          setFolderChainMenu({ folder: nodes.get(targetRelativePath)!, x, y })
        }}
      />
      <button
        className="hidden-folders-list-button"
        title={t('local.hiddenFolders')}
        type="button"
        onClick={onHiddenFoldersListButtonClick}
      >
        <Icon name="hiddenFolders" />
      </button>
      {folderChainMenu ? (
        <MenuFlyout
          position={folderChainMenu}
          onClose={() => {
            setFolderChainMenu(null)
          }}
          items={[
            {
              key: 'chain-shuffle-folder',
              text: t('nowPlaying.randomPlay'),
              icon: 'shuffle',
              disabled: folderChainMenu.folder.subtreeSongIds.length === 0,
              onClick: () => {
                const shuffledSongIds = shuffleSongIds(folderChainMenu.folder.subtreeSongIds)
                onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
              },
            },
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: folderChainMenu.folder.subtreeSongIds,
              t,
              defaultPlaylistName: folderChainMenu.folder.name,
              includeNowPlaying: true,
              includeFavorites: true,
              onAddToNowPlaying: () => onAddSongsToNowPlaying(folderChainMenu.folder.subtreeSongIds),
              onToggleFavorite: () => onAddSongsToPlaylist(favoritePlaylist.id, folderChainMenu.folder.subtreeSongIds),
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderChainMenu.folder.subtreeSongIds),
              onAddToPlaylist: (playlistId) => onAddSongsToPlaylist(playlistId, folderChainMenu.folder.subtreeSongIds),
            }),
            getFolderPreferenceMenuItem(folderChainMenu.folder, 'chain'),
            {
              key: 'chain-show-in-explorer',
              text: t('context.reveal'),
              pendingText: t('context.openingLocal'),
              icon: 'folder',
              onClick: () => onRevealFolder(folderChainMenu.folder.path),
            },
            {
              key: 'chain-search-directory',
              text: t('local.searchDirectory'),
              icon: 'search',
              onClick: () => searchDirectory(folderChainMenu.folder),
            },
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
    </div>
  )
}

function sortFolders(folders: FolderNode[]) {
  return folders.slice().sort((left, right) => compareLocalText(left.name, right.name))
}

function sortSongs(songs: LibrarySong[], mode: LocalSortMode, baseMode: LocalSortMode = mode): LibrarySong[] {
  if (mode === 'reverse') {
    return sortSongs(songs, baseMode === 'reverse' ? 'title' : baseMode).reverse()
  }

  return songs.slice().sort((left, right) => {
    if (mode === 'artist') {
      return compareLocalText(getDisplayArtists(left), getDisplayArtists(right))
    }

    if (mode === 'album') {
      return compareLocalText(left.album || '', right.album || '')
    }

    return compareLocalText(left.title, right.title)
  })
}

function localSortModeFromCriterion(criterion: number): LocalSortMode {
  switch (criterion) {
    case 7:
      return 'reverse'
    case 1:
      return 'artist'
    case 2:
      return 'album'
    default:
      return 'title'
  }
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

export function LocalPage({
  songs,
  folders,
  playlists,
  t,
  rootPath,
  currentRelativePath: routeRelativePath,
  searchQuery,
  selectedTrackId,
  isPlaying,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onRefreshFolder,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onRevealSong,
  onRevealFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onHideFolder,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onToggleFavorite,
  onDeleteSongFromDisk,
  onMoveSongsToFolder,
  onMoveFolderToFolder,
  onDeleteLocalItems,
  onUpdateFolderSort,
  onSearchDirectory,
}: LocalPageProps) {
  const navigate = useNavigate()
  const [currentRelativePath, setCurrentRelativePath] = useState(routeRelativePath)
  const [sortMode, setSortMode] = useState<LocalSortMode>('title')
  const [viewMode, setViewMode] = useState<LocalViewMode>(() =>
    window.localStorage.getItem('smplayer:local-view-mode') === 'list' ? 'list' : 'grid',
  )
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<Set<string>>(new Set())
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectedListItemKey, setSelectedListItemKey] = useState('')
  const [createdFolderPaths, setCreatedFolderPaths] = useState<Set<string>>(new Set())
  const [localNotification, setLocalNotification] = useState('')
  const refresh = useLibraryStore((state) => state.refresh)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const [folderMenu, setFolderMenu] = useState<LocalFolderMenuState | null>(null)
  const [songMenu, setSongMenu] = useState<LocalSongMenuState | null>(null)
  const [folderAddMenu, setFolderAddMenu] = useState<LocalFolderMenuState | null>(null)
  const [songAddMenu, setSongAddMenu] = useState<LocalSongAddMenuState | null>(null)
  const [selectionAddMenu, setSelectionAddMenu] = useState<LocalSelectionAddMenuState | null>(null)
  const [toolbarMenu, setToolbarMenu] = useState<LocalToolbarMenuState | null>(null)
  const [folderPreferenceItems, setFolderPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const { nodes, songsById } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const currentNode = nodes.get(currentRelativePath) ?? null
  const currentSortMode = currentNode ? localSortModeFromCriterion(currentNode.criterion) : 'title'

  useEffect(() => {
    setCurrentRelativePath(routeRelativePath)
  }, [routeRelativePath])

  const openFolder = (targetRelativePath: string) => {
    setCurrentRelativePath(targetRelativePath)
    navigate(buildLocalRoute(targetRelativePath), { replace: true })
  }

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
      currentSortMode,
    )
  }, [currentNode, currentSortMode, searchQuery, songsById, sortMode])
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
    )
  }, [createdFolderPaths, currentNode, currentRelativePath, nodes, rootPath, searchQuery, songsById])
  const visibleSongIds = useMemo(() => currentSongs.map((song) => song.id), [currentSongs])
  const queueSongIds = visibleSongIds
  const effectiveSelectedFolderPaths = [...selectedFolderPaths].filter((folderPath) =>
    childFolders.some((folder) => folder.relativePath === folderPath),
  )
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => visibleSongIds.includes(songId))
  const selectedQueueSongIds = [
    ...effectiveSelectedSongIds,
    ...effectiveSelectedFolderPaths.flatMap((folderPath) => nodes.get(folderPath)?.subtreeSongIds ?? []),
  ].filter((songId, index, all) => all.indexOf(songId) === index)
  const playablePlaylists = playlists.filter((playlist) => !playlist.isBuiltIn || playlist.name === t('common.myFavorites'))
  const favoritePlaylist = playlists.find((playlist) => playlist.isBuiltIn)!
  const refreshFolderPreferenceItems = async () => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setFolderPreferenceItems(new Map(settings.folders.map((item) => [item.itemId, item])))
  }

  const ClearMultiSelectStatus = () => {
    if (!multiSelect) {
      return false
    }

    setMultiSelect(false)
    setSelectedFolderPaths(new Set())
    setSelectedSongIds(new Set())
    return true
  }

  const HideMultiSelectAfterOperation = () => {
    if (hideMultiSelectCommandBarAfterOperation) {
      ClearMultiSelectStatus()
    }
  }

  const PleaseExitMultiSelectMode = () => {
    if (!multiSelect) {
      return false
    }

    setLocalNotification(t('local.pleaseExitMultiSelectMode'))
    return true
  }

  useEffect(() => {
    ClearMultiSelectStatus()
    setSelectedListItemKey('')
    setLocalNotification('')
  }, [currentRelativePath])

  useEffect(() => {
    const childFolderPathSet = new Set(childFolders.map((folder) => folder.relativePath))
    const visibleSongIdSet = new Set(visibleSongIds)

    setSelectedFolderPaths((current) => {
      const next = new Set([...current].filter((folderPath) => childFolderPathSet.has(folderPath)))
      return areSetsEqual(current, next) ? current : next
    })
    setSelectedSongIds((current) => {
      const next = new Set([...current].filter((songId) => visibleSongIdSet.has(songId)))
      return areSetsEqual(current, next) ? current : next
    })
    setCreatedFolderPaths((current) => {
      const next = new Set([...current].filter((folderPath) => !nodes.has(folderPath)))
      return areSetsEqual(current, next) ? current : next
    })

    if (selectedListItemKey.startsWith('folder:')) {
      const folderPath = selectedListItemKey.slice('folder:'.length)
      if (!childFolderPathSet.has(folderPath)) {
        setSelectedListItemKey('')
      }
    }
    if (selectedListItemKey.startsWith('song:')) {
      const songId = Number(selectedListItemKey.slice('song:'.length))
      if (!visibleSongIdSet.has(songId)) {
        setSelectedListItemKey('')
      }
    }

    if (folderMenu && !nodes.has(folderMenu.folder.relativePath)) {
      setFolderMenu(null)
    }
    if (folderAddMenu && !nodes.has(folderAddMenu.folder.relativePath)) {
      setFolderAddMenu(null)
    }
    if (songMenu && !songsById.has(songMenu.song.id)) {
      setSongMenu(null)
    }
    if (songAddMenu && !songsById.has(songAddMenu.song.id)) {
      setSongAddMenu(null)
    }
  }, [childFolders, folderAddMenu, folderMenu, nodes, selectedListItemKey, songAddMenu, songMenu, songsById, visibleSongIds])

  useEffect(() => {
    setSortMode(currentSortMode)
  }, [currentSortMode, currentRelativePath])

  useEffect(() => {
    window.localStorage.setItem('smplayer:local-view-mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    void refreshFolderPreferenceItems()
  }, [])

  const playShuffled = () => {
    if (queueSongIds.length === 0) {
      setLocalNotification(t('local.noMusicUnderCurrentFolder'))
      return
    }

    const shuffledSongIds = shuffleSongIds(queueSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const shuffleFolder = (folder: FolderNode) => {
    const shuffledSongIds = shuffleSongIds(folder.subtreeSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const folderPathExists = (parentRelativePath: string, folderName: string) => {
    const relativePath = parentRelativePath ? `${parentRelativePath}/${folderName}` : folderName
    return nodes.has(relativePath) || createdFolderPaths.has(relativePath)
  }

  const getNextFolderName = (parentRelativePath: string) => {
    const baseName = t('local.newFolderName')
    if (!folderPathExists(parentRelativePath, baseName)) {
      return baseName
    }

    let index = 1
    let nextName = `${baseName} (${index})`
    while (folderPathExists(parentRelativePath, nextName)) {
      index += 1
      nextName = `${baseName} (${index})`
    }
    return nextName
  }

  const getValidatedFolderName = (parentRelativePath: string, name: string, currentName = '') => {
    const nextName = name.trim()
    if (!nextName) {
      window.alert(t('local.folderNameEmpty'))
      return ''
    }
    if (nextName.length > 50) {
      window.alert(t('local.folderNameTooLong'))
      return ''
    }
    if (nextName !== currentName && folderPathExists(parentRelativePath, nextName)) {
      window.alert(t('local.folderNameUsed'))
      return ''
    }
    return nextName
  }

  const getFolderPreferenceMenuItem = (folder: FolderNode, keyPrefix: string): MenuFlyoutItem => {
    const preferenceItem = folderPreferenceItems.get(String(folder.id))

    return {
      key: `${keyPrefix}-folder-preference`,
      text: t('settings.preferenceSettings'),
      icon: 'star',
      submenu: [
        ...(preferenceItem
          ? [
              {
                key: `${keyPrefix}-folder-preference-undo`,
                text: t('preferences.undoPrefer'),
                onClick: () => {
                  void window.smplayer?.removePreferenceItem(preferenceItem.id).then(refreshFolderPreferenceItems)
                },
              },
              { key: `${keyPrefix}-folder-preference-undo-separator`, text: '', separator: true },
            ] satisfies MenuFlyoutItem[]
          : []),
        ...([
          'very-high',
          'higher',
          'high',
          'normal',
          'dislike',
          'do-not-appear',
        ] as PreferenceLevel[]).map((level) => ({
          key: `${keyPrefix}-folder-preference-${level}`,
          text: t(`preferences.level.${level}`),
          icon: preferenceItem?.level === level ? 'check' as const : undefined,
          onClick: () => {
            void window.smplayer?.addPreferenceItem('folder', String(folder.id), folder.name, level).then(refreshFolderPreferenceItems)
          },
        })),
      ],
    }
  }

  const createFolder = async () => {
    const name = window.prompt(t('local.newFolderPrompt'), getNextFolderName(currentRelativePath))
    if (!name) {
      return
    }

    const nextName = getValidatedFolderName(currentRelativePath, name)
    if (!nextName) {
      return
    }

    await onCreateFolder(currentRelativePath, nextName)
    const folderPath = currentRelativePath ? `${currentRelativePath}/${nextName}` : nextName
    setCreatedFolderPaths((current) => new Set(current).add(folderPath))
  }

  const createChildFolder = async (folder: FolderNode) => {
    const name = window.prompt(t('local.newFolderPrompt'), getNextFolderName(folder.relativePath))
    if (!name) {
      return
    }

    const nextName = getValidatedFolderName(folder.relativePath, name)
    if (!nextName) {
      return
    }

    await onCreateFolder(folder.relativePath, nextName)
    setFolderMenu(null)
  }

  const renameFolder = async (folder: FolderNode) => {
    const name = window.prompt(t('local.renameFolderPrompt'), folder.name)
    if (!name || name === folder.name) {
      return
    }

    const nextName = getValidatedFolderName(getParentPath(folder.relativePath), name, folder.name)
    if (!nextName) {
      return
    }

    await onRenameFolder(folder.path, nextName)
    setFolderMenu(null)
  }

  const deleteFolder = async (folder: FolderNode) => {
    if (!window.confirm(t('local.deleteFolderConfirm', { name: folder.name }))) {
      return
    }

    await onDeleteFolder(folder.path)
    setFolderMenu(null)
  }

  const hideFolder = async (folder: FolderNode) => {
    await onHideFolder(folder.path)
    showUndo(t('notification.hiddenStorageItem', { name: folder.name }), async () => {
      const hiddenItems = await window.smplayer!.getHiddenStorageItems()
      const hiddenItem = hiddenItems.find((item) => item.path === folder.path)
      await window.smplayer!.resumeHiddenStorageItem(hiddenItem!)
      await refresh()
    })
    ClearMultiSelectStatus()
    setFolderMenu(null)
  }

  const addFolderSongsToNowPlaying = (folder: FolderNode) => {
    onAddSongsToNowPlaying(folder.subtreeSongIds)
  }

  const addFolderSongsToPlaylist = (folder: FolderNode, playlistId: number) => {
    onAddSongsToPlaylist(playlistId, folder.subtreeSongIds)
  }

  const addSongToNowPlaying = (song: LibrarySong) => {
    onAddSongsToNowPlaying([song.id])
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

  const selectedFolderAbsolutePaths = effectiveSelectedFolderPaths.map((folderPath) => nodes.get(folderPath)!.path)
  const selectedMoveTargetFolders = [...nodes.values()].filter((folder) => {
    const songAlreadyInTarget = effectiveSelectedSongIds.some((songId) =>
      getSongFolderRelativePath(songsById.get(songId)!.path, rootPath) === folder.relativePath,
    )
    if (songAlreadyInTarget) {
      return false
    }

    return effectiveSelectedFolderPaths.every((selectedFolderPath) =>
      folder.relativePath !== selectedFolderPath &&
      folder.relativePath !== getParentPath(selectedFolderPath) &&
      !folder.relativePath.startsWith(`${selectedFolderPath}/`),
    )
  })

  const getFolderMoveToMenuItem = (sourceFolder: FolderNode) => {
    const sourceParentPath = getParentPath(sourceFolder.relativePath)
    const targetFolders = [...nodes.values()].filter((folder) => {
      if (folder.relativePath === sourceFolder.relativePath || folder.relativePath === sourceParentPath) {
        return false
      }
      return !folder.relativePath.startsWith(`${sourceFolder.relativePath}/`)
    })

    if (targetFolders.length === 0) {
      return null
    }

    const childrenByParentPath = new Map<string, FolderNode[]>()
    for (const folder of targetFolders) {
      const parentPath = folder.relativePath ? getParentPath(folder.relativePath) : ''
      childrenByParentPath.set(parentPath, [...(childrenByParentPath.get(parentPath) ?? []), folder])
    }

    const toItem = (folder: FolderNode): MenuFlyoutItem => {
      const children = (childrenByParentPath.get(folder.relativePath) ?? [])
        .filter((child) => child.relativePath !== folder.relativePath)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))

      return {
        key: `move-folder-${folder.relativePath || 'root'}`,
        text: folder.relativePath ? folder.name : t('local.libraryRoot'),
        icon: 'folder',
        onClick: children.length === 0
          ? () => onMoveFolderToFolder(sourceFolder.path, folder.path)
          : undefined,
        submenu: children.length > 0
          ? [
              {
                key: `move-folder-${folder.relativePath || 'root'}-self`,
                text: folder.relativePath ? folder.name : t('local.libraryRoot'),
                icon: 'folder',
                onClick: () => onMoveFolderToFolder(sourceFolder.path, folder.path),
              },
              { key: `move-folder-${folder.relativePath || 'root'}-separator`, text: '', separator: true },
              ...children.map(toItem),
            ]
          : undefined,
      }
    }

    const roots = targetFolders
      .filter((folder) => !folder.relativePath || !targetFolders.some((item) => item.relativePath === getParentPath(folder.relativePath)))
      .sort((left, right) => left.name.localeCompare(right.name))

    return {
      key: 'move-folder-to-folder',
      text: t('context.moveToFolder'),
      icon: 'folder',
      submenu: roots.map(toItem),
    } satisfies MenuFlyoutItem
  }

  const updateSortMode = async (nextSortMode: LocalSortMode) => {
    if (PleaseExitMultiSelectMode()) {
      return
    }

    setSortMode(nextSortMode)
    if (nextSortMode !== 'reverse') {
      await onUpdateFolderSort(currentNode!.path, nextSortMode)
    }
  }

  const updateFolderSortMode = async (folder: FolderNode, nextSortMode: LocalSortMode) => {
    if (PleaseExitMultiSelectMode()) {
      return
    }

    if (nextSortMode !== 'reverse') {
      await onUpdateFolderSort(folder.path, nextSortMode)
    }
    if (folder.relativePath === currentRelativePath) {
      setSortMode(nextSortMode)
    }
    setFolderMenu(null)
  }

  const switchViewMode = (nextViewMode: LocalViewMode) => {
    if (PleaseExitMultiSelectMode()) {
      return
    }

    setViewMode(nextViewMode)
  }

  const showToolbarMenu = (event: MouseEvent<HTMLElement>, kind: LocalToolbarMenuState['kind']) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setToolbarMenu({
      kind,
      x: rect.left,
      y: rect.bottom + 6,
    })
    setFolderMenu(null)
    setSongMenu(null)
    setFolderAddMenu(null)
    setSongAddMenu(null)
    setSelectionAddMenu(null)
  }

  const refreshFolderWithResult = async (folder: FolderNode) => {
    const result = await onRefreshFolder(folder.path)
    if (result) {
      setLocalNotification(getRefreshResultMessage(result, t))
    }
    setFolderMenu(null)
  }

  const selectFolder = (folder: FolderNode) => {
    setMultiSelect(true)
    setSelectedFolderPaths(new Set([folder.relativePath]))
    setSelectedSongIds(new Set())
    setFolderMenu(null)
  }

  const selectSong = (songId: number) => {
    setMultiSelect(true)
    setSelectedSongIds(new Set([songId]))
    setSelectedFolderPaths(new Set())
    setSongMenu(null)
  }

  const moveSelectedItemsToFolder = async (folderPath: string) => {
    await onMoveSongsToFolder(effectiveSelectedSongIds, folderPath)
    for (const sourceFolderPath of selectedFolderAbsolutePaths) {
      await onMoveFolderToFolder(sourceFolderPath, folderPath)
    }
    HideMultiSelectAfterOperation()
  }

  const deleteSelectedItems = async () => {
    const selectedCount = effectiveSelectedSongIds.length + selectedFolderAbsolutePaths.length
    if (!window.confirm(t('local.deleteSelectedConfirm', { count: selectedCount }))) {
      return
    }

    await onDeleteLocalItems(effectiveSelectedSongIds, selectedFolderAbsolutePaths)
    HideMultiSelectAfterOperation()
  }

  const searchDirectory = (folder: FolderNode) => {
    const query = window.prompt(t('local.searchDirectoryPrompt', { name: folder.name }))
    if (!query?.trim()) {
      return
    }

    onSearchDirectory(query, folder.relativePath)
    setFolderMenu(null)
  }

  const dragPayloadForFolder = (folder: FolderNode) => ({
    songIds: [],
    folderPaths: selectedFolderPaths.has(folder.relativePath) ? selectedFolderAbsolutePaths : [folder.path],
  })

  const dragPayloadForSong = (song: LibrarySong) => ({
    songIds: selectedSongIds.has(song.id) ? effectiveSelectedSongIds : [song.id],
    folderPaths: [],
  })

  const moveDraggedItems = async (event: DragEvent, targetFolder: FolderNode) => {
    event.preventDefault()
    const rawPayload = event.dataTransfer.getData('application/x-smplayer-local-items')
    if (!rawPayload) {
      return
    }

    const payload = JSON.parse(rawPayload) as { songIds: number[]; folderPaths: string[] }
    await onMoveSongsToFolder(payload.songIds, targetFolder.path)
    for (const folderPath of payload.folderPaths) {
      await onMoveFolderToFolder(folderPath, targetFolder.path)
    }
    ClearMultiSelectStatus()
  }

  if (!rootPath) {
    return (
      <section className="page-panel local-page">
        <div className="empty-state">
          <h3>{t('local.noRoot')}</h3>
          <p>{t('local.noRootCopy')}</p>
          <button className="local-command" type="button" onClick={onPickLibraryRoot}>
            <Icon name="folder" />
            {t('library.chooseFolder')}
          </button>
          <Link className="local-command" to="/settings">
            <Icon name="settings" />
            {t('local.goToSettings')}
          </Link>
        </div>
      </section>
    )
  }

  if (!currentNode) {
    return (
      <section className="page-panel local-page">
        <div className="empty-state">
          <h3>{t('local.folderNotFound')}</h3>
          <p>{t('local.folderNotFoundDescription')}</p>
          <Link className="local-command" to="/local">
            <Icon name="arrowLeft" />
            {t('local.backToRoot')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="page-panel local-page">
      <div className="local-toolbar">
        <p>
          {t('local.headerStats', {
            folders: childFolders.length,
            songs: currentSongs.length,
          })}
        </p>
        <div className="local-commandbar">
          <button className="local-command" type="button" onClick={playShuffled}>
            <Icon name="shuffle" />
            {t('nowPlaying.randomPlay')}
          </button>
          <button
            className="local-command"
            type="button"
            onClick={() => {
              void refreshFolderWithResult(currentNode)
            }}
            disabled={scanning}
          >
            <Icon name="recent" />
            {scanning ? t('library.scanning') : t('local.updateFolder')}
          </button>
          <button
            className="local-command"
            type="button"
            onClick={(event) => {
              showToolbarMenu(event, 'sort')
            }}
          >
            <Icon name="sort" />
            {t('common.sort')}
          </button>
          <button className="local-command" type="button" onClick={createFolder}>
            <Icon name="folder" />
            {t('local.newFolder')}
          </button>
          <button
            className="local-command"
            type="button"
            onClick={(event) => {
              showToolbarMenu(event, 'view')
            }}
          >
            <Icon name="selectAll" />
            {viewMode === 'grid' ? t('local.viewGrid') : t('local.viewList')}
          </button>
          <button
            className={multiSelect ? 'local-command is-active' : 'local-command'}
            type="button"
            onClick={() => {
              if (multiSelect) {
                return
              }
              setMultiSelect(true)
              setLocalNotification('')
            }}
          >
            <Icon name="check" />
            {t('albums.multiSelect')}
          </button>
        </div>
      </div>

      {loading ? <div className="root-banner">{t('library.refreshing')}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {localNotification ? <div className="root-banner">{localNotification}</div> : null}

      {multiSelect ? (
        <div className="local-selection-bar">
          <strong>
            {t('albums.selectedCount', {
              count: effectiveSelectedFolderPaths.length + effectiveSelectedSongIds.length,
            })}
          </strong>
          <button
            type="button"
            disabled={selectedQueueSongIds.length === 0}
            onClick={() => {
              onPlayTrack(selectedQueueSongIds[0]!, selectedQueueSongIds)
              HideMultiSelectAfterOperation()
            }}
          >
            <Icon name="play" />
            {t('albums.playSelected')}
          </button>
          <button
            type="button"
            disabled={selectedQueueSongIds.length === 0}
            onClick={(event) => {
              setSelectionAddMenu({ x: event.clientX, y: event.clientY })
            }}
          >
            <Icon name="plus" />
            {t('context.addToPlaylist')}
          </button>
          <label className="local-selection-select">
            <Icon name="folder" />
            <span>{t('context.moveToFolder')}</span>
            <select
              defaultValue=""
              disabled={effectiveSelectedFolderPaths.length + effectiveSelectedSongIds.length === 0 || selectedMoveTargetFolders.length === 0}
              onChange={(event) => {
                const folderPath = event.currentTarget.value
                event.currentTarget.value = ''
                void moveSelectedItemsToFolder(folderPath)
              }}
            >
              <option value="" disabled>
                {t('context.moveToFolder')}
              </option>
              {selectedMoveTargetFolders.map((folder) => (
                <option key={folder.path} value={folder.path}>
                  {folder.relativePath || t('local.libraryRoot')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={effectiveSelectedFolderPaths.length + effectiveSelectedSongIds.length === 0}
            onClick={() => {
              void deleteSelectedItems()
            }}
          >
            <Icon name="trash" />
            {t('playlists.delete')}
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
              setSelectedFolderPaths((current) => new Set(childFolders
                .map((folder) => folder.relativePath)
                .filter((folderPath) => !current.has(folderPath))))
              setSelectedSongIds((current) => new Set(visibleSongIds.filter((songId) => !current.has(songId))))
            }}
          >
            <Icon name="repeat" />
            {t('albums.reverseSelection')}
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
          <button
            type="button"
            onClick={() => {
              ClearMultiSelectStatus()
            }}
          >
            <Icon name="clearSelection" />
            {t('common.cancel')}
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
          {songs.length === 0 ? (
            <Link className="local-command" to="/settings">
              <Icon name="settings" />
              {t('local.goToSettings')}
            </Link>
          ) : null}
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
                  onPlayFolder={shuffleFolder}
                  onAddFolder={(event, folder) => {
                    setFolderAddMenu({ folder, x: event.clientX, y: event.clientY })
                  }}
                  onOpenFolder={openFolder}
                  onToggleSelection={toggleFolderSelection}
                  onDragStart={(event, folder) => {
                    event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForFolder(folder)))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDrop={(event, folder) => {
                    void moveDraggedItems(event, folder)
                  }}
                  onOpenFolderMenu={(folder, x, y) => {
                    setFolderMenu({ folder, x, y })
                  }}
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
                  onMoveToMusicOrPlay={onMoveToMusicOrPlay}
                  onToggleSelection={toggleSongSelection}
                  onOpenAddMenu={(event, song) => {
                    setSongAddMenu({ song, x: event.clientX, y: event.clientY })
                  }}
                  onDragStart={(event, song) => {
                    event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onOpenSongMenu={(song, x, y) => {
                    setSongMenu({ song, x, y })
                  }}
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
                  className={joinClassNames(
                    !multiSelect && selectedListItemKey === getFolderListItemKey(folder.relativePath) && 'is-selected',
                    multiSelect && selectedFolderPaths.has(folder.relativePath) && 'is-selected',
                  )}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForFolder(folder)))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    void moveDraggedItems(event, folder)
                  }}
                  onClick={() => {
                    if (multiSelect) {
                      toggleFolderSelection(folder.relativePath)
                    } else {
                      setSelectedListItemKey(getFolderListItemKey(folder.relativePath))
                    }
                  }}
                  onDoubleClick={() => {
                    if (!multiSelect) {
                      openFolder(folder.relativePath)
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setFolderMenu({ folder, x: event.clientX, y: event.clientY })
                  }}
                >
                  <td>
                    {multiSelect ? (
                      <span className={selectedFolderPaths.has(folder.relativePath) ? 'local-check is-selected' : 'local-check'}>
                        {selectedFolderPaths.has(folder.relativePath) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    <button className="table-link table-link-button" type="button">
                      {folder.name}
                    </button>
                  </td>
                  <td>{t('common.folders')}</td>
                  <td>{t('local.childFolderCount', { count: folder.childPaths.length })}</td>
                  <td>{t('local.folderSongs', { count: folder.subtreeSongIds.length })}</td>
                  <td className="local-path-cell">{folder.relativePath || t('local.libraryRoot')}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action-button subtle"
                      onClick={(event) => {
                        event.stopPropagation()
                        void hideFolder(folder)
                      }}
                    >
                      {t('local.hideFolder')}
                    </button>
                  </td>
                </tr>
              ))}
              {currentSongs.map((song) => (
                <tr
                  key={`${currentNode.relativePath}-${song.id}`}
                  className={joinClassNames(
                    song.id === selectedTrackId && 'is-current',
                    !multiSelect && selectedListItemKey === getSongListItemKey(song.id) && 'is-selected',
                    multiSelect && selectedSongIds.has(song.id) && 'is-selected',
                  )}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => {
                    if (multiSelect) {
                      toggleSongSelection(song.id)
                    } else {
                      setSelectedListItemKey(getSongListItemKey(song.id))
                    }
                  }}
                  onDoubleClick={() => {
                    if (!multiSelect) {
                      onPlayTrack(song.id, queueSongIds)
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setSongMenu({ song, x: event.clientX, y: event.clientY })
                  }}
                >
                  <td>
                    {multiSelect ? (
                      <span className={selectedSongIds.has(song.id) ? 'local-check is-selected' : 'local-check'}>
                        {selectedSongIds.has(song.id) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    {song.title}
                    {!multiSelect ? (
                      <span className="local-table-song-actions">
                        <button
                          type="button"
                          title={song.id === selectedTrackId && isPlaying ? t('context.pause') : t('context.play')}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (song.id === selectedTrackId && isPlaying) {
                              onTogglePlayPause()
                            } else {
                              onPlayTrack(song.id, queueSongIds)
                            }
                          }}
                        >
                          <Icon name={song.id === selectedTrackId && isPlaying ? 'pause' : 'play'} />
                        </button>
                        <button
                          type="button"
                          title={t('context.addToPlaylist')}
                          onClick={(event) => {
                            event.stopPropagation()
                            setSongAddMenu({ song, x: event.clientX, y: event.clientY })
                          }}
                        >
                          <Icon name="plus" />
                        </button>
                        <button
                          type="button"
                          title={t('context.playNext')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onPlayNext(song.id)
                          }}
                        >
                          <Icon name="next" />
                        </button>
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {getSongArtists(song).map((artist, index) => (
                      <span key={artist}>
                        {index > 0 ? ', ' : null}
                        <Link
                          className="table-link"
                          to={`/artists/${encodeURIComponent(artist)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {artist}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td>
                    <Link
                      className="table-link"
                      to={`/albums/${encodeURIComponent(song.album || t('common.albumUnknown'))}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {song.album || t('common.albumUnknown')}
                    </Link>
                  </td>
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
      {folderMenu ? (
        <MenuFlyout
          position={folderMenu}
          onClose={() => {
            setFolderMenu(null)
          }}
          items={[
            {
              key: 'shuffle-folder',
              text: t('nowPlaying.randomPlay'),
              icon: 'shuffle',
              disabled: folderMenu.folder.subtreeSongIds.length === 0,
              onClick: () => shuffleFolder(folderMenu.folder),
            },
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: folderMenu.folder.subtreeSongIds,
              t,
              defaultPlaylistName: folderMenu.folder.name,
              includeNowPlaying: true,
              includeFavorites: true,
              onAddToNowPlaying: () => addFolderSongsToNowPlaying(folderMenu.folder),
              onToggleFavorite: () => onAddSongsToPlaylist(favoritePlaylist.id, folderMenu.folder.subtreeSongIds),
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderMenu.folder.subtreeSongIds),
              onAddToPlaylist: (playlistId) => addFolderSongsToPlaylist(folderMenu.folder, playlistId),
            }),
            {
              key: 'select-folder',
              text: t('context.select'),
              icon: 'menu',
              onClick: () => selectFolder(folderMenu.folder),
            },
            getFolderMoveToMenuItem(folderMenu.folder),
            getFolderPreferenceMenuItem(folderMenu.folder, 'folder'),
            {
              key: 'show-in-explorer',
              text: t('context.reveal'),
              pendingText: t('context.openingLocal'),
              icon: 'folder',
              onClick: () => onRevealFolder(folderMenu.folder.path),
            },
            {
              key: 'new-folder',
              text: t('local.newFolder'),
              icon: 'plus',
              onClick: () => createChildFolder(folderMenu.folder),
            },
            {
              key: 'delete-folder',
              text: t('playlists.delete'),
              icon: 'trash',
              onClick: () => deleteFolder(folderMenu.folder),
            },
            {
              key: 'refresh-folder',
              text: t('settings.rescan'),
              icon: 'recent',
              onClick: () => refreshFolderWithResult(folderMenu.folder),
            },
            {
              key: 'rename-folder',
              text: t('playlists.rename'),
              icon: 'info',
              onClick: () => renameFolder(folderMenu.folder),
            },
            {
              key: 'folder-sort',
              text: t('common.sort'),
              icon: 'sort',
              submenu: [
                { key: 'folder-sort-reverse', text: t('albums.sortReverse'), sortMode: 'reverse' },
                { key: 'folder-sort-title', text: t('search.sortTitle'), sortMode: 'title' },
                { key: 'folder-sort-artist', text: t('common.artist'), sortMode: 'artist' },
                { key: 'folder-sort-album', text: t('common.album'), sortMode: 'album' },
              ].map((item) => ({
                key: item.key,
                text: item.text,
                icon: localSortModeFromCriterion(folderMenu.folder.criterion) === item.sortMode ? 'check' as const : undefined,
                onClick: () => updateFolderSortMode(folderMenu.folder, item.sortMode as LocalSortMode),
              })),
            },
            {
              key: 'search-directory',
              text: t('local.searchDirectory'),
              icon: 'search',
              onClick: () => searchDirectory(folderMenu.folder),
            },
            {
              key: 'hide-folder',
              text: t('local.hideFolder'),
              icon: 'hiddenFolders',
              onClick: () => hideFolder(folderMenu.folder),
            },
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
      {selectionAddMenu ? (
        <MenuFlyout
          position={selectionAddMenu}
          onClose={() => {
            setSelectionAddMenu(null)
          }}
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: selectedQueueSongIds,
              t,
              defaultPlaylistName: currentNode.name,
              includeNowPlaying: true,
              includeFavorites: true,
              onAddToNowPlaying: () => {
                onAddSongsToNowPlaying(selectedQueueSongIds)
                HideMultiSelectAfterOperation()
              },
              onToggleFavorite: () => {
                onAddSongsToPlaylist(favoritePlaylist.id, selectedQueueSongIds)
                HideMultiSelectAfterOperation()
              },
              onCreatePlaylist: (name) => {
                onCreatePlaylistWithSongs(name, selectedQueueSongIds)
                HideMultiSelectAfterOperation()
              },
              onAddToPlaylist: (playlistId) => {
                onAddSongsToPlaylist(playlistId, selectedQueueSongIds)
                HideMultiSelectAfterOperation()
              },
            }),
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
      {toolbarMenu ? (
        <MenuFlyout
          position={toolbarMenu}
          onClose={() => {
            setToolbarMenu(null)
          }}
          items={(toolbarMenu.kind === 'sort'
            ? [
                { key: 'toolbar-sort-reverse', text: t('albums.sortReverse'), icon: sortMode === 'reverse' ? 'check' : undefined, onClick: () => updateSortMode('reverse') },
                { key: 'toolbar-sort-title', text: t('search.sortTitle'), icon: sortMode === 'title' ? 'check' : undefined, onClick: () => updateSortMode('title') },
                { key: 'toolbar-sort-artist', text: t('common.artist'), icon: sortMode === 'artist' ? 'check' : undefined, onClick: () => updateSortMode('artist') },
                { key: 'toolbar-sort-album', text: t('common.album'), icon: sortMode === 'album' ? 'check' : undefined, onClick: () => updateSortMode('album') },
              ]
            : [
                { key: 'toolbar-view-list', text: t('local.viewList'), icon: viewMode === 'list' ? 'check' : undefined, onClick: () => switchViewMode('list') },
                { key: 'toolbar-view-grid', text: t('local.viewGrid'), icon: viewMode === 'grid' ? 'check' : undefined, onClick: () => switchViewMode('grid') },
              ]) as MenuFlyoutItem[]}
        />
      ) : null}
      {folderAddMenu ? (
        <MenuFlyout
          position={folderAddMenu}
          onClose={() => {
            setFolderAddMenu(null)
          }}
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: folderAddMenu.folder.subtreeSongIds,
              t,
              defaultPlaylistName: folderAddMenu.folder.name,
              includeNowPlaying: true,
              includeFavorites: true,
              onAddToNowPlaying: () => addFolderSongsToNowPlaying(folderAddMenu.folder),
              onToggleFavorite: () => onAddSongsToPlaylist(favoritePlaylist.id, folderAddMenu.folder.subtreeSongIds),
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderAddMenu.folder.subtreeSongIds),
              onAddToPlaylist: (playlistId) => addFolderSongsToPlaylist(folderAddMenu.folder, playlistId),
            }),
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
      {songAddMenu ? (
        <MenuFlyout
          position={songAddMenu}
          onClose={() => {
            setSongAddMenu(null)
          }}
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: [songAddMenu.song.id],
              t,
              defaultPlaylistName: songAddMenu.song.title,
              includeNowPlaying: true,
              includeFavorites: !songAddMenu.song.favorite,
              onAddToNowPlaying: () => addSongToNowPlaying(songAddMenu.song),
              onToggleFavorite: () => onToggleFavorite(songAddMenu.song.id, true),
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, [songAddMenu.song.id]),
              onAddToPlaylist: (playlistId) => onAddSongToPlaylist(playlistId, songAddMenu.song.id),
            }),
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
      {songMenu ? (
        <MusicMenuFlyout
          menu={songMenu}
          playlists={playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onClose={() => {
            setSongMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          onAddSongToPlaylist={onAddSongToPlaylist}
          showSelect
          showMoveToFolder
          showHideFile
          onSelectSong={selectSong}
        />
      ) : null}
    </section>
  )
}

function LocalFolderCard({
  folder,
  selected,
  multiSelect,
  t,
  onPlayFolder,
  onAddFolder,
  onOpenFolder,
  onToggleSelection,
  onDragStart,
  onDrop,
  onOpenFolderMenu,
}: {
  folder: FolderNode
  selected: boolean
  multiSelect: boolean
  t: Translator
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (event: MouseEvent, folder: FolderNode) => void
  onOpenFolder: (targetRelativePath: string) => void
  onToggleSelection: (folderPath: string) => void
  onDragStart: (event: DragEvent, folder: FolderNode) => void
  onDrop: (event: DragEvent, folder: FolderNode) => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
}) {
  const openFolder = () => onOpenFolder(folder.relativePath)
  const openFolderOnKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFolder()
    }
  }
  const content = (
    <GridArtworkCardContent
      actions={multiSelect ? [] : [
        {
          key: 'play',
          title: t('local.gridFolderPlayInfo', { name: folder.name }),
          icon: 'play',
          disabled: folder.subtreeSongIds.length === 0,
          onClick: () => onPlayFolder(folder),
        },
        {
          key: 'add',
          title: t('context.addToPlaylist'),
          icon: 'plus',
          disabled: folder.subtreeSongIds.length === 0,
          onClick: (event) => onAddFolder(event, folder),
        },
      ]}
      artworkUrls={folder.thumbnailUrls}
      badge={<FolderTypeBadge />}
      fallbackIcon="folder"
      selectedMark={multiSelect ? (
        <span className={selected ? 'local-card-check is-selected' : 'local-card-check'}>
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
      subtitle={folder.childPaths.length > 0
        ? t('local.folderCardStats', { folders: folder.childPaths.length, songs: folder.subtreeSongIds.length })
        : t('local.folderSongsShort', { count: folder.subtreeSongIds.length })}
      title={folder.name}
    />
  )

  if (multiSelect) {
    return (
      <button
        type="button"
        className={selected ? 'local-folder-card is-selected' : 'local-folder-card'}
        draggable
        onDragStart={(event) => onDragStart(event, folder)}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => onDrop(event, folder)}
        onContextMenu={(event) => {
          event.preventDefault()
          onOpenFolderMenu(folder, event.clientX, event.clientY)
        }}
        onClick={() => {
          onToggleSelection(folder.relativePath)
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <article
      role="button"
      tabIndex={0}
      className="local-folder-card"
      draggable
      onDragStart={(event) => onDragStart(event, folder)}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => onDrop(event, folder)}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenFolderMenu(folder, event.clientX, event.clientY)
      }}
      onClick={openFolder}
      onKeyDown={openFolderOnKeyDown}
    >
      <span className="local-folder-card-main">
        {content}
      </span>
    </article>
  )
}

function FolderTypeBadge() {
  return (
    <span className="local-folder-type-badge" aria-hidden="true">
      <img src="/folder.png" alt="" />
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
  onMoveToMusicOrPlay,
  onToggleSelection,
  onOpenAddMenu,
  onDragStart,
  onOpenSongMenu,
}: {
  song: LibrarySong
  selected: boolean
  current: boolean
  multiSelect: boolean
  queueSongIds: number[]
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onToggleSelection: (songId: number) => void
  onOpenAddMenu: (event: MouseEvent, song: LibrarySong) => void
  onDragStart: (event: DragEvent, song: LibrarySong) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
}) {
  const openSong = () => {
    if (multiSelect) {
      onToggleSelection(song.id)
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }
  const openSongOnKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openSong()
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      className={selected ? 'local-song-card is-selected' : current ? 'local-song-card is-current' : 'local-song-card'}
      draggable
      onDragStart={(event) => onDragStart(event, song)}
      onClick={openSong}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenSongMenu(song, event.clientX, event.clientY)
      }}
      onKeyDown={openSongOnKeyDown}
    >
      <ArtworkImage
        className="local-song-artwork"
        src={song.artworkUrl}
        title={song.title}
        renderFallback={() => (
          <span className="local-song-artwork local-song-artwork-fallback">
            <DefaultAlbumArtwork className="local-song-artwork-fallback-image" />
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
      {!multiSelect ? (
        <span className="local-song-card-actions">
          <button
            title={t('local.gridMusicPlayInfo', { name: song.title })}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onMoveToMusicOrPlay(song.id)
            }}
          >
            <Icon name="play" />
          </button>
          <button
            title={t('context.addToPlaylist')}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpenAddMenu(event, song)
            }}
          >
            <Icon name="plus" />
          </button>
        </span>
      ) : null}
    </article>
  )
}
