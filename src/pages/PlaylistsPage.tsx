import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'

import { AppBarPortal } from '../components/AppBarPortal'
import { GridViewHolder } from '../components/GridViewHolder'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import type { MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import { RenameDialog } from '../components/RenameDialog'
import type { LibraryPlaylist, LibrarySnapshot, PlaylistSortCriterion, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getNextPlaylistName } from '../shared/playlistNames'

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
  routeBase?: string
  routePlaylistId?: number | null
}

function playlistIdsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((playlistId, index) => playlistId === right[index])
}

function getArtistRoute(routeBase: string, artistName: string) {
  const encodedArtist = encodeURIComponent(artistName)
  return routeBase ? `${routeBase}/artists/${encodedArtist}` : `/artists?artist=${encodedArtist}`
}

function getAlbumRoute(routeBase: string, albumName: string) {
  const encodedAlbum = encodeURIComponent(albumName)
  return routeBase ? `${routeBase}/albums/${encodedAlbum}` : `/albums?album=${encodedAlbum}`
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
  onReorderPlaylists,
  onSetPlaylistPreferred,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
  routeBase = '',
  routePlaylistId: explicitRoutePlaylistId,
}: PlaylistsPageProps) {
  const navigate = useNavigate()
  const params = useParams()
  const draggedPlaylistIdRef = useRef<number | null>(null)
  const previewPlaylistIdsRef = useRef<number[] | null>(null)
  const playlistCardElementsRef = useRef(new Map<number, HTMLDivElement>())
  const playlistDragRectsRef = useRef(new Map<number, DOMRect>())
  const playlistDragStateRef = useRef<PlaylistDragState | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const latestDragPointRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextOpenRef = useRef(false)
  const dragOverlayElementRef = useRef<HTMLDivElement | null>(null)
  const [playlistMenu, setPlaylistMenu] = useState<{ playlist: LibraryPlaylist; x: number; y: number } | null>(null)
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<number | null>(null)
  const [previewPlaylistIds, setPreviewPlaylistIds] = useState<number[] | null>(null)
  const [playlistDragState, setPlaylistDragState] = useState<PlaylistDragState | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [renamePlaylistDialog, setRenamePlaylistDialog] = useState<LibraryPlaylist | null>(null)
  const [pendingCreatedPlaylistName, setPendingCreatedPlaylistName] = useState('')
  const routePlaylistId = explicitRoutePlaylistId ?? (params.playlistId ? Number(params.playlistId) : null)
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
  const updatePreviewPlaylistIds = (playlistIds: number[] | null) => {
    previewPlaylistIdsRef.current = playlistIds
    setPreviewPlaylistIds(playlistIds)
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

    const currentPreviewPlaylistIds = previewPlaylistIdsRef.current ?? customPlaylistIds
    const visiblePlaylistIdSet = new Set(visiblePlaylists.map((playlist) => playlist.id))
    const orderedVisibleIds = currentPreviewPlaylistIds.filter((playlistId) => visiblePlaylistIdSet.has(playlistId))
    const targetRects = orderedVisibleIds
      .filter((playlistId) => playlistId !== draggedPlaylistId)
      .map((playlistId) => {
        const element = playlistCardElementsRef.current.get(playlistId)
        const rect = element?.getBoundingClientRect() ?? playlistDragRectsRef.current.get(playlistId)
        return rect ? { playlistId, rect } : null
      })
      .filter((target) => target !== null)

    const nextVisibleIds = orderedVisibleIds.filter((playlistId) => playlistId !== draggedPlaylistId)
    const insertIndex = targetRects.findIndex(({ rect }) =>
      clientY < rect.top ||
      (clientY <= rect.bottom && clientX < rect.left + rect.width / 2),
    )
    nextVisibleIds.splice(insertIndex === -1 ? nextVisibleIds.length : insertIndex, 0, draggedPlaylistId)

    let visibleIndex = 0
    const nextPlaylistIds = currentPreviewPlaylistIds.map((playlistId) =>
      visiblePlaylistIdSet.has(playlistId) ? nextVisibleIds[visibleIndex++]! : playlistId,
    )

    if (!playlistIdsEqual(currentPreviewPlaylistIds, nextPlaylistIds)) {
      updatePreviewPlaylistIds(nextPlaylistIds)
    }
  }
  const finishPlaylistDrag = (commit: boolean) => {
    const nextPlaylistIds = previewPlaylistIdsRef.current ?? customPlaylistIds
    draggedPlaylistIdRef.current = null
    playlistDragRectsRef.current.clear()
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
    playlistDragRectsRef.current = new Map([...playlistCardElementsRef.current].map(([playlistId, element]) => [
      playlistId,
      element.getBoundingClientRect(),
    ]))
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
      navigate(`${routeBase}/playlists/${playlist.id}`)
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
            navigate(`${routeBase}/playlists`)
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
            navigate(getArtistRoute(routeBase, artist))
          }}
          onAlbumClick={(album) => {
            navigate(getAlbumRoute(routeBase, album))
          }}
        />
      </section>
    )
  }

  return (
    <section className="playlists-page page-panel">
      <AppBarPortal>
        <button
          className="appbar-icon-button playlists-appbar-create-button"
          type="button"
          aria-label={t('playlists.newName')}
          title={t('playlists.newName')}
          onClick={() => {
            setIsCreateDialogOpen(true)
          }}
        >
          <Icon name="plus" />
        </button>
      </AppBarPortal>
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

                    navigate(`${routeBase}/playlists/${playlist.id}`)
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
            t,
            onCreatePlaylistWithSongs,
            onRequestRenamePlaylist: (playlist) => {
              setRenamePlaylistDialog(playlist)
              setPlaylistMenu(null)
            },
            onDeletePlaylist,
          })}
        />
      ) : null}
      {isCreateDialogOpen ? (
        <RenameDialog
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
      {renamePlaylistDialog ? (
        <RenameDialog
          t={t}
          title={t('playlists.rename')}
          playlists={snapshot.playlists.filter((playlist) => playlist.id !== renamePlaylistDialog.id)}
          defaultName={renamePlaylistDialog.name}
          confirmText={t('playlists.rename')}
          onCancel={() => {
            setRenamePlaylistDialog(null)
          }}
          onConfirm={(name) => {
            onRenamePlaylist(renamePlaylistDialog.id, name)
            setRenamePlaylistDialog(null)
          }}
        />
      ) : null}
    </section>
  )
}

function getPlaylistCardMenuItems({
  playlist,
  playlists,
  t,
  onCreatePlaylistWithSongs,
  onRequestRenamePlaylist,
  onDeletePlaylist,
}: {
  playlist: LibraryPlaylist
  playlists: LibraryPlaylist[]
  t: Translator
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onRequestRenamePlaylist: (playlist: LibraryPlaylist) => void
  onDeletePlaylist: (playlistId: number) => void
}) {
  return [
    {
      key: 'rename-playlist',
      text: t('playlists.rename'),
      icon: 'rename',
      onClick: () => {
        onRequestRenamePlaylist(playlist)
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
  ] satisfies MenuFlyoutItem[]
}
