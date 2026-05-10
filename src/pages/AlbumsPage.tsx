import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { getSongArtists } from '../shared/artists'
import type { AlbumSortCriterion, AppSettingsUpdate, LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { compareLocalText, getLocalTextQuickJumpBucket, LOCAL_TEXT_QUICK_JUMP_KEYS } from '../shared/textCompare'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'

const ALBUM_TILE_TRACK_WIDTH = 180
const ALBUM_COLUMN_GAP = 30
const ALBUM_GRID_RIGHT_PADDING = 0
const ALBUM_ROW_HEIGHT = 250
const ALBUM_COMPACT_ROW_HEIGHT = 234
const ALBUM_OVERSCAN_ROWS = 2
const ALBUM_COMPACT_QUERY = '(max-width: 720px)'

interface AlbumView {
  name: string
  artist: string
  artists: string[]
  songs: LibrarySong[]
  artworkUrl: string
  duration: number
}

interface AlbumsPageProps {
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  loading: boolean
  scanning: boolean
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onUpdateSettings: (update: AppSettingsUpdate) => void
}

export function AlbumsPage({
  songs,
  playlists,
  favoritePlaylistId,
  t,
  loading,
  scanning,
  onPlayTrack,
  onAddSongsToPlaylist,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onUpdateSettings,
}: AlbumsPageProps) {
  const navigate = useNavigate()
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [isCompactAlbumLayout, setIsCompactAlbumLayout] = useState(false)
  const albumsSort = useLibraryStore((state) => state.snapshot.settings.albumsSort)
  const [sortCriterion, setSortCriterion] = useState<AlbumSortCriterion>(albumsSort)
  const [reverseDisplayOrder, setReverseDisplayOrder] = useState(false)
  const [sortMenu, setSortMenu] = useState<MenuFlyoutPosition | null>(null)
  const [processing, setProcessing] = useState(false)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedAlbumNames, setSelectedAlbumNames] = useState<Set<string>>(new Set())
  const [albumContextMenu, setAlbumContextMenu] = useState<(MenuFlyoutPosition & { album: AlbumView }) | null>(null)
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[]; defaultPlaylistName: string }) | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<AlbumView | null>(null)
  const [albumPreferenceItems, setAlbumPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const albumGridRef = useRef<HTMLDivElement | null>(null)
  const [albumScrollTop, setAlbumScrollTop] = useState(0)
  const [albumViewportHeight, setAlbumViewportHeight] = useState(640)
  const [albumGridWidth, setAlbumGridWidth] = useState(960)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const refreshPreferences = usePreferenceStore((state) => state.refresh)

  const albums = useMemo(() => buildAlbumViews(songs, t), [songs, t])
  const baseVisibleAlbums = useMemo<AlbumView[]>(() => {
    if (searchQuery.trim()) {
      return searchAlbums(albums, searchQuery)
    }

    return sortAlbums(albums, sortCriterion)
  }, [albums, searchQuery, sortCriterion])
  const visibleAlbums = reverseDisplayOrder ? baseVisibleAlbums.slice().reverse() : baseVisibleAlbums
  const searchHasText = Boolean(searchDraft || searchQuery)
  const albumSearchSuggestions = searchDraft.trim()
    ? searchAlbums(albums, searchDraft).slice(0, 8)
    : []
  const showAlbumSearchSuggestions = searchFocused && albumSearchSuggestions.length > 0
  const selectedAlbums = useMemo(
    () => visibleAlbums.filter((album) => selectedAlbumNames.has(album.name)),
    [selectedAlbumNames, visibleAlbums],
  )
  const selectedSongIds = selectedAlbums.flatMap((album) => album.songs.map((song) => song.id))
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const albumColumns = Math.max(1, Math.floor((albumGridWidth + ALBUM_COLUMN_GAP) / (ALBUM_TILE_TRACK_WIDTH + ALBUM_COLUMN_GAP)))
  const albumRowHeight = isCompactAlbumLayout ? ALBUM_COMPACT_ROW_HEIGHT : ALBUM_ROW_HEIGHT
  const albumRowCount = Math.ceil(visibleAlbums.length / albumColumns)
  const albumListHeight = albumRowCount * albumRowHeight
  const effectiveAlbumScrollTop = Math.min(
    albumScrollTop,
    Math.max(0, albumListHeight - albumViewportHeight),
  )
  const albumStartRow = Math.max(
    0,
    Math.floor(effectiveAlbumScrollTop / albumRowHeight) - ALBUM_OVERSCAN_ROWS,
  )
  const albumEndRow = Math.min(
    albumRowCount,
    Math.ceil((effectiveAlbumScrollTop + albumViewportHeight) / albumRowHeight) + ALBUM_OVERSCAN_ROWS,
  )
  const renderedAlbums = visibleAlbums.slice(albumStartRow * albumColumns, albumEndRow * albumColumns)
  const albumWindowTop = albumStartRow * albumRowHeight
  const albumQuickJumpMap = useMemo(
    () => buildAlbumQuickJumpMap(visibleAlbums),
    [visibleAlbums],
  )
  const activeAlbumQuickJumpKey = visibleAlbums.length > 0
    ? getLocalTextQuickJumpBucket(visibleAlbums[Math.min(visibleAlbums.length - 1, albumStartRow * albumColumns)]!.name)
    : ''

  const clearSelection = () => {
    setSelectedAlbumNames(new Set())
  }

  const hideSelectionAfterOperation = () => {
    if (hideMultiSelectCommandBarAfterOperation) {
      setMultiSelect(false)
      clearSelection()
    }
  }

  const showProcessing = () => {
    setProcessing(true)
    window.setTimeout(() => {
      setProcessing(false)
    }, 180)
  }

  const toggleAlbumSelection = (albumName: string) => {
    setSelectedAlbumNames((current) => {
      const next = new Set(current)
      if (next.has(albumName)) {
        next.delete(albumName)
      } else {
        next.add(albumName)
      }
      return next
    })
  }

  const playSelected = () => {
    const [firstSongId] = selectedSongIds
    onPlayTrack(firstSongId, selectedSongIds)
  }

  const addSongsToFavorites = (songIds: number[]) => {
    onAddSongsToPlaylist(favoritePlaylistId, songIds)
  }

  const reverseSelection = () => {
    setSelectedAlbumNames((current) => {
      const next = new Set<string>()
      for (const album of visibleAlbums) {
        if (!current.has(album.name)) {
          next.add(album.name)
        }
      }
      return next
    })
  }

  const refreshAlbumPreferenceItems = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setAlbumPreferenceItems(new Map(settings.albums.map((item) => [item.itemId, item])))
  }

  useLayoutEffect(() => {
    const albumGrid = albumGridRef.current
    if (!albumGrid) {
      return
    }

    const measureAlbumGrid = () => {
      setAlbumViewportHeight(albumGrid.clientHeight)
      setAlbumGridWidth(albumGrid.clientWidth - ALBUM_GRID_RIGHT_PADDING)
    }

    measureAlbumGrid()
    const animationFrame = window.requestAnimationFrame(measureAlbumGrid)
    const resizeObserver = new ResizeObserver(measureAlbumGrid)

    resizeObserver.observe(albumGrid)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    const compactQuery = window.matchMedia(ALBUM_COMPACT_QUERY)
    const updateCompactLayout = () => {
      setIsCompactAlbumLayout(compactQuery.matches)
    }

    updateCompactLayout()
    compactQuery.addEventListener('change', updateCompactLayout)

    return () => {
      compactQuery.removeEventListener('change', updateCompactLayout)
    }
  }, [])

  useEffect(() => {
    setSortCriterion(albumsSort)
    setReverseDisplayOrder(false)
  }, [albumsSort])

  useEffect(() => {
    void refreshAlbumPreferenceItems()
  }, [])

  const scrollAlbumsToTop = () => {
    setAlbumScrollTop(0)
    if (albumGridRef.current) {
      albumGridRef.current.scrollTop = 0
    }
  }

  const submitSearch = () => {
    const nextQuery = searchDraft.trim()
    showProcessing()
    setSearchDraft(nextQuery)
    setSearchQuery(nextQuery)
    scrollAlbumsToTop()
  }

  const jumpToAlbumKey = (key: string) => {
    const targetIndex = albumQuickJumpMap.get(key)
    if (targetIndex == null) {
      return
    }

    albumGridRef.current?.scrollTo({
      top: Math.floor(targetIndex / albumColumns) * albumRowHeight,
    })
  }

  const changeAlbumSort = (criterion: AlbumSortCriterion) => {
    showProcessing()
    if (criterion === 'reverse') {
      setReverseDisplayOrder((current) => !current)
      scrollAlbumsToTop()
      return
    }
    setReverseDisplayOrder(false)
    setSortCriterion(criterion)
    onUpdateSettings({ albumsSort: criterion })
    scrollAlbumsToTop()
  }

  const albumSortOptions: AlbumSortCriterion[] = ['reverse', 'default', 'name', 'artist']
  const albumSortMenuItems: MenuFlyoutItem[] = albumSortOptions.map((criterion) => ({
    key: `albums-sort-${criterion}`,
    text: criterion === 'reverse' ? t('local.sortReverseList') : t(`albums.sort.${criterion}`),
    icon: criterion !== 'reverse' && criterion === sortCriterion ? 'check' : undefined,
    onClick: () => {
      changeAlbumSort(criterion)
    },
  }))

  const renderAlbumSearch = () => (
    <div className="page-search-shell albums-search-shell">
      <div className={`page-search-form${searchHasText ? ' has-query' : ''}`}>
        <button
          className="page-search-submit-button"
          type="button"
          aria-label={t('common.search')}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            submitSearch()
          }}
        >
          <Icon name="search" />
        </button>
        <input
          type="search"
          value={searchDraft}
          onFocus={() => {
            setSearchFocused(true)
          }}
          onBlur={() => {
            setSearchFocused(false)
          }}
          onChange={(event) => {
            setSearchDraft(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitSearch()
            }
          }}
          placeholder={t('albums.searchAlbumPlaceholder')}
        />
        {searchHasText ? (
          <button
            className="page-search-clear-button"
            type="button"
            aria-label={t('common.clear')}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              setSearchDraft('')
              setSearchQuery('')
              scrollAlbumsToTop()
            }}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>
      {showAlbumSearchSuggestions ? (
        <>
          <div className="dropdown-dismiss-layer" onPointerDown={() => setSearchFocused(false)} />
          <div className="page-search-suggestions">
            {albumSearchSuggestions.map((album) => (
              <button
                className="page-search-suggestion"
                type="button"
                key={album.name}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  setSearchDraft(album.name)
                  setSearchQuery(album.name)
                  setSearchFocused(false)
                  scrollAlbumsToTop()
                }}
              >
                <span>{album.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <section className="albums-page page-panel">
      <header className="albums-toolbar">
        <CommandBar
          className="albums-commandbar"
          content={renderAlbumSearch()}
        >
          <CommandBarButton
            icon="menu"
            label={t('common.multiSelect')}
            active={multiSelect}
            onClick={() => {
              setMultiSelect(true)
            }}
          />
          <CommandBarButton
            icon="sort"
            label={t(`albums.sort.${sortCriterion}`)}
            ariaHasPopup="menu"
            ariaExpanded={sortMenu != null}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setSortMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
          />
        </CommandBar>
      </header>
      {sortMenu ? (
        <MenuFlyout
          position={sortMenu}
          onClose={() => setSortMenu(null)}
          items={albumSortMenuItems}
        />
      ) : null}

      {loading || scanning || processing ? <div className="albums-progress" aria-label={t('nowPlaying.loading')} /> : null}

      {visibleAlbums.length === 0 ? (
        loading || scanning || processing ? (
          <LoadingState t={t} compact />
        ) : (
        <div className="empty-state compact">
          <h3>{searchQuery ? t('albums.noMatch') : t('collection.noAlbums')}</h3>
          <p>{searchQuery ? t('albums.noMatchCopy') : t('collection.scanFirst')}</p>
        </div>
        )
      ) : (
        <div className="albums-grid-shell">
          <nav className="albums-quick-jump" aria-label={t('common.albums')}>
            {LOCAL_TEXT_QUICK_JUMP_KEYS.map((key) => {
              const enabled = albumQuickJumpMap.has(key)

              return (
                <button
                  key={key}
                  type="button"
                  className={activeAlbumQuickJumpKey === key ? 'is-active' : ''}
                  disabled={!enabled}
                  title={getQuickJumpTooltip(key, enabled, t('common.albums'), t('common.album'), t)}
                  onClick={() => {
                    jumpToAlbumKey(key)
                  }}
                >
                  {key}
                </button>
              )
            })}
          </nav>
          <div
            className="albums-grid"
            ref={albumGridRef}
            onScroll={(event) => {
              setAlbumScrollTop(event.currentTarget.scrollTop)
            }}
          >
            <div className="albums-grid-virtual" style={{ height: albumListHeight }}>
              <div
                className="albums-grid-window"
                style={{
                  columnGap: `${ALBUM_COLUMN_GAP}px`,
                  gridTemplateColumns: `repeat(${albumColumns}, ${ALBUM_TILE_TRACK_WIDTH}px)`,
                  transform: `translateY(${albumWindowTop}px)`,
                }}
              >
                {renderedAlbums.map((album) => (
                  <AlbumTile
                    album={album}
                    key={album.name}
                    multiSelect={multiSelect}
                    selected={selectedAlbumNames.has(album.name)}
                    t={t}
                    onOpenAlbum={() => {
                      navigate(`/albums?album=${encodeURIComponent(album.name)}`)
                    }}
                    onPlayAlbum={() => {
                      onPlayTrack(album.songs[0].id, album.songs.map((song) => song.id))
                    }}
                    onAddAlbum={(position) => {
                      setAlbumContextMenu(null)
                      setAddToMenu({ ...position, songIds: album.songs.map((song) => song.id), defaultPlaylistName: album.name })
                    }}
                    onToggleSelection={() => {
                      toggleAlbumSelection(album.name)
                    }}
                    onOpenContextMenu={(position) => {
                      setAlbumContextMenu({ ...position, album })
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedAlbums.length}
        t={t}
        playlists={customPlaylists}
        onPlay={playSelected}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({ x: rect.left, y: rect.top - 8, songIds: selectedSongIds, defaultPlaylistName: t('common.albums') })
        }}
        onSelectAll={() => {
          setSelectedAlbumNames(new Set(visibleAlbums.map((album) => album.name)))
        }}
        onReverseSelection={reverseSelection}
        onClearSelection={clearSelection}
        onCancel={() => {
          setMultiSelect(false)
          clearSelection()
        }}
      />

      {albumContextMenu ? (
        <MenuFlyout
          position={albumContextMenu}
          onClose={() => {
            setAlbumContextMenu(null)
          }}
          items={getAlbumContextMenuItems({
            album: albumContextMenu.album,
            playlists: customPlaylists,
            t,
            onPlay: () => {
              const shuffledSongIds = shuffleSongIds(albumContextMenu.album.songs.map((song) => song.id))
              onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
            },
            onAddToNowPlaying: () => {
              onAddSongsToNowPlaying(albumContextMenu.album.songs.map((song) => song.id))
            },
            onAddToFavorites: () => {
              addSongsToFavorites(albumContextMenu.album.songs.filter((song) => !song.favorite).map((song) => song.id))
            },
            onSelect: () => {
              setSelectedAlbumNames(new Set([albumContextMenu.album.name]))
              setMultiSelect(true)
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, albumContextMenu.album.songs.map((song) => song.id))
            },
            onAddToPlaylist: (playlistId) => {
              onAddSongsToPlaylist(playlistId, albumContextMenu.album.songs.map((song) => song.id))
            },
            preferenceItem: albumPreferenceItems.get(albumContextMenu.album.name) ?? null,
            onPreferenceChanged: refreshAlbumPreferenceItems,
            onSeeAlbumArt: () => {
              setAlbumArtPreview(albumContextMenu.album)
            },
          })}
        />
      ) : null}

      {addToMenu ? (
        <MenuFlyout
          position={addToMenu}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={[
            getAddToPlaylistMenuFlyoutItem({
              playlists: customPlaylists,
              songIds: addToMenu.songIds,
              t,
              defaultPlaylistName: addToMenu.defaultPlaylistName,
              includeNowPlaying: true,
              includeFavorites: addToMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
              onAddToNowPlaying: () => {
                onAddSongsToNowPlaying(addToMenu.songIds)
                hideSelectionAfterOperation()
              },
              onToggleFavorite: () => {
                addSongsToFavorites(addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId)))
                hideSelectionAfterOperation()
              },
              onCreatePlaylist: (name) => {
                onCreatePlaylistWithSongs(name, addToMenu.songIds)
                hideSelectionAfterOperation()
              },
              onAddToPlaylist: (playlistId) => {
                onAddSongsToPlaylist(playlistId, addToMenu.songIds)
                hideSelectionAfterOperation()
              },
            }),
          ].filter((item) => item != null)}
        />
      ) : null}

      {albumArtPreview ? (
        <div
          className="album-art-preview-backdrop"
          role="presentation"
          onClick={() => {
            setAlbumArtPreview(null)
          }}
        >
          <section
            className="album-art-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('context.seeAlbumArt')}
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <button
              type="button"
              className="album-art-preview-close"
              aria-label={t('common.close')}
              onClick={() => {
                setAlbumArtPreview(null)
              }}
            >
              <Icon name="close" />
            </button>
            <AlbumArtControl title={albumArtPreview.name} artworkUrl={albumArtPreview.artworkUrl} songId={albumArtPreview.songs[0]!.id} />
            <strong title={albumArtPreview.name}>{albumArtPreview.name}</strong>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function AlbumTile({
  album,
  multiSelect,
  selected,
  t,
  onOpenAlbum,
  onPlayAlbum,
  onAddAlbum,
  onToggleSelection,
  onOpenContextMenu,
}: {
  album: AlbumView
  multiSelect: boolean
  selected: boolean
  t: Translator
  onOpenAlbum: () => void
  onPlayAlbum: () => void
  onAddAlbum: (position: MenuFlyoutPosition) => void
  onToggleSelection: () => void
  onOpenContextMenu: (position: MenuFlyoutPosition) => void
}) {
  const content = (
    <>
      <AlbumArtControl title={album.name} artworkUrl={album.artworkUrl} songId={album.songs[0]!.id} />
      <div className="album-tile-copy">
        <strong title={album.name}>{album.name}</strong>
        <span title={album.artist}>{album.artist}</span>
      </div>
    </>
  )

  return (
    <article
      className={[
        'album-tile',
        multiSelect ? 'is-selection-mode' : '',
        selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <button
        type="button"
        className="album-tile-surface"
        title={album.name}
        onClick={multiSelect ? onToggleSelection : onOpenAlbum}
      >
        {content}
      </button>
      <div className="album-hover-actions">
        <button type="button" onClick={onPlayAlbum} aria-label={t('detail.playAlbum')} title={t('detail.playAlbum')}>
          <Icon name="play" />
        </button>
        <button
          type="button"
          className="album-add-button"
          onClick={(event) => {
            event.stopPropagation()
            onAddAlbum({ x: event.clientX, y: event.clientY })
          }}
          aria-label={t('context.addToPlaylist')}
          title={t('context.addToPlaylist')}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {multiSelect || selected ? (
        <span className={selected ? 'album-select-mark is-selected' : 'album-select-mark'} aria-hidden="true">
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
    </article>
  )
}

function getAlbumContextMenuItems({
  album,
  playlists,
  t,
  onPlay,
  onAddToNowPlaying,
  onAddToFavorites,
  onSelect,
  onCreatePlaylist,
  onAddToPlaylist,
  preferenceItem,
  onPreferenceChanged,
  onSeeAlbumArt,
}: {
  album: AlbumView
  playlists: LibraryPlaylist[]
  t: Translator
  onPlay: () => void
  onAddToNowPlaying: () => void
  onAddToFavorites: () => void
  onSelect: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  preferenceItem: PreferenceItemSnapshot | null
  onPreferenceChanged: () => void | Promise<void>
  onSeeAlbumArt: () => void
}) {
  const songIds = album.songs.map((song) => song.id)
  const items: MenuFlyoutItem[] = [
    { key: 'shuffle', text: t('nowPlaying.randomPlay'), icon: 'shuffle', onClick: onPlay },
  ]
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds,
    t,
    defaultPlaylistName: album.name,
    includeNowPlaying: true,
    includeFavorites: onAddToFavorites != null && album.songs.some((song) => !song.favorite),
    onAddToNowPlaying,
    onToggleFavorite: onAddToFavorites,
    onCreatePlaylist,
    onAddToPlaylist,
  })
  if (addToItem) {
    items.push(addToItem)
  }
  items.push({ key: 'select', text: t('context.select'), icon: 'menu', onClick: onSelect })
  items.push(getPreferenceMenuFlyoutItem({
    type: 'album',
    itemId: album.name,
    name: album.name,
    preferenceItem,
    t,
    onUpdated: onPreferenceChanged,
  }))
  items.push({
    key: 'see-album-art',
    text: t('context.seeAlbumArt'),
    icon: 'albums',
    onClick: onSeeAlbumArt,
  })
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

function buildAlbumViews(songs: LibrarySong[], t: Translator): AlbumView[] {
  const groups = new Map<string, LibrarySong[]>()

  for (const song of songs) {
    const albumName = song.album || t('common.albumUnknown')
    const albumSongs = groups.get(albumName)
    if (albumSongs) {
      albumSongs.push(song)
    } else {
      groups.set(albumName, [song])
    }
  }

  return [...groups.entries()].map(([name, albumSongs]) => ({
    name,
    artists: getAlbumArtists(albumSongs),
    artist: getAlbumArtistLabel(albumSongs, t),
    songs: albumSongs.slice().sort((left, right) => compareLocalText(left.title, right.title)),
    artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
    duration: albumSongs.reduce((total, song) => total + song.duration, 0),
  }))
}

function getAlbumArtists(songs: LibrarySong[]) {
  const artistCounts = new Map<string, number>()

  for (const song of songs) {
    for (const artist of getSongArtists(song)) {
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1)
    }
  }

  return [...artistCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return compareLocalText(left[0], right[0])
    })
    .map(([artist]) => artist)
}

function getAlbumArtistLabel(songs: LibrarySong[], t: Translator) {
  const artists = getAlbumArtists(songs)

  if (artists.length >= 3) {
    return t('albums.artistsAndMore', { first: artists[0], second: artists[1], count: artists.length })
  }

  return artists.join(t('albums.artistSeparator'))
}

function searchAlbums(albums: AlbumView[], query: string): AlbumView[] {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return albums
  }

  return albums
    .map((album) => ({ album, score: getAlbumSearchScore(album, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.album)
}

function getAlbumSearchScore(album: AlbumView, keyword: string) {
  return evaluateString(album.name, keyword)
}

function buildAlbumQuickJumpMap(albums: AlbumView[]) {
  const indexes = new Map<string, number>()

  albums.forEach((album, index) => {
    const bucket = getLocalTextQuickJumpBucket(album.name)
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

function evaluateString(value: string, keyword: string, offset = 0) {
  if (!value) {
    return 0
  }

  if (value === keyword) {
    return 100 + offset
  }

  const normalizedValue = value.toLocaleLowerCase()
  const normalizedKeyword = keyword.toLocaleLowerCase()

  if (normalizedValue === normalizedKeyword) {
    return 95 + offset
  }

  if (value.startsWith(keyword)) {
    return 90 + offset
  }

  if (normalizedValue.startsWith(normalizedKeyword)) {
    return 85 + offset
  }

  if (value.includes(keyword)) {
    return 80 + offset
  }

  if (normalizedValue.includes(normalizedKeyword)) {
    return 75 + offset
  }

  if (normalizedKeyword.includes(normalizedValue)) {
    return 70 + offset
  }

  const editDistance = getEditDistance(value, keyword)
  const ratio = Math.floor((editDistance * 100) / Math.max(value.length, keyword.length))
  return ratio <= 60 ? 70 - ratio + offset : 0
}

function getEditDistance(target: string, given: string) {
  const rows = target.length
  const columns = given.length
  if (rows * columns === 0) {
    return rows + columns
  }

  const dp = Array.from({ length: rows + 1 }, (_, rowIndex) =>
    Array.from({ length: columns + 1 }, (_, columnIndex) => rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0),
  )

  for (let rowIndex = 1; rowIndex <= rows; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= columns; columnIndex += 1) {
      const left = dp[rowIndex - 1][columnIndex] + 1
      const down = dp[rowIndex][columnIndex - 1] + 1
      const leftDown = dp[rowIndex - 1][columnIndex - 1] + (target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1)
      dp[rowIndex][columnIndex] = Math.min(left, down, leftDown)
    }
  }

  return dp[rows][columns]
}

function sortAlbums(albums: AlbumView[], criterion: AlbumSortCriterion): AlbumView[] {
  const sorted = albums.slice()

  switch (criterion) {
    case 'artist':
      return sorted.sort((left, right) => compareLocalText(left.artist, right.artist) || compareLocalText(left.name, right.name))
    case 'name':
    case 'default':
      return sorted.sort((left, right) => compareLocalText(left.name, right.name) || compareLocalText(left.artist, right.artist))
    default:
      return sorted
  }
}
