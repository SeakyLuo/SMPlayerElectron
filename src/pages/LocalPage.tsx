import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { InputDialog } from '../components/InputDialog'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getAddToPlaylistMenuFlyoutItems, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout } from '../components/MusicMenuFlyout'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { RemoveDialog } from '../components/RemoveDialog'
import { useFolderPreferenceMenuItem } from '../hooks/useFolderPreferenceMenuItem'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import { useSongsAddedUndo } from '../hooks/useSongsAddedUndo'
import type { ArtistSplitResultItem, LibraryFolder, LibraryPlaylist, LibrarySong, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useStoredMultiSelect, useStoredNumberSet, useStoredStringSet } from '../state/usePageSelectionStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { MONOTONE_ICON_URL } from '../shared/staticAssets'
import {
  buildFolderIndex,
  createFolderNode,
  getParentPath,
  getSongFolderRelativePath,
  localSortModeFromCriterion,
  matchesSongSearch,
  shuffleSongIds,
  sortFolders,
  sortSongs,
  type FolderNode,
} from './localFolderModel'
import { buildLocalMoveToFolderMenuItems } from './localMoveToFolderMenu'
import { FolderUpdateResultDialog } from './FolderUpdateResultDialog'
import { LocalGridContent } from './LocalGridContent'
import { LocalTableContent } from './LocalTableContent'
import {
  areSetsEqual,
  buildLocalSongQuickJumpMap,
  getLocalSongQuickJumpBasisName,
  getRefreshFolderErrorMessage,
  getRefreshResultMessage,
  hasRefreshResultChanges,
  type LocalSortMode,
} from './localPageModel'

const LOCAL_COMPACT_BREAKPOINT = 720
const LOCAL_ITEMS_DRAG_TYPE = 'application/x-smplayer-local-items'

interface LocalItemsDragPayload {
  songIds: number[]
  folderPaths: string[]
}

