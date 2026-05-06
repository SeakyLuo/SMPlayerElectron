import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems, getShuffleMenuItems } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'

const QUICK_PLAY_LIMIT = 100
const NOW_PLAYING_ROW_HEIGHT = 46
const NOW_PLAYING_OVERSCAN_ROWS = 12

interface NowPlayingPageProps {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  onTogglePlayPause: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onReplaceQueue: (songIds: number[]) => void
  onPlayNext: (songId: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongs: (songIds: number[]) => void
  onDeleteSongFromDisk: (songId: number) => void
  onClearQueue: () => void
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
}: NowPlayingPageProps) {
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [randomMenuOpen, setRandomMenuOpen] = useState(false)
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const draggedSongIdRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const navigate = useNavigate()
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )

  const visibleSongs = useMemo(
    () => songs.filter((song) => matchesSearch(song, searchQuery)),
    [songs, searchQuery],
  )
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const selectedVisibleSongIds = useMemo(
    () => visibleSongs.filter((song) => selectedSongIds.has(song.id)).map((song) => song.id),
    [selectedSongIds, visibleSongs],
  )
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const currentSong = useMemo(
    () => songs.find((song) => song.id === selectedTrackId) ?? null,
    [selectedTrackId, songs],
  )
  const canUseQueueCommands = songs.length > 0
  const canUseLibraryCommands = librarySongs.length > 0
  const queueIndexBySongId = useMemo(
    () => new Map(queueSongIds.map((songId, index) => [songId, index])),
    [queueSongIds],
  )
  const listHeight = visibleSongs.length * NOW_PLAYING_ROW_HEIGHT
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / NOW_PLAYING_ROW_HEIGHT) - NOW_PLAYING_OVERSCAN_ROWS)
  const endIndex = Math.min(
    visibleSongs.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / NOW_PLAYING_ROW_HEIGHT) + NOW_PLAYING_OVERSCAN_ROWS,
  )
  const renderedSongs = visibleSongs.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * NOW_PLAYING_ROW_HEIGHT
  const bottomSpacerHeight = (visibleSongs.length - endIndex) * NOW_PLAYING_ROW_HEIGHT
  const randomActions = useMemo(
    () =>
      getShuffleMenuItems({
        songs,
        librarySongs,
        recentSongs,
        playlists,
        randomLimit: QUICK_PLAY_LIMIT,
        t,
        onPlaySongs: (songIds) => {
          onReplaceQueue(songIds)
          onPlayTrack(songIds[0]!, songIds)
        },
      }),
    [librarySongs, onPlayTrack, onReplaceQueue, playlists, recentSongs, songs, t],
  )
  const addToMenuItem = addToMenu
    ? getAddToPlaylistMenuFlyoutItem({
        playlists,
        songIds: addToMenu.songIds,
        t,
        onAddToPlaylist: (playlistId) => {
          onAddSongsToPlaylist(playlistId, addToMenu.songIds)
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedSongIds(new Set())
          }
        },
      })
    : null

  const clearSelection = () => {
    setSelectedSongIds(new Set())
  }

  const toggleSelection = (songId: number) => {
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

  const playSelected = () => {
    const [firstSongId] = selectedVisibleSongIds
    onReplaceQueue(selectedVisibleSongIds)
    onPlayTrack(firstSongId!, selectedVisibleSongIds)
  }

  const reverseSelection = () => {
    setSelectedSongIds((current) => {
      const next = new Set<number>()
      for (const song of visibleSongs) {
        if (!current.has(song.id)) {
          next.add(song.id)
        }
      }
      return next
    })
  }

  const locateCurrent = () => {
    const currentVisibleIndex = visibleSongs.findIndex((song) => song.id === selectedTrackId)
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

  return (
    <section className="now-playing-page page-panel">
      <header className="now-playing-commandbar">
        <button
          type="button"
          className="now-playing-command"
          disabled={!canUseLibraryCommands}
          onClick={() => {
            const songIds = librarySongs.slice(0, QUICK_PLAY_LIMIT).map((song) => song.id)
            onReplaceQueue(songIds)
            onPlayTrack(songIds[0]!, songIds)
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
                    action.onClick?.()
                    setRandomMenuOpen(false)
                  }}
                >
                  {action.text}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="now-playing-command"
          disabled={!canUseQueueCommands || !currentSong}
          onClick={locateCurrent}
        >
          <Icon name="nowPlaying" />
          {t('nowPlaying.locateCurrent')}
        </button>
        {customPlaylists.length > 0 ? (
          <button
            type="button"
            className="now-playing-command"
            disabled={!canUseQueueCommands}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setAddToMenu({ x: rect.left, y: rect.bottom + 8, songIds: queueSongIds })
            }}
          >
            <Icon name="plus" />
            {t('context.addToPlaylist')}
          </button>
        ) : null}
        <button
          type="button"
          className="now-playing-command"
          disabled={!canUseQueueCommands}
          onClick={onClearQueue}
        >
          <Icon name="close" />
          {t('nowPlaying.clearQueue')}
        </button>
        <button
          type="button"
          className="now-playing-command"
          disabled={!currentSong}
          onClick={() => {
            navigate('/now-playing?full=1')
          }}
        >
          <Icon name="albums" />
          {t('nowPlaying.playMode')}
        </button>
        <button
          type="button"
          className={clsx('now-playing-command', { 'is-active': multiSelect })}
          disabled={!canUseQueueCommands}
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
            {renderedSongs.map((song) => {
              const queueIndex = queueIndexBySongId.get(song.id) ?? 0
              const current = song.id === selectedTrackId

              return (
                <PlaylistControlItem
                  key={`now-playing-${queueIndex}-${song.id}`}
                  containerRef={current ? currentRowRef : undefined}
                  song={song}
                  t={t}
                  current={current}
                  isPlaying={isPlaying}
                  selected={selectedSongIds.has(song.id)}
                  selectionMode={multiSelect}
                  queueSongIds={queueSongIds}
                  draggable
                  showArtist
                  showAlbum
                  onPlayTrack={onPlayTrack}
                  onTogglePlayPause={onTogglePlayPause}
                  onSelect={toggleSelection}
                  onAddToPlaylistClick={(contextSong, x, y) => {
                    setSongMenu({ song: contextSong, x, y })
                  }}
                  onContextMenu={(contextSong, x, y) => {
                    setSongMenu({ song: contextSong, x, y })
                  }}
                  onDragStart={(event) => {
                    draggedSongIdRef.current = song.id
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const draggedSongId = draggedSongIdRef.current
                    draggedSongIdRef.current = null
                    if (draggedSongId == null || draggedSongId === song.id) {
                      return
                    }

                    const nextSongIds = queueSongIds.filter((songId) => songId !== draggedSongId)
                    nextSongIds.splice(queueIndex, 0, draggedSongId)
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
        playlists={customPlaylists}
        removeLabel={t('nowPlaying.remove')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedVisibleSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({ x: rect.left, y: rect.top - 8, songIds: selectedVisibleSongIds })
        }}
        onRemove={() => {
          onRemoveSongs(selectedVisibleSongIds)
          clearSelection()
        }}
        onSelectAll={() => {
          setSelectedSongIds(new Set(visibleSongs.map((song) => song.id)))
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
            queueSongIds,
            currentTrackId: selectedTrackId,
            isPlaying,
            t,
            onPlay: () => {
              onPlayTrack(songMenu.song.id, queueSongIds)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id)
            },
            onAddToPlaylist: (playlistId) => {
              onAddSongToPlaylist(playlistId, songMenu.song.id)
            },
            onRemove: () => {
              onRemoveSongs([songMenu.song.id])
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedSongIds(new Set([songMenu.song.id]))
            },
            onToggleFavorite: () => {
              onToggleFavorite(songMenu.song.id, !songMenu.song.favorite)
            },
            onReveal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              onDeleteSongFromDisk(songMenu.song.id)
            },
            onSeeArtist: () => {
              navigate(`/artists/${encodeURIComponent(songMenu.song.artists[0] || songMenu.song.artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
            },
            onSeeMusicInfo: () => {
              navigate('/now-playing?full=1&panel=info')
            },
            onSeeLyrics: () => {
              navigate('/now-playing?full=1&panel=lyrics')
            },
            onSeeAlbumArt: () => {
              navigate('/now-playing?full=1&panel=album-art')
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

interface NowPlayingSongMenuState {
  song: LibrarySong
  x: number
  y: number
}

interface NowPlayingAddToMenuState {
  songIds: number[]
  x: number
  y: number
}
