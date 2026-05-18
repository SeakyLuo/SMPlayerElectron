import { getDisplayArtists } from '../shared/artists'
import type { LibraryFolder, LibrarySong, LocalFolderSortCriterion } from '../shared/contracts'
import { compareLocalText } from '../shared/textCompare'

export type LocalSortMode = LocalFolderSortCriterion

export interface FolderNode {
  id: number
  relativePath: string
  path: string
  name: string
  thumbnailUrls: string[]
  childPaths: string[]
  directSongIds: number[]
  subtreeSongIds: number[]
  thumbnailChildPaths: string[]
  thumbnailDirectSongIds: number[]
  thumbnailSubtreeSongIds: number[]
  criterion: number
}

export interface FolderChainItem {
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

export function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getSongFolderRelativePath(songPath: string, rootPath: string) {
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

export function createFolderNode(relativePath: string, rootPath: string): FolderNode {
  return {
    relativePath,
    id: 0,
    path: getFolderAbsolutePath(relativePath, rootPath),
    name: getFolderDisplayName(relativePath, rootPath),
    thumbnailUrls: [],
    childPaths: [],
    directSongIds: [],
    subtreeSongIds: [],
    thumbnailChildPaths: [],
    thumbnailDirectSongIds: [],
    thumbnailSubtreeSongIds: [],
    criterion: 0,
  }
}

function getAlbumSongGroups(songIds: number[], songsById: Map<number, LibrarySong>) {
  const albumSongs = new Map<string, LibrarySong[]>()

  for (const songId of songIds) {
    const song = songsById.get(songId)!
    const groupSongs = albumSongs.get(song.album)
    if (groupSongs) {
      groupSongs.push(song)
    } else {
      albumSongs.set(song.album, [song])
    }
  }

  return [...albumSongs.values()]
}

export function getOriginalFolderThumbnailCandidateGroups(
  node: FolderNode,
  nodes: Map<string, FolderNode>,
  songsById: Map<number, LibrarySong>,
) {
  const candidateGroups = getAlbumSongGroups(node.thumbnailDirectSongIds, songsById)

  for (const childPath of node.thumbnailChildPaths) {
    const childNode = nodes.get(childPath)!
    candidateGroups.push(...getAlbumSongGroups(childNode.thumbnailSubtreeSongIds, songsById))
  }

  return candidateGroups
}

function getFolderFlattenedSongIds(node: FolderNode, nodes: Map<string, FolderNode>): number[] {
  return [
    ...node.childPaths.flatMap((childPath) => getFolderFlattenedSongIds(nodes.get(childPath)!, nodes)),
    ...node.directSongIds,
  ]
}

function getFolderFlattenedThumbnailSongIds(node: FolderNode, nodes: Map<string, FolderNode>): number[] {
  return [
    ...node.thumbnailChildPaths.flatMap((childPath) => getFolderFlattenedThumbnailSongIds(nodes.get(childPath)!, nodes)),
    ...node.thumbnailDirectSongIds,
  ]
}

function compareSongByFolderCriterion(left: LibrarySong, right: LibrarySong, criterion: number): number {
  switch (criterion) {
    case 1:
      return compareLocalText(getDisplayArtists(left), getDisplayArtists(right)) ||
        compareLocalText(left.title, right.title)
    case 2:
      return compareLocalText(left.album, right.album) ||
        compareLocalText(left.title, right.title)
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

export function getParentPath(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.slice(0, -1).join('/')
}

export function buildFolderIndex(songs: LibrarySong[], folders: LibraryFolder[], rootPath: string) {
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
    node.thumbnailChildPaths = node.childPaths.slice().sort((left, right) => nodes.get(left)!.id - nodes.get(right)!.id)
    node.thumbnailDirectSongIds = node.directSongIds.slice().sort((left, right) => left - right)
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
    node.thumbnailSubtreeSongIds = getFolderFlattenedThumbnailSongIds(node, nodes)
  }

  return { nodes, songsById }
}

export function matchesSongSearch(song: LibrarySong, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return [song.title, song.artist, ...song.artists, song.album, song.path]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedSearchQuery)
}

export function buildFolderChain(
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

export function sortFolders(folders: FolderNode[]) {
  return folders.slice().sort((left, right) => compareLocalText(left.name, right.name))
}

export function sortSongs(songs: LibrarySong[], mode: LocalSortMode, baseMode: LocalSortMode = mode): LibrarySong[] {
  if (mode === 'reverse') {
    return sortSongs(songs, baseMode === 'reverse' ? 'title' : baseMode).reverse()
  }

  return songs.slice().sort((left, right) => {
    if (mode === 'artist') {
      return compareLocalText(getDisplayArtists(left), getDisplayArtists(right)) ||
        compareLocalText(left.title, right.title)
    }

    if (mode === 'album') {
      return compareLocalText(left.album, right.album) ||
        compareLocalText(left.title, right.title)
    }

    return compareLocalText(left.title, right.title)
  })
}

export function localSortModeFromCriterion(criterion: number): LocalSortMode {
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

export function shuffleSongIds(songIds: number[]) {
  const shuffledSongIds = songIds.slice()

  for (let index = shuffledSongIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffledSongIds[index]
    shuffledSongIds[index] = shuffledSongIds[randomIndex]
    shuffledSongIds[randomIndex] = current
  }

  return shuffledSongIds
}
