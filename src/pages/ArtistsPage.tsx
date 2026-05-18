import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import clsx from 'clsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { AppBarSearch } from '../components/AppBarPortal'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getAddToPlaylistMenuFlyoutItems, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import { MultiSelectCommandBar, MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER } from '../components/MultiSelectCommandBar'
import { PageSearchHistoryPanel } from '../components/PageSearchHistoryPanel'
import { RenameDialog } from '../components/RenameDialog'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot, SearchHistoryEntry } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import { formatArtistAlbumSummary, formatArtistSummary } from '../shared/i18nCounts'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { useStoredMultiSelect, useStoredNumberSet } from '../state/usePageSelectionStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useSongArtwork } from '../hooks/useSongArtwork'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import { useSongsAddedUndo } from '../hooks/useSongsAddedUndo'
import {
  ARTIST_OVERSCAN_ROWS,
  ARTIST_QUICK_JUMP_KEYS,
  ARTIST_ROW_HEIGHT,
  buildAlbumGroups,
  buildArtistGroups,
  buildArtistQuickJumpMap,
  getAlbumRoute,
  getArtistAlbumVirtualWindow,
  getArtistQuickJumpBucket,
  getArtistRoute,
  getEstimatedArtistAlbumHeight,
  getSongsAddedMessage,
  getSongsByIds,
  searchArtists,
  shuffleSongIds,
  type ArtistGroup,
} from './artistsPageModel'

interface ArtistsPageProps {
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  loading: boolean
  scanning: boolean
  targetArtistName?: string
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRecordAlbumPlayed: (album: string) => void
  onRecordArtistPlayed: (artist: string) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  recentSearches: SearchHistoryEntry[]
  onRecordSearch?: (query: string) => void
  onRemoveRecentSearch: (entryId: number) => void
  onRemoveRecentSearches: (entryIds: number[]) => void
  onCompactTitleChange?: (title: string) => void
  routeBase?: string
}

