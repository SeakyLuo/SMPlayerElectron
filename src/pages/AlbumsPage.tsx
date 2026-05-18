import { useEffect, useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { AlbumTile } from '../components/AlbumTile'
import { AppBarPortal, AppBarSearch } from '../components/AppBarPortal'
import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getAddToPlaylistMenuFlyoutItems, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar, MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER } from '../components/MultiSelectCommandBar'
import { PageSearchHistoryPanel } from '../components/PageSearchHistoryPanel'
import { getSongArtists } from '../shared/artists'
import type { AlbumSortCriterion, AppSettingsUpdate, LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot, SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { compareLocalText, getLocalTextQuickJumpBucket, LOCAL_TEXT_QUICK_JUMP_KEYS } from '../shared/textCompare'
import { useLibraryStore } from '../state/useLibraryStore'
import { useStoredMultiSelect, useStoredStringSet } from '../state/usePageSelectionStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import { useSongsAddedUndo } from '../hooks/useSongsAddedUndo'

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
  songIds: number[]
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
  onRecordAlbumPlayed: (album: string) => void
  recentSearches: SearchHistoryEntry[]
  onRecordSearch?: (query: string) => void
  onRemoveRecentSearch: (entryId: number) => void
  onRemoveRecentSearches: (entryIds: number[]) => void
  routeBase?: string
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
  onRecordAlbumPlayed,
  recentSearches,
  onRecordSearch,
  onRemoveRecentSearch,
  onRemoveRecentSearches,
  routeBase = '',
}: AlbumsPageProps) {
  const navigate = useNavigate()
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [appBarSearchOpen, setAppBarSearchOpen] = useState(false)
  const [isCompactAlbumLayout, setIsCompactAlbumLayout] = useState(() => window.matchMedia(ALBUM_COMPACT_QUERY).matches)
  const albumsSort = useLibraryStore((state) => state.snapshot.settings.albumsSort)
  const [sortCriterion, setSortCriterion] = useState<AlbumSortCriterion>(albumsSort)
  const [reverseDisplayOrder, setReverseDisplayOrder] = useState(false)
  const [sortMenu, setSortMenu] = useState<MenuFlyoutPosition | null>(null)
  const [processing, setProcessing] = useState(false)
  const [multiSelect, setMultiSelect] = useStoredMultiSelect('albums')
  const [selectedAlbumNames, setSelectedAlbumNames] = useStoredStringSet('albums', 'selectedAlbumNames')
  const [albumContextMenu, setAlbumContextMenu] = useState<(MenuFlyoutPosition & { album: AlbumView }) | null>(null)
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[]; defaultPlaylistName: string }) | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<AlbumView | null>(null)
  const [albumPreferenceItems, setAlbumPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const albumGridScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const albumGridScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const albumGridRef = useRef<HTMLDivElement | null>(null)
  const albumGridObserverRef = useRef<ResizeObserver | null>(null)
  const [albumScrollTop, setAlbumScrollTop] = useState(0)
  const [albumViewportHeight, setAlbumViewportHeight] = useState(640)
  const [albumGridWidth, setAlbumGridWidth] = useState(960)
  const [albumQuickJumpTarget, setAlbumQuickJumpTarget] = useState<{ key: string; row: number } | null>(null)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const { addToNowPlayingWithUndo, showAddToPlaylistUndo } = useSongsAddedUndo(songs, t)

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
  const albumSearchHistoryEntries = useMemo(
    () => recentSearches.filter((entry) => entry.type === 'albums').slice(0, 10),
    [recentSearches],
  )
  const showAlbumSearchSuggestions = searchFocused && albumSearchSuggestions.length > 0
  const showAlbumSearchHistory = searchFocused && !searchDraft.trim() && albumSearchHistoryEntries.length > 0
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
  const albumContentHeight = albumRowCount * albumRowHeight
  const albumListHeight = albumContentHeight + (multiSelect ? MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER : 0)
  const effectiveAlbumScrollTop = Math.min(
    albumScrollTop,
    Math.max(0, albumListHeight - albumViewportHeight),
  )
  const albumTopRow = Math.max(0, Math.floor(effectiveAlbumScrollTop / albumRowHeight))
  const albumStartRow = Math.max(
    0,
    albumTopRow - ALBUM_OVERSCAN_ROWS,
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
  const activeAlbumQuickJumpKey = albumQuickJumpTarget?.row === albumTopRow
    ? albumQuickJumpTarget.key
    : visibleAlbums.length > 0
      ? getLocalTextQuickJumpBucket(visibleAlbums[Math.min(visibleAlbums.length - 1, albumTopRow * albumColumns)]!.name)
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

  const setAlbumGridRef = useCallback((node: HTMLDivElement | null) => {
    albumGridRef.current = node
    if (albumGridObserverRef.current) {
      albumGridObserverRef.current.disconnect()
      albumGridObserverRef.current = null
    }
    if (node) {
      const measureAlbumGrid = () => {
        setAlbumViewportHeight(node.clientHeight)
        setAlbumGridWidth(node.clientWidth - ALBUM_GRID_RIGHT_PADDING)
      }
      measureAlbumGrid()
      const resizeObserver = new ResizeObserver(() => {
        measureAlbumGrid()
      })
      resizeObserver.observe(node)
      albumGridObserverRef.current = resizeObserver
    }
  }, [])

  const onAlbumGridScrollbarPointerDown = useCustomScrollbar({
    frameRef: albumGridScrollFrameRef,
    scrollContainerRef: albumGridRef,
    scrollbarTrackRef: albumGridScrollbarTrackRef,
    refreshDependencies: [albumListHeight, isCompactAlbumLayout],
  })

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
    setAlbumQuickJumpTarget(null)
  }, [albumColumns, visibleAlbums])

  useEffect(() => {
    if (isCompactAlbumLayout && multiSelect) {
      setMultiSelect(false)
      setSelectedAlbumNames(new Set())
    }
  }, [isCompactAlbumLayout, multiSelect])

  useEffect(() => {
    void refreshAlbumPreferenceItems()
  }, [])

  const scrollAlbumsToTop = () => {
    setAlbumScrollTop(0)
    if (albumGridRef.current) {
      albumGridRef.current.scrollTop = 0
    }
  }

  const submitSearch = (placement: 'page' | 'appbar') => {
    const nextQuery = searchDraft.trim()
    showProcessing()
    setSearchDraft(nextQuery)
    setSearchQuery(nextQuery)
    if (nextQuery) {
      onRecordSearch?.(nextQuery)
    }
    if (placement === 'appbar') {
      setAppBarSearchOpen(false)
    }
    scrollAlbumsToTop()
  }

  const jumpToAlbumKey = (key: string) => {
    const targetIndex = albumQuickJumpMap.get(key)
    if (targetIndex == null) {
      return
    }

    const targetRow = Math.floor(targetIndex / albumColumns)
    setAlbumQuickJumpTarget({ key, row: targetRow })
    albumGridRef.current?.scrollTo({
      top: targetRow * albumRowHeight,
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

  const openSortMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setSortMenu({ x: rect.left, y: rect.bottom + 4, anchor: event.currentTarget })
  }

  const openSortMenuAt = (position: MenuFlyoutPosition) => {
    setSortMenu(position)
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

  const renderAlbumSearch = (placement: 'page' | 'appbar') => (
    <div className={clsx('page-search-shell albums-search-shell', placement === 'appbar' && 'appbar-page-search-shell')}>
      <div className={`page-search-form${searchHasText ? ' has-query' : ''}`}>
        <button
          className="page-search-submit-button"
          type="button"
          aria-label={t('common.search')}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            submitSearch(placement)
          }}
        >
          <Icon name="search" />
        </button>
        <input
          type="search"
          value={searchDraft}
          autoFocus={placement === 'appbar'}
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
              submitSearch(placement)
            } else if (event.key === 'Escape' && placement === 'appbar') {
              setAppBarSearchOpen(false)
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
                  onRecordSearch?.(album.name)
                  setSearchFocused(false)
                  setAppBarSearchOpen(false)
                  scrollAlbumsToTop()
                }}
              >
                <span>{album.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : showAlbumSearchHistory ? (
        <>
          <div className="dropdown-dismiss-layer" onPointerDown={() => setSearchFocused(false)} />
          <PageSearchHistoryPanel
            entries={albumSearchHistoryEntries}
            t={t}
            onSelect={(query) => {
              setSearchDraft(query)
              setSearchQuery(query)
              onRecordSearch?.(query)
              setSearchFocused(false)
              setAppBarSearchOpen(false)
              scrollAlbumsToTop()
            }}
            onRemove={onRemoveRecentSearch}
            onClear={() => {
              onRemoveRecentSearches(albumSearchHistoryEntries.map((entry) => entry.id))
            }}
          />
        </>
      ) : null}
    </div>
  )

  return (
    <section className="albums-page page-panel">
      <AppBarSearch
        t={t}
        active={searchHasText}
        open={appBarSearchOpen}
        onOpenChange={setAppBarSearchOpen}
      >
        {renderAlbumSearch('appbar')}
      </AppBarSearch>
      <AppBarPortal>
        <button
          className="appbar-icon-button albums-appbar-sort-button"
          type="button"
          aria-label={t(`albums.sort.${sortCriterion}`)}
          title={t(`albums.sort.${sortCriterion}`)}
          aria-haspopup="menu"
          aria-expanded={sortMenu != null}
          onClick={openSortMenu}
        >
          <Icon name="sort" />
        </button>
      </AppBarPortal>
      <header className="albums-toolbar">
        <CommandBar
          className="albums-commandbar"
          content={renderAlbumSearch('page')}
          overflowLabel={t('player.more')}
        >
          <CommandBarButton
            icon="multiSelect"
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
            onClick={openSortMenu}
            onOverflowClick={openSortMenuAt}
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
          <div className="albums-grid-scroll-frame custom-scrollbar-frame" ref={albumGridScrollFrameRef}>
            <div
              className="albums-grid custom-scrollbar-container"
              ref={setAlbumGridRef}
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
                        navigate(getAlbumRoute(routeBase, album.name))
                      }}
                      onPlayAlbum={() => {
                        onRecordAlbumPlayed(album.name)
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
            <CustomScrollbar
              scrollbarTrackRef={albumGridScrollbarTrackRef}
              onThumbPointerDown={onAlbumGridScrollbarPointerDown}
            />
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
          setAddToMenu({ x: rect.left, y: rect.top - 8, anchor: event.currentTarget, songIds: selectedSongIds, defaultPlaylistName: t('common.albums') })
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
              onRecordAlbumPlayed(albumContextMenu.album.name)
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
          items={getAddToPlaylistMenuFlyoutItems({
            playlists: customPlaylists,
            songIds: addToMenu.songIds,
            t,
            defaultPlaylistName: addToMenu.defaultPlaylistName,
            includeNowPlaying: true,
            includeFavorites: addToMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
            onAddToNowPlaying: () => {
              addToNowPlayingWithUndo(addToMenu.songIds)
              hideSelectionAfterOperation()
            },
            onToggleFavorite: () => {
              const nextFavoriteSongIds = addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId))
              addSongsToFavorites(nextFavoriteSongIds)
              showAddToPlaylistUndo(favoritePlaylistId, nextFavoriteSongIds, t('common.myFavorites'))
              hideSelectionAfterOperation()
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, addToMenu.songIds)
              hideSelectionAfterOperation()
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongsToPlaylist(playlistId, addToMenu.songIds)
              showAddToPlaylistUndo(playlistId, addToMenu.songIds, targetPlaylist.name)
              hideSelectionAfterOperation()
            },
          })}
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
  items.push({ key: 'select', text: t('context.select'), icon: 'multiSelect', onClick: onSelect })
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
    icon: 'pictures',
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
    artists: getAlbumArtists(albumSongs, t),
    artist: getAlbumArtistLabel(albumSongs, t),
    songs: albumSongs.slice().sort((left, right) => compareLocalText(left.title, right.title)),
    artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
    duration: albumSongs.reduce((total, song) => total + song.duration, 0),
    songIds: albumSongs.map((song) => song.id),
  }))
}

function getAlbumArtists(songs: LibrarySong[], t: Translator) {
  const artistCounts = new Map<string, number>()

  for (const song of songs) {
    for (const artist of getSongArtists(song, t('common.artistUnknown'))) {
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
  const artists = getAlbumArtists(songs, t)
  return artists[0] ?? t('common.artistUnknown')
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

function getAlbumRoute(routeBase: string, albumName: string) {
  const encodedAlbum = encodeURIComponent(albumName)
  return routeBase ? `${routeBase}/albums/${encodedAlbum}` : `/albums?album=${encodedAlbum}`
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
