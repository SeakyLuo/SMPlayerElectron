import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react'

import { getDisplayArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, MusicLibrarySortCriterion, PlaylistSortCriterion, PreferenceEntityType, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { ArtworkImage } from './ArtworkImage'
import { Icon } from './icons'
import { MenuFlyout } from './MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, type MenuFlyoutPosition } from './MenuFlyoutHelper'
import { MultiSelectCommandBar } from './MultiSelectCommandBar'
import { PlaylistControlItem } from './PlaylistControlItem'

type HeaderedPlaylistType = 'album' | 'playlist' | 'favorites'

interface HeaderedPlaylistControlProps {
  type: HeaderedPlaylistType
  title: string
  subtitle: string
  caption: string
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  isPlaying?: boolean
  playlists: LibraryPlaylist[]
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
}

const sortOptions: MusicLibrarySortCriterion[] = ['title', 'artist', 'album', 'duration', 'play-count', 'date-added']
const preferenceLevels: PreferenceLevel[] = ['very-high', 'higher', 'high', 'normal', 'dislike', 'do-not-appear']

export function HeaderedPlaylistControl({
  type,
  title,
  subtitle,
  caption,
  t,
  songs,
  selectedTrackId,
  isPlaying = false,
  playlists,
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
}: HeaderedPlaylistControlProps) {
  const controlRef = useRef<HTMLElement | null>(null)
  const onScrollbarPointerDown = useHeaderedPlaylistScroll(controlRef)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[] }) | null>(null)
  const [sortMenu, setSortMenu] = useState<MenuFlyoutPosition | null>(null)
  const [preferenceMenu, setPreferenceMenu] = useState<MenuFlyoutPosition | null>(null)
  const [preferenceLevel, setPreferenceLevel] = useState<PreferenceLevel>('normal')
  const [editingName, setEditingName] = useState(false)
  const [renameDraft, setRenameDraft] = useState(title)
  const [selectedSortCriterion, setSelectedSortCriterion] = useState<PlaylistSortCriterion | null>(null)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const inferredSortCriterion = useMemo(() => inferSortCriterion(songs), [songs])
  const activeSortCriterion = selectedSortCriterion ?? sortCriterion ?? inferredSortCriterion
  const visibleSongs = songs
  const visibleSongIds = visibleSongs.map((song) => song.id)
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => queueSongIds.includes(songId))
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const hasAddablePlaylist = (songIds: number[]) =>
    customPlaylists.some((playlist) => songIds.some((songId) => !playlist.songIds.includes(songId)))
  const multiSelectPlaylists =
    effectiveSelectedSongIds.length === 0 || hasAddablePlaylist(effectiveSelectedSongIds)
      ? customPlaylists
      : []

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
    setSelectedSortCriterion(criterion)
    onSortSongs?.(sortedSongs.map((song) => song.id), criterion)
  }

  const reverseSort = () => {
    const reversedSongs = visibleSongs.slice().reverse()
    setSelectedSortCriterion(activeSortCriterion)
    onSortSongs?.(reversedSongs.map((song) => song.id), activeSortCriterion)
  }

  const openPreferenceMenu = (x: number, y: number) => {
    setSortMenu(null)
    setPreferenceMenu({ x, y })
    if (preferenceType && preferenceItemId) {
      void window.smplayer?.getPreferenceSettings().then((snapshot) => {
        const item = [
          ...snapshot.songs,
          ...snapshot.artists,
          ...snapshot.albums,
          ...snapshot.playlists,
          ...snapshot.folders,
          ...snapshot.others,
        ].find((preferenceItem) => preferenceItem.type === preferenceType && preferenceItem.itemId === preferenceItemId)
        if (item) {
          setPreferenceLevel(item.level)
        }
      })
    }
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

  return (
    <section ref={controlRef} className={`headered-playlist-control headered-playlist-${type}`}>
      <div className="headered-playlist-drag-region" aria-hidden="true" />
      <div className="headered-playlist-scrollbar" aria-hidden="true">
        <div className="headered-playlist-scrollbar-thumb" onPointerDown={onScrollbarPointerDown} />
      </div>
      <div className="headered-playlist-backdrop" aria-hidden="true">
        {artworkUrl ? <img src={artworkUrl} alt="" /> : null}
      </div>
      <header
        className="headered-playlist-hero"
        onPointerDownCapture={startHeaderDrag}
        onPointerUpCapture={stopHeaderDrag}
        onPointerCancelCapture={stopHeaderDrag}
        onLostPointerCapture={stopHeaderDrag}
      >
        <div className="headered-playlist-hero-drag-layer" aria-hidden="true" />
        <div className="headered-playlist-hero-inner">
          <ArtworkImage
            className="headered-playlist-cover"
            src={artworkUrl}
            title={title}
            renderFallback={() => (
              <div className="headered-playlist-cover headered-playlist-cover-fallback" aria-hidden="true">
                <Icon name={type === 'album' ? 'albums' : 'playlists'} />
              </div>
            )}
          />
          <div className="headered-playlist-copy">
            {editingName ? (
              <form
                className="headered-playlist-rename"
                onSubmit={(event) => {
                  event.preventDefault()
                  const nextName = renameDraft.trim()
                  if (!nextName) {
                    return
                  }
                  onRename?.(nextName)
                  setEditingName(false)
                }}
              >
                <input
                  value={renameDraft}
                  onChange={(event) => {
                    setRenameDraft(event.currentTarget.value)
                  }}
                />
                <button type="submit">{captionFor('save')}</button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false)
                    setRenameDraft(title)
                  }}
                >
                  {captionFor('cancel')}
                </button>
              </form>
            ) : (
              <h2 title={title}>{title}</h2>
            )}
            <p>{subtitle}</p>
            <p>{caption}</p>
            <div className="headered-playlist-commandbar">
              <button type="button" disabled={songs.length === 0} onClick={shuffle} title={captionFor('shuffle')}>
                <Icon name="shuffle" />
                <span>{captionFor('shuffle')}</span>
              </button>
              <button
                type="button"
                disabled={songs.length === 0}
                onClick={() => {
                  setSelectionMode(true)
                }}
                title={captionFor('multiSelect')}
              >
                <Icon name="menu" />
                <span>{captionFor('multiSelect')}</span>
              </button>
              {canSetPreferred && onSetPreferred ? (
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openPreferenceMenu(event.clientX, event.clientY)
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  title={captionFor('preferenceSettings')}
                >
                  <Icon name="heart" />
                  <span>{captionFor('preferenceSettings')}</span>
                </button>
              ) : null}
              <button
                type="button"
                disabled={songs.length === 0}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setPreferenceMenu(null)
                  setSortMenu({ x: event.clientX, y: event.clientY })
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                title={captionFor('sort')}
              >
                <Icon name="sort" />
                <span>{captionFor('sort')}</span>
              </button>
              {canRename ? (
                <button
                  type="button"
                  onClick={() => {
                    setRenameDraft(title)
                    setEditingName(true)
                  }}
                  title={captionFor('rename')}
                >
                  <Icon name="settings" />
                  <span>{captionFor('rename')}</span>
                </button>
              ) : null}
              {canClear ? (
                <button type="button" disabled={songs.length === 0} onClick={onClear} title={captionFor('clear')}>
                  <Icon name="clearSelection" />
                  <span>{captionFor('clear')}</span>
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" onClick={onDelete} title={captionFor('delete')}>
                  <Icon name="trash" />
                  <span>{captionFor('delete')}</span>
                </button>
              ) : null}
              {canEditArtwork && onEditArtwork ? (
                <button type="button" onClick={onEditArtwork} title={captionFor('editArtwork')}>
                  <Icon name="albums" />
                  <span>{captionFor('editArtwork')}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className={`headered-playlist-list${showAlbum ? ' has-album' : ''}`}>
        <div className="headered-playlist-list-header">
          <span className="headered-playlist-title-head">
            <span>#</span>
            <span>{captionFor('name')}</span>
          </span>
          {showArtist ? <span>{captionFor('artist')}</span> : null}
          {showAlbum ? <span>{captionFor('album')}</span> : null}
          <span>{captionFor('duration')}</span>
        </div>
        <div className="headered-playlist-song-list">
          {visibleSongs.map((song, index) => (
            <PlaylistControlItem
              key={song.id}
              song={song}
              t={translateCaption}
              rowNumber={index + 1}
              current={song.id === selectedTrackId}
              isPlaying={isPlaying}
              selected={effectiveSelectedSongIds.includes(song.id)}
              selectionMode={selectionMode}
              queueSongIds={queueSongIds}
              showAlbum={showAlbum}
              showArtist={showArtist}
              showDuration
              removable={removable}
              onRemoveFromListClick={(contextSong) => {
                onRemoveSongs?.([contextSong.id])
              }}
              onAddToPlaylistClick={
                hasAddablePlaylist([song.id])
                  ? (contextSong, x, y) => {
                      setAddToMenu({ songIds: [contextSong.id], x, y })
                    }
                  : undefined
              }
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onSelect={toggleSongSelection}
              onArtistClick={onArtistClick}
              onAlbumClick={onAlbumClick}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </section>

      <MultiSelectCommandBar
        visible={selectionMode}
        selectedCount={effectiveSelectedSongIds.length}
        t={translateCaption}
        playlists={multiSelectPlaylists}
        removeLabel={captionFor('removeSelected')}
        onPlay={() => {
          onPlayTrack(effectiveSelectedSongIds[0]!, effectiveSelectedSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          setAddToMenu({ songIds: effectiveSelectedSongIds, x: event.clientX, y: event.clientY })
        }}
        onRemove={removable ? () => {
          onRemoveSongs?.(effectiveSelectedSongIds)
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
          items={preferenceLevels.map((level) => ({
            key: `preference-${level}`,
            text: t(`preferences.level.${level}`),
            icon: level === preferenceLevel ? 'check' as const : undefined,
            onClick: () => {
              setPreferenceLevel(level)
              onSetPreferred(level)
            },
          }))}
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

function useHeaderedPlaylistScroll(controlRef: RefObject<HTMLElement | null>) {
  const scrollContainerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const control = controlRef.current as HTMLElement
    const scrollContainer = control.closest('.immersive-detail-page') as HTMLElement
    scrollContainerRef.current = scrollContainer
    let animationFrame = 0

    const update = () => {
      animationFrame = 0
      const scrollTop = scrollContainer.scrollTop
      const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
      const collapseProgress = Math.min(scrollTop / 210, 1)
      const isCollapsed = collapseProgress >= 1
      const heroHeight = Math.round(326 - collapseProgress * 200)
      const heroPaddingTop = Math.round(50 - collapseProgress * 26)
      const coverSize = Math.round(240 - collapseProgress * 154)
      const titleSize = Math.round(48 - collapseProgress * 22)
      const commandMargin = Math.round(30 - collapseProgress * 22)
      const scrollbarTop = Math.round(heroHeight + 4)
      const scrollbarHeight = Math.max(48, scrollContainer.clientHeight - scrollbarTop - 10)
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((scrollContainer.clientHeight / scrollContainer.scrollHeight) * scrollbarHeight))
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
      control.style.setProperty('--header-scrollbar-top', `${scrollbarTop}px`)
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
      resizeObserver.disconnect()
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      scrollContainerRef.current = null
    }
  }, [controlRef])

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
    const scrollPerPixel = maxScrollTop / (scrollbarHeight - thumbHeight)

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
  'sort.album': 'table.album',
  'sort.artist': 'table.artist',
  'sort.date-added': 'table.dateAdded',
  'sort.duration': 'table.duration',
  'sort.play-count': 'table.playCount',
  'sort.reverse': 'albums.sort.reverse',
  'sort.title': 'table.title',
}

function sortSongs(songs: LibrarySong[], criterion: MusicLibrarySortCriterion) {
  const sortedSongs = songs.slice().sort((left, right) => {
    switch (criterion) {
      case 'artist':
        return getDisplayArtists(left).localeCompare(getDisplayArtists(right)) || left.title.localeCompare(right.title)
      case 'album':
        return left.album.localeCompare(right.album) || left.title.localeCompare(right.title)
      case 'duration':
        return left.duration - right.duration || left.title.localeCompare(right.title)
      case 'play-count':
        return right.playCount - left.playCount || left.title.localeCompare(right.title)
      case 'date-added':
        return right.dateAdded.localeCompare(left.dateAdded) || left.title.localeCompare(right.title)
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