const ARTIST_COMPACT_QUERY = '(max-width: 720px)'
export function ArtistsPage({
  t,
  songs,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  playlists,
  favoritePlaylistId,
  loading,
  scanning,
  targetArtistName,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onTogglePlayPause,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRecordAlbumPlayed,
  onRecordArtistPlayed,
  onRevealSong,
  onDeleteSongFromDisk,
  recentSearches,
  onRecordSearch,
  onRemoveRecentSearch,
  onRemoveRecentSearches,
  onCompactTitleChange,
  routeBase = '',
}: ArtistsPageProps) {
  const [artistSearch, setArtistSearch] = useState('')
  const [artistSearchFocused, setArtistSearchFocused] = useState(false)
  const [appBarSearchOpen, setAppBarSearchOpen] = useState(false)
  const [selectedArtistName, setSelectedArtistName] = useState('')
  const [multiSelect, setMultiSelect] = useStoredMultiSelect('artists')
  const [selectedSongIds, setSelectedSongIds] = useStoredNumberSet('artists', 'selectedSongIds')
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[]; defaultPlaylistName: string }) | null>(null)
  const [playlistNameDialog, setPlaylistNameDialog] = useState<{ defaultName: string; songIds: number[] } | null>(null)
  const [songContextMenu, setSongContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [groupMenu, setGroupMenu] = useState<GroupContextMenuState | null>(null)
  const artistMasterScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const artistMasterScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const artistListRef = useRef<HTMLDivElement | null>(null)
  const artistDetailScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const artistDetailScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const artistDetailRef = useRef<HTMLElement | null>(null)
  const artistAlbumListRef = useRef<HTMLDivElement | null>(null)
  const [artistScrollTop, setArtistScrollTop] = useState(0)
  const [artistViewportHeight, setArtistViewportHeight] = useState(640)
  const [artistDetailScrollTop, setArtistDetailScrollTop] = useState(0)
  const [artistDetailViewportHeight, setArtistDetailViewportHeight] = useState(640)
  const [artistAlbumListOffsetTop, setArtistAlbumListOffsetTop] = useState(0)
  const [isCompactArtistLayout, setIsCompactArtistLayout] = useState(() => window.matchMedia(ARTIST_COMPACT_QUERY).matches)
  const location = useLocation()
  const navigate = useNavigate()
  const showNotification = useUndoableNotificationStore((state) => state.showMessage)
  const { addToNowPlayingWithUndo, showAddToPlaylistUndo } = useSongsAddedUndo(songs, t)
  const artistGroups = useMemo(() => buildArtistGroups(songs, t), [songs, t])
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])
  const visibleArtists = artistGroups
  const artistSearchSuggestions = useMemo(
    () => searchArtists(artistGroups, artistSearch || searchQuery),
    [artistGroups, artistSearch, searchQuery],
  )
  const visibleArtistSearchSuggestions = artistSearch.trim()
    ? artistSearchSuggestions.slice(0, 8)
    : []
  const artistSearchHistoryEntries = useMemo(
    () => recentSearches.filter((entry) => entry.type === 'artists').slice(0, 10),
    [recentSearches],
  )
  const showArtistSearchSuggestions = artistSearchFocused && visibleArtistSearchSuggestions.length > 0
  const showArtistSearchHistory = artistSearchFocused && !artistSearch.trim() && artistSearchHistoryEntries.length > 0
  const selectedArtist =
    visibleArtists.find((artist) => artist.name === selectedArtistName) ?? null
  const selectedArtistSongs = useMemo(() => selectedArtist?.songs ?? [], [selectedArtist])
  const selectedQueueSongIds = useMemo(
    () => selectedArtistSongs.map((song) => song.id),
    [selectedArtistSongs],
  )
  const effectiveSelectedSongIds = useMemo(
    () => selectedQueueSongIds.filter((songId) => selectedSongIds.has(songId)),
    [selectedQueueSongIds, selectedSongIds],
  )
  const selectedAlbums = useMemo(() => buildAlbumGroups(selectedArtistSongs, t), [selectedArtistSongs, t])
  const artistAlbumHeights = useMemo(
    () => selectedAlbums.map((album) => getEstimatedArtistAlbumHeight(album, isCompactArtistLayout)),
    [isCompactArtistLayout, selectedAlbums],
  )
  const artistAlbumVirtualWindow = useMemo(
    () => getArtistAlbumVirtualWindow(
      artistAlbumHeights,
      Math.max(0, artistDetailScrollTop - artistAlbumListOffsetTop),
      artistDetailViewportHeight,
    ),
    [artistAlbumHeights, artistAlbumListOffsetTop, artistDetailScrollTop, artistDetailViewportHeight],
  )
  const renderedArtistAlbums = selectedAlbums.slice(
    artistAlbumVirtualWindow.startIndex,
    artistAlbumVirtualWindow.endIndex,
  )
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const artistListHeight = visibleArtists.length * ARTIST_ROW_HEIGHT
  const effectiveArtistScrollTop = Math.min(
    artistScrollTop,
    Math.max(0, artistListHeight - artistViewportHeight),
  )
  const artistStartIndex = Math.max(
    0,
    Math.floor(effectiveArtistScrollTop / ARTIST_ROW_HEIGHT) - ARTIST_OVERSCAN_ROWS,
  )
  const artistEndIndex = Math.min(
    visibleArtists.length,
    Math.ceil((effectiveArtistScrollTop + artistViewportHeight) / ARTIST_ROW_HEIGHT) + ARTIST_OVERSCAN_ROWS,
  )
  const renderedArtists = visibleArtists.slice(artistStartIndex, artistEndIndex)
  const artistTopSpacerHeight = artistStartIndex * ARTIST_ROW_HEIGHT
  const artistBottomSpacerHeight = (visibleArtists.length - artistEndIndex) * ARTIST_ROW_HEIGHT
  const artistQuickJumpMap = useMemo(
    () => buildArtistQuickJumpMap(visibleArtists),
    [visibleArtists],
  )
  const activeArtistQuickJumpKey = visibleArtists.length > 0
    ? getArtistQuickJumpBucket(visibleArtists[Math.min(visibleArtists.length - 1, Math.max(0, Math.floor(effectiveArtistScrollTop / ARTIST_ROW_HEIGHT)))]!.name)
    : ''

  const openGroupMenu = (
    event: MouseEvent<HTMLElement>,
    type: GroupContextMenuState['type'],
    label: string,
    groupSongs: LibrarySong[],
    showLocateArtist = false,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setSongContextMenu(null)
    setGroupMenu({
      type,
      label,
      songs: groupSongs,
      showLocateArtist,
      x: event.clientX,
      y: event.clientY,
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

  const selectSong = (songId: number) => {
    setMultiSelect(true)
    setSelectedSongIds(new Set([songId]))
  }

  const selectSongs = (songIds: number[]) => {
    setMultiSelect(true)
    setSelectedSongIds(new Set(songIds))
  }

  const addSongsToFavorites = (songIds: number[]) => {
    onAddSongsToPlaylist(favoritePlaylistId, songIds)
  }

  const playShuffledSongs = (groupSongs: LibrarySong[]) => {
    const shuffledSongIds = shuffleSongIds(groupSongs.map((song) => song.id))
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const clearSelection = () => {
    setSelectedSongIds(new Set())
  }

  const scrollToArtist = (artistName: string) => {
    const artistIndex = artistGroups.findIndex((artist) => artist.name === artistName)
    if (artistIndex > -1 && artistListRef.current) {
      artistListRef.current.scrollTo({ top: artistIndex * ARTIST_ROW_HEIGHT })
    }
  }

  const jumpToArtistKey = (key: string) => {
    const targetIndex = artistQuickJumpMap.get(key)
    if (targetIndex == null) {
      return
    }

    artistListRef.current?.scrollTo({
      top: targetIndex * ARTIST_ROW_HEIGHT,
    })
  }

  const chooseArtist = (artistName: string) => {
    onRecordSearch?.(artistName)
    setSelectedArtistName(artistName)
    setArtistSearch(artistName)
    setMultiSelect(false)
    clearSelection()
    if (isCompactArtistLayout) {
      const artistRoute = getArtistRoute(routeBase, artistName)
      if (`${location.pathname}${location.search}` !== artistRoute) {
        navigate(artistRoute)
      }
    }
    scrollToArtist(artistName)
  }

  const openArtistDetail = (artistName: string) => {
    setSelectedArtistName(artistName)
    setMultiSelect(false)
    clearSelection()
    if (isCompactArtistLayout) {
      const artistRoute = getArtistRoute(routeBase, artistName)
      if (`${location.pathname}${location.search}` !== artistRoute) {
        navigate(artistRoute)
      }
      artistDetailRef.current?.scrollTo({ top: 0 })
      setArtistDetailScrollTop(0)
    }
  }

  const returnToArtistList = () => {
    setSelectedArtistName('')
    setMultiSelect(false)
    clearSelection()
    const artistsRoute = `${routeBase}/artists`
    if (location.pathname !== artistsRoute || location.search) {
      navigate(artistsRoute, { replace: true })
    }
  }

  const chooseFirstArtistSuggestion = () => {
    const exactMatch = artistGroups.find((artist) => artist.name === artistSearch)
    const targetArtist = exactMatch ?? artistSearchSuggestions[0]
    if (targetArtist) {
      chooseArtist(targetArtist.name)
    } else if (artistSearch.trim()) {
      onRecordSearch?.(artistSearch.trim())
    }
  }

  const submitArtistSearch = (placement: 'page' | 'appbar') => {
    if (artistSearch.trim().length > 0) {
      chooseFirstArtistSuggestion()
    }
    if (placement === 'appbar') {
      setAppBarSearchOpen(false)
    }
  }

  const renderArtistSearch = (placement: 'page' | 'appbar') => (
    <div className={clsx('page-search-shell artists-search-shell', placement === 'appbar' && 'appbar-page-search-shell')}>
      <div className={`page-search-form${artistSearch ? ' has-query' : ''}`}>
        <button
          className="page-search-submit-button"
          type="button"
          aria-label={t('common.search')}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            submitArtistSearch(placement)
          }}
        >
          <Icon name="search" />
        </button>
        <input
          type="search"
          value={artistSearch}
          placeholder={t('artists.searchArtistsPlaceholder')}
          autoFocus={placement === 'appbar'}
          onFocus={() => {
            setArtistSearchFocused(true)
          }}
          onBlur={() => {
            setArtistSearchFocused(false)
          }}
          onChange={(event) => {
            setArtistSearch(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitArtistSearch(placement)
            } else if (event.key === 'Escape' && placement === 'appbar') {
              setAppBarSearchOpen(false)
            }
          }}
        />
        {artistSearch ? (
          <button
            className="page-search-clear-button"
            type="button"
            aria-label={t('common.clear')}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              setArtistSearch('')
            }}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>
      {showArtistSearchSuggestions ? (
        <>
          <div className="dropdown-dismiss-layer" onPointerDown={() => setArtistSearchFocused(false)} />
          <div className="page-search-suggestions">
            {visibleArtistSearchSuggestions.map((artist) => (
              <button
                className="page-search-suggestion"
                type="button"
                key={artist.name}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  setArtistSearchFocused(false)
                  setAppBarSearchOpen(false)
                  chooseArtist(artist.name)
                }}
              >
                <span>{artist.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : showArtistSearchHistory ? (
        <>
          <div className="dropdown-dismiss-layer" onPointerDown={() => setArtistSearchFocused(false)} />
          <PageSearchHistoryPanel
            entries={artistSearchHistoryEntries}
            t={t}
            onSelect={(query) => {
              setArtistSearchFocused(false)
              setAppBarSearchOpen(false)
              chooseArtist(query)
            }}
            onRemove={onRemoveRecentSearch}
            onClear={() => {
              onRemoveRecentSearches(artistSearchHistoryEntries.map((entry) => entry.id))
            }}
          />
        </>
      ) : null}
    </div>
  )

  useEffect(() => {
    const compactQuery = window.matchMedia(ARTIST_COMPACT_QUERY)
    const updateCompactLayout = () => {
      setIsCompactArtistLayout(compactQuery.matches)
    }

    updateCompactLayout()
    compactQuery.addEventListener('change', updateCompactLayout)

    return () => {
      compactQuery.removeEventListener('change', updateCompactLayout)
    }
  }, [])

  useEffect(() => {
    const artistList = artistListRef.current
    if (!artistList) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setArtistViewportHeight(artistList.clientHeight)
    })

    resizeObserver.observe(artistList)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const onArtistMasterScrollbarPointerDown = useCustomScrollbar({
    frameRef: artistMasterScrollFrameRef,
    scrollContainerRef: artistListRef,
    scrollbarTrackRef: artistMasterScrollbarTrackRef,
    refreshDependencies: [artistListHeight, isCompactArtistLayout],
  })
  const onArtistDetailScrollbarPointerDown = useCustomScrollbar({
    frameRef: artistDetailScrollFrameRef,
    scrollContainerRef: artistDetailRef,
    scrollbarTrackRef: artistDetailScrollbarTrackRef,
    refreshDependencies: [selectedArtistName, selectedAlbums.length, artistAlbumVirtualWindow.startIndex, artistAlbumVirtualWindow.endIndex],
  })

  useEffect(() => {
    const artistDetail = artistDetailRef.current
    if (!artistDetail) {
      return
    }

    const updateDetailMetrics = () => {
      setArtistDetailViewportHeight(artistDetail.clientHeight)
      setArtistAlbumListOffsetTop(artistAlbumListRef.current?.offsetTop ?? 0)
    }
    const resizeObserver = new ResizeObserver(updateDetailMetrics)

    updateDetailMetrics()
    resizeObserver.observe(artistDetail)

    return () => {
      resizeObserver.disconnect()
    }
  }, [selectedArtistName, selectedAlbums.length])

  useEffect(() => {
    artistDetailRef.current?.scrollTo({ top: 0 })
    setArtistDetailScrollTop(0)
  }, [selectedArtistName])

  useEffect(() => {
    onCompactTitleChange?.(isCompactArtistLayout && selectedArtist ? selectedArtist.name : '')

    return () => {
      onCompactTitleChange?.('')
    }
  }, [isCompactArtistLayout, onCompactTitleChange, selectedArtist])

  useEffect(() => {
    if (loading || scanning) {
      return
    }

    if (targetArtistName) {
      if (!artistGroups.some((artist) => artist.name === targetArtistName)) {
        showNotification(t('collection.artistNotFound'), 3200)
        return
      }
      chooseArtist(targetArtistName)
    }
  }, [artistGroups, loading, scanning, targetArtistName])

  useEffect(() => {
    if ((loading || scanning) && visibleArtists.length === 0) {
      return
    }

    if (targetArtistName && artistGroups.some((artist) => artist.name === targetArtistName)) {
      return
    }

    if (visibleArtists.length === 0) {
      setSelectedArtistName('')
      setMultiSelect(false)
      clearSelection()
      return
    }

    if (!visibleArtists.some((artist) => artist.name === selectedArtistName)) {
      if (isCompactArtistLayout) {
        setSelectedArtistName('')
        setMultiSelect(false)
        clearSelection()
        return
      }
      setSelectedArtistName(visibleArtists[0]!.name)
      setMultiSelect(false)
      clearSelection()
    }
  }, [artistGroups, isCompactArtistLayout, loading, scanning, selectedArtistName, targetArtistName, visibleArtists])

  return (
    <section className={clsx('page-panel artists-page', {
      'is-compact-detail-open': isCompactArtistLayout && selectedArtist,
    })}>
      {error ? <div className="error-banner">{error}</div> : null}
      <AppBarSearch
        t={t}
        active={Boolean(artistSearch)}
        open={appBarSearchOpen}
        onOpenChange={setAppBarSearchOpen}
      >
        {renderArtistSearch('appbar')}
      </AppBarSearch>

      <aside className="artists-master">
        {renderArtistSearch('page')}
        {loading || scanning ? <div className="artists-progress" aria-label={t('nowPlaying.loading')} /> : null}

        <div className="artists-list-shell">
          <nav className="artists-quick-jump" aria-label={t('artists.quickJump')}>
            {ARTIST_QUICK_JUMP_KEYS.map((key) => {
              const enabled = artistQuickJumpMap.has(key)

              return (
                <button
                  key={key}
                  type="button"
                  className={clsx({ 'is-active': activeArtistQuickJumpKey === key })}
                  disabled={!enabled}
                  title={getQuickJumpTooltip(key, enabled, t('common.artists'), t('common.artist'), t)}
                  onClick={() => {
                    jumpToArtistKey(key)
                  }}
                >
                  {key}
                </button>
              )
            })}
          </nav>
          <div className="artists-master-scroll-frame custom-scrollbar-frame" ref={artistMasterScrollFrameRef}>
            <div
              className="artists-list custom-scrollbar-container"
              ref={artistListRef}
              aria-label={t('common.artists')}
              onScroll={(event) => {
                setArtistScrollTop(event.currentTarget.scrollTop)
              }}
            >
              {artistTopSpacerHeight > 0 ? (
                <div className="artists-virtual-spacer" style={{ height: artistTopSpacerHeight }} />
              ) : null}
              {renderedArtists.map((artist) => (
                <div className="artist-virtual-row" key={artist.name}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={clsx('artist-list-item', {
                      'is-active': artist.name === selectedArtist?.name,
                    })}
                    title={artist.name}
                    onClick={() => {
                      openArtistDetail(artist.name)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openArtistDetail(artist.name)
                      }
                    }}
                    onContextMenu={(event) => {
                      openGroupMenu(event, 'artist', artist.name, artist.songs)
                    }}
                  >
                    <ArtistListArtwork
                      artist={artist}
                      playLabel={t('nowPlaying.randomPlay')}
                      onPlay={() => {
                        onRecordArtistPlayed(artist.name)
                        playShuffledSongs(artist.songs)
                      }}
                    />
                    <span className="artist-list-copy">
                      <strong>{artist.name}</strong>
                      <small>
                        {formatArtistSummary(t, artist.albumCount, artist.songs.length)}
                      </small>
                    </span>
                  </div>
                </div>
              ))}
              {artistBottomSpacerHeight > 0 ? (
                <div className="artists-virtual-spacer" style={{ height: artistBottomSpacerHeight }} />
              ) : null}
            </div>
            <CustomScrollbar
              scrollbarTrackRef={artistMasterScrollbarTrackRef}
              onThumbPointerDown={onArtistMasterScrollbarPointerDown}
            />
          </div>
        </div>
      </aside>

      <div className="artists-detail-scroll-frame custom-scrollbar-frame" ref={artistDetailScrollFrameRef}>
        <main
          className={clsx('artists-detail custom-scrollbar-container', { 'is-empty': !selectedArtist })}
          ref={artistDetailRef}
          onScroll={(event) => {
            setArtistDetailScrollTop(event.currentTarget.scrollTop)
          }}
        >
        {selectedArtist ? (
          <>
            <header className="artist-detail-header">
              <div className="artist-detail-compact-command-row">
                <button
                  className="artist-detail-back-button"
                  type="button"
                  aria-label={t('sidebar.back')}
                  title={t('sidebar.back')}
                  onClick={returnToArtistList}
                >
                  <Icon name="arrowLeft" />
                </button>
                <p className="artist-detail-compact-summary">
                  {formatArtistSummary(t, selectedArtist.albumCount, selectedArtist.songs.length)}
                </p>
                <div className="artist-detail-compact-command-spacer" />
              </div>
              <div>
                <h2>{selectedArtist.name}</h2>
                <p>
                  {formatArtistSummary(t, selectedArtist.albumCount, selectedArtist.songs.length)}
                </p>
              </div>
              <div className="artist-detail-actions">
                <button
                  className="artist-shuffle-button"
                  type="button"
                  title={t('nowPlaying.randomPlay')}
                  disabled={selectedArtistSongs.length === 0}
                  onClick={() => {
                    onRecordArtistPlayed(selectedArtist.name)
                    playShuffledSongs(selectedArtistSongs)
                  }}
                >
                  <Icon name="shuffle" />
                </button>
                <button
                  className="artist-more-button"
                  type="button"
                  title={t('player.more')}
                  disabled={selectedArtistSongs.length === 0}
                  onClick={(event) => {
                    openGroupMenu(event, 'artist', selectedArtist.name, selectedArtistSongs, true)
                  }}
                  onContextMenu={(event) => {
                    openGroupMenu(event, 'artist', selectedArtist.name, selectedArtistSongs, true)
                  }}
                >
                  <Icon name="moreHorizontal" />
                </button>
              </div>
            </header>

            <div className="artist-album-list" ref={artistAlbumListRef}>
              {artistAlbumVirtualWindow.topSpacerHeight > 0 ? (
                <div className="artist-album-virtual-spacer" style={{ height: artistAlbumVirtualWindow.topSpacerHeight }} />
              ) : null}
              {renderedArtistAlbums.map((album) => {
                return (
                  <section className="artist-album-section" key={album.name}>
                    <header className="artist-album-header">
                      <AlbumArtwork title={album.name} artworkUrl={album.artworkUrl} songId={album.songs[0]!.id} />
                      <div className="artist-album-copy">
                        <Link to={getAlbumRoute(routeBase, album.name)}>{album.name}</Link>
                        <p>
                          {formatArtistAlbumSummary(t, album.songs.length, formatDuration(album.duration))}
                        </p>
                      </div>
                      <div className="artist-album-actions">
                        <button
                          className="artist-album-shuffle"
                          type="button"
                          title={t('nowPlaying.randomPlay')}
                          onClick={() => {
                            onRecordAlbumPlayed(album.name)
                            playShuffledSongs(album.songs)
                          }}
                        >
                          <Icon name="shuffle" />
                        </button>
                        <button
                          className="artist-album-more"
                          type="button"
                          title={t('player.more')}
                          onClick={(event) => {
                            openGroupMenu(event, 'album', album.name, album.songs)
                          }}
                          onContextMenu={(event) => {
                            openGroupMenu(event, 'album', album.name, album.songs)
                          }}
                        >
                          <Icon name="moreHorizontal" />
                        </button>
                      </div>
                    </header>

                    <div className="artist-song-list playlist-control-compact">
                      {album.songs.map((song) => (
                        <PlaylistControlItem
                          key={song.id}
                          song={song}
                          t={t}
                          current={song.id === selectedTrackId}
                          playing={isPlaying}
                          queueSongIds={selectedQueueSongIds}
                          selectionMode={multiSelect}
                          selected={selectedSongIds.has(song.id)}
                          dropPosition={null}
                          draggable={false}
                          showAlbum={false}
                          onPlayTrack={onPlayTrack}
                          onTogglePlayPause={onTogglePlayPause}
                          onToggleFavorite={onToggleFavorite}
                          onToggleSelection={() => {
                            toggleSongSelection(song.id)
                          }}
                          onAddToPlaylistClick={(contextSong, x, y) => {
                            setGroupMenu(null)
                            setSongContextMenu(null)
                            setAddToMenu({
                              songIds: [contextSong.id],
                              defaultPlaylistName: contextSong.title,
                              x,
                              y,
                            })
                          }}
                          onPlayNextClick={(contextSong) => {
                            onPlayNext(contextSong.id)
                          }}
                          onContextMenu={(contextSong, x, y) => {
                            setGroupMenu(null)
                            setAddToMenu(null)
                            setSongContextMenu({
                              song: contextSong,
                              x,
                              y,
                            })
                          }}
                          onSeeArtist={(artist) => {
                            navigate(getArtistRoute(routeBase, artist))
                          }}
                          onSeeAlbum={(contextSong) => {
                            navigate(getAlbumRoute(routeBase, contextSong.album || t('common.albumUnknown')))
                          }}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
              {artistAlbumVirtualWindow.bottomSpacerHeight > 0 ? (
                <div className="artist-album-virtual-spacer" style={{ height: artistAlbumVirtualWindow.bottomSpacerHeight }} />
              ) : null}
              {multiSelect ? (
                <div className="artist-album-virtual-spacer" style={{ height: MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER }} />
              ) : null}
            </div>
          </>
        ) : (
          loading || scanning ? (
            <LoadingState t={t} />
          ) : (
            <div className="empty-state">
              <h3>{visibleArtists.length > 0 ? t('artists.selectArtist') : t('collection.noArtists')}</h3>
              {visibleArtists.length > 0 ? null : <p>{t('artists.emptyCopy')}</p>}
            </div>
          )
        )}
        </main>
        <CustomScrollbar
          scrollbarTrackRef={artistDetailScrollbarTrackRef}
          onThumbPointerDown={onArtistDetailScrollbarPointerDown}
        />
      </div>
      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={effectiveSelectedSongIds.length}
        t={t}
        playlists={customPlaylists}
        onPlay={() => {
          onPlayTrack(effectiveSelectedSongIds[0]!, effectiveSelectedSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            x: rect.left,
            y: rect.top - 8,
            songIds: effectiveSelectedSongIds,
            defaultPlaylistName: selectedArtist?.name ?? t('common.artists'),
          })
        }}
        onSelectAll={() => {
          setSelectedSongIds(new Set(selectedQueueSongIds))
        }}
        onReverseSelection={() => {
          setSelectedSongIds((current) => new Set(selectedQueueSongIds.filter((songId) => !current.has(songId))))
        }}
        onClearSelection={clearSelection}
        onCancel={() => {
          setMultiSelect(false)
          clearSelection()
        }}
      />
      {groupMenu ? (
        <ArtistGroupContextMenu
          menu={groupMenu}
          playlists={customPlaylists}
          t={t}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onAddSongsToNowPlaying={onAddSongsToNowPlaying}
          onAddSongsToFavorites={(songIds) => {
            addSongsToFavorites(songIds)
          }}
          onCreatePlaylistWithSongs={onCreatePlaylistWithSongs}
          onRequestCreatePlaylist={(defaultName, songIds) => {
            setPlaylistNameDialog({ defaultName, songIds })
          }}
          onClose={() => {
            setGroupMenu(null)
          }}
          onPlaySongs={(songIds) => {
            const shuffledSongIds = shuffleSongIds(songIds)
            if (groupMenu.type === 'artist') {
              onRecordArtistPlayed(groupMenu.label)
            } else {
              onRecordAlbumPlayed(groupMenu.label)
            }
            onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
          }}
          onEnterMultiSelect={() => {
            setMultiSelect(true)
            clearSelection()
          }}
          onSelectSongs={selectSongs}
          onLocateArtist={(artistName) => {
            scrollToArtist(artistName)
          }}
          onSeeAlbum={(albumName) => {
            navigate(getAlbumRoute(routeBase, albumName))
          }}
        />
      ) : null}
      {songContextMenu ? (
        <MusicMenuFlyout
          menu={songContextMenu}
          playlists={playlists}
          queueSongIds={selectedQueueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => {
            setSongContextMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          showSelect
          onSelectSong={selectSong}
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
            },
            onToggleFavorite: () => {
              const nextFavoriteSongIds = addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId))
              addSongsToFavorites(nextFavoriteSongIds)
              showAddToPlaylistUndo(favoritePlaylistId, nextFavoriteSongIds, t('common.myFavorites'))
            },
            onRequestCreatePlaylist: () => {
              setPlaylistNameDialog({
                defaultName: addToMenu.defaultPlaylistName,
                songIds: addToMenu.songIds,
              })
            },
            onCreatePlaylist: (name) => {
              onCreatePlaylistWithSongs(name, addToMenu.songIds)
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongsToPlaylist(playlistId, addToMenu.songIds)
              showAddToPlaylistUndo(playlistId, addToMenu.songIds, targetPlaylist.name)
            },
          })}
        />
      ) : null}
      {playlistNameDialog ? (
        <RenameDialog
          t={t}
          playlists={customPlaylists}
          defaultName={playlistNameDialog.defaultName}
          onCancel={() => {
            setPlaylistNameDialog(null)
          }}
          onConfirm={(name) => {
            onCreatePlaylistWithSongs(name, playlistNameDialog.songIds)
            setPlaylistNameDialog(null)
          }}
        />
      ) : null}
    </section>
  )
}

interface GroupContextMenuState {
  type: 'artist' | 'album'
  label: string
  songs: LibrarySong[]
  showLocateArtist: boolean
  x: number
  y: number
}

function ArtistGroupContextMenu({
  menu,
  playlists,
  t,
  onAddSongsToPlaylist,
  onAddSongsToNowPlaying,
  onAddSongsToFavorites,
  onCreatePlaylistWithSongs,
  onRequestCreatePlaylist,
  onClose,
  onPlaySongs,
  onEnterMultiSelect,
  onSelectSongs,
  onLocateArtist,
  onSeeAlbum,
}: {
  menu: GroupContextMenuState
  playlists: LibraryPlaylist[]
  t: Translator
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onAddSongsToFavorites: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onRequestCreatePlaylist: (defaultName: string, songIds: number[]) => void
  onClose: () => void
  onPlaySongs: (songIds: number[]) => void
  onEnterMultiSelect: () => void
  onSelectSongs: (songIds: number[]) => void
  onLocateArtist: (artistName: string) => void
  onSeeAlbum: (albumName: string) => void
}) {
  const songIds = useMemo(() => menu.songs.map((song) => song.id), [menu.songs])
  const favoriteSongIds = useMemo(() => menu.songs.filter((song) => !song.favorite).map((song) => song.id), [menu.songs])
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const refreshPreferenceItem = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    const items = menu.type === 'artist' ? settings.artists : settings.albums
    setPreferenceItem(items.find((item) => item.itemId === menu.label) ?? null)
  }
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds,
    t,
    defaultPlaylistName: menu.label,
    includeNowPlaying: true,
    includeFavorites: favoriteSongIds.length > 0,
    onAddToNowPlaying: () => {
      const insertedIndex = useLibraryStore.getState().snapshot.nowPlaying.songIds.length
      onAddSongsToNowPlaying(songIds)
      showUndo(getSongsAddedMessage(menu.songs, t('common.nowPlaying'), t), () =>
        replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, songIds.length)),
      )
    },
    onToggleFavorite: () => {
      const favoritePlaylistId = useLibraryStore.getState().snapshot.favorites.playlistId
      onAddSongsToFavorites(favoriteSongIds)
      showUndo(getSongsAddedMessage(getSongsByIds(menu.songs, favoriteSongIds), t('common.myFavorites'), t), () =>
        removeSongsFromPlaylist(favoritePlaylistId, favoriteSongIds),
      )
    },
    onRequestCreatePlaylist: () => {
      onRequestCreatePlaylist(menu.label, songIds)
    },
    onCreatePlaylist: (name) => {
      onCreatePlaylistWithSongs(name, songIds)
    },
    onAddToPlaylist: (playlistId) => {
      const playlist = playlists.find((item) => item.id === playlistId)!
      onAddSongsToPlaylist(playlistId, songIds)
      showUndo(getSongsAddedMessage(menu.songs, playlist.name, t), () =>
        removeSongsFromPlaylist(playlistId, songIds),
      )
    },
  })

  useEffect(() => {
    void refreshPreferenceItem()
  }, [menu.type, menu.label])

  return (
    <MenuFlyout
      position={menu}
      onClose={onClose}
      items={[
        {
          key: 'shuffle',
          text: t('nowPlaying.randomPlay'),
          icon: 'shuffle',
          onClick: () => {
            onPlaySongs(songIds)
          },
        },
        ...(addToItem ? [addToItem] : []),
        {
          key: menu.type === 'artist' ? 'multi-select' : 'select',
          text: menu.type === 'artist' ? t('common.multiSelect') : t('context.select'),
          icon: 'multiSelect',
          onClick: () => {
            if (menu.type === 'artist') {
              onEnterMultiSelect()
            } else {
              onSelectSongs(songIds)
            }
          },
        },
        getPreferenceMenuFlyoutItem({
          type: menu.type,
          itemId: menu.label,
          name: menu.label,
          preferenceItem,
          t,
          onUpdated: refreshPreferenceItem,
        }),
        ...(menu.type === 'artist'
          ? menu.showLocateArtist
            ? [{
                key: 'locate-artist',
                text: t('artists.locateArtist'),
                icon: 'nowPlaying',
                onClick: () => {
                  onLocateArtist(menu.label)
                },
              }] satisfies MenuFlyoutItem[]
            : []
          : [{
              key: 'see-album',
              text: t('context.seeAlbum'),
              icon: 'albums',
              onClick: () => {
                onSeeAlbum(menu.label)
              },
            }] satisfies MenuFlyoutItem[]),
      ]}
    />
  )
}

