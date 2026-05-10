import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent, type RefObject, type SetStateAction } from 'react'

import { getDisplayArtists } from '../shared/artists'
import { extractArtworkColorRgb, getDefaultArtworkColorRgb } from '../shared/artworkColor'
import type { LibraryPlaylist, LibrarySong, MusicLibrarySortCriterion, PlaylistSortCriterion, PreferenceEntityType, PreferenceItemSnapshot, PreferenceLevel, PreferenceSettingsSnapshot } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { ArtworkImage } from './ArtworkImage'
import { AppBarPortal } from './AppBarPortal'
import { CommandBar, CommandBarButton } from './CommandBar'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { requestConfirmDialog, requestTextDialog } from './dialogService'
import { MenuFlyout } from './MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getMusicMenuFlyoutItems, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from './MenuFlyoutHelper'
import { MultiSelectCommandBar } from './MultiSelectCommandBar'
import { PlaylistControlItem } from './PlaylistControlItem'
import { MusicDialog } from './MusicDialog'
import { getPlaylistArtworkDisplayUrls, usePlaylistArtwork } from './playlistArtwork'

type HeaderedPlaylistType = 'album' | 'playlist' | 'favorites'

interface HeaderedPlaylistControlProps {
  type: HeaderedPlaylistType
  title: string
  subtitle?: string
  caption?: string
  headerSongs?: LibrarySong[]
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  isPlaying?: boolean
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  artworkUrl: string
  removable?: boolean
  showAlbum?: boolean
  showArtist?: boolean
  canRename?: boolean
  canDelete?: boolean
  canClear?: boolean
  canEditArtwork?: boolean
  canSetPreferred?: boolean
  sortCriterion?: PlaylistSortCriterion
  preferenceType?: PreferenceEntityType
  preferenceItemId?: string
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist?: (playlistId: number, songIds: number[]) => void
  onRemoveSongs?: (songIds: number[]) => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onClear?: () => void
  onEditArtwork?: () => void
  onSetPreferred?: (level: PreferenceLevel) => void
  onSortSongs?: (songIds: number[], sortCriterion: PlaylistSortCriterion) => void
  onArtistClick?: (artist: string) => void
  onAlbumClick?: (album: string) => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
  onMoveToMusicOrPlay?: (songId: number) => void
  onPlayNext?: (songId: number) => void
}

const sortOptions: MusicLibrarySortCriterion[] = ['title', 'artist', 'album', 'duration', 'play-count', 'date-added']

