import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'

import { resolveSongArtworks } from '../hooks/useSongArtwork'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { FOLDER_ICON_URL } from '../shared/staticAssets'
import { getOriginalFolderThumbnailCandidateGroups, type FolderNode } from '../pages/localFolderModel'
import { GridArtworkCardContent } from './GridArtworkCardContent'
import { Icon } from './icons'

export const LOCAL_FOLDER_TYPE_ICON_URL = FOLDER_ICON_URL

const localFolderThumbnailUrlsCache = new Map<string, string[]>()

function getFolderThumbnailSignature(folder: FolderNode, candidateGroups: LibrarySong[][]) {
  return `${folder.relativePath}:${candidateGroups.map((groupSongs) => groupSongs.map((song) => song.id).join(',')).join('|')}`
}

async function resolveOriginalFolderThumbnailUrls(candidateGroups: LibrarySong[][], isDisposed: () => boolean) {
  const artworkUrls: string[] = []

  for (const groupSongs of candidateGroups) {
    const artworkBySongId = await resolveSongArtworks(groupSongs.map((song) => song.id))
    for (const song of groupSongs) {
      if (isDisposed()) {
        return artworkUrls
      }
      const artworkUrl = artworkBySongId.get(song.id) ?? ''
      if (artworkUrl) {
        artworkUrls.push(artworkUrl)
        break
      }
    }

    if (artworkUrls.length === 4) {
      return artworkUrls
    }
  }

  return artworkUrls
}

function useOriginalFolderThumbnailUrls(
  folder: FolderNode,
  nodes: Map<string, FolderNode>,
  songsById: Map<number, LibrarySong>,
) {
  const candidateGroups = useMemo(
    () => getOriginalFolderThumbnailCandidateGroups(folder, nodes, songsById),
    [folder, nodes, songsById],
  )
  const thumbnailSignature = getFolderThumbnailSignature(folder, candidateGroups)
  const [artworkUrls, setArtworkUrls] = useState(() =>
    localFolderThumbnailUrlsCache.get(thumbnailSignature) ?? folder.thumbnailUrls,
  )

  useEffect(() => {
    let disposed = false
    const cachedArtworkUrls = localFolderThumbnailUrlsCache.get(thumbnailSignature)
    if (cachedArtworkUrls) {
      setArtworkUrls(cachedArtworkUrls)
      return () => {
        disposed = true
      }
    }

    setArtworkUrls(folder.thumbnailUrls)
    void resolveOriginalFolderThumbnailUrls(candidateGroups, () => disposed).then((nextArtworkUrls) => {
      if (!disposed) {
        localFolderThumbnailUrlsCache.set(thumbnailSignature, nextArtworkUrls)
        setArtworkUrls(nextArtworkUrls)
      }
    })

    return () => {
      disposed = true
    }
  }, [candidateGroups, folder.thumbnailUrls, thumbnailSignature])

  return artworkUrls
}

function FolderTypeBadge() {
  return (
    <span className="local-folder-type-badge" aria-hidden="true">
      <img src={LOCAL_FOLDER_TYPE_ICON_URL} alt="" />
    </span>
  )
}

