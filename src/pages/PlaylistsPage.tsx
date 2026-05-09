import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'

import { GridViewHolder } from '../components/GridViewHolder'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import type { LibraryPlaylist, LibrarySnapshot, PlaylistSortCriterion, PreferenceItemSnapshot, PreferenceLevel, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { usePreferenceStore } from '../state/usePreferenceStore'

interface PlaylistsPageProps {
  snapshot: LibrarySnapshot
  t: Translator
  loading: boolean
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onSelectPlaylist: (playlistId: number) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onSetPlaylistPreferred: (playlistId: number, name: string, level: PreferenceLevel) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongsFromPlaylist: (playlistId: number, songIds: number[]) => void
  onReorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => void
}

function reorderPlaylistByDrop(playlistIds: number[], draggedPlaylistId: number, targetPlaylistId: number, insertAfter: boolean) {
  const nextPlaylistIds = playlistIds.filter((playlistId) => playlistId !== draggedPlaylistId)
  const targetIndex = nextPlaylistIds.indexOf(targetPlaylistId)
  nextPlaylistIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedPlaylistId)
  return nextPlaylistIds
}

function playlistIdsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((playlistId, index) => playlistId === right[index])
}

interface PlaylistDragState {
  playlist: LibraryPlaylist
  active: boolean
  startX: number
  startY: number
  x: number
  y: number
  offsetX: number
  offsetY: number
}

