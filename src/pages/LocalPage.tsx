import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'

import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { useFolderPreferenceMenuItem } from '../hooks/useFolderPreferenceMenuItem'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import type { LibraryFolder, LibraryPlaylist, LibrarySong, ScanLibraryProgress, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
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
import { LocalPageDialogs } from './LocalPageDialogs'
import { LocalFolderNotFoundState, LocalNoRootState } from './LocalEmptyState'
import { LocalPageMainContent } from './LocalPageMainContent'
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
  scanProgress: ScanLibraryProgress | null
  error: string | null
  onPickLibraryRoot: () => void
  onOpenFolder: (targetRelativePath: string) => void
  onRefreshFolder: (folderPath: string) => void | ScanLibraryResult | null | Promise<ScanLibraryResult | null | void>
  onCancelRefreshFolder: () => void
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
  scanProgress,
  error,
  onPickLibraryRoot,
  onOpenFolder,
  onRefreshFolder,
  onCancelRefreshFolder,
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
  onHiddenFoldersListButtonClick,
}: LocalPageProps) {
  const currentRelativePath = routeRelativePath
  const [sortMode, setSortMode] = useState<LocalSortMode>('title')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<Set<string>>(new Set())
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectedListItemKey, setSelectedListItemKey] = useState('')
  const [createdFolderPaths, setCreatedFolderPaths] = useState<Set<string>>(new Set())
  const [localNotification, setLocalNotification] = useState('')
  const [folderUpdateResultDialog, setFolderUpdateResultDialog] = useState<FolderUpdateResultDialogState | null>(null)
  const [folderUpdateResultSongMenu, setFolderUpdateResultSongMenu] = useState<FolderUpdateResultSongMenuState | null>(null)
  const refreshFolderRunningRef = useRef(false)
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
  const localSongItemRefs = useRef<Array<HTMLElement | null>>([])
  const { getFolderPreferenceMenuItem } = useFolderPreferenceMenuItem(t)
  const { nodes, songsById } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const currentNode = nodes.get(currentRelativePath) ?? null
  const currentSortMode = currentNode ? localSortModeFromCriterion(currentNode.criterion) : 'title'
  const effectiveViewMode: 'grid' | 'list' = 'grid'

  const openFolder = (targetRelativePath: string) => {
    onOpenFolder(targetRelativePath)
  }

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
  const queueSongIds = visibleSongIds
  const songQuickJumpMap = useMemo(
    () => buildLocalSongQuickJumpMap(currentSongs, sortMode, currentSortMode, t),
    [currentSongs, currentSortMode, sortMode, t],
  )
  const showSongQuickJump = currentSongs.length >= 50 && songQuickJumpMap.size >= 4
  const songQuickJumpBasisName = getLocalSongQuickJumpBasisName(sortMode, currentSortMode, t)
  const effectiveSelectedFolderPaths = [...selectedFolderPaths].filter((folderPath) =>
    childFolders.some((folder) => folder.relativePath === folderPath),
  )
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => visibleSongIds.includes(songId))
  const selectedQueueSongIds = [
    ...effectiveSelectedSongIds,
    ...effectiveSelectedFolderPaths.flatMap((folderPath) => nodes.get(folderPath)?.subtreeSongIds ?? []),
  ].filter((songId, index, all) => all.indexOf(songId) === index)
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
    ClearMultiSelectStatus()
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
        await onDeleteFolder(folder.path)
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

  const showSortMenu = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setToolbarMenu({
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
    return <LocalNoRootState loading={loading} t={t} onPickLibraryRoot={onPickLibraryRoot} />
  }

  if (!currentNode) {
    return <LocalFolderNotFoundState loading={loading} t={t} />
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
  const refreshProgressRatio = scanProgress
    ? Math.min(1, scanProgress.progress / scanProgress.max)
    : 0
  const refreshProgressAngle = `${refreshProgressRatio * 360}deg`
  const refreshProgressPercent = Math.round(refreshProgressRatio * 100)

  return (
    <section className="page-panel local-page">
      <LocalPageMainContent
        childFolders={childFolders}
        currentSongs={currentSongs}
        nodes={nodes}
        songs={songs}
        songsById={songsById}
        playablePlaylists={playablePlaylists}
        selectedFolderPaths={selectedFolderPaths}
        selectedSongIds={selectedSongIds}
        selectedTrackId={selectedTrackId}
        selectedListItemKey={selectedListItemKey}
        isPlaying={isPlaying}
        multiSelect={multiSelect}
        isCompactLayout={isCompactLayout}
        showLocalSectionHeaders={showLocalSectionHeaders}
        showFolderItems={showFolderItems}
        showSongItems={showSongItems}
        foldersExpanded={foldersExpanded}
        songsExpanded={songsExpanded}
        showSongQuickJump={showSongQuickJump}
        songQuickJumpBasisName={songQuickJumpBasisName}
        songQuickJumpMap={songQuickJumpMap}
        effectiveViewMode={effectiveViewMode}
        currentRelativePath={currentRelativePath}
        queueSongIds={queueSongIds}
        selectedQueueSongIds={selectedQueueSongIds}
        selectedLocalItemCount={selectedLocalItemCount}
        loading={loading}
        scanning={scanning}
        scanProgress={scanProgress}
        refreshProgressAngle={refreshProgressAngle}
        refreshProgressPercent={refreshProgressPercent}
        error={error}
        localNotification={localNotification}
        searchQuery={searchQuery}
        t={t}
        localSongItemRefs={localSongItemRefs}
        localScrollFrameRef={localScrollFrameRef}
        localScrollShellRef={localScrollShellRef}
        localScrollbarTrackRef={localScrollbarTrackRef}
        localTableScrollFrameRef={localTableScrollFrameRef}
        localTableShellRef={localTableShellRef}
        localTableScrollbarTrackRef={localTableScrollbarTrackRef}
        onLocalScrollbarPointerDown={onLocalScrollbarPointerDown}
        onLocalTableScrollbarPointerDown={onLocalTableScrollbarPointerDown}
        onHiddenFoldersListButtonClick={onHiddenFoldersListButtonClick}
        onCancelRefreshFolder={onCancelRefreshFolder}
        onPlayShuffled={playShuffled}
        onRefreshCurrentFolder={() => {
          void refreshFolderWithResult(currentNode)
        }}
        onShowSortMenu={showSortMenu}
        onCreateFolder={createFolder}
        onEnableMultiSelect={() => {
          if (multiSelect) {
            return
          }
          setMultiSelect(true)
          setLocalNotification('')
        }}
        onDeleteSelectedItems={() => {
          void deleteSelectedItems()
        }}
        onOpenSelectionAddMenu={(x, y) => setSelectionAddMenu({ x, y })}
        onOpenSelectionMoveMenu={(x, y) => setSelectionMoveMenu({ x, y })}
        selectedMoveTargetFolders={selectedMoveTargetFolders}
        onSelectAll={() => {
          setSelectedFolderPaths(new Set(childFolders.map((folder) => folder.relativePath)))
          setSelectedSongIds(new Set(visibleSongIds))
        }}
        onReverseSelection={() => {
          setSelectedFolderPaths((current) => new Set(childFolders
            .map((folder) => folder.relativePath)
            .filter((folderPath) => !current.has(folderPath))))
          setSelectedSongIds((current) => new Set(visibleSongIds.filter((songId) => !current.has(songId))))
        }}
        onClearSelection={() => {
          setSelectedFolderPaths(new Set())
          setSelectedSongIds(new Set())
        }}
        onCancelSelection={() => {
          ClearMultiSelectStatus()
        }}
        onToggleFoldersExpanded={() => setFoldersExpanded((current) => !current)}
        onToggleSongsExpanded={() => setSongsExpanded((current) => !current)}
        onSelectListItem={setSelectedListItemKey}
        onOpenFolder={openFolder}
        onShuffleFolder={shuffleFolder}
        onOpenFolderAddMenu={(folder, x, y) => setFolderAddMenu({ folder, x, y })}
        onRefreshFolder={(folder) => {
          void refreshFolderWithResult(folder)
        }}
        onSearchFolder={searchDirectory}
        onRevealFolder={(folder) => {
          void onRevealFolder(folder.path)
        }}
        onToggleFolderSelection={toggleFolderSelection}
        onDragFolderStart={(event, folder) => {
          event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForFolder(folder)))
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDropFolder={(event, folder) => {
          void moveDraggedItems(event, folder)
        }}
        onOpenFolderMenu={(folder, x, y) => setFolderMenu({ folder, x, y })}
        onPlayTrack={onPlayTrack}
        onTogglePlayPause={onTogglePlayPause}
        onMoveToMusicOrPlay={onMoveToMusicOrPlay}
        onPlayNext={onPlayNext}
        onToggleSongSelection={toggleSongSelection}
        onOpenSongAddMenu={(song, x, y) => setSongAddMenu({ song, x, y })}
        onOpenSongMenu={(song, x, y) => setSongMenu({ song, x, y })}
        onDragSongStart={(event, song) => {
          event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
          event.dataTransfer.effectAllowed = 'move'
        }}
        onJumpToSongKey={jumpToLocalSongKey}
      />
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
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: selectedQueueSongIds,
              t,
              defaultPlaylistName: currentNode.name,
              includeNowPlaying: true,
              includeFavorites: getNotFavoriteSongIds(selectedQueueSongIds).length > 0,
              onAddToNowPlaying: () => {
                onAddSongsToNowPlaying(selectedQueueSongIds)
                HideMultiSelectAfterOperation()
              },
              onToggleFavorite: () => {
                addSongsToFavorites(getNotFavoriteSongIds(selectedQueueSongIds))
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
      {selectionMoveMenu ? (
        <MenuFlyout
          position={selectionMoveMenu}
          onClose={() => {
            setSelectionMoveMenu(null)
          }}
          items={selectedMoveTargetFolders.map((folder) => ({
            key: `move-selection-${folder.relativePath}`,
            text: folder.relativePath || t('local.libraryRoot'),
            icon: 'folder',
            onClick: () => {
              void moveSelectedItemsToFolder(folder.relativePath)
            },
          }))}
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
              includeFavorites: getNotFavoriteSongIds(folderAddMenu.folder.subtreeSongIds).length > 0,
              onAddToNowPlaying: () => addFolderSongsToNowPlaying(folderAddMenu.folder),
              onToggleFavorite: () => {
                addSongsToFavorites(getNotFavoriteSongIds(folderAddMenu.folder.subtreeSongIds))
              },
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
      <LocalPageDialogs
        t={t}
        songs={songs}
        playlists={playlists}
        queueSongIds={queueSongIds}
        selectedTrackId={selectedTrackId}
        isPlaying={isPlaying}
        songMenu={songMenu}
        folderUpdateResultDialog={folderUpdateResultDialog}
        folderUpdateResultSongMenu={folderUpdateResultSongMenu}
        inputDialog={inputDialog}
        removeDialog={removeDialog}
        onCloseSongMenu={() => setSongMenu(null)}
        onCloseFolderUpdateResultDialog={() => {
          setFolderUpdateResultDialog(null)
          setFolderUpdateResultSongMenu(null)
        }}
        onCloseFolderUpdateResultSongMenu={() => setFolderUpdateResultSongMenu(null)}
        onOpenFolderUpdateResultSongMenu={(song, x, y) => setFolderUpdateResultSongMenu({ song, x, y })}
        onCloseInputDialog={() => setInputDialog(null)}
        onCloseRemoveDialog={() => setRemoveDialog(null)}
        onPlayTrack={onPlayTrack}
        onMoveToMusicOrPlay={onMoveToMusicOrPlay}
        onTogglePlayPause={onTogglePlayPause}
        onPlayNext={onPlayNext}
        onRevealSong={onRevealSong}
        onDeleteSongFromDisk={onDeleteSongFromDisk}
        onToggleFavorite={onToggleFavorite}
        onAddSongToPlaylist={onAddSongToPlaylist}
        onSelectSong={selectSong}
      />
    </section>
  )
}