export function LocalFolderCard({
  folder,
  selected,
  dropTarget = false,
  multiSelect,
  nodes,
  songsById,
  t,
  draggable = true,
  variant = 'grid',
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onOpenFolder,
  onToggleSelection,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onOpenFolderMenu,
}: {
  folder: FolderNode
  selected: boolean
  dropTarget?: boolean
  multiSelect: boolean
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  t: Translator
  draggable?: boolean
  variant?: 'grid' | 'list'
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (event: MouseEvent, folder: FolderNode) => void
  onRefreshFolder?: (folder: FolderNode) => void
  onSearchFolder?: (folder: FolderNode) => void
  onRevealFolder?: (folder: FolderNode) => void
  onOpenFolder: (targetRelativePath: string) => void
  onToggleSelection: (folderPath: string) => void
  onDragStart?: (event: DragEvent, folder: FolderNode) => void
  onDragOver?: (event: DragEvent, folder: FolderNode) => void
  onDragLeave?: (event: DragEvent, folder: FolderNode) => void
  onDrop?: (event: DragEvent, folder: FolderNode) => void
  onDragEnd?: () => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
}) {
  const artworkUrls = useOriginalFolderThumbnailUrls(folder, nodes, songsById)
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
  const listContent = (
    <>
      {multiSelect ? (
        <span className={selected ? 'local-card-check is-selected' : 'local-card-check'} aria-hidden="true">
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
      <span className="local-folder-list-icon" aria-hidden="true">
        <img src={LOCAL_FOLDER_TYPE_ICON_URL} alt="" />
      </span>
      <span className="local-folder-list-content">
        <span className="local-folder-list-name" title={folder.path}>{folder.name}</span>
      </span>
      <span className="local-folder-list-trailing">
        {!multiSelect ? (
          <span className="local-folder-list-actions">
            <button
              type="button"
              aria-label={t('local.gridFolderPlayInfo', { name: folder.name })}
              title={t('local.gridFolderPlayInfo', { name: folder.name })}
              onClick={(event) => {
                event.stopPropagation()
                onPlayFolder(folder)
              }}
            >
              <Icon name="play" />
            </button>
            <button
              type="button"
              disabled={folder.subtreeSongIds.length === 0}
              aria-label={t('context.addToPlaylist')}
              title={t('context.addToPlaylist')}
              onClick={(event) => {
                event.stopPropagation()
                onAddFolder(event, folder)
              }}
            >
              <Icon name="plus" />
            </button>
            {onRefreshFolder ? (
              <button
                type="button"
                aria-label={t('local.updateFolder')}
                title={t('local.updateFolder')}
                onClick={(event) => {
                  event.stopPropagation()
                  onRefreshFolder(folder)
                }}
              >
                <Icon name="refresh" />
              </button>
            ) : null}
            {onSearchFolder ? (
              <button
                type="button"
                aria-label={t('local.searchFolderButtonTooltip')}
                title={t('local.searchFolderButtonTooltip')}
                onClick={(event) => {
                  event.stopPropagation()
                  onSearchFolder(folder)
                }}
              >
                <Icon name="search" />
              </button>
            ) : null}
            {onRevealFolder ? (
              <button
                type="button"
                aria-label={t('local.openLocalButtonTooltip')}
                title={t('local.openLocalButtonTooltip')}
                onClick={(event) => {
                  event.stopPropagation()
                  onRevealFolder(folder)
                }}
              >
                <Icon name="local" />
              </button>
            ) : null}
          </span>
        ) : null}
        <Icon name="chevronRight" />
      </span>
    </>
  )

  if (variant === 'list') {
    if (multiSelect) {
      return (
        <button
          type="button"
          className={['local-folder-card local-folder-card-list', selected ? 'is-selected' : '', dropTarget ? 'is-drop-target' : ''].filter(Boolean).join(' ')}
          draggable={draggable}
          onDragStart={draggable ? (event) => onDragStart?.(event, folder) : undefined}
          onDragOver={draggable ? (event) => onDragOver?.(event, folder) : undefined}
          onDragLeave={draggable ? (event) => onDragLeave?.(event, folder) : undefined}
          onDrop={draggable ? (event) => onDrop?.(event, folder) : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
          onContextMenu={(event) => {
            event.preventDefault()
            onOpenFolderMenu(folder, event.clientX, event.clientY)
          }}
          onClick={() => {
            onToggleSelection(folder.relativePath)
          }}
        >
          {listContent}
        </button>
      )
    }

    return (
      <article
        role="button"
        tabIndex={0}
        className={['local-folder-card local-folder-card-list', dropTarget ? 'is-drop-target' : ''].filter(Boolean).join(' ')}
        draggable={draggable}
        onDragStart={draggable ? (event) => onDragStart?.(event, folder) : undefined}
        onDragOver={draggable ? (event) => onDragOver?.(event, folder) : undefined}
        onDragLeave={draggable ? (event) => onDragLeave?.(event, folder) : undefined}
        onDrop={draggable ? (event) => onDrop?.(event, folder) : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
        onContextMenu={(event) => {
          event.preventDefault()
          onOpenFolderMenu(folder, event.clientX, event.clientY)
        }}
        onClick={openFolder}
        onKeyDown={openFolderOnKeyDown}
      >
        {listContent}
      </article>
    )
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
      artworkUrls={artworkUrls}
      badge={<FolderTypeBadge />}
      fallbackIcon="folder"
      selectedMark={multiSelect ? (
        <span className={selected ? 'local-card-check is-selected' : 'local-card-check'}>
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
      subtitle={folder.childPaths.length > 0
        ? t('local.folderCardStats', { folders: folder.childPaths.length, songs: folder.directSongIds.length })
        : t('local.folderSongsShort', { count: folder.directSongIds.length })}
      title={folder.name}
    />
  )

  if (multiSelect) {
    return (
      <button
        type="button"
        className={['local-folder-card', selected ? 'is-selected' : '', dropTarget ? 'is-drop-target' : ''].filter(Boolean).join(' ')}
        draggable={draggable}
        onDragStart={draggable ? (event) => onDragStart?.(event, folder) : undefined}
        onDragOver={draggable ? (event) => onDragOver?.(event, folder) : undefined}
        onDragLeave={draggable ? (event) => onDragLeave?.(event, folder) : undefined}
        onDrop={draggable ? (event) => onDrop?.(event, folder) : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
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
      className={['local-folder-card', dropTarget ? 'is-drop-target' : ''].filter(Boolean).join(' ')}
      draggable={draggable}
      onDragStart={draggable ? (event) => onDragStart?.(event, folder) : undefined}
      onDragOver={draggable ? (event) => onDragOver?.(event, folder) : undefined}
      onDragLeave={draggable ? (event) => onDragLeave?.(event, folder) : undefined}
      onDrop={draggable ? (event) => onDrop?.(event, folder) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
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