function ArtistListArtwork({ artist, playLabel, onPlay }: { artist: ArtistGroup; playLabel: string; onPlay: () => void }) {
  const { artworkUrl, refreshArtwork } = useSongArtwork(artist.artworkSongId, artist.artworkUrl)
  return (
    <span className="artist-list-artwork-shell">
      <ArtworkImage
        className="artist-list-artwork"
        src={artworkUrl}
        title={artist.name}
        onError={refreshArtwork}
        renderFallback={() => (
          <span className="artist-list-avatar" aria-hidden="true">
            <DefaultAlbumArtwork className="artist-list-avatar-image" />
          </span>
        )}
      />
      <span
        role="button"
        tabIndex={0}
        className="artist-list-hover-play"
        aria-label={playLabel}
        title={playLabel}
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            onPlay()
          }
        }}
      >
        <Icon name="play" />
      </span>
    </span>
  )
}

function AlbumArtwork({ title, artworkUrl, songId }: { title: string; artworkUrl: string; songId: number }) {
  const resolvedArtwork = useSongArtwork(songId, artworkUrl)
  return (
    <ArtworkImage
      className="artist-album-artwork"
      src={resolvedArtwork.artworkUrl}
      title={title}
      onError={resolvedArtwork.refreshArtwork}
      renderFallback={() => (
        <div className="artist-album-artwork artist-album-artwork-fallback" aria-hidden="true">
          <DefaultAlbumArtwork className="artist-album-artwork-fallback-image" />
        </div>
      )}
    />
  )
}
