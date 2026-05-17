import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { requestConfirmDialog } from '../components/dialogService'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { insertQueueEntries, insertQueueSongs, removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { useStoredMultiSelect, useStoredNumberSet } from '../state/usePageSelectionStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { getDefaultNewPlaylistName, getNextPlaylistName, getParentFolderPath, refreshSongPreferenceItem, type NowPlayingAddToMenuState, type NowPlayingSongMenuState } from './nowPlayingFullModel'

type FullPanel = 'playlist' | 'info' | 'lyrics' | 'album-art'
export function NowPlayingFullPlaylist({
  open,
  songs,
  playlists,
  favoritePlaylistId,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
  loading,
  onTogglePlayPause,
  onPlayTrack,
  onReplaceQueue,
  onPlayNext,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onToggleFavorite,
  onRemoveSongs,
  onDeleteSongFromDisk,
  onClose,
  onPanelRequest,
}: {
  open: boolean
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
  loading: boolean
  onTogglePlayPause: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[], queueIndex?: number) => void
  onReplaceQueue: (songIds: number[]) => void
  onPlayNext: (songId: number, queueIndex?: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongs: (songIds: number[]) => void
  onDeleteSongFromDisk: (songId: number) => void
  onClose: () => void
  onPanelRequest: (panel: FullPanel) => void
}) {
  const [multiSelect, setMultiSelect] = useStoredMultiSelect('now-playing-full')
  const [selectedQueueIndexes, setSelectedQueueIndexes] = useStoredNumberSet('now-playing-full', 'selectedQueueIndexes')
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ queueIndex: number; position: 'before' | 'after' } | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const draggedQueueIndexRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const queueEntryKeys = useMemo(() => {
    const occurrenceCounts = new Map<number, number>()
    return songs.map((song) => {
      const occurrence = occurrenceCounts.get(song.id) ?? 0
      occurrenceCounts.set(song.id, occurrence + 1)
      return `now-playing-full-${song.id}-${occurrence}`
    })
  }, [songs])
  const selectedEntries = useMemo(
    () => songs
      .map((song, queueIndex) => ({ song, queueIndex }))
      .filter((entry) => selectedQueueIndexes.has(entry.queueIndex)),
    [selectedQueueIndexes, songs],
  )
  const selectedSongIds = useMemo(() => selectedEntries.map((entry) => entry.song.id), [selectedEntries])
  const selectedQueueIndexList = useMemo(() => selectedEntries.map((entry) => entry.queueIndex), [selectedEntries])
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])
  const defaultNewPlaylistName = useMemo(() => getDefaultNewPlaylistName(t, playlists), [playlists, t])
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const songMenuSongId = songMenu?.song.id

  useEffect(() => {
    if (songMenuSongId !== undefined) {
      void window.smplayer!.getPreferenceSettings().then((settings) => {
        setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songMenuSongId)) ?? null)
      })
    }
  }, [songMenuSongId])

  useEffect(() => {
    if (!open || songs.length === 0) {
      return
    }

    window.requestAnimationFrame(() => {
      currentRowRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [open, selectedQueueIndex, selectedTrackId, songs.length])

  useEffect(() => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const queueIndex of current) {
        if (queueIndex < songs.length) {
          next.add(queueIndex)
        }
      }
      return next
    })
  }, [songs.length])

  const addToMenuItem = addToMenu
    ? getAddToPlaylistMenuFlyoutItem({
        playlists: customPlaylists,
        songIds: addToMenu.songIds,
        t,
        defaultPlaylistName: addToMenu.defaultPlaylistName,
        currentPlaylistName: t('common.nowPlaying'),
        includeFavorites: addToMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
        onToggleFavorite: () => {
          const nextFavoriteSongIds = addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId))
          onAddSongsToPlaylist(favoritePlaylistId, nextFavoriteSongIds)
          showUndo(
            nextFavoriteSongIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === nextFavoriteSongIds[0])!.title,
                  target: t('common.myFavorites'),
                })
              : t('notification.songsAddedTo', { count: nextFavoriteSongIds.length, target: t('common.myFavorites') }),
            () => removeSongsFromPlaylist(favoritePlaylistId, nextFavoriteSongIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onCreatePlaylist: (name) => {
          void createPlaylist(name, addToMenu.songIds)
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onAddToPlaylist: (playlistId) => {
          const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
          onAddSongsToPlaylist(playlistId, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: targetPlaylist.name,
                })
              : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: targetPlaylist.name }),
            () => removeSongsFromPlaylist(playlistId, addToMenu.songIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
      })
    : null

  const clearSelection = () => {
    setSelectedQueueIndexes(new Set())
  }

  const toggleSelection = (queueIndex: number) => {
    setSelectedQueueIndexes((current) => {
      const next = new Set(current)
      if (next.has(queueIndex)) {
        next.delete(queueIndex)
      } else {
        next.add(queueIndex)
      }
      return next
    })
  }

  const playSelected = () => {
    const [firstSongId] = selectedSongIds
    onReplaceQueue(selectedSongIds)
    onPlayTrack(firstSongId!, selectedSongIds)
  }

  const getDropPosition = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  const getTouchDropTarget = (clientX: number, clientY: number) => {
    const row = document.elementsFromPoint(clientX, clientY).find((element): element is HTMLElement =>
      element instanceof HTMLElement && element.classList.contains('now-playing-queue-item'),
    )
    if (!row) {
      return null
    }

    const queueIndex = Number(row.dataset.queueIndex)
    if (!Number.isInteger(queueIndex)) {
      return null
    }

    const rect = row.getBoundingClientRect()
    return {
      queueIndex,
      position: clientY > rect.top + rect.height / 2 ? 'after' as const : 'before' as const,
    }
  }

  const moveQueueSong = (draggedQueueIndex: number, targetQueueIndex: number, insertAfter: boolean) => {
    if (draggedQueueIndex === targetQueueIndex) {
      return
    }

    const nextSongIds = songs.map((song) => song.id)
    const [draggedSongId] = nextSongIds.splice(draggedQueueIndex, 1)
    const targetIndex = draggedQueueIndex < targetQueueIndex + (insertAfter ? 1 : 0)
      ? targetQueueIndex + (insertAfter ? 1 : 0) - 1
      : targetQueueIndex + (insertAfter ? 1 : 0)
    nextSongIds.splice(targetIndex, 0, draggedSongId!)
    onReplaceQueue(nextSongIds)
  }

  const moveTouchQueueDrag = (clientX: number, clientY: number) => {
    const target = getTouchDropTarget(clientX, clientY)
    setDropIndicator(target)
  }

  const completeTouchQueueDrag = (clientX: number, clientY: number) => {
    const draggedQueueIndex = draggedQueueIndexRef.current
    draggedQueueIndexRef.current = null
    const target = getTouchDropTarget(clientX, clientY)
    setDropIndicator(null)
    if (draggedQueueIndex == null || !target) {
      return
    }

    moveQueueSong(draggedQueueIndex, target.queueIndex, target.position === 'after')
  }

  const reverseSelection = () => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const queueIndex of songs.keys()) {
        if (!current.has(queueIndex)) {
          next.add(queueIndex)
        }
      }
      return next
    })
  }

  if (songs.length === 0) {
    return (
      <section
        className={clsx('now-playing-full-panel now-playing-full-empty-panel now-playing-full-queue-popover', {
          'is-open': open,
        })}
        aria-hidden={!open}
      >
        {loading ? (
          <LoadingState t={t} compact />
        ) : null}
      </section>
    )
  }

  return (
    <section
      className={clsx('now-playing-full-panel now-playing-full-playlist-panel now-playing-full-queue-popover', {
        'is-open': open,
      })}
      aria-hidden={!open}
    >
      <header className="now-playing-full-playlist-title">
        <div>
          <strong>{t('common.nowPlaying')}</strong>
          <span>{t('playlists.songCount', { count: songs.length })}</span>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <section className="now-playing-full-list-shell" ref={listShellRef}>
        <div className="now-playing-playlist-control now-playing-full-queue-list playlist-control-compact">
          {songs.map((song, queueIndex) => {
            const current = selectedQueueIndex !== null
              ? queueIndex === selectedQueueIndex
              : song.id === selectedTrackId
            return (
              <PlaylistControlItem
                key={queueEntryKeys[queueIndex]}
                containerRef={current ? currentRowRef : undefined}
                song={song}
                t={t}
                current={current}
                playing={isPlaying}
                selected={selectedQueueIndexes.has(queueIndex)}
                selectionMode={multiSelect}
                dropPosition={dropIndicator?.queueIndex === queueIndex ? dropIndicator.position : null}
                queueSongIds={queueSongIds}
                touchReorderIndex={queueIndex}
                onPlayTrack={(trackId, nextQueueSongIds) => {
                  onPlayTrack(trackId, nextQueueSongIds, queueIndex)
                }}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={() => toggleSelection(queueIndex)}
                onToggleFavorite={onToggleFavorite}
                onRemoveFromListClick={(contextSong) => {
                  onReplaceQueue(queueSongIds.filter((_, index) => index !== queueIndex))
                  showUndo(t('notification.removedFrom', { title: contextSong.title, target: t('common.nowPlaying') }), () =>
                    onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, queueIndex, [contextSong.id])),
                  )
                }}
                onAddToPlaylistClick={(contextSong, x, y) => {
                  setAddToMenu({
                    x,
                    y,
                    songIds: [contextSong.id],
                    defaultPlaylistName: getNextPlaylistName(contextSong.title, playlists),
                  })
                }}
                onContextMenu={(contextSong, x, y) => {
                  setSongMenu({ song: contextSong, queueIndex, x, y })
                }}
                onSeeAlbum={(contextSong) => {
                  navigate(`/albums?album=${encodeURIComponent(contextSong.album || t('common.albumUnknown'))}`)
                  onClose()
                }}
                onSeeArtist={(artist) => {
                  navigate(`/artists?artist=${encodeURIComponent(artist)}`)
                  onClose()
                }}
                onDragStart={(event) => {
                  draggedQueueIndexRef.current = queueIndex
                  setDropIndicator(null)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(queueIndex))
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropIndicator({
                    queueIndex,
                    position: getDropPosition(event),
                  })
                }}
                onDragLeave={() => {
                  setDropIndicator((currentDrop) => currentDrop?.queueIndex === queueIndex ? null : currentDrop)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedQueueIndex = draggedQueueIndexRef.current
                  draggedQueueIndexRef.current = null
                  const insertAfter = getDropPosition(event) === 'after'
                  setDropIndicator(null)
                  if (draggedQueueIndex == null || draggedQueueIndex === queueIndex) {
                    return
                  }

                  moveQueueSong(draggedQueueIndex, queueIndex, insertAfter)
                }}
                onDragEnd={() => {
                  draggedQueueIndexRef.current = null
                  setDropIndicator(null)
                }}
                onTouchReorderStart={() => {
                  draggedQueueIndexRef.current = queueIndex
                  setDropIndicator(null)
                }}
                onTouchReorderMove={moveTouchQueueDrag}
                onTouchReorderEnd={completeTouchQueueDrag}
                onTouchReorderCancel={() => {
                  draggedQueueIndexRef.current = null
                  setDropIndicator(null)
                }}
              />
            )
          })}
        </div>
      </section>
      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedSongIds.length}
        t={t}
        playlists={playlists}
        removeLabel={t('nowPlaying.remove')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            x: rect.left,
            y: rect.top - 8,
            anchor: event.currentTarget,
            songIds: selectedSongIds,
            defaultPlaylistName: defaultNewPlaylistName,
          })
        }}
        onRemove={() => {
          const removedSongIds = selectedQueueIndexList.map((queueIndex) => queueSongIds[queueIndex]!)
          const insertIndex = selectedQueueIndexList[0]!
          onReplaceQueue(queueSongIds.filter((_, index) => !selectedQueueIndexList.includes(index)))
          showUndo(t('notification.songsRemovedFrom', { count: selectedSongIds.length, target: t('common.nowPlaying') }), () =>
            onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertIndex, removedSongIds)),
          )
          clearSelection()
        }}
        onSelectAll={() => {
          setSelectedQueueIndexes(new Set(songs.map((_, queueIndex) => queueIndex)))
        }}
        onReverseSelection={reverseSelection}
        onClearSelection={clearSelection}
        onCancel={() => {
          setMultiSelect(false)
          clearSelection()
        }}
      />
      {songMenu ? (
        <MenuFlyout
          position={songMenu}
          onClose={() => {
            setSongMenu(null)
          }}
          items={getMusicMenuFlyoutItems({
            song: songMenu.song,
            option: {
              showRemove: true,
              showSelect: true,
              showDelete: true,
              showAlbumArt: false,
            },
            playlists,
            folders,
            currentPlaylistName: t('common.nowPlaying'),
            excludePlaylistName: '',
            currentTrackId: selectedTrackId,
            isPlaying,
            t,
            onPlay: () => {
              onPlayTrack(songMenu.song.id, queueSongIds, songMenu.queueIndex)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id, songMenu.queueIndex)
            },
            onAddToNowPlaying: () => {
              const insertedIndex = queueSongIds.length
              onReplaceQueue([...queueSongIds, songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
              )
            },
            onCreatePlaylist: (name) => {
              void createPlaylist(name, [songMenu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongToPlaylist(playlistId, songMenu.song.id)
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: targetPlaylist.name }), () =>
                removeSongFromPlaylist(playlistId, songMenu.song.id),
              )
            },
            onRemove: () => {
              onReplaceQueue(queueSongIds.filter((_, index) => index !== songMenu.queueIndex))
              showUndo(t('notification.removedFrom', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(insertQueueSongs(useLibraryStore.getState().snapshot.nowPlaying.songIds, songMenu.queueIndex, [songMenu.song.id])),
              )
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedQueueIndexes(new Set([songMenu.queueIndex]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void window.smplayer?.removePreferenceItem(songPreferenceItem!.id).then(() => refreshSongPreferenceItem(songMenu.song.id, setSongPreferenceItem))
            },
            onSetPreference: (level) => {
              void window.smplayer?.addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then(() => refreshSongPreferenceItem(songMenu.song.id, setSongPreferenceItem))
            },
            onMoveToFolder: (folderPath) => {
              const originalFolderPath = getParentFolderPath(songMenu.song.path)
              void moveSongToFolder(songMenu.song.id, folderPath)
              showUndo(t('notification.movedSong', { title: songMenu.song.title }), () =>
                moveSongToFolder(songMenu.song.id, originalFolderPath),
              )
            },
            onToggleFavorite: () => {
              onToggleFavorite(songMenu.song.id, !songMenu.song.favorite)
              const target = t('common.myFavorites')
              showUndo(
                songMenu.song.favorite
                  ? t('notification.removedFrom', { title: songMenu.song.title, target })
                  : t('notification.songAddedTo', { title: songMenu.song.title, target }),
                () => setSongFavorite(songMenu.song.id, songMenu.song.favorite),
              )
            },
            onSeeLocal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              void requestConfirmDialog({
                title: t('playlists.delete'),
                message: t('context.deleteSongConfirm', { title: songMenu.song.title }),
                confirmText: t('playlists.delete'),
              }).then((confirmed) => {
                if (confirmed) {
                  onDeleteSongFromDisk(songMenu.song.id)
                }
              })
            },
            onHide: async () => {
              const removedQueueEntries = queueSongIds
                .map((songId, index) => ({ index, songId }))
                .filter((entry) => entry.songId === songMenu.song.id)
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveSongs([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                const hiddenItems = await window.smplayer!.getHiddenStorageItems()
                const hiddenItem = hiddenItems.find((item) => item.path === songMenu.song.path)
                await window.smplayer!.resumeHiddenStorageItem(hiddenItem!)
                onReplaceQueue(insertQueueEntries(useLibraryStore.getState().snapshot.nowPlaying.songIds, removedQueueEntries))
                await refresh()
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists?artist=${encodeURIComponent(artist)}`)
              onClose()
            },
            onSeeAlbum: () => {
              navigate(`/albums?album=${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
              onClose()
            },
            onSeeMusicInfo: () => {
              setSongMenu(null)
              onPanelRequest('info')
            },
            onSeeLyrics: () => {
              setSongMenu(null)
              onPanelRequest('lyrics')
            },
            onSeeAlbumArt: () => {
              setSongMenu(null)
              onPanelRequest('album-art')
            },
          })}
        />
      ) : null}
      {addToMenuItem?.submenu ? (
        <MenuFlyout
          position={addToMenu!}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={addToMenuItem.submenu}
        />
      ) : null}
    </section>
  )
}
