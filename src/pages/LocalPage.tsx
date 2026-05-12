import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { Icon } from '../components/icons'
import { InputDialog } from '../components/InputDialog'
import { LoadingState } from '../components/LoadingState'
import { LocalFolderCard, LOCAL_FOLDER_TYPE_ICON_URL } from '../components/LocalFolderCard'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout } from '../components/MusicMenuFlyout'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { RemoveDialog } from '../components/RemoveDialog'
import { useFolderPreferenceMenuItem } from '../hooks/useFolderPreferenceMenuItem'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import type { LibraryFolder, LibraryPlaylist, LibrarySong, LocalFolderSortCriterion, ScanLibraryResult } from '../shared/contracts'
import { getSongArtists } from '../shared/artists'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { getLocalTextQuickJumpBucket, LOCAL_TEXT_QUICK_JUMP_KEYS } from '../shared/textCompare'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import {
  buildFolderChain,
  buildFolderIndex,
  createFolderNode,
  getParentPath,
  getSongFolderRelativePath,
  localSortModeFromCriterion,
  matchesSongSearch,
  normalizePath,
  shuffleSongIds,
  sortFolders,
  sortSongs,
  type FolderNode,
} from './localFolderModel'

type LocalSortMode = LocalFolderSortCriterion
const LOCAL_COMPACT_BREAKPOINT = 720
const LOCAL_FILE_TYPE_ICON_URL = '/colorful_no_bg.png'

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
type LocalSelectionMoveMenuState = MenuFlyoutPosition

type LocalToolbarMenuState = MenuFlyoutPosition

interface FolderUpdateResultDialogState {
  folder: FolderNode
  result: ScanLibraryResult
}

interface FolderUpdateResultSongMenuState extends MenuFlyoutPosition {
  song: LibrarySong
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

function hasRefreshResultChanges(result: ScanLibraryResult) {
  return result.filesAdded.length > 0 || result.filesRemoved.length > 0 || result.filesMoved.length > 0
}

function getUpdateResultFileTitle(filePath: string, folderPath: string) {
  const normalizedFilePath = normalizePath(filePath)
  const normalizedFolderPath = normalizePath(folderPath)
  const relativePath = normalizedFilePath.startsWith(`${normalizedFolderPath}/`)
    ? normalizedFilePath.slice(normalizedFolderPath.length + 1)
    : normalizedFilePath
  const extensionIndex = relativePath.lastIndexOf('.')
  return extensionIndex > 0 ? relativePath.slice(0, extensionIndex) : relativePath
}

function getUpdateResultFileItems(filePaths: string[], folderPath: string) {
  const items = filePaths.map((filePath) => ({
    path: filePath,
    title: getUpdateResultFileTitle(filePath, folderPath),
  }))
  const titleCounts = new Map<string, number>()
  for (const item of items) {
    titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1)
  }

  return items.map((item) => ({
    ...item,
    title: titleCounts.get(item.title)! > 1 ? item.path : item.title,
  }))
}

function getPathKey(filePath: string) {
  return normalizePath(filePath).toLocaleLowerCase()
}

function findSongByPath(songs: LibrarySong[], songPath: string) {
  const targetPathKey = getPathKey(songPath)
  return songs.find((song) => getPathKey(song.path) === targetPathKey) ?? null
}

function getRefreshFolderErrorMessage(error: string, t: Translator) {
  const notFoundPrefix = 'Folder not found: '
  const accessDeniedPrefix = 'Cannot access folder: '
  if (error.startsWith(notFoundPrefix)) {
    return t('local.updateFolderNotFound', { path: error.slice(notFoundPrefix.length) })
  }
  if (error.startsWith(accessDeniedPrefix)) {
    return t('local.updateFolderAccessDenied', { path: error.slice(accessDeniedPrefix.length) })
  }

  return error
}

function scrollCurrentFolderToTop() {
  document.querySelector<HTMLElement>('.local-scroll-shell, .local-table-shell')?.scrollTo({
    top: 0,
  })
}

