import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEventHandler, type KeyboardEvent, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../components/icons'
import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems, getShuffleMenuItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { MusicDialog } from '../components/MusicDialog'
import { getSongArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { quickPlay } from '../shared/mediaHelper'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

const QUICK_PLAY_LIMIT = 100
const NOW_PLAYING_ROW_HEIGHT = 82
const NOW_PLAYING_OVERSCAN_ROWS = 12

interface NowPlayingPageProps {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
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
  onClearQueue: () => void
  onOpenImmersiveMode: () => void
}

function matchesSearch(song: LibrarySong, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  if (!normalizedSearchQuery) {
    return true
  }

  return [song.title, song.artist, ...song.artists, song.album, song.path]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedSearchQuery)
}

export function NowPlayingPage({
  songs,
  librarySongs,
  recentSongs,
  playlists,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
  searchQuery,
  error,
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
  onClearQueue,
  onOpenImmersiveMode,
}: NowPlayingPageProps) {
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedQueueIndexes, setSelectedQueueIndexes] = useState<Set<number>>(new Set())
  const [randomMenuOpen, setRandomMenuOpen] = useState(false)
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const [songDialog, setSongDialog] = useState<{ song: LibrarySong; mode: 'properties' | 'lyrics' | 'album-art' } | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const draggedQueueIndexRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const navigate = useNavigate()
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const playQuick = useCallback(async () => {
    const preferences = await window.smplayer!.getPreferenceSettings()
    const songIds = quickPlay({
      songs: librarySongs,
      recentSongs,
      playlists,
      folders,
      preferences,
    }, QUICK_PLAY_LIMIT)
    onReplaceQueue(songIds)
    onPlayTrack(songIds[0]!, songIds, 0)
  }, [folders, librarySongs, onPlayTrack, onReplaceQueue, playlists, recentSongs])

  const refreshSongPreferenceItem = async (songId: number) => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
  }

  useEffect(() => {
    if (songMenu) {
      void window.smplayer!.getPreferenceSettings().then((settings) => {
        setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songMenu.song.id)) ?? null)
      })
    }
  }, [songMenu?.song.id])

  const queueEntries = useMemo(
    () => songs.map((song, queueIndex) => ({ song, queueIndex })),
    [songs],
  )
  const visibleEntries = useMemo(
    () => queueEntries.filter((entry) => matchesSearch(entry.song, searchQuery)),
    [queueEntries, searchQuery],
  )
  const visibleSongs = useMemo(
    () => visibleEntries.map((entry) => entry.song),
    [visibleEntries],
  )
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const selectedVisibleEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedQueueIndexes.has(entry.queueIndex)),
    [selectedQueueIndexes, visibleEntries],
  )
  const selectedVisibleSongIds = useMemo(
    () => selectedVisibleEntries.map((entry) => entry.song.id),
    [selectedVisibleEntries],
  )
  const selectedVisibleQueueIndexes = useMemo(
    () => selectedVisibleEntries.map((entry) => entry.queueIndex),
    [selectedVisibleEntries],
  )
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const favoritePlaylist = useMemo(
    () => playlists.find((playlist) => playlist.isBuiltIn && playlist.name === t('common.myFavorites'))!,
    [playlists, t],
  )
  const defaultNewPlaylistName = useMemo(() => getDefaultNewPlaylistName(t, playlists), [playlists, t])
  const currentSong = useMemo(
    () => songs.find((song) => song.id === selectedTrackId) ?? null,
    [selectedTrackId, songs],
  )
  const canUseQueueCommands = songs.length > 0
  const canUseLibraryCommands = librarySongs.length > 0
  const listHeight = visibleEntries.length * NOW_PLAYING_ROW_HEIGHT
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / NOW_PLAYING_ROW_HEIGHT) - NOW_PLAYING_OVERSCAN_ROWS)
  const endIndex = Math.min(
    visibleEntries.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / NOW_PLAYING_ROW_HEIGHT) + NOW_PLAYING_OVERSCAN_ROWS,
  )
  const renderedEntries = visibleEntries.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * NOW_PLAYING_ROW_HEIGHT
  const bottomSpacerHeight = (visibleEntries.length - endIndex) * NOW_PLAYING_ROW_HEIGHT
  const randomActions = useMemo(
    () =>
      getShuffleMenuItems({
        songs,
        librarySongs,
        recentSongs,
        playlists,
        folders,
        randomLimit: QUICK_PLAY_LIMIT,
        t,
        onQuickPlay: playQuick,
        onPlaySongs: (songIds) => {
          onReplaceQueue(songIds)
          onPlayTrack(songIds[0]!, songIds, 0)
        },
      }),
    [folders, librarySongs, onPlayTrack, onReplaceQueue, playQuick, playlists, recentSongs, songs, t],
  )
  const addToMenuItem = addToMenu
    ? getAddToPlaylistMenuFlyoutItem({
        playlists: customPlaylists,
        songIds: addToMenu.songIds,
        t,
        defaultPlaylistName: addToMenu.defaultPlaylistName,
        currentPlaylistName: t('common.nowPlaying'),
        includeFavorites: true,
        onToggleFavorite: () => {
          onAddSongsToPlaylist(favoritePlaylist.id, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: t('common.myFavorites'),
                })
              : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: t('common.myFavorites') }),
            () => Promise.all(addToMenu.songIds.map((songId) => removeSongFromPlaylist(favoritePlaylist.id, songId))).then(() => undefined),
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
            () => Promise.all(addToMenu.songIds.map((songId) => removeSongFromPlaylist(playlistId, songId))).then(() => undefined),
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
    const [firstSongId] = selectedVisibleSongIds
    onReplaceQueue(selectedVisibleSongIds)
    onPlayTrack(firstSongId!, selectedVisibleSongIds, 0)
  }

  const reverseSelection = () => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const entry of visibleEntries) {
        if (!current.has(entry.queueIndex)) {
          next.add(entry.queueIndex)
        }
      }
      return next
    })
  }

  const locateCurrent = () => {
    const currentVisibleIndex = visibleEntries.findIndex((entry) =>
      selectedQueueIndex == null
        ? entry.song.id === selectedTrackId
        : entry.queueIndex === selectedQueueIndex,
    )
    if (currentVisibleIndex < 0) {
      return
    }

    const nextScrollTop = Math.max(
      0,
      currentVisibleIndex * NOW_PLAYING_ROW_HEIGHT - (listShellRef.current?.clientHeight ?? viewportHeight) / 2,
    )
    listShellRef.current?.scrollTo({ top: nextScrollTop, behavior: 'smooth' })
  }

  useEffect(() => {
    if (!randomMenuOpen) {
      return
    }

    const closeRandomMenu = () => {
      setRandomMenuOpen(false)
    }

    window.addEventListener('pointerdown', closeRandomMenu)

    return () => {
      window.removeEventListener('pointerdown', closeRandomMenu)
    }
  }, [randomMenuOpen])

  useEffect(() => {
    const listShell = listShellRef.current
    if (!listShell) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(listShell.clientHeight)
    })
    setViewportHeight(listShell.clientHeight)
    resizeObserver.observe(listShell)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (songs.length === 0) {
      return
    }

    window.requestAnimationFrame(locateCurrent)
  }, [])

  return (
    <section className="now-playing-page page-panel">
      <header className="now-playing-commandbar">
        <button
          type="button"
          className="now-playing-command"
          disabled={!canUseLibraryCommands}
          onClick={() => {
            void playQuick()
          }}
        >
          <Icon name="play" />
          {t('nowPlaying.quickPlay')}
        </button>
        <div className="now-playing-random-menu">
          <button
            type="button"
            className="now-playing-command"
            disabled={!canUseLibraryCommands}
            aria-haspopup="menu"
            aria-expanded={randomMenuOpen}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={() => {
              setRandomMenuOpen((current) => !current)
            }}
          >
            <Icon name="shuffle" />
            {t('nowPlaying.randomPlay')}
          </button>
          {randomMenuOpen ? (
            <div
              className="now-playing-random-options"
              role="menu"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
            >
              {randomActions.map((action) => (
                <button
                  type="button"
                  role="menuitem"
                  key={action.key}
                  disabled={action.disabled}
                  onClick={() => {
                    void action.onClick?.()
                    setRandomMenuOpen(false)
                  }}
                >
                  {action.text}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {canUseQueueCommands ? (
          <>
            <button
              type="button"
              className="now-playing-command"
              disabled={!currentSong}
              onClick={locateCurrent}
            >
              <Icon name="nowPlaying" />
              {t('nowPlaying.locateCurrent')}
            </button>
            <button
              type="button"
              className="now-playing-command"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setAddToMenu({
                  x: rect.left,
                  y: rect.bottom + 8,
                  songIds: queueSongIds,
                  defaultPlaylistName: defaultNewPlaylistName,
                })
              }}
            >
              <Icon name="plus" />
              {t('context.addToPlaylist')}
            </button>
            <button
              type="button"
              className="now-playing-command"
              onClick={onClearQueue}
            >
              <Icon name="close" />
              {t('nowPlaying.clearQueue')}
            </button>
            <button
              type="button"
              className="now-playing-command"
              disabled={!currentSong}
              onClick={onOpenImmersiveMode}
            >
              <Icon name="albums" />
              {t('nowPlaying.playMode')}
            </button>
            <button
              type="button"
              className={clsx('now-playing-command', { 'is-active': multiSelect })}
              onClick={() => {
                setMultiSelect((current) => {
                  if (current) {
                    clearSelection()
                  }
                  return !current
                })
              }}
            >
              <Icon name="menu" />
              {t('albums.multiSelect')}
            </button>
          </>
        ) : null}
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section
        className="now-playing-list-shell"
        ref={listShellRef}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop)
        }}
      >
        {visibleSongs.length === 0 ? (
          <div className="empty-state compact">
            <h3>
              {songs.length > 0
                ? t('nowPlaying.noQueueMatch', { query: searchQuery })
                : t('nowPlaying.queueEmpty')}
            </h3>
            <p>{songs.length > 0 ? t('nowPlaying.queueSearchHelp') : t('nowPlaying.queueEmptyHelp')}</p>
          </div>
        ) : (
          <div className="now-playing-playlist-control" style={{ minHeight: listHeight }}>
            {topSpacerHeight > 0 ? <div className="now-playing-virtual-spacer" style={{ height: topSpacerHeight }} /> : null}
            {renderedEntries.map(({ song, queueIndex }) => {
              const current = selectedQueueIndex == null ? song.id === selectedTrackId : queueIndex === selectedQueueIndex

              return (
                <NowPlayingQueueItem
                  key={`now-playing-${queueIndex}-${song.id}`}
                  containerRef={current ? currentRowRef : undefined}
                  song={song}
                  t={t}
                  current={current}
                  playing={isPlaying}
                  selected={selectedQueueIndexes.has(queueIndex)}
                  selectionMode={multiSelect}
                  queueSongIds={queueSongIds}
                  onPlayTrack={(trackId, nextQueueSongIds) => {
                    onPlayTrack(trackId, nextQueueSongIds, queueIndex)
                  }}
                  onTogglePlayPause={onTogglePlayPause}
                  onToggleSelection={() => toggleSelection(queueIndex)}
                  onToggleFavorite={(songId, favorite) => {
                    onToggleFavorite(songId, favorite)
                  }}
                  onRemoveFromListClick={(contextSong) => {
                    const previousQueueSongIds = queueSongIds
                    onReplaceQueue(queueSongIds.filter((_, index) => index !== queueIndex))
                    showUndo(t('notification.removedFrom', { title: contextSong.title, target: t('common.nowPlaying') }), () =>
                      onReplaceQueue(previousQueueSongIds),
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
                    navigate(`/albums/${encodeURIComponent(contextSong.album || t('common.albumUnknown'))}`)
                  }}
                  onSeeArtist={(artist) => {
                    navigate(`/artists/${encodeURIComponent(artist)}`)
                  }}
                  onDragStart={(event) => {
                    draggedQueueIndexRef.current = queueIndex
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const draggedQueueIndex = draggedQueueIndexRef.current
                    draggedQueueIndexRef.current = null
                    if (draggedQueueIndex == null || draggedQueueIndex === queueIndex) {
                      return
                    }

                    const nextSongIds = queueSongIds.slice()
                    const [draggedSongId] = nextSongIds.splice(draggedQueueIndex, 1)
                    const targetIndex = draggedQueueIndex < queueIndex ? queueIndex - 1 : queueIndex
                    nextSongIds.splice(targetIndex, 0, draggedSongId!)
                    onReplaceQueue(nextSongIds)
                  }}
                />
              )
            })}
            {bottomSpacerHeight > 0 ? <div className="now-playing-virtual-spacer" style={{ height: bottomSpacerHeight }} /> : null}
          </div>
        )}
      </section>

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedVisibleSongIds.length}
        t={t}
        playlists={playlists}
        removeLabel={t('nowPlaying.remove')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedVisibleSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            x: rect.left,
            y: rect.top - 8,
            songIds: selectedVisibleSongIds,
            defaultPlaylistName: defaultNewPlaylistName,
          })
        }}
        onRemove={() => {
          const previousQueueSongIds = queueSongIds
          onReplaceQueue(queueSongIds.filter((_, index) => !selectedVisibleQueueIndexes.includes(index)))
          showUndo(t('notification.songsRemovedFrom', { count: selectedVisibleSongIds.length, target: t('common.nowPlaying') }), () =>
            onReplaceQueue(previousQueueSongIds),
          )
          clearSelection()
        }}
        onSelectAll={() => {
          setSelectedQueueIndexes(new Set(visibleEntries.map((entry) => entry.queueIndex)))
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
            },
            playlists,
            folders,
            currentPlaylistName: t('common.nowPlaying'),
            excludePlaylistName: '',
            queueSongIds,
            currentTrackId: selectedTrackId,
            currentTrackIndex: selectedQueueIndex,
            songIndex: songMenu.queueIndex,
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
              const previousQueueSongIds = queueSongIds
              onReplaceQueue([...queueSongIds, songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(previousQueueSongIds),
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
              const previousQueueSongIds = queueSongIds
              onReplaceQueue(queueSongIds.filter((_, index) => index !== songMenu.queueIndex))
              showUndo(t('notification.removedFrom', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(previousQueueSongIds),
              )
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedQueueIndexes(new Set([songMenu.queueIndex]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void window.smplayer?.removePreferenceItem(songPreferenceItem!.id).then(() => refreshSongPreferenceItem(songMenu.song.id))
            },
            onSetPreference: (level) => {
              void window.smplayer?.addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then(() => refreshSongPreferenceItem(songMenu.song.id))
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
            onReveal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              if (window.confirm(t('context.deleteSongConfirm', { title: songMenu.song.title }))) {
                onDeleteSongFromDisk(songMenu.song.id)
              }
            },
            onHide: async () => {
              const previousQueueSongIds = queueSongIds
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveSongs([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                const hiddenItems = await window.smplayer!.getHiddenStorageItems()
                const hiddenItem = hiddenItems.find((item) => item.path === songMenu.song.path)
                await window.smplayer!.resumeHiddenStorageItem(hiddenItem!)
                onReplaceQueue(previousQueueSongIds)
                await refresh()
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists/${encodeURIComponent(artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
            },
            onSeeMusicInfo: () => {
              setSongDialog({ song: songMenu.song, mode: 'properties' })
              setSongMenu(null)
            },
            onSeeLyrics: () => {
              setSongDialog({ song: songMenu.song, mode: 'lyrics' })
              setSongMenu(null)
            },
            onSeeAlbumArt: () => {
              setSongDialog({ song: songMenu.song, mode: 'album-art' })
              setSongMenu(null)
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
      {songDialog ? (
        <MusicDialog
          song={songDialog.song}
          mode={songDialog.mode}
          t={t}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onClose={() => {
            setSongDialog(null)
          }}
          onSaved={refresh}
        />
      ) : null}
    </section>
  )
}

interface NowPlayingQueueItemProps {
  song: LibrarySong
  t: Translator
  current: boolean
  playing: boolean
  selected: boolean
  selectionMode: boolean
  queueSongIds: number[]
  containerRef?: Ref<HTMLDivElement>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSelection: () => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveFromListClick: (song: LibrarySong) => void
  onAddToPlaylistClick: (song: LibrarySong, x: number, y: number) => void
  onContextMenu: (song: LibrarySong, x: number, y: number) => void
  onSeeAlbum: (song: LibrarySong) => void
  onSeeArtist: (artist: string) => void
  onDragStart: DragEventHandler<HTMLDivElement>
  onDragOver: DragEventHandler<HTMLDivElement>
  onDrop: DragEventHandler<HTMLDivElement>
}

function NowPlayingQueueItem({
  song,
  t,
  current,
  playing,
  selected,
  selectionMode,
  queueSongIds,
  containerRef,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSelection,
  onToggleFavorite,
  onRemoveFromListClick,
  onAddToPlaylistClick,
  onContextMenu,
  onSeeAlbum,
  onSeeArtist,
  onDragStart,
  onDragOver,
  onDrop,
}: NowPlayingQueueItemProps) {
  const artists = getSongArtists(song)
  const artistLabel = artists.join(', ')
  const open = () => {
    if (selectionMode) {
      onToggleSelection()
    } else {
      onPlayTrack(song.id, queueSongIds)
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      draggable
      className={clsx('now-playing-queue-item', {
        'is-current': current,
        'is-playing': current && playing,
        'is-selected': selected,
        'is-selecting': selectionMode,
      })}
      onClick={open}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(song, event.clientX, event.clientY)
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="now-playing-queue-status">
        {current ? (
          <span className="playlist-control-item-playing-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </span>
      <span className="now-playing-queue-artwork-wrap">
        <ArtworkImage
          className="now-playing-queue-artwork"
          src={song.artworkUrl}
          title={song.title}
          renderFallback={() => (
            <span className="now-playing-queue-artwork now-playing-queue-artwork-fallback" aria-hidden="true">
              <DefaultAlbumArtwork className="now-playing-queue-artwork-fallback-image" />
            </span>
          )}
        />
        {selectionMode ? (
          <span className="now-playing-queue-select-mark" aria-hidden="true">
            {selected ? <Icon name="check" /> : null}
          </span>
        ) : null}
        {!selectionMode ? (
          <button
            type="button"
            className="now-playing-queue-play"
            aria-label={current && playing ? t('context.pause') : t('context.play')}
            title={current && playing ? t('context.pause') : t('context.play')}
            onClick={(event) => {
              event.stopPropagation()
              if (current && playing) {
                onTogglePlayPause()
              } else {
                onPlayTrack(song.id, queueSongIds)
              }
            }}
          >
            <Icon name={current && playing ? 'pause' : 'play'} />
          </button>
        ) : null}
      </span>
      <span className="now-playing-queue-copy">
        <strong title={song.title}>{song.title}</strong>
        <span className="now-playing-queue-artists" title={artistLabel}>
          {artists.map((artist, index) => (
            <span key={`${song.id}-${artist}`}>
              {index > 0 ? ', ' : null}
              <button
                type="button"
                className="now-playing-queue-artist"
                onClick={(event) => {
                  event.stopPropagation()
                  onSeeArtist(artist)
                }}
              >
                {artist}
              </button>
            </span>
          ))}
        </span>
      </span>
      <span className="now-playing-queue-actions">
        <button
          type="button"
          className={clsx('now-playing-queue-action', 'favorite', { 'is-active': song.favorite })}
          aria-label={t('common.favorite')}
          title={t('common.favorite')}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite(song.id, !song.favorite)
          }}
        >
          <Icon name={song.favorite ? 'heartFilled' : 'heart'} />
        </button>
        <button
          type="button"
          className="now-playing-queue-action is-hover-action"
          aria-label={t('context.addToPlaylist')}
          title={t('context.addToPlaylist')}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            onAddToPlaylistClick(song, rect.left, rect.bottom + 8)
          }}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="now-playing-queue-action is-hover-action"
          aria-label={t('nowPlaying.remove')}
          title={t('nowPlaying.remove')}
          onClick={(event) => {
            event.stopPropagation()
            onRemoveFromListClick(song)
          }}
        >
          <Icon name="close" />
        </button>
        <button
          type="button"
          className="now-playing-queue-action is-hover-action"
          aria-label={t('player.more')}
          title={t('player.more')}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            onContextMenu(song, rect.left, rect.bottom + 8)
          }}
        >
          <Icon name="moreHorizontal" />
        </button>
      </span>
      <button
        type="button"
        className="now-playing-queue-album"
        title={song.album || t('common.albumUnknown')}
        onClick={(event) => {
          event.stopPropagation()
          onSeeAlbum(song)
        }}
      >
        {song.album || t('common.albumUnknown')}
      </button>
      <time>{formatDuration(song.duration)}</time>
    </div>
  )
}

interface NowPlayingSongMenuState {
  song: LibrarySong
  queueIndex: number
  x: number
  y: number
}

interface NowPlayingAddToMenuState {
  songIds: number[]
  defaultPlaylistName: string
  x: number
  y: number
}

function getDefaultNewPlaylistName(t: Translator, playlists: LibraryPlaylist[]) {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return getNextPlaylistName(`${t('common.nowPlaying')} - ${year}/${month}/${day}`, playlists)
}

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  const playlistNames = new Set(playlists.map((playlist) => playlist.name))
  const siblingCount = playlists.filter((playlist) => playlist.name.startsWith(name)).length
  for (let index = 1; index <= siblingCount; index += 1) {
    const nextName = `${name} (${index})`
    if (!playlistNames.has(nextName)) {
      return nextName
    }
  }

  return name
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}