interface LocalPageProps {
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
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
  onOpenFolder: (targetRelativePath: string) => void
  onRefreshFolder: (folderPath: string) => void | ScanLibraryResult | null | Promise<ScanLibraryResult | null | void>
  onApplyArtistSplits: (splits: ArtistSplitResultItem[]) => void | Promise<void>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onAddNextAndPlay: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onRevealFolder: (folderPath: string) => void | Promise<void>
  onCreateFolder: (relativePath: string, name: string) => void | Promise<void>
  onRenameFolder: (folderPath: string, name: string) => void | Promise<void>
  onHideFolder: (folderPath: string) => void | Promise<void>
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onDeleteSongFromDisk: (songId: number) => void
  onMoveLocalItemsToFolder: (songIds: number[], folderPaths: string[], targetFolderPath: string) => void | Promise<void>
  onDeleteLocalItems: (songIds: number[], folderPaths: string[]) => void | Promise<void>
  onUpdateFolderSort: (folderPath: string, sortCriterion: LocalSortMode) => void | Promise<void>
  onSearchDirectory: (query: string, folderRelativePath: string) => void
  onHiddenFoldersListButtonClick: () => void
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
type LocalSelectionMoveMenuState = MenuFlyoutPosition

type LocalToolbarMenuState = MenuFlyoutPosition

interface FolderUpdateResultDialogState {
  folder: FolderNode
  result: ScanLibraryResult
}

interface FolderUpdateResultSongMenuState extends MenuFlyoutPosition {
  song: LibrarySong
}

function getAbsoluteParentPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

function getAbsolutePathName(filePath: string) {
  return filePath.split(/[\\/]+/).at(-1)!
}

function joinAbsolutePath(parentPath: string, name: string) {
  const separator = parentPath.includes('\\') ? '\\' : '/'
  return `${parentPath.replace(/[\\/]+$/, '')}${separator}${name}`
}

function LocalEmptyState({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="empty-state local-empty-state">
      <span className="local-empty-state-artwork" aria-hidden="true">
        <img src={MONOTONE_ICON_URL} alt="" />
      </span>
      {children}
    </div>
  )
}

export function LocalPage({
  songs,
  folders,
  playlists,
  favoritePlaylistId,
  t,
  rootPath,
  currentRelativePath: routeRelativePath,
  searchQuery,
  selectedTrackId,
  isPlaying,
  loading,
  scanning,
  onPickLibraryRoot,
  onOpenFolder,
  onRefreshFolder,
  onApplyArtistSplits,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onAddNextAndPlay,
  onRevealSong,
  onRevealFolder,
  onCreateFolder,
  onRenameFolder,
  onHideFolder,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onToggleFavorite,
  onDeleteSongFromDisk,
  onMoveLocalItemsToFolder,
  onDeleteLocalItems,
  onUpdateFolderSort,
  onSearchDirectory,
  onHiddenFoldersListButtonClick,
}: LocalPageProps) {
  const currentRelativePath = routeRelativePath
  const previousRelativePathRef = useRef(currentRelativePath)
  const [sortMode, setSortMode] = useState<LocalSortMode>('title')
  const [multiSelect, setMultiSelect] = useStoredMultiSelect('local')
  const [selectedFolderPaths, setSelectedFolderPaths] = useStoredStringSet('local', 'selectedFolderPaths')
  const [selectedSongIds, setSelectedSongIds] = useStoredNumberSet('local', 'selectedSongIds')
  const [selectedListItemKey, setSelectedListItemKey] = useState('')
  const [createdFolderPaths, setCreatedFolderPaths] = useState<Set<string>>(new Set())
  const [, setLocalNotification] = useState('')
  const [folderUpdateResultDialog, setFolderUpdateResultDialog] = useState<FolderUpdateResultDialogState | null>(null)
  const [folderUpdateResultSongMenu, setFolderUpdateResultSongMenu] = useState<FolderUpdateResultSongMenuState | null>(null)
  const [dragOverFolderPath, setDragOverFolderPath] = useState('')
  const refreshFolderRunningRef = useRef(false)
  const localItemsDragPayloadRef = useRef<LocalItemsDragPayload | null>(null)
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const [songsExpanded, setSongsExpanded] = useState(true)
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.innerWidth < LOCAL_COMPACT_BREAKPOINT)
  const resumeHiddenStorageItemByPath = useLibraryStore((state) => state.resumeHiddenStorageItemByPath)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const showNotification = useUndoableNotificationStore((state) => state.showMessage)
  const clearLibraryError = useLibraryStore((state) => state.clearError)
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const { addToNowPlayingWithUndo, showAddToPlaylistUndo } = useSongsAddedUndo(songs, t)
  const [folderMenu, setFolderMenu] = useState<LocalFolderMenuState | null>(null)
  const [songMenu, setSongMenu] = useState<LocalSongMenuState | null>(null)
  const [folderAddMenu, setFolderAddMenu] = useState<LocalFolderMenuState | null>(null)
  const [songAddMenu, setSongAddMenu] = useState<LocalSongAddMenuState | null>(null)
  const [selectionAddMenu, setSelectionAddMenu] = useState<LocalSelectionAddMenuState | null>(null)
  const [selectionMoveMenu, setSelectionMoveMenu] = useState<LocalSelectionMoveMenuState | null>(null)
  const [toolbarMenu, setToolbarMenu] = useState<LocalToolbarMenuState | null>(null)
  const [inputDialog, setInputDialog] = useState<{
    title: string
    defaultValue: string
    validate: (value: string) => string
    onConfirm: (value: string) => void | Promise<void>
  } | null>(null)
  const [removeDialog, setRemoveDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const localScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const localScrollShellRef = useRef<HTMLDivElement | null>(null)
  const localScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const localTableScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const localTableScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const localTableShellRef = useRef<HTMLDivElement | null>(null)
  const setLocalTableShellRef = useCallback((node: HTMLDivElement | null) => {
    localTableShellRef.current = node
  }, [])
  const localSongItemRefs = useRef<Array<HTMLElement | null>>([])
  const { getFolderPreferenceMenuItem } = useFolderPreferenceMenuItem(t)
  const { nodes, songsById } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const nodesByAbsolutePath = useMemo(() => new Map([...nodes.values()].map((folder) => [folder.path, folder])), [nodes])
  const currentNode = nodes.get(currentRelativePath) ?? null
  const currentSortMode = currentNode ? localSortModeFromCriterion(currentNode.criterion) : 'title'
  const effectiveViewMode: 'grid' | 'list' = 'grid'

  useEffect(() => {
    const updateCompactLayout = () => {
      setIsCompactLayout(window.innerWidth < LOCAL_COMPACT_BREAKPOINT)
    }

    updateCompactLayout()
    window.addEventListener('resize', updateCompactLayout)
    return () => {
      window.removeEventListener('resize', updateCompactLayout)
    }
  }, [])

  const currentSongs = useMemo(() => {
    if (!currentNode) {
      return []
    }

    return sortSongs(
      currentNode.directSongIds
        .map((songId) => songsById.get(songId)!)
        .filter((song) => matchesSongSearch(song, searchQuery)),
      sortMode,
      currentSortMode,
    )
  }, [currentNode, currentSortMode, searchQuery, songsById, sortMode])
  const getNotFavoriteSongIds = (songIds: number[]) => songIds.filter((songId) => !songsById.get(songId)!.favorite)
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

        return child.name.toLocaleLowerCase().includes(normalizedSearchQuery)
      }),
    )
  }, [createdFolderPaths, currentNode, currentRelativePath, nodes, rootPath, searchQuery])
  const showLocalSectionHeaders = childFolders.length > 0 && currentSongs.length > 0
  const visibleSongIds = useMemo(() => currentSongs.map((song) => song.id), [currentSongs])
  const visibleSongIdSet = useMemo(() => new Set(visibleSongIds), [visibleSongIds])
  const queueSongIds = visibleSongIds
  const songQuickJumpMap = useMemo(
    () => buildLocalSongQuickJumpMap(currentSongs, sortMode, currentSortMode, t),
    [currentSongs, currentSortMode, sortMode, t],
  )
  const showSongQuickJump = currentSongs.length >= 50 && songQuickJumpMap.size >= 4
  const songQuickJumpBasisName = getLocalSongQuickJumpBasisName(sortMode, currentSortMode, t)
  const childFolderPathSet = useMemo(
    () => new Set(childFolders.map((folder) => folder.relativePath)),
    [childFolders],
  )
  const effectiveSelectedFolderPaths = useMemo(
    () => [...selectedFolderPaths].filter((folderPath) => childFolderPathSet.has(folderPath)),
    [childFolderPathSet, selectedFolderPaths],
  )
  const effectiveSelectedSongIds = useMemo(
    () => [...selectedSongIds].filter((songId) => visibleSongIdSet.has(songId)),
    [selectedSongIds, visibleSongIdSet],
  )
  const selectedQueueSongIds = useMemo(
    () => [
      ...new Set([
        ...effectiveSelectedSongIds,
        ...effectiveSelectedFolderPaths.flatMap((folderPath) => nodes.get(folderPath)?.subtreeSongIds ?? []),
      ]),
    ],
    [effectiveSelectedFolderPaths, effectiveSelectedSongIds, nodes],
  )
  const selectedLocalItemCount = effectiveSelectedFolderPaths.length + effectiveSelectedSongIds.length
  const playablePlaylists = playlists.filter((playlist) => !playlist.isBuiltIn || playlist.name === t('common.myFavorites'))
  const addSongsToFavorites = (songIds: number[]) => {
    onAddSongsToPlaylist(favoritePlaylistId, songIds)
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
    if (previousRelativePathRef.current !== currentRelativePath) {
      ClearMultiSelectStatus()
      previousRelativePathRef.current = currentRelativePath
    }
    setSelectedListItemKey('')
    setLocalNotification('')
  }, [currentRelativePath])

  useLayoutEffect(() => {
    localScrollShellRef.current?.scrollTo({ top: 0 })
    localTableShellRef.current?.scrollTo({ top: 0 })
  }, [currentRelativePath])

  const localScrollRefreshDependencies = [
    childFolders.length,
    currentRelativePath,
    currentSongs.length,
    foldersExpanded,
    isCompactLayout,
    showLocalSectionHeaders,
    songsExpanded,
  ]
  const onLocalScrollbarPointerDown = useCustomScrollbar({
    frameRef: localScrollFrameRef,
    scrollContainerRef: localScrollShellRef,
    scrollbarTrackRef: localScrollbarTrackRef,
    refreshDependencies: localScrollRefreshDependencies,
  })
  const onLocalTableScrollbarPointerDown = useCustomScrollbar({
    frameRef: localTableScrollFrameRef,
    scrollContainerRef: localTableShellRef,
    scrollbarTrackRef: localTableScrollbarTrackRef,
    refreshDependencies: localScrollRefreshDependencies,
  })

  useEffect(() => {
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
  }, [childFolderPathSet, folderAddMenu, folderMenu, nodes, selectedListItemKey, songAddMenu, songMenu, songsById, visibleSongIdSet])

  useEffect(() => {
    setSortMode(currentSortMode)
  }, [currentSortMode, currentRelativePath])

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
    if (shuffledSongIds.length === 0) {
      setLocalNotification(t('local.noMusicUnderCurrentFolder'))
      return
    }

    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const jumpToLocalSongKey = (key: string) => {
    const targetIndex = songQuickJumpMap.get(key)
    if (targetIndex == null) {
      return
    }

    const targetElement = localSongItemRefs.current[targetIndex]!
    const scrollContainer = targetElement.closest('.local-scroll-shell, .local-table-shell') as HTMLElement
    const targetRect = targetElement.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + targetRect.top - containerRect.top - 6,
    })
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

  const getFolderNameValidationError = (parentRelativePath: string, name: string, currentName = '') => {
    const nextName = name.trim()
    if (!nextName) {
      return t('local.folderNameEmpty')
    }
    if (nextName.length > 50) {
      return t('local.folderNameTooLong')
    }
    if (nextName !== currentName && folderPathExists(parentRelativePath, nextName)) {
      return t('local.folderNameUsed')
    }
    return ''
  }

  const createFolder = () => {
    setInputDialog({
      title: t('local.newFolderPrompt'),
      defaultValue: getNextFolderName(currentRelativePath),
      validate: (name) => getFolderNameValidationError(currentRelativePath, name),
      onConfirm: async (name) => {
        await onCreateFolder(currentRelativePath, name)
        const folderPath = currentRelativePath ? `${currentRelativePath}/${name}` : name
        setCreatedFolderPaths((current) => new Set(current).add(folderPath))
        setInputDialog(null)
      },
    })
  }

  const createChildFolder = (folder: FolderNode) => {
    setInputDialog({
      title: t('local.newFolderPrompt'),
      defaultValue: getNextFolderName(folder.relativePath),
      validate: (name) => getFolderNameValidationError(folder.relativePath, name),
      onConfirm: async (name) => {
        await onCreateFolder(folder.relativePath, name)
        setInputDialog(null)
        setFolderMenu(null)
      },
    })
  }

  const renameFolder = (folder: FolderNode) => {
    setInputDialog({
      title: t('local.renameFolderPrompt'),
      defaultValue: folder.name,
      validate: (name) => getFolderNameValidationError(getParentPath(folder.relativePath), name, folder.name),
      onConfirm: async (name) => {
        if (name !== folder.name) {
          await onRenameFolder(folder.path, name)
        }
        setInputDialog(null)
        setFolderMenu(null)
      },
    })
  }

  const deleteFolder = (folder: FolderNode) => {
    setRemoveDialog({
      title: t('local.deleteFolder'),
      message: t('local.deleteFolderConfirm', { name: folder.name }),
      onConfirm: async () => {
        await onDeleteLocalItems([], [folder.path])
        setRemoveDialog(null)
        setFolderMenu(null)
      },
    })
  }

  const hideFolder = async (folder: FolderNode) => {
    await onHideFolder(folder.path)
    showUndo(t('notification.hiddenStorageItem', { name: folder.name }), async () => {
      await resumeHiddenStorageItemByPath(folder.path)
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

  const moveLocalItemsWithUndo = async (songIds: number[], folderPaths: string[], targetFolderPath: string) => {
    const songOriginalFolders = songIds.map((songId) => ({
      songId,
      folderPath: getAbsoluteParentPath(songsById.get(songId)!.path),
    }))
    const folderOriginalFolders = folderPaths.map((folderPath) => ({
      folderPath: joinAbsolutePath(targetFolderPath, getAbsolutePathName(folderPath)),
      parentPath: getAbsoluteParentPath(folderPath),
    }))

    await onMoveLocalItemsToFolder(songIds, folderPaths, targetFolderPath)

    const movedItemCount = songIds.length + folderPaths.length
    const message = movedItemCount === 1 && songIds.length === 1
      ? t('notification.movedSong', { title: songsById.get(songIds[0])!.title })
      : t('notification.movedLocalItems', { count: movedItemCount })

    showUndo(message, async () => {
      const songIdsByFolder = new Map<string, number[]>()
      for (const item of songOriginalFolders) {
        songIdsByFolder.set(item.folderPath, [...(songIdsByFolder.get(item.folderPath) ?? []), item.songId])
      }
      for (const [folderPath, movedSongIds] of songIdsByFolder) {
        await onMoveLocalItemsToFolder(movedSongIds, [], folderPath)
      }

      const folderPathsByParent = new Map<string, string[]>()
      for (const item of folderOriginalFolders) {
        folderPathsByParent.set(item.parentPath, [...(folderPathsByParent.get(item.parentPath) ?? []), item.folderPath])
      }
      for (const [parentPath, movedFolderPaths] of folderPathsByParent) {
        await onMoveLocalItemsToFolder([], movedFolderPaths, parentPath)
      }
    })
  }

  const getFolderMoveToMenuItem = (sourceFolder: FolderNode) => {
    const submenu = buildLocalMoveToFolderMenuItems({
      nodes,
      songsById,
      songIds: [],
      folderPaths: [sourceFolder.path],
      t,
      onMoveToFolder: (targetFolder) => {
        void moveLocalItemsWithUndo([], [sourceFolder.path], targetFolder.path)
      },
    })

    if (submenu.length === 0) {
      return null
    }

    return {
      key: 'move-folder-to-folder',
      text: t('context.moveToFolder'),
      icon: 'folder',
      submenu,
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

  const showSortMenu = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setToolbarMenu({
      x: rect.left,
      y: rect.bottom + 6,
      anchor: event.currentTarget,
    })
    setFolderMenu(null)
    setSongMenu(null)
    setFolderAddMenu(null)
    setSongAddMenu(null)
    setSelectionAddMenu(null)
  }

  const refreshFolderWithResult = async (folder: FolderNode) => {
    if (scanning || refreshFolderRunningRef.current) {
      return
    }

    refreshFolderRunningRef.current = true
    try {
      setLocalNotification('')
      setFolderMenu(null)
      setFolderUpdateResultDialog(null)
      setFolderUpdateResultSongMenu(null)
      const result = await onRefreshFolder(folder.path)
      if (result) {
        if (hasRefreshResultChanges(result)) {
          showUndoableNotification(
            getRefreshResultMessage(result, t),
            t('common.detail'),
            () => {
              setFolderUpdateResultDialog({ folder, result })
            },
            10000,
          )
        } else {
          showNotification(getRefreshResultMessage(result, t), 2000)
        }
      } else {
        const refreshError = useLibraryStore.getState().error
        if (refreshError) {
          showNotification(getRefreshFolderErrorMessage(refreshError, t), 2000)
          clearLibraryError()
        }
      }
    } finally {
      refreshFolderRunningRef.current = false
    }
  }

  const applyFolderUpdateArtistSplits = async (splits: ArtistSplitResultItem[]) => {
    if (splits.length === 0) {
      return
    }

    await onApplyArtistSplits(splits)
    setFolderUpdateResultDialog((current) => current
      ? (() => {
          const mergeSongIds = new Set(current.result.artistMergeSuggestions.map((item) => item.songId))
          return {
            ...current,
            result: {
              ...current.result,
              artistSplitsApplied: [
                ...current.result.artistSplitsApplied,
                ...splits.filter((split) => !mergeSongIds.has(split.songId)),
              ],
              artistSplitSuggestions: current.result.artistSplitSuggestions.filter((item) =>
                !splits.some((split) => split.songId === item.songId)),
              artistMergeSuggestions: current.result.artistMergeSuggestions.filter((item) =>
                !splits.some((split) => split.songId === item.songId)),
            },
          }
        })()
      : current)
  }

  const dismissFolderUpdateArtistSplitSuggestions = () => {
    setFolderUpdateResultDialog((current) => current
      ? {
          ...current,
          result: {
            ...current.result,
            artistSplitSuggestions: [],
            artistMergeSuggestions: [],
          },
        }
      : current)
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
    await moveLocalItemsWithUndo(effectiveSelectedSongIds, selectedFolderAbsolutePaths, folderPath)
    HideMultiSelectAfterOperation()
  }

  const selectedMoveToFolderMenuItems = buildLocalMoveToFolderMenuItems({
    nodes,
    songsById,
    songIds: effectiveSelectedSongIds,
    folderPaths: selectedFolderAbsolutePaths,
    t,
    onMoveToFolder: (targetFolder) => {
      void moveSelectedItemsToFolder(targetFolder.path)
    },
  })

  const deleteSelectedItems = async () => {
    const selectedCount = effectiveSelectedSongIds.length + selectedFolderAbsolutePaths.length
    setRemoveDialog({
      title: t('context.deleteFromDisk'),
      message: t('local.deleteSelectedConfirm', { count: selectedCount }),
      onConfirm: async () => {
        await onDeleteLocalItems(effectiveSelectedSongIds, selectedFolderAbsolutePaths)
        setRemoveDialog(null)
        HideMultiSelectAfterOperation()
      },
    })
  }

  const searchDirectory = (folder: FolderNode) => {
    setInputDialog({
      title: t('local.searchDirectoryPrompt', { name: folder.name }),
      defaultValue: '',
      validate: (query) => query ? '' : t('local.searchQueryEmpty'),
      onConfirm: (query) => {
        onSearchDirectory(query, folder.relativePath)
        setInputDialog(null)
        setFolderMenu(null)
      },
    })
  }

  const dragPayloadForFolder = (folder: FolderNode): LocalItemsDragPayload => ({
    songIds: [],
    folderPaths: selectedFolderPaths.has(folder.relativePath) ? selectedFolderAbsolutePaths : [folder.path],
  })

  const dragPayloadForSong = (song: LibrarySong): LocalItemsDragPayload => ({
    songIds: selectedSongIds.has(song.id) ? effectiveSelectedSongIds : [song.id],
    folderPaths: [],
  })

  const getDragPayload = (event: DragEvent) => {
    if (localItemsDragPayloadRef.current) {
      return localItemsDragPayloadRef.current
    }

    const rawPayload = event.dataTransfer.getData(LOCAL_ITEMS_DRAG_TYPE)
    return rawPayload ? JSON.parse(rawPayload) as LocalItemsDragPayload : null
  }

  const isMoveTargetFolder = (payload: LocalItemsDragPayload, targetFolder: FolderNode) => {
    if (payload.songIds.length + payload.folderPaths.length === 0) {
      return false
    }

    const songAlreadyInTarget = payload.songIds.some((songId) =>
      getSongFolderRelativePath(songsById.get(songId)!.path, rootPath) === targetFolder.relativePath,
    )
    if (songAlreadyInTarget) {
      return false
    }

    return payload.folderPaths.every((folderPath) => {
      const sourceFolder = nodesByAbsolutePath.get(folderPath)!
      return targetFolder.relativePath !== sourceFolder.relativePath &&
        targetFolder.relativePath !== getParentPath(sourceFolder.relativePath) &&
        !targetFolder.relativePath.startsWith(`${sourceFolder.relativePath}/`)
    })
  }

  const onDragOverFolder = (event: DragEvent, folder: FolderNode) => {
    const payload = localItemsDragPayloadRef.current
    if (!payload || !isMoveTargetFolder(payload, folder)) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverFolderPath((current) => current === folder.relativePath ? current : folder.relativePath)
  }

  const onDragLeaveFolder = (event: DragEvent, folder: FolderNode) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setDragOverFolderPath((current) => current === folder.relativePath ? '' : current)
  }

  const moveDraggedItems = async (event: DragEvent, targetFolder: FolderNode) => {
    const payload = getDragPayload(event)
    if (!payload || !isMoveTargetFolder(payload, targetFolder)) {
      return
    }

    event.preventDefault()
    setDragOverFolderPath('')
    await moveLocalItemsWithUndo(payload.songIds, payload.folderPaths, targetFolder.path)
    ClearMultiSelectStatus()
  }

  const clearLocalItemsDrag = () => {
    localItemsDragPayloadRef.current = null
    setDragOverFolderPath('')
  }

  const refreshCurrentFolder = () => {
    void refreshFolderWithResult(currentNode!)
  }

  const enableMultiSelect = () => {
    if (multiSelect) {
      return
    }
    setMultiSelect(true)
    setLocalNotification('')
  }

  const requestDeleteSelectedItems = () => {
    void deleteSelectedItems()
  }

  const openSelectionAddMenu = (x: number, y: number, anchor?: HTMLElement) => {
    setSelectionAddMenu({ x, y, anchor })
  }

  const openSelectionMoveMenu = (x: number, y: number, anchor?: HTMLElement) => {
    setSelectionMoveMenu({ x, y, anchor })
  }

  const selectAllLocalItems = () => {
    setSelectedFolderPaths(new Set(childFolders.map((folder) => folder.relativePath)))
    setSelectedSongIds(new Set(visibleSongIds))
  }

  const reverseLocalSelection = () => {
    setSelectedFolderPaths((current) => new Set(childFolders
      .map((folder) => folder.relativePath)
      .filter((folderPath) => !current.has(folderPath))))
    setSelectedSongIds((current) => new Set(visibleSongIds.filter((songId) => !current.has(songId))))
  }

  const clearLocalSelection = () => {
    setSelectedFolderPaths(new Set())
    setSelectedSongIds(new Set())
  }

  const toggleFoldersExpanded = () => {
    setFoldersExpanded((current) => !current)
  }

  const toggleSongsExpanded = () => {
    setSongsExpanded((current) => !current)
  }

  const openFolderAddMenu = (folder: FolderNode, x: number, y: number) => {
    setFolderAddMenu({ folder, x, y })
  }

  const refreshFolder = (folder: FolderNode) => {
    void refreshFolderWithResult(folder)
  }

  const revealFolder = (folder: FolderNode) => {
    void onRevealFolder(folder.path)
  }

  const openFolderMenu = (folder: FolderNode, x: number, y: number) => {
    setFolderMenu({ folder, x, y })
  }

  const openSongAddMenu = (song: LibrarySong, x: number, y: number) => {
    setSongAddMenu({ song, x, y })
  }

  const openSongMenu = (song: LibrarySong, x: number, y: number) => {
    setSongMenu({ song, x, y })
  }

  const onDragFolderStart = (event: DragEvent, folder: FolderNode) => {
    const payload = dragPayloadForFolder(folder)
    localItemsDragPayloadRef.current = payload
    event.dataTransfer.setData(LOCAL_ITEMS_DRAG_TYPE, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDropFolder = (event: DragEvent, folder: FolderNode) => {
    void moveDraggedItems(event, folder)
  }

  const onDragSongStart = (event: DragEvent, song: LibrarySong) => {
    const payload = dragPayloadForSong(song)
    localItemsDragPayloadRef.current = payload
    event.dataTransfer.setData(LOCAL_ITEMS_DRAG_TYPE, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  if (!rootPath) {
    return (
      <section className="page-panel local-page">
        {loading ? (
          <LoadingState t={t} />
        ) : (
          <LocalEmptyState>
            <h3>{t('local.noRoot')}</h3>
            <p>{t('local.noRootCopy')}</p>
            <button className="local-command" type="button" onClick={onPickLibraryRoot}>
              <Icon name="folder" />
              {t('library.chooseFolder')}
            </button>
          </LocalEmptyState>
        )}
      </section>
    )
  }

  if (!currentNode) {
    return (
      <section className="page-panel local-page">
        {loading ? (
          <LoadingState t={t} />
        ) : (
          <LocalEmptyState>
            <h3>{t('local.folderNotFound')}</h3>
            <p>{t('local.folderNotFoundDescription')}</p>
            <Link className="local-command" to="/local">
              <Icon name="arrowLeft" />
              {t('local.backToRoot')}
            </Link>
          </LocalEmptyState>
        )}
      </section>
    )
  }

  const showFolderItems = !showLocalSectionHeaders || foldersExpanded
  const showSongItems = !showLocalSectionHeaders || songsExpanded
  const toolbarSortItems: MenuFlyoutItem[] = [
    { key: 'toolbar-sort-reverse', text: t('local.sortReverseList'), onClick: () => updateSortMode('reverse') },
    { key: 'toolbar-sort-separator', text: '', separator: true },
    { key: 'toolbar-sort-title', text: t('local.sortByTitle'), icon: sortMode === 'title' ? 'check' : undefined, onClick: () => updateSortMode('title') },
    { key: 'toolbar-sort-artist', text: t('local.sortByArtist'), icon: sortMode === 'artist' ? 'check' : undefined, onClick: () => updateSortMode('artist') },
    { key: 'toolbar-sort-album', text: t('local.sortByAlbum'), icon: sortMode === 'album' ? 'check' : undefined, onClick: () => updateSortMode('album') },
  ]
  return (
    <section className="page-panel local-page">
      <div className="local-toolbar">
        <CommandBar
          className="local-commandbar"
          overflowReserve={isCompactLayout ? 44 : 0}
          overflowLabel={t('player.more')}
          overflowItems={isCompactLayout ? [
            {
              key: 'hidden-folders',
              text: t('local.viewHiddenFolders'),
              icon: 'hiddenFolders',
              onClick: onHiddenFoldersListButtonClick,
            },
          ] : []}
          content={(
            <p>
              {t('local.headerStats', {
                folders: childFolders.length,
                songs: currentSongs.length,
              })}
            </p>
          )}
        >
          <CommandBarButton icon="shuffle" label={t('nowPlaying.randomPlay')} onClick={playShuffled} />
          <CommandBarButton
            icon="refresh"
            label={scanning ? t('library.scanning') : isCompactLayout ? t('local.updateFolderShort') : t('local.updateFolder')}
            onClick={refreshCurrentFolder}
            disabled={scanning || !currentNode}
          />
          <CommandBarButton icon="sort" label={t('common.sort')} onClick={showSortMenu} />
          <CommandBarButton icon="plus" label={t('local.newFolder')} onClick={createFolder} />
          <CommandBarButton icon="multiSelect" label={t('albums.multiSelect')} active={multiSelect} onClick={enableMultiSelect} />
          {multiSelect ? (
            <CommandBarButton
              icon="trash"
              label={t('context.deleteFromDisk')}
              disabled={selectedLocalItemCount === 0}
              onClick={requestDeleteSelectedItems}
            />
          ) : null}
        </CommandBar>
      </div>

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedLocalItemCount}
        t={t}
        playlists={playablePlaylists}
        showPlay={selectedQueueSongIds.length > 0}
        showAddTo={selectedQueueSongIds.length > 0}
        onPlay={() => {
          onPlayTrack(selectedQueueSongIds[0]!, selectedQueueSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openSelectionAddMenu(rect.left, rect.top - 8, event.currentTarget)
        }}
        onRemove={requestDeleteSelectedItems}
        removeLabel={t('context.deleteFromDisk')}
        extraActions={[
          {
            key: 'move-to-folder',
            text: t('context.moveToFolder'),
            icon: 'folder',
            disabled: selectedLocalItemCount === 0 || selectedMoveToFolderMenuItems.length === 0,
            onClick: (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              openSelectionMoveMenu(rect.left, rect.top - 8, event.currentTarget)
            },
          },
        ]}
        onSelectAll={selectAllLocalItems}
        onReverseSelection={reverseLocalSelection}
        onClearSelection={clearLocalSelection}
        onCancel={ClearMultiSelectStatus}
      />

      {childFolders.length === 0 && currentSongs.length === 0 ? (
        loading || scanning ? (
          <LoadingState t={t} />
        ) : songs.length === 0 || searchQuery.trim() ? (
          <LocalEmptyState>
            <h3>
              {songs.length === 0
                ? t('local.noSongsScanned')
                : t('local.noSongsBranch', { query: searchQuery })}
            </h3>
            <p>
              {songs.length === 0
                ? t('local.scanPopulate')
                : t('local.searchHelp')}
            </p>
            {songs.length === 0 ? (
              <Link className="local-command" to="/settings">
                <Icon name="settings" />
                {t('local.goToSettings')}
              </Link>
            ) : null}
          </LocalEmptyState>
        ) : (
          <div className="local-empty-folder" aria-hidden="true" />
        )
      ) : effectiveViewMode === 'grid' ? (
        <div className="local-scroll-frame custom-scrollbar-frame" ref={localScrollFrameRef}>
          <div className="local-scroll-shell custom-scrollbar-container" ref={localScrollShellRef}>
            <LocalGridContent
              childFolders={childFolders}
              currentSongs={currentSongs}
              nodes={nodes}
              songsById={songsById}
              selectedFolderPaths={selectedFolderPaths}
              selectedSongIds={selectedSongIds}
              dragOverFolderPath={dragOverFolderPath}
              selectedTrackId={selectedTrackId}
              isPlaying={isPlaying}
              multiSelect={multiSelect}
              isCompactLayout={isCompactLayout}
              showLocalSectionHeaders={showLocalSectionHeaders}
              foldersExpanded={foldersExpanded}
              songsExpanded={songsExpanded}
              showSongQuickJump={showSongQuickJump}
              songQuickJumpBasisName={songQuickJumpBasisName}
              songQuickJumpMap={songQuickJumpMap}
              queueSongIds={queueSongIds}
              t={t}
              localSongItemRefs={localSongItemRefs}
              onToggleFoldersExpanded={toggleFoldersExpanded}
              onToggleSongsExpanded={toggleSongsExpanded}
              onPlayFolder={shuffleFolder}
              onAddFolder={openFolderAddMenu}
              onRefreshFolder={refreshFolder}
              onSearchFolder={searchDirectory}
              onRevealFolder={revealFolder}
              onOpenFolder={onOpenFolder}
              onToggleFolderSelection={toggleFolderSelection}
              onDragFolderStart={onDragFolderStart}
              onDragOverFolder={onDragOverFolder}
              onDragLeaveFolder={onDragLeaveFolder}
              onDropFolder={onDropFolder}
              onDragLocalItemEnd={clearLocalItemsDrag}
              onOpenFolderMenu={openFolderMenu}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onToggleSongSelection={toggleSongSelection}
              onPlayNext={onPlayNext}
              onToggleFavorite={onToggleFavorite}
              onAddSong={openSongAddMenu}
              onOpenSongMenu={openSongMenu}
              onDragSongStart={onDragSongStart}
              onJumpToSongKey={jumpToLocalSongKey}
            />
          </div>
          <CustomScrollbar
            scrollbarTrackRef={localScrollbarTrackRef}
            onThumbPointerDown={onLocalScrollbarPointerDown}
          />
        </div>
      ) : (
        <LocalTableContent
          frameRef={localTableScrollFrameRef}
          onShellRefChange={setLocalTableShellRef}
          scrollbarTrackRef={localTableScrollbarTrackRef}
          onThumbPointerDown={onLocalTableScrollbarPointerDown}
          childFolders={childFolders}
          currentSongs={currentSongs}
          currentRelativePath={currentRelativePath}
          selectedFolderPaths={selectedFolderPaths}
          selectedSongIds={selectedSongIds}
          dragOverFolderPath={dragOverFolderPath}
          selectedListItemKey={selectedListItemKey}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          multiSelect={multiSelect}
          showLocalSectionHeaders={showLocalSectionHeaders}
          showFolderItems={showFolderItems}
          showSongItems={showSongItems}
          foldersExpanded={foldersExpanded}
          songsExpanded={songsExpanded}
          showSongQuickJump={showSongQuickJump}
          songQuickJumpBasisName={songQuickJumpBasisName}
          songQuickJumpMap={songQuickJumpMap}
          queueSongIds={queueSongIds}
          t={t}
          localSongItemRefs={localSongItemRefs}
          onToggleFoldersExpanded={toggleFoldersExpanded}
          onToggleSongsExpanded={toggleSongsExpanded}
          onToggleFolderSelection={toggleFolderSelection}
          onSelectListItem={setSelectedListItemKey}
          onOpenFolder={onOpenFolder}
          onOpenFolderMenu={openFolderMenu}
          onDragFolderStart={onDragFolderStart}
          onDragOverFolder={onDragOverFolder}
          onDragLeaveFolder={onDragLeaveFolder}
          onDropFolder={onDropFolder}
          onDragLocalItemEnd={clearLocalItemsDrag}
          onPlayFolder={shuffleFolder}
          onAddFolder={openFolderAddMenu}
          onRefreshFolder={refreshFolder}
          onSearchFolder={searchDirectory}
          onRevealFolder={revealFolder}
          onToggleSongSelection={toggleSongSelection}
          onOpenSongMenu={openSongMenu}
          onDragSongStart={onDragSongStart}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onPlayNext={onPlayNext}
          onAddSong={openSongAddMenu}
          onJumpToSongKey={jumpToLocalSongKey}
        />
      )}

      {folderMenu && nodes.has(folderMenu.folder.relativePath) ? (
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
              onClick: () => shuffleFolder(folderMenu.folder),
            },
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: folderMenu.folder.subtreeSongIds,
              t,
              defaultPlaylistName: folderMenu.folder.name,
              includeNowPlaying: true,
              includeFavorites: getNotFavoriteSongIds(folderMenu.folder.subtreeSongIds).length > 0,
              onAddToNowPlaying: () => addFolderSongsToNowPlaying(folderMenu.folder),
              onToggleFavorite: () => {
                addSongsToFavorites(getNotFavoriteSongIds(folderMenu.folder.subtreeSongIds))
              },
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderMenu.folder.subtreeSongIds),
              onAddToPlaylist: (playlistId) => addFolderSongsToPlaylist(folderMenu.folder, playlistId),
            }),
            {
              key: 'select-folder',
              text: t('context.select'),
              icon: 'multiSelect',
              onClick: () => selectFolder(folderMenu.folder),
            },
            getFolderMoveToMenuItem(folderMenu.folder),
            getFolderPreferenceMenuItem(folderMenu.folder, 'folder'),
            {
              key: 'show-in-explorer',
              text: t('context.reveal'),
              pendingText: t('context.openingLocal'),
              icon: 'local',
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
              text: t('local.deleteFolder'),
              icon: 'trash',
              onClick: () => deleteFolder(folderMenu.folder),
            },
            {
              key: 'refresh-folder',
              text: t('local.updateFolder'),
              icon: 'refresh',
              onClick: () => refreshFolderWithResult(folderMenu.folder),
            },
            {
              key: 'rename-folder',
              text: t('local.renameFolder'),
              icon: 'rename',
              onClick: () => renameFolder(folderMenu.folder),
            },
            {
              key: 'folder-sort',
              text: t('common.sort'),
              icon: 'sort',
              submenu: [
                {
                  key: 'folder-sort-reverse',
                  text: t('local.sortReverseList'),
                  onClick: () => updateFolderSortMode(folderMenu.folder, 'reverse'),
                },
                { key: 'folder-sort-separator', text: '', separator: true },
                ...[
                  { key: 'folder-sort-title', text: t('local.sortByTitle'), sortMode: 'title' },
                  { key: 'folder-sort-artist', text: t('local.sortByArtist'), sortMode: 'artist' },
                  { key: 'folder-sort-album', text: t('local.sortByAlbum'), sortMode: 'album' },
                ].map((item) => ({
                  key: item.key,
                  text: item.text,
                  icon: localSortModeFromCriterion(folderMenu.folder.criterion) === item.sortMode ? 'check' as const : undefined,
                  onClick: () => updateFolderSortMode(folderMenu.folder, item.sortMode as LocalSortMode),
                })),
              ],
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
          items={getAddToPlaylistMenuFlyoutItems({
            playlists: playablePlaylists,
            songIds: selectedQueueSongIds,
            t,
            defaultPlaylistName: currentNode.name,
            includeNowPlaying: true,
            includeFavorites: getNotFavoriteSongIds(selectedQueueSongIds).length > 0,
            onAddToNowPlaying: () => {
              addToNowPlayingWithUndo(selectedQueueSongIds)
              HideMultiSelectAfterOperation()
            },
            onToggleFavorite: () => {
              const nextFavoriteSongIds = getNotFavoriteSongIds(selectedQueueSongIds)
              addSongsToFavorites(nextFavoriteSongIds)
              showAddToPlaylistUndo(favoritePlaylistId, nextFavoriteSongIds, t('common.myFavorites'))
              HideMultiSelectAfterOperation()
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, selectedQueueSongIds)
              HideMultiSelectAfterOperation()
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongsToPlaylist(playlistId, selectedQueueSongIds)
              showAddToPlaylistUndo(playlistId, selectedQueueSongIds, targetPlaylist.name)
              HideMultiSelectAfterOperation()
            },
          })}
        />
      ) : null}
      {selectionMoveMenu ? (
        <MenuFlyout
          position={selectionMoveMenu}
          onClose={() => {
            setSelectionMoveMenu(null)
          }}
          items={selectedMoveToFolderMenuItems}
        />
      ) : null}
      {toolbarMenu ? (
        <MenuFlyout
          position={toolbarMenu}
          onClose={() => {
            setToolbarMenu(null)
          }}
          items={toolbarSortItems}
        />
      ) : null}
      {folderAddMenu && nodes.has(folderAddMenu.folder.relativePath) ? (
        <MenuFlyout
          position={folderAddMenu}
          onClose={() => {
            setFolderAddMenu(null)
          }}
          items={getAddToPlaylistMenuFlyoutItems({
            playlists: playablePlaylists,
            songIds: folderAddMenu.folder.subtreeSongIds,
            t,
            defaultPlaylistName: folderAddMenu.folder.name,
            includeNowPlaying: true,
            includeFavorites: getNotFavoriteSongIds(folderAddMenu.folder.subtreeSongIds).length > 0,
            onAddToNowPlaying: () => addFolderSongsToNowPlaying(folderAddMenu.folder),
            onToggleFavorite: () => {
              addSongsToFavorites(getNotFavoriteSongIds(folderAddMenu.folder.subtreeSongIds))
            },
            onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderAddMenu.folder.subtreeSongIds),
            onAddToPlaylist: (playlistId) => addFolderSongsToPlaylist(folderAddMenu.folder, playlistId),
          })}
        />
      ) : null}
      {songAddMenu && songsById.has(songAddMenu.song.id) ? (
        <MenuFlyout
          position={songAddMenu}
          onClose={() => {
            setSongAddMenu(null)
          }}
          items={getAddToPlaylistMenuFlyoutItems({
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
          })}
        />
      ) : null}
      {songMenu && songsById.has(songMenu.song.id) ? (
        <MusicMenuFlyout
          menu={songMenu}
          playlists={playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onClose={() => setSongMenu(null)}
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
      {folderUpdateResultDialog ? (
        <FolderUpdateResultDialog
          t={t}
          result={folderUpdateResultDialog.result}
          folder={folderUpdateResultDialog.folder}
          songs={songs}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          onPlaySong={(songId) => {
            onAddNextAndPlay(songId)
          }}
          onOpenSongMenu={(song, x, y) => setFolderUpdateResultSongMenu({ song, x, y })}
          onApplyArtistSplits={applyFolderUpdateArtistSplits}
          onDismissArtistSplitSuggestions={dismissFolderUpdateArtistSplitSuggestions}
          onClose={() => {
            setFolderUpdateResultDialog(null)
            setFolderUpdateResultSongMenu(null)
          }}
        />
      ) : null}
      {folderUpdateResultSongMenu ? (
        <MusicMenuFlyout
          menu={folderUpdateResultSongMenu}
          playlists={playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onClose={() => setFolderUpdateResultSongMenu(null)}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          onAddSongToPlaylist={onAddSongToPlaylist}
          showSelect={false}
          showMusicProperties={false}
          showDelete={false}
          menuLayer="dialog"
        />
      ) : null}
      {inputDialog ? (
        <InputDialog
          t={t}
          title={inputDialog.title}
          defaultValue={inputDialog.defaultValue}
          validate={inputDialog.validate}
          onCancel={() => setInputDialog(null)}
          onConfirm={(value) => {
            return inputDialog.onConfirm(value)
          }}
        />
      ) : null}
      {removeDialog ? (
        <RemoveDialog
          t={t}
          title={removeDialog.title}
          message={removeDialog.message}
          onCancel={() => setRemoveDialog(null)}
          onConfirm={() => {
            void removeDialog.onConfirm()
          }}
        />
      ) : null}
    </section>
  )
}
