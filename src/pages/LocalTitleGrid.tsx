import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { InputDialog } from '../components/InputDialog'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { useFolderPreferenceMenuItem } from '../hooks/useFolderPreferenceMenuItem'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import type { LibraryFolder, LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import {
  buildFolderChain,
  buildFolderIndex,
  shuffleSongIds,
  type FolderNode,
} from './localFolderModel'
import { buildLocalMoveToFolderMenuItems } from './localMoveToFolderMenu'

export interface FolderChainDropPayload {
  songIds: number[]
  folderPaths: string[]
}

interface FolderChainMenuState extends MenuFlyoutPosition {
  folder: FolderNode
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
  const [openedFolderChainItem, setOpenedFolderChainItem] = useState<{ path: string; left: number; top: number } | null>(null)
  const folderChainListRef = useRef<HTMLElement | null>(null)
  const folderChainFlyoutFrameRef = useRef<HTMLDivElement | null>(null)
  const folderChainFlyoutScrollRef = useRef<HTMLDivElement | null>(null)
  const folderChainFlyoutScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const folderChainDragRef = useRef({ active: false, dragged: false, startX: 0, scrollLeft: 0 })
  const { nodes } = useMemo(
    () => buildFolderIndex(songs, folders, rootPath),
    [folders, songs, rootPath],
  )
  const folderChain = useMemo(
    () => buildFolderChain(currentRelativePath, nodes),
    [currentRelativePath, nodes],
  )
  const onFolderChainFlyoutScrollbarPointerDown = useCustomScrollbar({
    frameRef: folderChainFlyoutFrameRef,
    scrollContainerRef: folderChainFlyoutScrollRef,
    scrollbarTrackRef: folderChainFlyoutScrollbarTrackRef,
    refreshDependencies: [openedFolderChainItem?.path],
  })
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
          if (event.target !== event.currentTarget) {
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
              {hasChildFolders && isFlyoutOpen && openedFolderChainItem ? createPortal(
                <div
                  className="folder-chain-item-flyout"
                  ref={folderChainFlyoutFrameRef}
                  style={{
                    left: openedFolderChainItem.left,
                    top: openedFolderChainItem.top,
                  }}
                >
                  <div className="folder-chain-item-flyout-scroll custom-scrollbar-container" ref={folderChainFlyoutScrollRef}>
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
                  <CustomScrollbar
                    className="folder-chain-item-flyout-scrollbar"
                    scrollbarTrackRef={folderChainFlyoutScrollbarTrackRef}
                    onThumbPointerDown={onFolderChainFlyoutScrollbarPointerDown}
                  />
                </div>,
                document.body,
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
  onMoveLocalItemsToFolder,
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
  onMoveLocalItemsToFolder: (songIds: number[], folderPaths: string[], targetFolderPath: string) => void | Promise<void>
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
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
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
  const getFolderChainMoveToMenuItem = (folder: FolderNode) => {
    const submenu = buildLocalMoveToFolderMenuItems({
      nodes,
      songsById,
      songIds: [],
      folderPaths: [folder.path],
      t,
      onMoveToFolder: (targetFolder) => {
        void onMoveLocalItemsToFolder([], [folder.path], targetFolder.path)
        setFolderChainMenu(null)
      },
    })

    if (submenu.length === 0) {
      return null
    }

    return {
      key: 'chain-move-to-folder',
      text: t('context.moveToFolder'),
      icon: 'folder',
      submenu,
    } satisfies MenuFlyoutItem
  }
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
            getFolderChainMoveToMenuItem(folderChainMenu.folder),
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