function FolderUpdateResultDialog({
  t,
  result,
  folder,
  songs,
  selectedTrackId,
  onPlaySong,
  onOpenSongMenu,
  onClose,
}: {
  t: Translator
  result: ScanLibraryResult
  folder: FolderNode
  songs: LibrarySong[]
  selectedTrackId: number | null
  onPlaySong: (songId: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onClose: () => void
}) {
  const groups = [
    { key: 'added', label: t('local.refreshAddedGroup', { count: result.filesAdded.length }), items: getUpdateResultFileItems(result.filesAdded, folder.path), playable: true },
    { key: 'removed', label: t('local.refreshRemovedGroup', { count: result.filesRemoved.length }), items: getUpdateResultFileItems(result.filesRemoved, folder.path), playable: false },
    { key: 'moved', label: t('local.refreshMovedGroup', { count: result.filesMoved.length }), items: getUpdateResultFileItems(result.filesMoved, folder.path), playable: true },
  ].filter((group) => group.items.length > 0)

  return (
    <div className="input-dialog-overlay folder-update-result-overlay" role="presentation">
      <section className="input-dialog folder-update-result-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-update-result-title">
        <div className="folder-update-result-header">
          <h3 id="folder-update-result-title">{t('local.updateResultOfFolder', { name: folder.name })}</h3>
          <button type="button" className="folder-update-result-close" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="folder-update-result-groups">
          {groups.map((group) => (
            <section className="folder-update-result-group" key={group.key}>
              <h4>{group.label}</h4>
              <div className="folder-update-result-list">
                {group.items.map((item, index) => {
                  if (!group.playable) {
                    return (
                      <div
                        className="folder-update-result-item is-disabled"
                        key={`${group.key}-${item.path}-${index}`}
                        title={item.path}
                      >
                        <span className="folder-update-result-playing-icon" aria-hidden="true" />
                        <span className="folder-update-result-path">{item.title}</span>
                      </div>
                    )
                  }

                  const song = findSongByPath(songs, item.path)!
                  const isPlaying = song.id === selectedTrackId
                  const itemClassName = joinClassNames(
                    'folder-update-result-item',
                    isPlaying && 'is-playing',
                  )

                  return (
                    <button
                      type="button"
                      className={itemClassName}
                      key={`${group.key}-${item.path}-${index}`}
                      title={item.path}
                      onClick={() => {
                        onPlaySong(song.id)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        onOpenSongMenu(song, event.clientX, event.clientY)
                      }}
                    >
                      <span className="folder-update-result-playing-icon" aria-hidden="true">
                        {isPlaying ? <Icon name="play" /> : null}
                      </span>
                      <span className="folder-update-result-path">{item.title}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
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
  const [openedFolderChainItem, setOpenedFolderChainItem] = useState<{ path: string; left: number; top: number } | null>(null)
  const folderChainListRef = useRef<HTMLElement | null>(null)
  const folderChainDragRef = useRef({ active: false, dragged: false, startX: 0, scrollLeft: 0 })
  const { nodes } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const folderChain = useMemo(
    () => buildFolderChain(currentRelativePath, nodes),
    [currentRelativePath, nodes],
  )
  useLayoutEffect(() => {
    const folderChainList = folderChainListRef.current as HTMLElement
    const scrollToEnd = () => {
      folderChainList.scrollLeft = folderChainList.scrollWidth
    }

    scrollToEnd()
    const animationFrame = window.requestAnimationFrame(scrollToEnd)
    const resizeObserver = new ResizeObserver(scrollToEnd)
    resizeObserver.observe(folderChainList)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [currentRelativePath, folderChain.length])

  useEffect(() => {
    const folderChainList = folderChainListRef.current!
    const scrollFolderChain = (event: WheelEvent) => {
      const rawDelta = event.deltaX !== 0 ? event.deltaX : event.deltaY
      if (rawDelta === 0) {
        return
      }

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? folderChainList.clientWidth
          : 1
      event.preventDefault()
      folderChainList.scrollLeft += rawDelta * deltaScale
    }

    folderChainList.addEventListener('wheel', scrollFolderChain, { passive: false })
    return () => {
      folderChainList.removeEventListener('wheel', scrollFolderChain)
    }
  }, [])

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
    setOpenedFolderChainItem(null)
  }

  const stopFolderChainDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!folderChainDragRef.current.active) {
      return
    }

    folderChainDragRef.current.active = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <>
      {openedFolderChainItem != null ? (
        <button
          aria-label={t('local.path')}
          className="folder-chain-flyout-overlay"
          type="button"
          onClick={() => {
            setOpenedFolderChainItem(null)
          }}
        />
      ) : null}
      <nav
        ref={folderChainListRef}
        className="folder-chain-list-view"
        aria-label={t('local.path')}
        onClickCapture={(event) => {
          if (folderChainDragRef.current.dragged) {
            event.preventDefault()
            event.stopPropagation()
            folderChainDragRef.current.dragged = false
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return
          }

          folderChainDragRef.current = {
            active: true,
            dragged: false,
            startX: event.clientX,
            scrollLeft: event.currentTarget.scrollLeft,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const dragState = folderChainDragRef.current
          if (!dragState.active) {
            return
          }

          const deltaX = event.clientX - dragState.startX
          if (Math.abs(deltaX) > 3) {
            dragState.dragged = true
          }
          event.currentTarget.scrollLeft = dragState.scrollLeft - deltaX
        }}
        onPointerUp={stopFolderChainDrag}
        onPointerCancel={stopFolderChainDrag}
        onLostPointerCapture={stopFolderChainDrag}
      >
        {folderChain.map((folderChainItem) => {
          const isFlyoutOpen = openedFolderChainItem?.path === folderChainItem.path
          const hasChildFolders = folderChainItem.children.length > 0
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
                  onClick={() => {
                    scrollCurrentFolderToTop()
                    setOpenedFolderChainItem(null)
                  }}
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
                    setOpenedFolderChainItem(null)
                  }}
                >
                  {folderChainItem.name}
                </button>
              )}
              {hasChildFolders ? (
                <button
                  aria-label={folderChainItem.name}
                  className="folder-chain-item-dropdown-button"
                  type="button"
                  onClick={(event) => {
                    const segmentRect = event.currentTarget.parentElement!.getBoundingClientRect()
                    setOpenedFolderChainItem((current) =>
                      current?.path === folderChainItem.path
                        ? null
                        : {
                          path: folderChainItem.path,
                          left: Math.max(8, Math.min(segmentRect.left, window.innerWidth - 196)),
                          top: segmentRect.bottom + 4,
                        },
                    )
                  }}
                >
                  <Icon name={isFlyoutOpen ? 'chevronDown' : 'chevronRight'} />
                </button>
              ) : null}
              {hasChildFolders && isFlyoutOpen && openedFolderChainItem ? (
                <div
                  className="folder-chain-item-flyout"
                  style={{
                    left: openedFolderChainItem.left,
                    top: openedFolderChainItem.top,
                  }}
                >
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
                        setOpenedFolderChainItem(null)
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
  favoritePlaylistId,
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
  favoritePlaylistId: number
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
  const [searchTargetFolder, setSearchTargetFolder] = useState<FolderNode | null>(null)
  const { getFolderPreferenceMenuItem } = useFolderPreferenceMenuItem(t)
  const { nodes } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, rootPath, songs],
  )
  const searchDirectory = (folder: FolderNode, query: string) => {
    onSearchDirectory(query, folder.relativePath)
    setSearchTargetFolder(null)
    setFolderChainMenu(null)
  }
  const playablePlaylists = playlists.filter((playlist) => !playlist.isBuiltIn || playlist.name === t('common.myFavorites'))
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])
  const addSongsToFavorites = (songIds: number[]) => {
    onAddSongsToPlaylist(favoritePlaylistId, songIds)
  }
  const getNotFavoriteSongIds = (songIds: number[]) => songIds.filter((songId) => !favoriteSongIdSet.has(songId))
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
              onClick: () => {
                const shuffledSongIds = shuffleSongIds(folderChainMenu.folder.subtreeSongIds)
                if (shuffledSongIds.length > 0) {
                  onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
                }
              },
            },
            getAddToPlaylistMenuFlyoutItem({
              playlists: playablePlaylists,
              songIds: folderChainMenu.folder.subtreeSongIds,
              t,
              defaultPlaylistName: folderChainMenu.folder.name,
              includeNowPlaying: true,
              includeFavorites: getNotFavoriteSongIds(folderChainMenu.folder.subtreeSongIds).length > 0,
              onAddToNowPlaying: () => onAddSongsToNowPlaying(folderChainMenu.folder.subtreeSongIds),
              onToggleFavorite: () => {
                addSongsToFavorites(getNotFavoriteSongIds(folderChainMenu.folder.subtreeSongIds))
              },
              onCreatePlaylist: (name) => onCreatePlaylistWithSongs(name, folderChainMenu.folder.subtreeSongIds),
              onAddToPlaylist: (playlistId) => onAddSongsToPlaylist(playlistId, folderChainMenu.folder.subtreeSongIds),
            }),
            getFolderPreferenceMenuItem(folderChainMenu.folder, 'chain'),
            {
              key: 'chain-show-in-explorer',
              text: t('context.reveal'),
              pendingText: t('context.openingLocal'),
              icon: 'local',
              onClick: () => onRevealFolder(folderChainMenu.folder.path),
            },
            {
              key: 'chain-search-directory',
              text: t('local.searchDirectory'),
              icon: 'search',
              onClick: () => {
                setSearchTargetFolder(folderChainMenu.folder)
              },
            },
          ].filter((item) => item != null) as MenuFlyoutItem[]}
        />
      ) : null}
      {searchTargetFolder ? (
        <InputDialog
          t={t}
          title={t('local.searchDirectoryPrompt', { name: searchTargetFolder.name })}
          defaultValue=""
          validate={(query) => query ? '' : t('local.searchQueryEmpty')}
          onCancel={() => {
            setSearchTargetFolder(null)
          }}
          onConfirm={(query) => {
            searchDirectory(searchTargetFolder, query)
          }}
        />
      ) : null}
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
  error,
  onPickLibraryRoot,
  onOpenFolder,
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
    return (
      <section className="page-panel local-page">
        {loading ? (
          <LoadingState t={t} />
        ) : (
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
          <div className="empty-state">
          <h3>{t('local.folderNotFound')}</h3>
          <p>{t('local.folderNotFoundDescription')}</p>
          <Link className="local-command" to="/local">
            <Icon name="arrowLeft" />
            {t('local.backToRoot')}
          </Link>
          </div>
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
          <CommandBarButton
            icon="shuffle"
            label={t('nowPlaying.randomPlay')}
            onClick={playShuffled}
          />
          <CommandBarButton
            icon="refresh"
            label={scanning ? t('library.scanning') : isCompactLayout ? t('local.updateFolderShort') : t('local.updateFolder')}
            onClick={() => {
              void refreshFolderWithResult(currentNode)
            }}
            disabled={scanning}
          />
          <CommandBarButton
            icon="sort"
            label={t('common.sort')}
            onClick={(event) => {
              showSortMenu(event)
            }}
          />
          <CommandBarButton
            icon="folder"
            label={t('local.newFolder')}
            onClick={createFolder}
          />
          <CommandBarButton
            icon="multiSelect"
            label={t('albums.multiSelect')}
            active={multiSelect}
            onClick={() => {
              if (multiSelect) {
                return
              }
              setMultiSelect(true)
              setLocalNotification('')
            }}
          />
        </CommandBar>
      </div>

      {loading ? <div className="root-banner">{t('library.refreshing')}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {localNotification ? <div className="root-banner">{localNotification}</div> : null}
      {scanning ? (
        <div className="local-refresh-overlay" role="status" aria-live="polite">
          <LoadingState t={t} />
          <p>{t('local.updateFolderLoading')}</p>
        </div>
      ) : null}

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
          setSelectionAddMenu({ x: rect.left, y: rect.top - 8 })
        }}
        onRemove={() => {
          void deleteSelectedItems()
        }}
        removeLabel={t('playlists.delete')}
        extraActions={[
          {
            key: 'move-to-folder',
            text: t('context.moveToFolder'),
            icon: 'folder',
            disabled: selectedLocalItemCount === 0 || selectedMoveTargetFolders.length === 0,
            onClick: (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setSelectionMoveMenu({ x: rect.left, y: rect.top - 8 })
            },
          },
        ]}
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
        onCancel={() => {
          ClearMultiSelectStatus()
        }}
      />

      {childFolders.length === 0 && currentSongs.length === 0 ? (
        loading || scanning ? (
          <LoadingState t={t} />
        ) : songs.length === 0 || searchQuery.trim() ? (
        <div className="empty-state">
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
        </div>
        ) : (
          <div className="local-empty-folder" aria-hidden="true" />
        )
      ) : effectiveViewMode === 'grid' ? (
        <div className="local-scroll-frame custom-scrollbar-frame" ref={localScrollFrameRef}>
          <div className="local-scroll-shell custom-scrollbar-container" ref={localScrollShellRef}>
            {childFolders.length > 0 ? (
            showLocalSectionHeaders ? (
              <LocalContentSection
                count={childFolders.length}
                expanded={foldersExpanded}
                title={t('common.folders')}
                onToggle={() => setFoldersExpanded((current) => !current)}
              >
                <div className="local-folder-grid">
                  {childFolders.map((folder) => (
                    <LocalFolderCard
                      folder={folder}
                      key={folder.relativePath}
                      selected={selectedFolderPaths.has(folder.relativePath)}
                      multiSelect={multiSelect}
                      nodes={nodes}
                      songsById={songsById}
                      t={t}
                      variant={isCompactLayout ? 'list' : 'grid'}
                      onPlayFolder={shuffleFolder}
                      onAddFolder={(event, folder) => {
                        setFolderAddMenu({ folder, x: event.clientX, y: event.clientY })
                      }}
                      onRefreshFolder={(folder) => {
                        void refreshFolderWithResult(folder)
                      }}
                      onSearchFolder={searchDirectory}
                      onRevealFolder={(folder) => {
                        void onRevealFolder(folder.path)
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
              </LocalContentSection>
            ) : (
              <div className="local-folder-grid">
                {childFolders.map((folder) => (
                  <LocalFolderCard
                    folder={folder}
                    key={folder.relativePath}
                    selected={selectedFolderPaths.has(folder.relativePath)}
                    multiSelect={multiSelect}
                    nodes={nodes}
                    songsById={songsById}
                    t={t}
                    variant={isCompactLayout ? 'list' : 'grid'}
                    onPlayFolder={shuffleFolder}
                    onAddFolder={(event, folder) => {
                      setFolderAddMenu({ folder, x: event.clientX, y: event.clientY })
                    }}
                    onRefreshFolder={(folder) => {
                      void refreshFolderWithResult(folder)
                    }}
                    onSearchFolder={searchDirectory}
                    onRevealFolder={(folder) => {
                      void onRevealFolder(folder.path)
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
            )
          ) : null}
            {currentSongs.length > 0 ? (
            showLocalSectionHeaders ? (
              <LocalContentSection
                count={currentSongs.length}
                expanded={songsExpanded}
                title={t('local.allSongs')}
                onToggle={() => setSongsExpanded((current) => !current)}
              >
                <div className={showSongQuickJump ? 'local-song-grid-shell has-quick-jump' : 'local-song-grid-shell'}>
                  {showSongQuickJump ? (
                    <LocalSongQuickJump
                      basisName={songQuickJumpBasisName}
                      enabledKeys={songQuickJumpMap}
                      t={t}
                      visible={showSongQuickJump}
                      onJump={jumpToLocalSongKey}
                    />
                  ) : null}
                  <div className={isCompactLayout ? 'playlist-control-compact local-compact-song-list' : 'local-song-grid'}>
                  {currentSongs.map((song, index) => (
                    <div
                      className={isCompactLayout ? 'local-compact-song-row' : 'local-song-grid-item'}
                      key={song.id}
                      ref={(element) => {
                        localSongItemRefs.current[index] = element
                      }}
                    >
                      {isCompactLayout ? (
                        <PlaylistControlItem
                          song={song}
                          selected={selectedSongIds.has(song.id)}
                          current={song.id === selectedTrackId}
                          playing={song.id === selectedTrackId && isPlaying}
                          selectionMode={multiSelect}
                          dropPosition={null}
                          queueSongIds={queueSongIds}
                          t={t}
                          showAlbum={false}
                          onPlayTrack={onPlayTrack}
                          onTogglePlayPause={onTogglePlayPause}
                          onToggleSelection={() => toggleSongSelection(song.id)}
                          onAddToPlaylistClick={(song, x, y) => {
                            setSongAddMenu({ song, x, y })
                          }}
                          onContextMenu={(song, x, y) => {
                            setSongMenu({ song, x, y })
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                        />
                      ) : (
                        <GridViewMusicItemControl
                          song={song}
                          selected={selectedSongIds.has(song.id)}
                          current={song.id === selectedTrackId}
                          playing={song.id === selectedTrackId && isPlaying}
                          multiSelect={multiSelect}
                          queueSongIds={queueSongIds}
                          t={t}
                          variant="local"
                          draggable
                          onPlayTrack={onPlayTrack}
                          onTogglePlayPause={onTogglePlayPause}
                          onToggleSelection={toggleSongSelection}
                          onAddToPlaylistClick={(event, song) => {
                            setSongAddMenu({ song, x: event.clientX, y: event.clientY })
                          }}
                          onDragStart={(event, song) => {
                            event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onContextMenu={(event, song) => {
                            setSongMenu({ song, x: event.clientX, y: event.clientY })
                          }}
                        />
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              </LocalContentSection>
            ) : (
              <div className={showSongQuickJump ? 'local-song-grid-shell has-quick-jump' : 'local-song-grid-shell'}>
                {showSongQuickJump ? (
                  <LocalSongQuickJump
                    basisName={songQuickJumpBasisName}
                    enabledKeys={songQuickJumpMap}
                    t={t}
                    visible={showSongQuickJump}
                    onJump={jumpToLocalSongKey}
                  />
                ) : null}
                <div className={isCompactLayout ? 'playlist-control-compact local-compact-song-list' : 'local-song-grid'}>
                {currentSongs.map((song, index) => (
                  <div
                    className={isCompactLayout ? 'local-compact-song-row' : 'local-song-grid-item'}
                    key={song.id}
                    ref={(element) => {
                      localSongItemRefs.current[index] = element
                    }}
                  >
                    {isCompactLayout ? (
                      <PlaylistControlItem
                        song={song}
                        selected={selectedSongIds.has(song.id)}
                        current={song.id === selectedTrackId}
                        playing={song.id === selectedTrackId && isPlaying}
                        selectionMode={multiSelect}
                        dropPosition={null}
                        queueSongIds={queueSongIds}
                        t={t}
                        showAlbum={false}
                        onPlayTrack={onPlayTrack}
                        onTogglePlayPause={onTogglePlayPause}
                        onToggleSelection={() => toggleSongSelection(song.id)}
                        onAddToPlaylistClick={(song, x, y) => {
                          setSongAddMenu({ song, x, y })
                        }}
                        onContextMenu={(song, x, y) => {
                          setSongMenu({ song, x, y })
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                      />
                    ) : (
                      <GridViewMusicItemControl
                        song={song}
                        selected={selectedSongIds.has(song.id)}
                        current={song.id === selectedTrackId}
                        playing={song.id === selectedTrackId && isPlaying}
                        multiSelect={multiSelect}
                        queueSongIds={queueSongIds}
                        t={t}
                        variant="local"
                        draggable
                        onPlayTrack={onPlayTrack}
                        onTogglePlayPause={onTogglePlayPause}
                        onToggleSelection={toggleSongSelection}
                        onAddToPlaylistClick={(event, song) => {
                          setSongAddMenu({ song, x: event.clientX, y: event.clientY })
                        }}
                        onDragStart={(event, song) => {
                          event.dataTransfer.setData('application/x-smplayer-local-items', JSON.stringify(dragPayloadForSong(song)))
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onContextMenu={(event, song) => {
                          setSongMenu({ song, x: event.clientX, y: event.clientY })
                        }}
                      />
                    )}
                  </div>
                ))}
                </div>
              </div>
            )
            ) : null}
          </div>
          <CustomScrollbar
            scrollbarTrackRef={localScrollbarTrackRef}
            onThumbPointerDown={onLocalScrollbarPointerDown}
          />
        </div>
      ) : (
        <div className="local-scroll-frame custom-scrollbar-frame" ref={localTableScrollFrameRef}>
          <div className="table-shell local-table-shell custom-scrollbar-container" ref={localTableShellRef}>
            <table className="music-table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.artist')}</th>
                <th>{t('common.album')}</th>
              </tr>
            </thead>
            <tbody>
              {showLocalSectionHeaders && childFolders.length > 0 ? (
                <LocalTableSectionHeader
                  count={childFolders.length}
                  expanded={foldersExpanded}
                  title={t('common.folders')}
                  onToggle={() => setFoldersExpanded((current) => !current)}
                />
              ) : null}
              {showFolderItems ? childFolders.map((folder) => (
                <tr
                  key={folder.relativePath}
                  className={joinClassNames(
                    'local-table-folder-row',
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
                  <td className="local-table-name-cell local-table-folder-name-cell" colSpan={3}>
                    {multiSelect ? (
                      <span className={selectedFolderPaths.has(folder.relativePath) ? 'local-check is-selected' : 'local-check'}>
                        {selectedFolderPaths.has(folder.relativePath) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    <button className="table-link table-link-button" type="button">
                      <img className="local-table-type-icon" src={LOCAL_FOLDER_TYPE_ICON_URL} alt="" />
                      <span className="local-table-primary-text">{folder.name}</span>
                    </button>
                    <span className="local-table-folder-summary">
                      {t('local.folderSongsCompact', { count: folder.directSongIds.length })}
                    </span>
                    <Icon name="chevronRight" />
                    {!multiSelect ? (
                      <span className="local-table-item-actions">
                        <button
                          type="button"
                          title={t('local.playAllButtonTooltip')}
                          onClick={(event) => {
                            event.stopPropagation()
                            shuffleFolder(folder)
                          }}
                        >
                          <Icon name="shuffle" />
                        </button>
                        <button
                          type="button"
                          title={t('context.addToPlaylist')}
                          onClick={(event) => {
                            event.stopPropagation()
                            setFolderAddMenu({ folder, x: event.clientX, y: event.clientY })
                          }}
                        >
                          <Icon name="plus" />
                        </button>
                        <button
                          type="button"
                          title={t('local.updateFolder')}
                          onClick={(event) => {
                            event.stopPropagation()
                            void refreshFolderWithResult(folder)
                          }}
                        >
                          <Icon name="refresh" />
                        </button>
                        <button
                          type="button"
                          title={t('local.searchFolderButtonTooltip')}
                          onClick={(event) => {
                            event.stopPropagation()
                            searchDirectory(folder)
                          }}
                        >
                          <Icon name="search" />
                        </button>
                        <button
                          type="button"
                          title={t('local.openLocalButtonTooltip')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRevealFolder(folder.path)
                          }}
                        >
                          <Icon name="local" />
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              )) : null}
              {showLocalSectionHeaders && currentSongs.length > 0 ? (
                <LocalTableSectionHeader
                  count={currentSongs.length}
                  expanded={songsExpanded}
                  title={t('local.allSongs')}
                  onToggle={() => setSongsExpanded((current) => !current)}
                />
              ) : null}
              {showSongItems && showSongQuickJump ? (
                <tr className="local-table-quick-jump-row">
                  <td colSpan={3}>
                    <LocalSongQuickJump
                      basisName={songQuickJumpBasisName}
                      enabledKeys={songQuickJumpMap}
                      t={t}
                      visible={showSongQuickJump}
                      onJump={jumpToLocalSongKey}
                    />
                  </td>
                </tr>
              ) : null}
              {showSongItems ? currentSongs.map((song, index) => (
                <tr
                  key={`${currentNode.relativePath}-${song.id}`}
                  ref={(element) => {
                    localSongItemRefs.current[index] = element
                  }}
                  className={joinClassNames(
                    'local-table-song-row',
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
                  <td className="local-table-name-cell local-table-song-name-cell">
                    {multiSelect ? (
                      <span className={selectedSongIds.has(song.id) ? 'local-check is-selected' : 'local-check'}>
                        {selectedSongIds.has(song.id) ? <Icon name="check" /> : null}
                      </span>
                    ) : null}
                    <span className="local-table-row-icon">
                      {song.id === selectedTrackId ? (
                        <Icon name="play" />
                      ) : (
                        <img className="local-table-type-icon" src={LOCAL_FILE_TYPE_ICON_URL} alt="" />
                      )}
                    </span>
                    <span className="local-table-primary-text">{song.title}</span>
                    {!multiSelect ? (
                      <span className="local-table-item-actions local-table-song-actions">
                        <button
                          type="button"
                          title={t('context.play')}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (song.id === selectedTrackId && isPlaying) {
                              onTogglePlayPause()
                            } else {
                              onMoveToMusicOrPlay(song.id)
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
                          <Icon name="playNext" />
                        </button>
                      </span>
                    ) : null}
                  </td>
                  <td className="local-table-artist-cell">
                    {getSongArtists(song, t('common.artistUnknown')).map((artist, index) => (
                      <span key={artist}>
                        {index > 0 ? ', ' : null}
                        <Link
                          className="table-link"
                          to={`/artists?artist=${encodeURIComponent(artist)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {artist}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="local-table-album-cell">
                    <Link
                      className="table-link"
                      to={`/albums?album=${encodeURIComponent(song.album || t('common.albumUnknown'))}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {song.album || t('common.albumUnknown')}
                    </Link>
                  </td>
                </tr>
              )) : null}
            </tbody>
            </table>
          </div>
          <CustomScrollbar
            scrollbarTrackRef={localTableScrollbarTrackRef}
            onThumbPointerDown={onLocalTableScrollbarPointerDown}
          />
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
      {folderUpdateResultDialog ? (
        <FolderUpdateResultDialog
          t={t}
          result={folderUpdateResultDialog.result}
          folder={folderUpdateResultDialog.folder}
          songs={songs}
          selectedTrackId={selectedTrackId}
          onPlaySong={onMoveToMusicOrPlay}
          onOpenSongMenu={(song, x, y) => {
            setFolderUpdateResultSongMenu({ song, x, y })
          }}
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
          onClose={() => {
            setFolderUpdateResultSongMenu(null)
          }}
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
          onCancel={() => {
            setInputDialog(null)
          }}
          onConfirm={(value) => {
            void inputDialog.onConfirm(value)
          }}
        />
      ) : null}
      {removeDialog ? (
        <RemoveDialog
          t={t}
          title={removeDialog.title}
          message={removeDialog.message}
          onCancel={() => {
            setRemoveDialog(null)
          }}
          onConfirm={() => {
            void removeDialog.onConfirm()
          }}
        />
      ) : null}
    </section>
  )
}

function LocalContentSection({
  title,
  count,
  expanded,
  children,
  onToggle,
}: {
  title: string
  count: number
  expanded: boolean
  children: ReactNode
  onToggle: () => void
}) {
  return (
    <section className={expanded ? 'local-content-section is-expanded' : 'local-content-section'}>
      <button className={expanded ? 'local-content-section-header is-expanded' : 'local-content-section-header'} type="button" onClick={onToggle}>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
        <span>{title}</span>
        <span className="local-content-section-count">{count}</span>
      </button>
      {expanded ? children : null}
    </section>
  )
}

function LocalTableSectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <tr className="local-table-section-row">
      <td colSpan={3}>
        <button className={expanded ? 'local-content-section-header is-expanded' : 'local-content-section-header'} type="button" onClick={onToggle}>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
          <span>{title}</span>
          <span className="local-content-section-count">{count}</span>
        </button>
      </td>
    </tr>
  )
}

function LocalSongQuickJump({
  basisName,
  enabledKeys,
  t,
  visible,
  onJump,
}: {
  basisName: string
  enabledKeys: Map<string, number>
  t: Translator
  visible: boolean
  onJump: (key: string) => void
}) {
  if (!visible) {
    return null
  }

  return (
    <nav className="local-song-quick-jump" aria-label={t('common.search')}>
      {LOCAL_TEXT_QUICK_JUMP_KEYS.map((key) => {
        const enabled = enabledKeys.has(key)

        return (
          <button
            disabled={!enabled}
            key={key}
            title={getQuickJumpTooltip(key, enabled, t('common.songs'), basisName, t)}
            type="button"
            onClick={() => {
              onJump(key)
            }}
          >
            {key}
          </button>
        )
      })}
    </nav>
  )
}

function buildLocalSongQuickJumpMap(
  songs: LibrarySong[],
  sortMode: LocalSortMode,
  currentSortMode: LocalSortMode,
  t: Translator,
) {
  const indexes = new Map<string, number>()
  const quickJumpSortMode = sortMode === 'reverse' ? currentSortMode : sortMode

  songs.forEach((song, index) => {
    const bucket = getLocalTextQuickJumpBucket(getLocalSongQuickJumpValue(song, quickJumpSortMode, t))
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

function getLocalSongQuickJumpValue(song: LibrarySong, sortMode: LocalSortMode, t: Translator) {
  switch (sortMode) {
    case 'artist':
      return getSongArtists(song, t('common.artistUnknown'))[0] ?? ''
    case 'album':
      return song.album || t('common.albumUnknown')
    case 'reverse':
    case 'title':
      return song.title
  }
}

function getLocalSongQuickJumpBasisName(sortMode: LocalSortMode, currentSortMode: LocalSortMode, t: Translator) {
  const quickJumpSortMode = sortMode === 'reverse' ? currentSortMode : sortMode

  switch (quickJumpSortMode) {
    case 'artist':
      return t('common.artist')
    case 'album':
      return t('common.album')
    case 'reverse':
    case 'title':
      return t('musicLibrary.titleHeader')
  }
}
