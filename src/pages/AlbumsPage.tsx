import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { getSongArtists } from '../shared/artists'
import type { AlbumSortCriterion, AppSettingsUpdate, LibraryPlaylist, LibrarySong, PreferenceItemSnapshot } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'

const ALBUM_TILE_WIDTH = 160
const ALBUM_COLUMN_GAP = 18
const ALBUM_GRID_RIGHT_PADDING = 0
const ALBUM_ROW_HEIGHT = 250
const ALBUM_OVERSCAN_ROWS = 2

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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const albumsSort = useLibraryStore((state) => state.snapshot.settings.albumsSort)
  const [sortCriterion, setSortCriterion] = useState<AlbumSortCriterion>(albumsSort)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
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

  const albums = useMemo(() => buildAlbumViews(songs, t), [songs, t])
  const [manualAlbumOrder, setManualAlbumOrder] = useState<string[] | null>(null)
  const baseVisibleAlbums = useMemo(() => {
    if (searchQuery.trim()) {
      return searchAlbums(albums, searchQuery)
    }

    return sortAlbums(albums, sortCriterion === 'reverse' ? albumsSort : sortCriterion)
  }, [albums, albumsSort, searchQuery, sortCriterion])
  const visibleAlbums = useMemo(() => {
    if (!manualAlbumOrder) {
      return baseVisibleAlbums
    }

    const albumMap = new Map(baseVisibleAlbums.map((album) => [album.name, album]))
    return manualAlbumOrder.map((albumName) => albumMap.get(albumName)).filter((album) => album != null)
  }, [baseVisibleAlbums, manualAlbumOrder])
  const albumSearchSuggestions = searchQuery.trim()
    ? searchAlbums(albums, searchQuery).slice(0, 8)
    : []
  const showAlbumSearchSuggestions = searchFocused && albumSearchSuggestions.length > 0
  const selectedAlbums = useMemo(
    () => visibleAlbums.filter((album) => selectedAlbumNames.has(album.name)),
    [selectedAlbumNames, visibleAlbums],
  )
  const selectedSongIds = selectedAlbums.flatMap((album) => album.songs.map((song) => song.id))
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const favoritePlaylist = playlists.find((playlist) => playlist.isBuiltIn && playlist.name === t('common.myFavorites'))!
  const albumColumns = Math.max(1, Math.floor((albumGridWidth + ALBUM_COLUMN_GAP) / (ALBUM_TILE_WIDTH + ALBUM_COLUMN_GAP)))
  const albumRowCount = Math.ceil(visibleAlbums.length / albumColumns)
  const albumListHeight = albumRowCount * ALBUM_ROW_HEIGHT
  const effectiveAlbumScrollTop = Math.min(
    albumScrollTop,
    Math.max(0, albumListHeight - albumViewportHeight),
  )
  const albumStartRow = Math.max(
    0,
    Math.floor(effectiveAlbumScrollTop / ALBUM_ROW_HEIGHT) - ALBUM_OVERSCAN_ROWS,
  )
  const albumEndRow = Math.min(
    albumRowCount,
    Math.ceil((effectiveAlbumScrollTop + albumViewportHeight) / ALBUM_ROW_HEIGHT) + ALBUM_OVERSCAN_ROWS,
  )
  const renderedAlbums = visibleAlbums.slice(albumStartRow * albumColumns, albumEndRow * albumColumns)
  const albumWindowTop = albumStartRow * ALBUM_ROW_HEIGHT

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

  const refreshAlbumPreferenceItems = async () => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setAlbumPreferenceItems(new Map(settings.albums.map((item) => [item.itemId, item])))
  }

  useEffect(() => {
    const albumGrid = albumGridRef.current
    if (!albumGrid) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setAlbumViewportHeight(albumGrid.clientHeight)
      setAlbumGridWidth(albumGrid.clientWidth - ALBUM_GRID_RIGHT_PADDING)
    })

    resizeObserver.observe(albumGrid)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    setSortCriterion(albumsSort)
  }, [albumsSort])

  useEffect(() => {
    setManualAlbumOrder(null)
  }, [searchQuery])

  useEffect(() => {
    void refreshAlbumPreferenceItems()
  }, [])

  useEffect(() => {
    if (!sortMenuOpen) {
      return
    }

    const closeSortMenu = () => {
      setSortMenuOpen(false)
    }

    window.addEventListener('pointerdown', closeSortMenu)

    return () => {
      window.removeEventListener('pointerdown', closeSortMenu)
    }
  }, [sortMenuOpen])

  const scrollAlbumsToTop = () => {
    setAlbumScrollTop(0)
    if (albumGridRef.current) {
      albumGridRef.current.scrollTop = 0
    }
  }

  return (
    <section className="albums-page page-panel">
      <header className="albums-toolbar">
        <div className="page-search-shell albums-search-shell">
          <div className={`page-search-form${searchQuery ? ' has-query' : ''}`}>
            <Icon name="search" />
            <input
              type="search"
              value={searchQuery}
              onFocus={() => {
                setSearchFocused(true)
              }}
              onBlur={() => {
                setSearchFocused(false)
              }}
              onChange={(event) => {
                showProcessing()
                setSearchQuery(event.currentTarget.value)
                scrollAlbumsToTop()
              }}
              placeholder={t('albums.searchAlbumPlaceholder')}
            />
            {searchQuery ? (
              <button
                className="page-search-clear-button"
                type="button"
                aria-label={t('common.clear')}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  setSearchQuery('')
                  scrollAlbumsToTop()
                }}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
          {showAlbumSearchSuggestions ? (
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
                    setSearchFocused(false)
                    navigate(`/albums/${encodeURIComponent(album.name)}`)
                  }}
                >
                  <span>{album.name}</span>
                  <small>{album.artist || t('common.artistUnknown')}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="albums-command-row">
          <button
            type="button"
            className={multiSelect ? 'albums-command is-active' : 'albums-command'}
            onClick={() => {
              setMultiSelect(true)
            }}
          >
            <Icon name="menu" />
            {t('common.multiSelect')}
          </button>
          <AlbumSortMenu
            value={sortCriterion}
            open={sortMenuOpen}
            t={t}
            onOpenChange={setSortMenuOpen}
            onChange={(criterion) => {
              showProcessing()
              if (criterion === 'reverse') {
                setSortCriterion('reverse')
                setManualAlbumOrder(visibleAlbums.map((album) => album.name).reverse())
                scrollAlbumsToTop()
                return
              }

              setSortCriterion(criterion)
              setManualAlbumOrder(null)
              onUpdateSettings({ albumsSort: criterion })
              scrollAlbumsToTop()
            }}
          />
        </div>
      </header>

      {loading || scanning || processing ? <div className="albums-progress" aria-label={t('nowPlaying.loading')} /> : null}

      {visibleAlbums.length === 0 ? (
        <div className="empty-state compact">
          <h3>{searchQuery ? t('albums.noMatch') : t('collection.noAlbums')}</h3>
          <p>{searchQuery ? t('albums.noMatchCopy') : t('collection.scanFirst')}</p>
        </div>
      ) : (
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
                gridTemplateColumns: `repeat(${albumColumns}, ${ALBUM_TILE_WIDTH}px)`,
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
                    navigate(`/albums/${encodeURIComponent(album.name)}`)
                  }}
                  onPlayAlbum={() => {
                    onPlayTrack(album.songs[0].id, album.songs.map((song) => song.id))
                  }}
                  onAddAlbum={(position) => {
                    setAlbumContextMenu(null)
                    setAddToMenu({ ...position, songIds: album.songs.map((song) => song.id), defaultPlaylistName: album.name })
                  }}
                  canAddAlbum={customPlaylists.some((playlist) =>
                    album.songs.some((song) => !playlist.songIds.includes(song.id)),
                  )}
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
              onAddSongsToPlaylist(favoritePlaylist.id, albumContextMenu.album.songs.map((song) => song.id))
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
          items={getAddToPlaylistsMenuItems({
            playlists: customPlaylists,
            songIds: addToMenu.songIds,
            defaultPlaylistName: addToMenu.defaultPlaylistName,
            t,
            onAddToNowPlaying: () => {
              onAddSongsToNowPlaying(addToMenu.songIds)
              hideSelectionAfterOperation()
            },
            onAddToFavorites: () => {
              onAddSongsToPlaylist(favoritePlaylist.id, addToMenu.songIds)
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

function getAddToPlaylistsMenuItems({
  playlists,
  songIds,
  defaultPlaylistName,
  t,
  onAddToNowPlaying,
  onAddToFavorites,
  onCreatePlaylist,
  onAddToPlaylist,
}: {
  playlists: LibraryPlaylist[]
  songIds: number[]
  defaultPlaylistName: string
  t: Translator
  onAddToNowPlaying: () => void
  onAddToFavorites: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
}) {
  const items: MenuFlyoutItem[] = [
    {
      key: 'now-playing',
      text: t('common.nowPlaying'),
      icon: 'next',
      onClick: onAddToNowPlaying,
    },
    {
      key: 'favorites',
      text: t('common.myFavorites'),
      icon: 'heart',
      onClick: onAddToFavorites,
    },
    { key: 'built-in-separator', text: '', separator: true },
    {
      key: 'new-playlist',
      text: t('playlists.newName'),
      icon: 'plus',
      onClick: () => {
        const name = window.prompt(t('playlists.newName'), defaultPlaylistName)
        const nextName = name?.trim()
        if (nextName) {
          onCreatePlaylist(nextName)
        }
      },
    },
  ]
  const addablePlaylists = playlists.filter((playlist) => songIds.some((songId) => !playlist.songIds.includes(songId)))
  if (addablePlaylists.length > 0) {
    items.push({ key: 'separator-playlists', text: '', separator: true })
  }
  for (const playlist of addablePlaylists) {
    items.push({
      key: `playlist-${playlist.id}`,
      text: playlist.name,
      icon: 'playlists',
      onClick: () => {
        onAddToPlaylist(playlist.id)
      },
    })
  }
  return items
}

function AlbumSortMenu({
  value,
  open,
  t,
  onOpenChange,
  onChange,
}: {
  value: AlbumSortCriterion
  open: boolean
  t: Translator
  onOpenChange: (open: boolean) => void
  onChange: (criterion: AlbumSortCriterion) => void
}) {
  const options: AlbumSortCriterion[] = ['default', 'name', 'artist', 'reverse']

  return (
    <div
      className="albums-sort-menu"
      onBlur={(event) => {
        const nextFocus = event.relatedTarget
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
          onOpenChange(false)
        }
      }}
    >
      <button
        type="button"
        className="albums-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={() => {
          onOpenChange(!open)
        }}
      >
        <Icon name="sort" />
        <span>{t(`albums.sort.${value}`)}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} />
      </button>
      {open ? (
        <div
          className="albums-sort-options"
          role="listbox"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              className={option === value ? 'is-selected' : ''}
              key={option}
              onClick={() => {
                onChange(option)
                onOpenChange(false)
              }}
            >
              {t(`albums.sort.${option}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
  canAddAlbum,
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
  canAddAlbum: boolean
  onToggleSelection: () => void
  onOpenContextMenu: (position: MenuFlyoutPosition) => void
}) {
  const summary = t('albums.albumSummary', { songs: album.songs.length, duration: formatDuration(album.duration) })
  const content = (
    <>
      <AlbumArtControl title={album.name} artworkUrl={album.artworkUrl} songId={album.songs[0]!.id} />
      <div className="album-tile-copy">
        <strong title={album.name}>{album.name}</strong>
        <span title={album.artist}>{album.artist}</span>
        <small title={summary}>{summary}</small>
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
        {canAddAlbum ? (
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
        ) : null}
      </div>
      <span className="album-select-mark" aria-hidden="true">
        <Icon name="check" />
      </span>
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
    includeFavorites: true,
    onAddToNowPlaying,
    onToggleFavorite: onAddToFavorites,
    onCreatePlaylist,
    onAddToPlaylist,
  })
  if (addToItem) {
    items.push(addToItem)
  }
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
    groups.set(albumName, [...(groups.get(albumName) ?? []), song])
  }

  return [...groups.entries()].map(([name, albumSongs]) => ({
    name,
    artists: getAlbumArtists(albumSongs),
    artist: getAlbumArtistLabel(albumSongs, t),
    songs: albumSongs.slice().sort((left, right) => left.title.localeCompare(right.title)),
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

      return left[0].localeCompare(right[0])
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

function searchAlbums(albums: AlbumView[], query: string) {
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
  const artistScore = Math.max(...album.artists.map((artist) => Math.max(evaluateString(artist, keyword) - 10, 0)), 0)
  return Math.max(evaluateString(album.name, keyword), artistScore)
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

function sortAlbums(albums: AlbumView[], criterion: AlbumSortCriterion) {
  const sorted = albums.slice()

  switch (criterion) {
    case 'artist':
      return sorted.sort((left, right) => left.artist.localeCompare(right.artist) || left.name.localeCompare(right.name))
    case 'name':
    case 'default':
      return sorted.sort((left, right) => left.name.localeCompare(right.name) || left.artist.localeCompare(right.artist))
    case 'reverse':
      return sorted.reverse()
  }
}