export function HeaderedPlaylistControl({
  type,
  title,
  headerSongs,
  t,
  songs,
  selectedTrackId,
  isPlaying = false,
  playlists,
  favoritePlaylistId,
  artworkUrl,
  removable = false,
  showAlbum = false,
  showArtist = true,
  canRename = false,
  canDelete = false,
  canClear = false,
  canEditArtwork = false,
  canSetPreferred = false,
  sortCriterion,
  preferenceType,
  preferenceItemId,
  onPlayTrack,
  onTogglePlayPause,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongs,
  onRename,
  onDelete,
  onClear,
  onEditArtwork,
  onSetPreferred,
  onSortSongs,
  onArtistClick,
  onAlbumClick,
  onToggleFavorite,
  onMoveToMusicOrPlay,
  onPlayNext,
}: HeaderedPlaylistControlProps) {
  const controlRef = useRef<HTMLElement | null>(null)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const onScrollbarPointerDown = useHeaderedPlaylistScroll(controlRef, title, setIsHeaderCollapsed)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[] }) | null>(null)
  const [sortMenu, setSortMenu] = useState<MenuFlyoutPosition | null>(null)
  const [preferenceMenu, setPreferenceMenu] = useState<MenuFlyoutPosition | null>(null)
  const [songMenu, setSongMenu] = useState<(MenuFlyoutPosition & { song: LibrarySong; songIndex: number }) | null>(null)
  const [songDialog, setSongDialog] = useState<{ song: LibrarySong; mode: 'properties' | 'lyrics' | 'album-art' } | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [headerPreferenceItem, setHeaderPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [selectedSortCriterion, setSelectedSortCriterion] = useState<PlaylistSortCriterion | null>(null)
  const [orderedSongIds, setOrderedSongIds] = useState<number[] | null>(null)
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultArtworkColorRgb)
  const resolvedPlaylistArtworkUrls = usePlaylistArtwork(type === 'album' ? [] : headerSongs ?? songs)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const hideSong = useLibraryStore((state) => state.hideSong)
  const deleteSongFromDisk = useLibraryStore((state) => state.deleteSongFromDisk)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const resumeHiddenStorageItemByPath = useLibraryStore((state) => state.resumeHiddenStorageItemByPath)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const addSongsToPlaylist = useLibraryStore((state) => state.addSongsToPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const setSongsFavorite = useLibraryStore((state) => state.setSongsFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const inferredSortCriterion = useMemo(() => inferSortCriterion(songs), [songs])
  const activeSortCriterion = selectedSortCriterion ?? sortCriterion ?? inferredSortCriterion
  const visibleSongs = useMemo(() => {
    if (!orderedSongIds) {
      return songs
    }

    const orderedSongIdSet = new Set(orderedSongIds)
    return [
      ...orderedSongIds.map((songId) => songsById.get(songId)).filter((song) => song !== undefined),
      ...songs.filter((song) => !orderedSongIdSet.has(song.id)),
    ]
  }, [orderedSongIds, songs, songsById])
  const queueSongIds = useMemo(() => visibleSongs.map((song) => song.id), [visibleSongs])
  const visibleSongIds = visibleSongs.map((song) => song.id)
  const headerInfo = getHeaderPlaylistInfo(headerSongs ?? songs, translateCaption)
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => queueSongIds.includes(songId))
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const currentSavedPlaylist = type === 'playlist'
      ? playlists.find((playlist) => playlist.name === title)
      : undefined
  const currentPlaylistName = type === 'album' || type === 'favorites' ? title : currentSavedPlaylist?.name
  const preferenceDisplayName = type === 'album' ? getAlbumPreferenceDisplayName(title, songs, translateCaption) : title
  const defaultPlaylistName = getNextPlaylistName(
    isBadNewPlaylistName(title, translateCaption) ? '' : title,
    playlists,
  )
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, translateCaption('common.undo'), action)
  }
  const headerArtworkUrls = type === 'album'
    ? artworkUrl ? [artworkUrl] : []
    : getPlaylistArtworkDisplayUrls(resolvedPlaylistArtworkUrls)
  const headerArtworkUrl = headerArtworkUrls[0] ?? ''

  useEffect(() => {
    let isDisposed = false

    extractArtworkColorRgb(headerArtworkUrl)
      .then((nextColor) => {
        if (!isDisposed) {
          setCoverColorRgb(nextColor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setCoverColorRgb(getDefaultArtworkColorRgb())
        }
      })

    return () => {
      isDisposed = true
    }
  }, [headerArtworkUrl])

  useEffect(() => {
    document.documentElement.style.setProperty('--immersive-header-cover-rgb', coverColorRgb)

    return () => {
      document.documentElement.style.removeProperty('--immersive-header-cover-rgb')
    }
  }, [coverColorRgb])

  useEffect(() => {
    setOrderedSongIds(null)
    setSelectedSortCriterion(null)
  }, [songs])

  const refreshSongPreferenceItem = async (songId: number, snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
  }
  const songMenuSongId = songMenu?.song.id

  useEffect(() => {
    if (songMenuSongId !== undefined) {
      void refreshSongPreferenceItem(songMenuSongId)
    }
  }, [songMenuSongId])

  const shuffle = () => {
    const shuffledSongIds = shuffleSongIds(queueSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const clearSelection = () => {
    setSelectedSongIds(new Set())
  }

  const hideSelectionAfterOperation = () => {
    if (hideMultiSelectCommandBarAfterOperation) {
      setSelectionMode(false)
      clearSelection()
    }
  }

  const undoRemoveSongsFromCurrentPlaylist = (songIds: number[]) => {
    if (!currentSavedPlaylist) {
      return
    }

    showUndo(
      songIds.length === 1
        ? translateCaption('notification.removedFrom', {
            title: songs.find((song) => song.id === songIds[0])!.title,
            target: currentSavedPlaylist.name,
          })
        : translateCaption('notification.songsRemovedFrom', { count: songIds.length, target: currentSavedPlaylist.name }),
      () =>
        type === 'favorites'
          ? setSongsFavorite(songIds, true)
          : addSongsToPlaylist(currentSavedPlaylist.id, songIds),
    )
  }

  const reverseSelection = () => {
    setSelectedSongIds((current) => {
      const next = new Set<number>()
      for (const songId of visibleSongIds) {
        if (!current.has(songId)) {
          next.add(songId)
        }
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

  const commitSort = (criterion: PlaylistSortCriterion) => {
    const sortedSongs = criterion === activeSortCriterion
      ? visibleSongs.slice().reverse()
      : sortSongs(songs, criterion)
    setOrderedSongIds(sortedSongs.map((song) => song.id))
    setSelectedSortCriterion(criterion)
    onSortSongs?.(sortedSongs.map((song) => song.id), criterion)
  }

  const reverseSort = () => {
    const reversedSongs = visibleSongs.slice().reverse()
    setOrderedSongIds(reversedSongs.map((song) => song.id))
    setSelectedSortCriterion(activeSortCriterion)
    onSortSongs?.(reversedSongs.map((song) => song.id), activeSortCriterion)
  }

  const openPreferenceMenu = (x: number, y: number) => {
    setSortMenu(null)
    setPreferenceMenu({ x, y })
    if (preferenceType && preferenceItemId) {
      void refreshHeaderPreferenceItem()
    }
  }

  const openPreferenceMenuFromButton = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect()
    openPreferenceMenu(rect.left, rect.bottom + 4)
  }

  const openSortMenuFromButton = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect()
    setPreferenceMenu(null)
    setSortMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const getToolbarOverflowMenuPosition = () => {
    const menu = document.querySelector('.library-context-menu') as HTMLElement
    const menuRect = menu.getBoundingClientRect()
    return { x: menuRect.left, y: menuRect.top }
  }

  const openRenameDialog = () => {
    void requestTextDialog({
      title: translateCaption('playlists.rename'),
      defaultValue: title,
      placeholder: translateCaption('playlists.namePlaceholder'),
      confirmText: translateCaption('playlists.rename'),
      validate: (name) => validatePlaylistName(name, playlists, title, translateCaption),
    }).then((name) => {
      if (name && name !== title) {
        onRename?.(name)
      }
    })
  }

  const requestClear = () => {
    void requestConfirmDialog({
      title: captionFor('clear'),
      message: translateCaption('headeredPlaylist.clearConfirm', { name: title }),
      confirmText: captionFor('clear'),
    }).then((confirmed) => {
      if (confirmed) {
        onClear?.()
      }
    })
  }

  const requestDelete = () => {
    void requestConfirmDialog({
      title: captionFor('delete'),
      message: translateCaption('headeredPlaylist.deleteConfirm', { name: title }),
      confirmText: captionFor('delete'),
    }).then((confirmed) => {
      if (confirmed) {
        onDelete?.()
      }
    })
  }

  const refreshHeaderPreferenceItem = async (latestSnapshot?: PreferenceSettingsSnapshot | null) => {
    const snapshot = latestSnapshot ?? await refreshPreferences()
    if (!snapshot) {
      return
    }
    const item = [
      ...snapshot.songs,
      ...snapshot.artists,
      ...snapshot.albums,
      ...snapshot.playlists,
      ...snapshot.folders,
      ...snapshot.others,
    ].find((preferenceItem) => preferenceItem.type === preferenceType && preferenceItem.itemId === preferenceItemId)
    setHeaderPreferenceItem(item ?? null)
  }

  const startHeaderDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, a, [role="button"], .headered-playlist-scrollbar-thumb')) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    void window.smplayer?.startWindowDrag()
  }

  const stopHeaderDrag = () => {
    void window.smplayer?.stopWindowDrag()
  }

  const renderCommandBar = () => (
    <CommandBar className="headered-playlist-commandbar" overflowLabel={t('player.more')}>
      <CommandBarButton
        icon="shuffle"
        label={captionFor('shuffle')}
        disabled={songs.length === 0}
        onClick={shuffle}
      />
      <CommandBarButton
        icon="menu"
        label={captionFor('multiSelect')}
        disabled={songs.length === 0}
        onClick={() => {
          setSelectionMode(true)
        }}
      />
      {canSetPreferred && onSetPreferred ? (
        <CommandBarButton
          icon="star"
          label={captionFor('preferenceSettings')}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            openPreferenceMenuFromButton(event.currentTarget)
          }}
          onOverflowClick={(position) => {
            openPreferenceMenu(position.x, position.y)
          }}
        />
      ) : null}
      <CommandBarButton
        icon="sort"
        label={captionFor('sort')}
        disabled={songs.length === 0}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          openSortMenuFromButton(event.currentTarget)
        }}
        onOverflowClick={(position) => {
          setPreferenceMenu(null)
          setSortMenu(position)
        }}
      />
      {canRename ? (
        <CommandBarButton
          icon="rename"
          label={captionFor('rename')}
          onClick={openRenameDialog}
        />
      ) : null}
      {canClear ? (
        <CommandBarButton icon="clear" label={captionFor('clear')} disabled={songs.length === 0} onClick={requestClear} />
      ) : null}
      {canDelete ? (
        <CommandBarButton icon="trash" label={captionFor('delete')} onClick={requestDelete} />
      ) : null}
      {canEditArtwork && onEditArtwork ? (
        <CommandBarButton icon="pictures" label={captionFor('editArtwork')} onClick={onEditArtwork} />
      ) : null}
    </CommandBar>
  )

  const renderShyCommandBar = () => {
    const overflowItems: MenuFlyoutItem[] = [
      {
        key: 'multi-select',
        text: captionFor('multiSelect'),
        icon: 'menu',
        disabled: songs.length === 0,
        onClick: () => {
          setSelectionMode(true)
        },
      },
    ]

    if (canSetPreferred && onSetPreferred) {
      overflowItems.push({
        key: 'preference-settings',
        text: captionFor('preferenceSettings'),
        icon: 'star',
        onClick: () => {
          const position = getToolbarOverflowMenuPosition()
          openPreferenceMenu(position.x, position.y)
        },
      })
    }

    overflowItems.push({
      key: 'sort',
      text: captionFor('sort'),
      icon: 'sort',
      disabled: songs.length === 0,
      onClick: () => {
        setPreferenceMenu(null)
        setSortMenu(getToolbarOverflowMenuPosition())
      },
    })

    if (canRename) {
      overflowItems.push({
        key: 'rename',
        text: captionFor('rename'),
        icon: 'rename',
        onClick: openRenameDialog,
      })
    }

    if (canClear) {
      overflowItems.push({
        key: 'clear',
        text: captionFor('clear'),
        icon: 'clear',
        disabled: songs.length === 0,
        onClick: requestClear,
      })
    }

    if (canDelete) {
      overflowItems.push({
        key: 'delete',
        text: captionFor('delete'),
        icon: 'trash',
        onClick: requestDelete,
      })
    }

    if (canEditArtwork && onEditArtwork) {
      overflowItems.push({
        key: 'edit-artwork',
        text: captionFor('editArtwork'),
        icon: 'pictures',
        onClick: onEditArtwork,
      })
    }

    return (
      <CommandBar
        className="appbar-commandbar headered-playlist-appbar-commandbar"
        dynamicOverflow={false}
        overflowItems={overflowItems}
        overflowLabel={t('player.more')}
      >
        <CommandBarButton
          icon="shuffle"
          label={captionFor('shuffle')}
          disabled={songs.length === 0}
          onClick={shuffle}
        />
      </CommandBar>
    )
  }

  return (
    <section
      ref={controlRef}
      className={`headered-playlist-control headered-playlist-${type}`}
      style={{
        '--header-cover-rgb': coverColorRgb,
        '--playlist-control-row-count': visibleSongs.length,
      } as CSSProperties}
    >
      <div className="headered-playlist-drag-region" aria-hidden="true" />
      <div className="headered-playlist-scrollbar" aria-hidden="true">
        <div className="headered-playlist-scrollbar-thumb" onPointerDown={onScrollbarPointerDown} />
      </div>
      <div className="headered-playlist-backdrop" aria-hidden="true" />
      {isHeaderCollapsed ? (
        <AppBarPortal>
          {renderShyCommandBar()}
        </AppBarPortal>
      ) : null}
      <header
        className="headered-playlist-hero"
        onPointerDownCapture={startHeaderDrag}
        onPointerUpCapture={stopHeaderDrag}
        onPointerCancelCapture={stopHeaderDrag}
        onLostPointerCapture={stopHeaderDrag}
      >
        <div className="headered-playlist-hero-drag-layer" aria-hidden="true" />
        <div className="headered-playlist-hero-inner">
          <HeaderedPlaylistCover
            artworkUrls={headerArtworkUrls}
            title={title}
            type={type}
          />
          <div className="headered-playlist-copy">
            <h2 title={title}>{title}</h2>
            <p>{headerInfo}</p>
            <div className="headered-playlist-hero-commandbar">
              {renderCommandBar()}
            </div>
          </div>
        </div>
      </header>

      <section className={`PlaylistControl headered-playlist-list${showAlbum ? ' has-album' : ''}`}>
        <div className="headered-playlist-list-header">
          <span aria-hidden="true" />
          <span>{showArtist ? captionFor('songArtist') : captionFor('name')}</span>
          <span aria-hidden="true" />
          {showAlbum ? <span>{captionFor('album')}</span> : null}
          <span>{captionFor('duration')}</span>
        </div>
        <div className="headered-playlist-song-list">
          {visibleSongs.map((song, index) => (
            <PlaylistControlItem
              key={song.id}
              className="headered-playlist-queue-item"
              song={song}
              t={translateCaption}
              current={song.id === selectedTrackId}
              playing={isPlaying}
              selected={effectiveSelectedSongIds.includes(song.id)}
              selectionMode={selectionMode}
              dropPosition={null}
              queueSongIds={queueSongIds}
              draggable={false}
              showAlbum={showAlbum}
              showArtist={showArtist}
              onToggleSelection={() => {
                toggleSongSelection(song.id)
              }}
              onRemoveFromListClick={removable ? (contextSong) => {
                onRemoveSongs?.([contextSong.id])
              } : undefined}
              onAddToPlaylistClick={(contextSong, x, y) => {
                setAddToMenu({ songIds: [contextSong.id], x, y })
              }}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onContextMenu={(contextSong, x, y) => {
                setSongMenu({ song: contextSong, songIndex: index, x, y })
              }}
              onSeeArtist={onArtistClick}
              onSeeAlbum={(contextSong) => {
                onAlbumClick?.(contextSong.album || translateCaption('common.albumUnknown'))
              }}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </section>
      <div className="headered-playlist-bottom-spacer" aria-hidden="true" />

      <MultiSelectCommandBar
        visible={selectionMode}
        selectedCount={effectiveSelectedSongIds.length}
        t={translateCaption}
        playlists={customPlaylists}
        removeLabel={captionFor('removeSelected')}
        onPlay={() => {
          onPlayTrack(effectiveSelectedSongIds[0]!, effectiveSelectedSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          setAddToMenu({ songIds: effectiveSelectedSongIds, x: event.clientX, y: event.clientY })
        }}
        onRemove={removable ? () => {
          const removedSongIds = effectiveSelectedSongIds
          onRemoveSongs?.(effectiveSelectedSongIds)
          undoRemoveSongsFromCurrentPlaylist(removedSongIds)
          clearSelection()
        } : undefined}
        onSelectAll={() => {
          setSelectedSongIds(new Set(visibleSongIds))
        }}
        onReverseSelection={reverseSelection}
        onClearSelection={clearSelection}
        onCancel={() => {
          setSelectionMode(false)
          clearSelection()
        }}
      />

      {addToMenu ? (
        <MenuFlyout
          position={addToMenu}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists,
              songIds: addToMenu.songIds,
              t: translateCaption,
              defaultPlaylistName,
              currentPlaylistName,
              excludePlaylistName: currentSavedPlaylist?.name ?? '',
              includeNowPlaying: currentPlaylistName !== translateCaption('common.nowPlaying'),
              includeFavorites: currentPlaylistName !== translateCaption('common.myFavorites'),
              onAddToNowPlaying: () => {
                const insertedIndex = nowPlayingSongIds.length
                void replaceNowPlaying([...nowPlayingSongIds, ...addToMenu.songIds])
                showUndo(
                  addToMenu.songIds.length === 1
                    ? translateCaption('notification.songAddedTo', {
                        title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                        target: translateCaption('common.nowPlaying'),
                      })
                    : translateCaption('notification.songsAddedTo', { count: addToMenu.songIds.length, target: translateCaption('common.nowPlaying') }),
                  () => replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, addToMenu.songIds.length)),
                )
                hideSelectionAfterOperation()
              },
              onToggleFavorite: () => {
                void addSongsToPlaylist(favoritePlaylistId, addToMenu.songIds)
                showUndo(
                  addToMenu.songIds.length === 1
                    ? translateCaption('notification.songAddedTo', {
                        title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                        target: translateCaption('common.myFavorites'),
                      })
                    : translateCaption('notification.songsAddedTo', { count: addToMenu.songIds.length, target: translateCaption('common.myFavorites') }),
                  () => removeSongsFromPlaylist(favoritePlaylistId, addToMenu.songIds),
                )
                hideSelectionAfterOperation()
              },
              onCreatePlaylist: (name) => {
                void createPlaylist(name, addToMenu.songIds)
                hideSelectionAfterOperation()
              },
              onAddToPlaylist: (playlistId) => {
                if (addToMenu.songIds.length === 1) {
                  onAddSongToPlaylist(playlistId, addToMenu.songIds[0]!)
                } else {
                  onAddSongsToPlaylist?.(playlistId, addToMenu.songIds)
                }
                hideSelectionAfterOperation()
              },
            }),
          ].filter((item): item is NonNullable<typeof item> => item != null)}
        />
      ) : null}

      {sortMenu ? (
        <MenuFlyout
          position={sortMenu}
          onClose={() => {
            setSortMenu(null)
          }}
          items={[
            {
              key: 'reverse',
              text: captionFor('sort.reverse'),
              onClick: reverseSort,
            },
            {
              key: 'sort-separator',
              text: '',
              separator: true,
            },
            ...sortOptions.map((criterion) => ({
              key: criterion,
              text: captionFor(`sort.${criterion}`),
              icon: criterion === activeSortCriterion ? 'check' as const : undefined,
              onClick: () => {
                commitSort(criterion)
              },
            })),
          ]}
        />
      ) : null}

      {preferenceMenu && onSetPreferred ? (
        <MenuFlyout
          position={preferenceMenu}
          onClose={() => {
            setPreferenceMenu(null)
          }}
          items={[
            getPreferenceMenuFlyoutItem({
              type: preferenceType!,
              itemId: preferenceItemId!,
              name: preferenceDisplayName,
              preferenceItem: headerPreferenceItem,
              t,
              onUpdated: refreshHeaderPreferenceItem,
            }),
          ]}
        />
      ) : null}
      {songMenu ? (
        <MenuFlyout
          position={songMenu}
          onClose={() => {
            setSongMenu(null)
          }}
          items={getMusicMenuFlyoutItems({
            song: songMenu.song,
            option: {
              showRemove: removable,
              showSelect: true,
              showDelete: true,
              showSeeArtistsAndSeeAlbum: true,
            },
            playlists,
            folders,
            currentPlaylistName,
            excludePlaylistName: currentSavedPlaylist?.name ?? '',
            queueSongIds,
            playbackSongIds: nowPlayingSongIds,
            currentTrackId: selectedTrackId,
            songIndex: songMenu.songIndex,
            isPlaying,
            t: translateCaption,
            onPlay: () => {
              if (onMoveToMusicOrPlay) {
                onMoveToMusicOrPlay(songMenu.song.id)
                return
              }

              onPlayTrack(songMenu.song.id, queueSongIds)
            },
            onPause: () => {
              onTogglePlayPause?.()
            },
            onPlayNext: () => {
              if (onPlayNext) {
                onPlayNext(songMenu.song.id)
                return
              }

              const nextQueue = nowPlayingSongIds.slice()
              const currentIndex = selectedTrackId == null ? -1 : nextQueue.indexOf(selectedTrackId)
              nextQueue.splice(Math.max(0, currentIndex + 1), 0, songMenu.song.id)
              onPlayTrack(selectedTrackId ?? songMenu.song.id, nextQueue)
            },
            onAddToNowPlaying: () => {
              const insertedIndex = nowPlayingSongIds.length
              void replaceNowPlaying([...nowPlayingSongIds, songMenu.song.id])
              showUndo(translateCaption('notification.songAddedTo', { title: songMenu.song.title, target: translateCaption('common.nowPlaying') }), () =>
                replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
              )
            },
            onCreatePlaylist: (name) => {
              void createPlaylist(name, [songMenu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongToPlaylist(playlistId, songMenu.song.id)
              showUndo(translateCaption('notification.songAddedTo', { title: songMenu.song.title, target: targetPlaylist.name }), () =>
                removeSongFromPlaylist(playlistId, songMenu.song.id),
              )
            },
            onRemove: () => {
              onRemoveSongs?.([songMenu.song.id])
              if (currentSavedPlaylist) {
                showUndo(translateCaption('notification.removedFrom', { title: songMenu.song.title, target: currentSavedPlaylist.name }), () =>
                  type === 'favorites'
                    ? setSongFavorite(songMenu.song.id, true)
                    : addSongsToPlaylist(currentSavedPlaylist.id, [songMenu.song.id]),
                )
              }
            },
            onSelect: () => {
              setSelectionMode(true)
              setSelectedSongIds(new Set([songMenu.song.id]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void removePreferenceItem(songPreferenceItem!).then(() => refreshSongPreferenceItem(songMenu.song.id, usePreferenceStore.getState().snapshot))
            },
            onSetPreference: (level) => {
              void addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then((snapshot) => refreshSongPreferenceItem(songMenu.song.id, snapshot))
            },
            onMoveToFolder: (folderPath) => {
              const originalFolderPath = getParentFolderPath(songMenu.song.path)
              void moveSongToFolder(songMenu.song.id, folderPath)
              showUndo(translateCaption('notification.movedSong', { title: songMenu.song.title }), () =>
                moveSongToFolder(songMenu.song.id, originalFolderPath),
              )
            },
            onToggleFavorite: () => {
              onToggleFavorite?.(songMenu.song.id, !songMenu.song.favorite)
              const target = translateCaption('common.myFavorites')
              showUndo(
                songMenu.song.favorite
                  ? translateCaption('notification.removedFrom', { title: songMenu.song.title, target })
                  : translateCaption('notification.songAddedTo', { title: songMenu.song.title, target }),
                () => setSongFavorite(songMenu.song.id, songMenu.song.favorite),
              )
            },
            onReveal: () => {
              void window.smplayer?.revealItemInFolder(songMenu.song.path)
            },
            onDelete: () => {
              void requestConfirmDialog({
                title: translateCaption('playlists.delete'),
                message: translateCaption('context.deleteSongConfirm', { title: songMenu.song.title }),
                confirmText: translateCaption('playlists.delete'),
              }).then((confirmed) => {
                if (confirmed) {
                  void deleteSongFromDisk(songMenu.song.id)
                }
              })
            },
            onHide: () => {
              void hideSong(songMenu.song.id)
              showUndo(translateCaption('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                await resumeHiddenStorageItemByPath(songMenu.song.path)
              })
            },
            onSeeArtist: (artist) => {
              onArtistClick?.(artist)
            },
            onSeeAlbum: () => {
              onAlbumClick?.(songMenu.song.album || translateCaption('common.albumUnknown'))
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
      {songDialog ? (
        <MusicDialog
          song={songDialog.song}
          mode={songDialog.mode}
          t={translateCaption}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onClose={() => {
            setSongDialog(null)
            setSongMenu(null)
          }}
          onSaved={refresh}
        />
      ) : null}
    </section>
  )

  function translateCaption(key: string, values?: Record<string, string | number>) {
    if (key in captions) {
      return t(captions[key]!, values)
    }
    return t(key, values)
  }

  function captionFor(key: string) {
    return translateCaption(key)
  }
}

function useHeaderedPlaylistScroll(
  controlRef: RefObject<HTMLElement | null>,
  title: string,
  setIsHeaderCollapsed: Dispatch<SetStateAction<boolean>>,
) {
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const headerCollapsedRef = useRef(false)
  const appBarTitleRef = useRef('')

  useEffect(() => {
    const control = controlRef.current as HTMLElement
    const scrollContainer = control.closest('.workspace-content') as HTMLElement
    scrollContainerRef.current = scrollContainer
    let animationFrame = 0

    const update = () => {
      animationFrame = 0
      const scrollTop = scrollContainer.scrollTop
      const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
      const isNarrow = window.matchMedia('(max-width: 720px)').matches
      const collapseDistance = isNarrow ? 136 : 210
      const collapseProgress = Math.min(scrollTop / collapseDistance, 1)
      const isCollapsed = headerCollapsedRef.current
        ? scrollTop > (isNarrow ? 76 : 186)
        : scrollTop >= (isNarrow ? 112 : 224)
      headerCollapsedRef.current = isCollapsed
      setIsHeaderCollapsed((current) => current === isCollapsed ? current : isCollapsed)
      const nextAppBarTitle = isNarrow && isCollapsed ? title : ''
      if (appBarTitleRef.current !== nextAppBarTitle) {
        appBarTitleRef.current = nextAppBarTitle
        window.dispatchEvent(new CustomEvent('smplayer:immersive-title-change', {
          detail: { title: nextAppBarTitle },
        }))
      }
      const heroHeight = isNarrow
        ? Math.round(320 - collapseProgress * 182)
        : Math.round(326 - collapseProgress * 200)
      const heroPaddingTop = isNarrow
        ? 0
        : Math.round(50 - collapseProgress * 26)
      const coverSize = isNarrow
        ? Math.round(180 - collapseProgress * 112)
        : Math.round(240 - collapseProgress * 154)
      const titleSize = isNarrow
        ? Math.round(24 - collapseProgress * 4)
        : Math.round(48 - collapseProgress * 22)
      const commandMargin = isNarrow
        ? Math.round(8 - collapseProgress * 4)
        : Math.round(30 - collapseProgress * 22)
      const scrollContainerRect = scrollContainer.getBoundingClientRect()
      const fixedContainer = scrollContainer.closest('.workspace') as HTMLElement
      const fixedContainerRect = fixedContainer.getBoundingClientRect()
      const fixedHeaderViewportTop = Math.round(scrollContainerRect.top)
      const fixedHeaderTop = Math.round(scrollContainerRect.top - fixedContainerRect.top)
      const fixedHeaderLeft = Math.round(scrollContainerRect.left - fixedContainerRect.left)
      const fixedHeaderRight = Math.max(0, Math.round(fixedContainerRect.right - scrollContainerRect.right))
      const scrollbarTop = Math.round(fixedHeaderTop + heroHeight + 4)
      const playerRect = document.querySelector('.player-bar')?.getBoundingClientRect()
      const scrollbarBottom = Math.max(10, Math.round(fixedContainerRect.bottom - (playerRect?.top ?? scrollContainerRect.bottom) + 10))
      const scrollbarHeight = Math.max(48, window.innerHeight - scrollbarTop - scrollbarBottom)
      const visibleViewportHeight = Math.max(48, scrollbarHeight)
      const scrollbarRight = Math.max(2, Math.round(fixedContainerRect.right - scrollContainerRect.right + 2))
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((visibleViewportHeight / scrollContainer.scrollHeight) * scrollbarHeight))
        : scrollbarHeight
      const thumbTop = maxScrollTop > 0
        ? Math.round((scrollTop / maxScrollTop) * (scrollbarHeight - thumbHeight))
        : 0

      control.style.setProperty('--header-collapse-progress', String(collapseProgress))
      control.style.setProperty('--header-hero-height', `${heroHeight}px`)
      control.style.setProperty('--header-hero-padding-top', `${heroPaddingTop}px`)
      control.style.setProperty('--header-cover-size', `${coverSize}px`)
      control.style.setProperty('--header-title-size', `${titleSize}px`)
      control.style.setProperty('--header-command-margin', `${commandMargin}px`)
      control.style.setProperty('--header-viewport-top', `${fixedHeaderViewportTop}px`)
      control.style.setProperty('--header-fixed-top', `${fixedHeaderTop}px`)
      control.style.setProperty('--header-fixed-left', `${fixedHeaderLeft}px`)
      control.style.setProperty('--header-fixed-right', `${fixedHeaderRight}px`)
      control.style.setProperty('--header-scrollbar-top', `${scrollbarTop}px`)
      control.style.setProperty('--header-scrollbar-bottom', `${scrollbarBottom}px`)
      control.style.setProperty('--header-scrollbar-right', `${scrollbarRight}px`)
      control.style.setProperty('--header-scrollbar-height', `${scrollbarHeight}px`)
      control.style.setProperty('--header-scrollbar-thumb-height', `${thumbHeight}px`)
      control.style.setProperty('--header-scrollbar-thumb-top', `${thumbTop}px`)
      control.style.setProperty('--header-scrollbar-opacity', maxScrollTop > 0 ? '1' : '0')
      control.classList.toggle('is-header-collapsed', isCollapsed)
    }

    const scheduleUpdate = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(update)
      }
    }

    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(scrollContainer)
    resizeObserver.observe(control)
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true })
    update()

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame)
      }
      control.classList.remove('is-header-collapsed')
      setIsHeaderCollapsed(false)
      if (appBarTitleRef.current) {
        appBarTitleRef.current = ''
        window.dispatchEvent(new CustomEvent('smplayer:immersive-title-change', {
          detail: { title: '' },
        }))
      }
      resizeObserver.disconnect()
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      scrollContainerRef.current = null
    }
  }, [controlRef, title])

  return (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const control = controlRef.current as HTMLElement
    const scrollContainer = scrollContainerRef.current as HTMLElement
    const startY = event.clientY
    const startScrollTop = scrollContainer.scrollTop
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
    const style = getComputedStyle(control)
    const scrollbarHeight = parseFloat(style.getPropertyValue('--header-scrollbar-height'))
    const thumbHeight = parseFloat(style.getPropertyValue('--header-scrollbar-thumb-height'))
    const scrollPerPixel = maxScrollTop / Math.max(1, scrollbarHeight - thumbHeight)

    const move = (moveEvent: globalThis.PointerEvent) => {
      scrollContainer.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

function HeaderedPlaylistCover({
  artworkUrls,
  title,
  type,
}: {
  artworkUrls: string[]
  title: string
  type: HeaderedPlaylistType
}) {
  if (artworkUrls.length >= 3 && type !== 'album') {
    return (
      <span className="headered-playlist-cover headered-playlist-cover-mosaic" aria-hidden="true">
        {artworkUrls.slice(0, 4).map((artworkUrl, index) => (
          <img
            alt=""
            key={`${artworkUrl}:${index}`}
            src={artworkUrl}
          />
        ))}
        {artworkUrls.length === 3 ? (
          <span className="headered-playlist-cover-mosaic-fallback">
            <img src="/colorful_bg_wide.png" alt="" />
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <ArtworkImage
      className="headered-playlist-cover"
      src={artworkUrls[0] ?? ''}
      title={title}
      renderFallback={() => (
        <div className="headered-playlist-cover headered-playlist-cover-fallback" aria-hidden="true">
          {type === 'album'
            ? <DefaultAlbumArtwork className="headered-playlist-cover-fallback-image" />
            : <img className="headered-playlist-cover-fallback-image" src="/monotone_bg_wide.png" alt="" />}
        </div>
      )}
    />
  )
}

const captions: Record<string, string> = {
  album: 'common.album',
  artist: 'common.artist',
  cancel: 'common.cancel',
  clear: 'common.clear',
  delete: 'playlists.delete',
  duration: 'common.duration',
  editArtwork: 'albums.editArtwork',
  multiSelect: 'albums.multiSelect',
  name: 'common.name',
  play: 'context.play',
  removeSelected: 'playlists.removeSelected',
  rename: 'playlists.rename',
  save: 'playlists.save',
  shuffle: 'nowPlaying.randomPlay',
  sort: 'common.sort',
  preferenceSettings: 'settings.preferenceSettings',
  songArtist: 'headeredPlaylist.songArtist',
  songsPrefix: 'headeredPlaylist.songsPrefix',
  'sort.album': 'table.album',
  'sort.artist': 'table.artist',
  'sort.date-added': 'table.dateAdded',
  'sort.duration': 'table.duration',
  'sort.play-count': 'table.playCount',
  'sort.reverse': 'albums.sort.reverse',
  'sort.title': 'table.title',
}

function getHeaderPlaylistInfo(songs: LibrarySong[], t: Translator) {
  const countText = `${t('headeredPlaylist.songsPrefix')}${songs.length}`
  if (songs.length < 2) {
    return countText
  }

  const duration = songs.reduce((total, song) => total + song.duration, 0)
  return `${countText} • ${formatDuration(duration)}`
}

function getAlbumPreferenceDisplayName(albumName: string, songs: LibrarySong[], t: Translator) {
  const albumTitle = albumName || t('common.albumUnknown')
  const firstSong = songs[0]
  const artist = firstSong ? getDisplayArtists(firstSong) : t('common.artistUnknown')
  return `${albumTitle} - ${artist}`
}

function sortSongs(songs: LibrarySong[], criterion: MusicLibrarySortCriterion) {
  const sortedSongs = songs.slice().sort((left, right) => {
    switch (criterion) {
      case 'artist':
        return getDisplayArtists(left).localeCompare(getDisplayArtists(right))
      case 'album':
        return left.album.localeCompare(right.album)
      case 'duration':
        return left.duration - right.duration
      case 'play-count':
        return left.playCount - right.playCount
      case 'date-added':
        return left.dateAdded.localeCompare(right.dateAdded)
      case 'title':
        return left.title.localeCompare(right.title)
    }
  })

  return sortedSongs
}

function inferSortCriterion(songs: LibrarySong[]) {
  for (const criterion of sortOptions) {
    const sortedSongIds = sortSongs(songs, criterion).map((song) => song.id)
    if (sortedSongIds.every((songId, index) => songId === songs[index]!.id)) {
      return criterion
    }
  }

  return 'title'
}

function isBadNewPlaylistName(name: string, t: Translator) {
  return name === t('common.nowPlaying') || name === t('common.myFavorites')
}

function validatePlaylistName(name: string, playlists: LibraryPlaylist[], currentName: string, t: Translator) {
  if (!name) {
    return t('playlists.nameEmpty')
  }

  if (name.length > 50) {
    return t('playlists.nameTooLong')
  }

  if (playlists.some((playlist) => playlist.name !== currentName && playlist.name === name)) {
    return t('playlists.nameUsed')
  }

  if (name.includes('+++++') || name.includes('{0}') || name.includes('{1}')) {
    return t('playlists.nameSpecial')
  }

  return ''
}

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  if (!name) {
    return ''
  }

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