export function PlaylistsPage({
  snapshot,
  t,
  loading,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onSelectPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onReorderPlaylists,
  onSetPlaylistPreferred,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
}: PlaylistsPageProps) {
  const navigate = useNavigate()
  const params = useParams()
  const draggedPlaylistIdRef = useRef<number | null>(null)
  const previewPlaylistIdsRef = useRef<number[] | null>(null)
  const playlistCardElementsRef = useRef(new Map<number, HTMLDivElement>())
  const playlistDragStateRef = useRef<PlaylistDragState | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const latestDragPointRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextOpenRef = useRef(false)
  const dragOverlayElementRef = useRef<HTMLDivElement | null>(null)
  const [playlistMenu, setPlaylistMenu] = useState<{ playlist: LibraryPlaylist; x: number; y: number } | null>(null)
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<number | null>(null)
  const [previewPlaylistIds, setPreviewPlaylistIds] = useState<number[] | null>(null)
  const [playlistDragState, setPlaylistDragState] = useState<PlaylistDragState | null>(null)
  const [playlistPreferenceItems, setPlaylistPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [pendingCreatedPlaylistName, setPendingCreatedPlaylistName] = useState('')
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const routePlaylistId = params.playlistId ? Number(params.playlistId) : null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const customPlaylists = useMemo(
    () => snapshot.playlists.filter((playlist) => !playlist.isBuiltIn),
    [snapshot.playlists],
  )
  const customPlaylistIds = useMemo(
    () => customPlaylists.map((playlist) => playlist.id),
    [customPlaylists],
  )
  const visiblePlaylists = useMemo(() => {
    const displayPlaylists = customPlaylists.filter((playlist) =>
      playlist.name !== t('common.nowPlaying') &&
      playlist.name !== 'Now Playing',
    )
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return displayPlaylists
    }

    return displayPlaylists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedSearchQuery))
  }, [customPlaylists, searchQuery, t])
  const selectedPlaylistId =
    routePlaylistId != null && snapshot.playlists.some((playlist) => playlist.id === routePlaylistId)
      ? routePlaylistId
      : 0
  const selectedPlaylist = snapshot.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const orderedVisiblePlaylists = useMemo(() => {
    const visiblePlaylistMap = new Map(visiblePlaylists.map((playlist) => [playlist.id, playlist]))
    const orderedIds = previewPlaylistIds ?? customPlaylistIds
    return orderedIds
      .map((playlistId) => visiblePlaylistMap.get(playlistId))
      .filter((playlist) => playlist !== undefined)
  }, [customPlaylistIds, previewPlaylistIds, visiblePlaylists])
  const selectedPlaylistSongs = useMemo(
    () =>
      (selectedPlaylist?.songIds ?? [])
        .map((songId) => songsById.get(songId))
        .filter((song) => song !== undefined),
    [selectedPlaylist?.songIds, songsById],
  )
  const refreshPlaylistPreferenceItems = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setPlaylistPreferenceItems(new Map([...settings.playlists, ...settings.others].map((item) => [`${item.type}:${item.itemId}`, item])))
  }
  const updatePreviewPlaylistIds = (playlistIds: number[] | null) => {
    previewPlaylistIdsRef.current = playlistIds
    setPreviewPlaylistIds(playlistIds)
  }
  const animatePlaylistCardsFrom = (previousRects: Map<number, DOMRect>) => {
    window.requestAnimationFrame(() => {
      for (const [playlistId, element] of playlistCardElementsRef.current) {
        const previousRect = previousRects.get(playlistId)
        if (!previousRect) {
          continue
        }

        const nextRect = element.getBoundingClientRect()
        const deltaX = previousRect.left - nextRect.left
        const deltaY = previousRect.top - nextRect.top
        if (deltaX === 0 && deltaY === 0) {
          continue
        }

        element.style.transition = 'none'
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`
        window.requestAnimationFrame(() => {
          element.style.transition = ''
          element.style.transform = ''
        })
      }
    })
  }
  const updateAnimatedPreviewPlaylistIds = (playlistIds: number[]) => {
    const previousRects = new Map<number, DOMRect>()
    for (const [playlistId, element] of playlistCardElementsRef.current) {
      previousRects.set(playlistId, element.getBoundingClientRect())
    }

    updatePreviewPlaylistIds(playlistIds)
    animatePlaylistCardsFrom(previousRects)
  }
  const setPlaylistCardElement = (playlistId: number, element: HTMLDivElement | null) => {
    if (element) {
      playlistCardElementsRef.current.set(playlistId, element)
    } else {
      playlistCardElementsRef.current.delete(playlistId)
    }
  }
  const updatePlaylistDragState = (nextState: PlaylistDragState | null) => {
    playlistDragStateRef.current = nextState
    setPlaylistDragState(nextState)
  }
  const positionPlaylistDragOverlay = (dragState: PlaylistDragState) => {
    const overlayElement = dragOverlayElementRef.current
    if (!overlayElement) {
      return
    }

    overlayElement.style.setProperty('--playlist-drag-x', `${dragState.x - dragState.offsetX}px`)
    overlayElement.style.setProperty('--playlist-drag-y', `${dragState.y - dragState.offsetY}px`)
  }
  const movePlaylistPreviewToPoint = (clientX: number, clientY: number) => {
    const draggedPlaylistId = draggedPlaylistIdRef.current
    if (draggedPlaylistId === null) {
      return
    }

    const orderedPlaylistIds = previewPlaylistIdsRef.current ?? customPlaylistIds
    let closestTarget: { playlistId: number; distance: number; insertAfter: boolean } | null = null
    for (const playlistId of orderedPlaylistIds) {
      if (playlistId === draggedPlaylistId) {
        continue
      }

      const element = playlistCardElementsRef.current.get(playlistId)
      if (!element) {
        continue
      }

      const rect = element.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distance = (clientX - centerX) ** 2 + (clientY - centerY) ** 2
      const insertAfter = Math.abs(clientY - centerY) > rect.height / 3
        ? clientY > centerY
        : clientX > centerX

      if (!closestTarget || distance < closestTarget.distance) {
        closestTarget = { playlistId, distance, insertAfter }
      }
    }

    if (closestTarget) {
      const nextPlaylistIds = reorderPlaylistByDrop(
        orderedPlaylistIds,
        draggedPlaylistId,
        closestTarget.playlistId,
        closestTarget.insertAfter,
      )
      if (!playlistIdsEqual(orderedPlaylistIds, nextPlaylistIds)) {
        updateAnimatedPreviewPlaylistIds(nextPlaylistIds)
      }
    }
  }
  const finishPlaylistDrag = (commit: boolean) => {
    const nextPlaylistIds = previewPlaylistIdsRef.current ?? customPlaylistIds
    draggedPlaylistIdRef.current = null
    setDraggingPlaylistId(null)
    updatePreviewPlaylistIds(null)
    updatePlaylistDragState(null)
    if (commit && !playlistIdsEqual(customPlaylistIds, nextPlaylistIds)) {
      onReorderPlaylists(nextPlaylistIds)
    }
  }
  const startPlaylistPointerDrag = (playlist: LibraryPlaylist, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const dragSourceElement = event.currentTarget
    const pointerId = event.pointerId
    dragSourceElement.setPointerCapture(pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    latestDragPointRef.current = { x: event.clientX, y: event.clientY }
    updatePlaylistDragState({
      playlist,
      active: false,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    })

    const processPlaylistDrag = () => {
      dragFrameRef.current = null
      const point = latestDragPointRef.current
      const currentDragState = playlistDragStateRef.current
      if (!point || !currentDragState) {
        return
      }

      const movedDistance = Math.hypot(point.x - currentDragState.startX, point.y - currentDragState.startY)
      if (!currentDragState.active && movedDistance < 5) {
        return
      }

      if (!currentDragState.active) {
        draggedPlaylistIdRef.current = playlist.id
        setDraggingPlaylistId(playlist.id)
        updatePreviewPlaylistIds(customPlaylistIds)
      }

      updatePlaylistDragState({
        ...currentDragState,
        active: true,
        x: point.x,
        y: point.y,
      })
      positionPlaylistDragOverlay({
        ...currentDragState,
        active: true,
        x: point.x,
        y: point.y,
      })
      movePlaylistPreviewToPoint(point.x, point.y)
    }

    const movePlaylist = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault()
      latestDragPointRef.current = { x: pointerEvent.clientX, y: pointerEvent.clientY }
      if (dragFrameRef.current === null) {
        dragFrameRef.current = window.requestAnimationFrame(processPlaylistDrag)
      }
    }
    const stopPlaylistDrag = () => {
      window.removeEventListener('pointermove', movePlaylist)
      window.removeEventListener('pointerup', completePlaylistDrag)
      window.removeEventListener('pointercancel', cancelPlaylistDrag)
      if (dragSourceElement.hasPointerCapture(pointerId)) {
        dragSourceElement.releasePointerCapture(pointerId)
      }
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }

      const shouldCommit = playlistDragStateRef.current?.active === true
      suppressNextOpenRef.current = shouldCommit
      latestDragPointRef.current = null
      finishPlaylistDrag(shouldCommit)
      window.setTimeout(() => {
        suppressNextOpenRef.current = false
      }, 0)
    }
    const completePlaylistDrag = () => {
      stopPlaylistDrag()
    }
    const cancelPlaylistDrag = () => {
      stopPlaylistDrag()
    }

    window.addEventListener('pointermove', movePlaylist)
    window.addEventListener('pointerup', completePlaylistDrag)
    window.addEventListener('pointercancel', cancelPlaylistDrag)
  }

  useEffect(() => {
    void refreshPlaylistPreferenceItems()
  }, [])

  useEffect(() => {
    if (playlistDragState?.active) {
      positionPlaylistDragOverlay(playlistDragState)
    }
  }, [playlistDragState])

  useEffect(() => {
    if (!pendingCreatedPlaylistName) {
      return
    }

    const playlist = snapshot.playlists.find((item) => item.name === pendingCreatedPlaylistName)
    if (playlist) {
      navigate(`/playlists/${playlist.id}`)
      onSelectPlaylist(playlist.id)
      setPendingCreatedPlaylistName('')
    }
  }, [navigate, onSelectPlaylist, pendingCreatedPlaylistName, snapshot.playlists])

  if (routePlaylistId != null && selectedPlaylist) {
    return (
      <section className="page-panel immersive-detail-page">
        {error ? <div className="error-banner">{error}</div> : null}
        <HeaderedPlaylistControl
          type={selectedPlaylist.isBuiltIn ? 'favorites' : 'playlist'}
          title={selectedPlaylist.name}
          headerSongs={selectedPlaylistSongs}
          t={t}
          songs={selectedPlaylistSongs}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          playlists={snapshot.playlists}
          favoritePlaylistId={snapshot.favorites.playlistId}
          artworkUrl={selectedPlaylistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? ''}
          removable
          showAlbum
          showArtist
          showSongArtwork
          canRename={!selectedPlaylist.isBuiltIn}
          canDelete={!selectedPlaylist.isBuiltIn}
          canClear={selectedPlaylistSongs.length > 0}
          canSetPreferred
          sortCriterion={selectedPlaylist.sortCriterion}
          preferenceType={selectedPlaylist.isBuiltIn ? 'my-favorites' : 'playlist'}
          preferenceItemId={selectedPlaylist.isBuiltIn ? '6' : String(selectedPlaylist.id)}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onPlayNext={onPlayNext}
          onTogglePlayPause={onTogglePlayPause}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onRemoveSongs={(songIds) => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, songIds)
          }}
          onRename={(name) => {
            onRenamePlaylist(selectedPlaylist.id, name)
          }}
          onDelete={() => {
            onDeletePlaylist(selectedPlaylist.id)
            navigate('/playlists')
          }}
          onClear={() => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, selectedPlaylistSongs.map((song) => song.id))
          }}
          onSetPreferred={(level) => {
            onSetPlaylistPreferred(selectedPlaylist.id, selectedPlaylist.name, level)
          }}
          onSortSongs={(songIds, sortCriterion) => {
            onReorderPlaylistSongs(selectedPlaylist.id, songIds, sortCriterion)
          }}
          onArtistClick={(artist) => {
            navigate(`/artists/${encodeURIComponent(artist)}`)
          }}
          onAlbumClick={(album) => {
            navigate(`/albums/${encodeURIComponent(album)}`)
          }}
        />
      </section>
    )
  }

  return (
    <section className="playlists-page page-panel">
      <div className="now-playing-commandbar playlists-commandbar">
        <button
          type="button"
          className="now-playing-command"
          onClick={() => {
            setIsCreateDialogOpen(true)
          }}
        >
          <Icon name="plus" />
          {t('playlists.newName')}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {orderedVisiblePlaylists.length === 0 ? (
        loading ? (
          <LoadingState t={t} compact />
        ) : (
        <div className="empty-state compact">
          <h3>{t('playlists.none')}</h3>
          <p>{t('playlists.noneCopy')}</p>
        </div>
        )
      ) : (
        <div className="grid-view-holder-grid">
          {orderedVisiblePlaylists.map((playlist) => {
            const playlistSongs = playlist.songIds
              .map((songId) => songsById.get(songId))
              .filter((song) => song !== undefined)

            return draggingPlaylistId === playlist.id ? (
              <div className="grid-view-holder-placeholder" key={playlist.id} aria-hidden="true">
                <Icon name="plus" />
                <span>{t('playlists.dropHere')}</span>
              </div>
            ) : (
                <GridViewHolder
                  key={playlist.id}
                  cardRef={(element) => {
                    setPlaylistCardElement(playlist.id, element)
                  }}
                  playlist={playlist}
                  songs={playlistSongs}
                  selected={false}
                  dragging={false}
                  t={t}
                  onOpen={() => {
                    if (suppressNextOpenRef.current) {
                      return
                    }

                    navigate(`/playlists/${playlist.id}`)
                    onSelectPlaylist(playlist.id)
                  }}
                  onPlay={() => {
                    const [firstSong] = playlistSongs
                    if (firstSong) {
                      onPlayTrack(firstSong.id, playlistSongs.map((song) => song.id))
                    }
                  }}
                  onPointerDragStart={(event) => {
                    startPlaylistPointerDrag(playlist, event)
                  }}
                  onContextMenu={(x, y) => {
                    setPlaylistMenu({ playlist, x, y })
                  }}
                />
            )
          })}
          {playlistDragState?.active ? createPortal(
            <GridViewHolder
              dragOverlay
              dragging
              cardRef={(element) => {
                dragOverlayElementRef.current = element
                if (element) {
                  positionPlaylistDragOverlay(playlistDragState)
                }
              }}
              playlist={playlistDragState.playlist}
              songs={playlistDragState.playlist.songIds
                .map((songId) => songsById.get(songId))
                .filter((song) => song !== undefined)}
              selected={false}
              t={t}
              onOpen={() => {}}
              onPlay={() => {}}
            />,
            document.body,
          ) : null}
        </div>
      )}
      {playlistMenu ? (
        <MenuFlyout
          position={playlistMenu}
          onClose={() => {
            setPlaylistMenu(null)
          }}
          items={getPlaylistCardMenuItems({
            playlist: playlistMenu.playlist,
            playlists: snapshot.playlists,
            favoritePlaylistId: snapshot.favorites.playlistId,
            t,
            onPlayTrack,
            onAddSongsToNowPlaying,
            onCreatePlaylistWithSongs,
            onAddSongsToPlaylist,
            preferenceItem: playlistPreferenceItems.get(`${playlistMenu.playlist.isBuiltIn ? 'my-favorites' : 'playlist'}:${playlistMenu.playlist.isBuiltIn ? '6' : String(playlistMenu.playlist.id)}`) ?? null,
            onPreferenceChanged: refreshPlaylistPreferenceItems,
            onRenamePlaylist,
            onDeletePlaylist,
          })}
        />
      ) : null}
      {isCreateDialogOpen ? (
        <PlaylistNameDialog
          t={t}
          playlists={snapshot.playlists}
          defaultName={getNextPlaylistName(t('common.playlist'), snapshot.playlists, t)}
          onCancel={() => {
            setIsCreateDialogOpen(false)
          }}
          onConfirm={(name) => {
            setIsCreateDialogOpen(false)
            setPendingCreatedPlaylistName(name)
            onCreatePlaylistWithSongs(name, [])
          }}
        />
      ) : null}
    </section>
  )
}

function PlaylistNameDialog({
  t,
  playlists,
  defaultName,
  onCancel,
  onConfirm,
}: {
  t: Translator
  playlists: LibraryPlaylist[]
  defaultName: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const nextName = name.trim()
    const validationError = validatePlaylistName(nextName, playlists, t)
    if (validationError) {
      setError(validationError)
      return
    }

    onConfirm(nextName)
  }

  return (
    <div className="playlist-name-dialog-overlay" role="presentation">
      <section className="playlist-name-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-name-dialog-title">
        <h3 id="playlist-name-dialog-title">{t('playlists.createNew')}</h3>
        <input
          ref={inputRef}
          type="text"
          value={name}
          placeholder={t('playlists.namePlaceholder')}
          onChange={(event) => {
            setName(event.currentTarget.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              confirm()
            } else if (event.key === 'Escape') {
              onCancel()
            }
          }}
        />
        {error ? <p className="playlist-name-dialog-error">{error}</p> : null}
        <div className="playlist-name-dialog-actions">
          <button type="button" className="playlist-name-dialog-primary" onClick={confirm}>
            {t('common.confirm')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}

function getPlaylistCardMenuItems({
  playlist,
  playlists,
  favoritePlaylistId,
  t,
  onPlayTrack,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onAddSongsToPlaylist,
  preferenceItem,
  onPreferenceChanged,
  onRenamePlaylist,
  onDeletePlaylist,
}: {
  playlist: LibraryPlaylist
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  preferenceItem: PreferenceItemSnapshot | null
  onPreferenceChanged: (snapshot?: PreferenceSettingsSnapshot | null) => void | Promise<void>
  onRenamePlaylist: (playlistId: number, name: string) => void
  onDeletePlaylist: (playlistId: number) => void
}) {
  const items: MenuFlyoutItem[] = [
    {
      key: 'shuffle',
      text: t('nowPlaying.randomPlay'),
      icon: 'shuffle',
      onClick: () => {
        const shuffledSongIds = shuffleSongIds(playlist.songIds)
        if (shuffledSongIds.length > 0) {
          onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
        }
      },
    },
  ]
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: playlist.songIds,
    t,
    defaultPlaylistName: playlist.name,
    currentPlaylistName: playlist.name,
    includeNowPlaying: true,
    includeFavorites: playlist.name !== t('common.myFavorites'),
    onAddToNowPlaying: () => {
      onAddSongsToNowPlaying(playlist.songIds)
    },
    onToggleFavorite: () => {
      onAddSongsToPlaylist(favoritePlaylistId, playlist.songIds)
    },
    onCreatePlaylist: (name) => {
      onCreatePlaylistWithSongs(name, playlist.songIds)
    },
    onAddToPlaylist: (playlistId) => {
      onAddSongsToPlaylist(playlistId, playlist.songIds)
    },
  })

  if (addToItem) {
    items.push(addToItem)
  }

  items.push(getPreferenceMenuFlyoutItem({
    type: playlist.isBuiltIn ? 'my-favorites' : 'playlist',
    itemId: playlist.isBuiltIn ? '6' : String(playlist.id),
    name: playlist.name,
    preferenceItem,
    t,
    onUpdated: onPreferenceChanged,
  }))

  if (!playlist.isBuiltIn) {
    items.push(
      {
        key: 'rename-playlist',
        text: t('playlists.rename'),
        icon: 'info',
        onClick: () => {
          const name = window.prompt(t('playlists.rename'), playlist.name)
          const nextName = name?.trim()
          if (nextName) {
            onRenamePlaylist(playlist.id, nextName)
          }
        },
      },
      {
        key: 'duplicate-playlist',
        text: t('playlists.duplicate'),
        icon: 'copy',
        onClick: () => {
          onCreatePlaylistWithSongs(getNextPlaylistName(playlist.name, playlists, t), playlist.songIds)
        },
      },
      {
        key: 'delete-playlist',
        text: t('playlists.delete'),
        icon: 'trash',
        onClick: () => {
          onDeletePlaylist(playlist.id)
        },
      },
    )
  }

  return items
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

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  const existingNames = new Set(playlists.map((playlist) => playlist.name))
  if (!existingNames.has(name)) {
    return name
  }

  for (let index = 1; ; index += 1) {
    const nextName = t('playlists.nameTemplate', { name, index })
    if (!existingNames.has(nextName)) {
      return nextName
    }
  }
}

function validatePlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  if (!name) {
    return t('playlists.nameEmpty')
  }

  if (name.length > 50) {
    return t('playlists.nameTooLong')
  }

  if (playlists.some((playlist) => playlist.name === name)) {
    return t('playlists.nameUsed')
  }

  if (name.includes('+++++') || name.includes('{0}') || name.includes('{1}')) {
    return t('playlists.nameSpecial')
  }

  return ''
}
