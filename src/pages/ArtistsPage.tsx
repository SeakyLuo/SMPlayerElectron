import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import clsx from 'clsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { AppBarSearch } from '../components/AppBarPortal'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem, type MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { RenameDialog } from '../components/RenameDialog'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { getSongArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useSongArtwork } from '../hooks/useSongArtwork'

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
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onCompactTitleChange?: (title: string) => void
  routeBase?: string
}

interface ArtistGroup {
  name: string
  songs: LibrarySong[]
  albumCount: number
  artworkUrl: string
  artworkSongId: number | null
}

interface AlbumGroup {
  name: string
  songs: LibrarySong[]
  artworkUrl: string
  duration: number
}

const ARTIST_ROW_HEIGHT = 48
const ARTIST_OVERSCAN_ROWS = 10
const ARTIST_ALBUM_CARD_HEADER_HEIGHT = 112
const ARTIST_ALBUM_SONG_ROW_HEIGHT = 48
const ARTIST_ALBUM_CARD_GAP = 22
const ARTIST_ALBUM_OVERSCAN_ROWS = 2
const ARTIST_COMPACT_QUERY = '(max-width: 720px)'
const ARTIST_QUICK_JUMP_KEYS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const artistTextCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})
const ARTIST_PINYIN_BOUNDARIES = [
  ['A', '阿'],
  ['B', '芭'],
  ['C', '擦'],
  ['D', '搭'],
  ['E', '蛾'],
  ['F', '发'],
  ['G', '噶'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '期'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '压'],
  ['Z', '匝'],
] as const

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
  onRevealSong,
  onDeleteSongFromDisk,
  onCompactTitleChange,
  routeBase = '',
}: ArtistsPageProps) {
  const [artistSearch, setArtistSearch] = useState('')
  const [artistSearchFocused, setArtistSearchFocused] = useState(false)
  const [appBarSearchOpen, setAppBarSearchOpen] = useState(false)
  const [selectedArtistName, setSelectedArtistName] = useState('')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[]; defaultPlaylistName: string }) | null>(null)
  const [playlistNameDialog, setPlaylistNameDialog] = useState<{ defaultName: string; songIds: number[] } | null>(null)
  const [songContextMenu, setSongContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [groupMenu, setGroupMenu] = useState<GroupContextMenuState | null>(null)
  const artistListRef = useRef<HTMLDivElement | null>(null)
  const artistDetailRef = useRef<HTMLElement | null>(null)
  const artistAlbumListRef = useRef<HTMLDivElement | null>(null)
  const [artistScrollTop, setArtistScrollTop] = useState(0)
  const [artistViewportHeight, setArtistViewportHeight] = useState(640)
  const [artistDetailScrollTop, setArtistDetailScrollTop] = useState(0)
  const [artistDetailViewportHeight, setArtistDetailViewportHeight] = useState(640)
  const [artistAlbumListOffsetTop, setArtistAlbumListOffsetTop] = useState(0)
  const [loadingArtistName, setLoadingArtistName] = useState('')
  const [isCompactArtistLayout, setIsCompactArtistLayout] = useState(() => window.matchMedia(ARTIST_COMPACT_QUERY).matches)
  const location = useLocation()
  const navigate = useNavigate()
  const refresh = useLibraryStore((state) => state.refresh)
  const showNotification = useUndoableNotificationStore((state) => state.show)
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
  const showArtistSearchSuggestions = artistSearchFocused && visibleArtistSearchSuggestions.length > 0
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
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setSongContextMenu(null)
    setGroupMenu({
      type,
      label,
      songs: groupSongs,
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
      artistListRef.current.scrollTo({ top: artistIndex * ARTIST_ROW_HEIGHT, behavior: 'smooth' })
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

  const reloadArtist = (artistName: string) => {
    if (loadingArtistName === artistName) {
      showNotification(t('nowPlaying.loading'), t('common.close'), () => {}, 2400)
      return
    }

    setLoadingArtistName(artistName)
    void refresh().finally(() => {
      setLoadingArtistName('')
    })
  }

  const chooseArtist = (artistName: string) => {
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
        showNotification(t('collection.artistNotFound'), t('common.close'), () => {}, 3200)
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
          <div
            className="artists-list"
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
                <button
                  className={clsx('artist-list-item', {
                    'is-active': artist.name === selectedArtist?.name,
                  })}
                  type="button"
                  title={artist.name}
                  onClick={() => {
                    openArtistDetail(artist.name)
                  }}
                  onContextMenu={(event) => {
                    setSelectedArtistName(artist.name)
                    openGroupMenu(event, 'artist', artist.name, artist.songs)
                  }}
                >
                  <ArtistListArtwork artist={artist} />
                  <span className="artist-list-copy">
                    <strong>{artist.name}</strong>
                  </span>
                </button>
              </div>
            ))}
            {artistBottomSpacerHeight > 0 ? (
              <div className="artists-virtual-spacer" style={{ height: artistBottomSpacerHeight }} />
            ) : null}
          </div>
        </div>
      </aside>

      <main
        className={clsx('artists-detail', { 'is-empty': !selectedArtist })}
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
                  {t('artists.artistSummary', {
                    albums: selectedArtist.albumCount,
                    songs: selectedArtist.songs.length,
                  })}
                </p>
                <div className="artist-detail-compact-command-spacer" />
              </div>
              <div>
                <h2>{selectedArtist.name}</h2>
                <p>
                  {t('artists.artistSummary', {
                    albums: selectedArtist.albumCount,
                    songs: selectedArtist.songs.length,
                  })}
                </p>
              </div>
              <div className="artist-detail-actions">
                <button
                  className="artist-shuffle-button"
                  type="button"
                  title={t('nowPlaying.randomPlay')}
                  disabled={selectedArtistSongs.length === 0}
                  onClick={() => {
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
                    openGroupMenu(event, 'artist', selectedArtist.name, selectedArtistSongs)
                  }}
                  onContextMenu={(event) => {
                    openGroupMenu(event, 'artist', selectedArtist.name, selectedArtistSongs)
                  }}
                >
                  <Icon name="moreHorizontal" />
                </button>
              </div>
              {loadingArtistName === selectedArtist.name ? <div className="artist-detail-progress" aria-label={t('nowPlaying.loading')} /> : null}
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
                          {t('artists.albumSummary', {
                            songs: album.songs.length,
                            duration: formatDuration(album.duration),
                          })}
                        </p>
                      </div>
                      <div className="artist-album-actions">
                        <button
                          className="artist-album-shuffle"
                          type="button"
                          title={t('nowPlaying.randomPlay')}
                          onClick={() => {
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
                          showArtist={false}
                          onPlayTrack={onPlayTrack}
                          onTogglePlayPause={onTogglePlayPause}
                          onToggleFavorite={onToggleFavorite}
                          onToggleSelection={() => {
                            toggleSongSelection(song.id)
                          }}
                          onAddToPlaylistClick={(contextSong, x, y) => {
                            setGroupMenu(null)
                            setSongContextMenu({
                              song: contextSong,
                              x,
                              y,
                            })
                          }}
                          onPlayNextClick={(contextSong) => {
                            onPlayNext(contextSong.id)
                          }}
                          onContextMenu={(contextSong, x, y) => {
                            setGroupMenu(null)
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
            onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
          }}
          onSelectSongs={selectSongs}
          onLocateArtist={(artistName) => {
            scrollToArtist(artistName)
          }}
          onReloadArtist={() => {
            reloadArtist(groupMenu.label)
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
              },
              onToggleFavorite: () => {
                addSongsToFavorites(addToMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId)))
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
                onAddSongsToPlaylist(playlistId, addToMenu.songIds)
              },
            }),
          ].filter((item) => item != null)}
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
  onSelectSongs,
  onLocateArtist,
  onReloadArtist,
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
  onSelectSongs: (songIds: number[]) => void
  onLocateArtist: (artistName: string) => void
  onReloadArtist: (artistName: string) => void
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
            onSelectSongs(songIds)
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
          ? [
              {
                key: 'reload-artist',
                text: t('artists.reload'),
                icon: 'refresh',
                onClick: () => {
                  onReloadArtist(menu.label)
                },
              },
              {
                key: 'locate-artist',
                text: t('artists.locateArtist'),
                icon: 'nowPlaying',
                onClick: () => {
                  onLocateArtist(menu.label)
                },
              },
            ] satisfies MenuFlyoutItem[]
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

function getSongsAddedMessage(songs: LibrarySong[], target: string, t: Translator) {
  return songs.length === 1
    ? t('notification.songAddedTo', { title: songs[0]!.title, target })
    : t('notification.songsAddedTo', { count: songs.length, target })
}

function getSongsByIds(songs: LibrarySong[], songIds: number[]) {
  const songIdSet = new Set(songIds)
  return songs.filter((song) => songIdSet.has(song.id))
}

function searchArtists(artists: ArtistGroup[], query: string) {
  const keyword = query.trim()
  if (!keyword) {
    return artists
  }

  return artists
    .map((artist) => ({ artist, score: evaluateString(artist.name, keyword) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.artist)
}

function buildArtistQuickJumpMap(artists: ArtistGroup[]) {
  const indexes = new Map<string, number>()

  artists.forEach((artist, index) => {
    const bucket = getArtistQuickJumpBucket(artist.name)
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

function getArtistQuickJumpBucket(artistName: string) {
  const firstChar = artistName.trim().charAt(0)
  const normalizedFirstChar = firstChar
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase()

  if (/^[A-Z]$/.test(normalizedFirstChar)) {
    return normalizedFirstChar
  }

  if (!/[\u3400-\u9fff]/.test(firstChar)) {
    return '#'
  }

  for (let index = ARTIST_PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [key, boundary] = ARTIST_PINYIN_BOUNDARIES[index]!
    if (artistTextCollator.compare(firstChar, boundary) >= 0) {
      return key
    }
  }

  return '#'
}

function compareArtistText(left: string, right: string) {
  const leftBucketIndex = ARTIST_QUICK_JUMP_KEYS.indexOf(getArtistQuickJumpBucket(left))
  const rightBucketIndex = ARTIST_QUICK_JUMP_KEYS.indexOf(getArtistQuickJumpBucket(right))

  if (leftBucketIndex !== rightBucketIndex) {
    return leftBucketIndex - rightBucketIndex
  }

  return artistTextCollator.compare(left, right)
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

function buildArtistGroups(songs: LibrarySong[], t: Translator) {
  const groups = new Map<string, ArtistGroup>()

  for (const song of songs) {
    for (const artistName of getSongArtists(song)) {
      const group =
        groups.get(artistName) ?? {
          name: artistName,
          songs: [],
          albumCount: 0,
          artworkUrl: '',
          artworkSongId: null,
        }

      group.songs.push(song)
      groups.set(artistName, group)
    }
  }

  return [...groups.values()]
    .map((artist) => {
      const artworkSong = artist.songs
        .filter((song) => song.artworkUrl)
        .sort((left, right) => Date.parse(right.dateAdded) - Date.parse(left.dateAdded))[0]
      const latestSong = artist.songs
        .slice()
        .sort((left, right) => Date.parse(right.dateAdded) - Date.parse(left.dateAdded))[0]!

      return {
        ...artist,
        albumCount: new Set(artist.songs.map((song) => song.album || t('common.albumUnknown'))).size,
        artworkUrl: artworkSong?.artworkUrl ?? '',
        artworkSongId: artworkSong?.id ?? latestSong.id,
        songs: artist.songs.slice().sort((left, right) =>
          compareArtistText(left.album || '', right.album || '') || compareArtistText(left.title, right.title),
        ),
      }
    })
    .sort((left, right) => compareArtistText(left.name, right.name))
}

function buildAlbumGroups(songs: LibrarySong[], t: Translator): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>()

  for (const song of songs) {
    const albumName = song.album || t('common.albumUnknown')
    const group =
      groups.get(albumName) ?? {
        name: albumName,
        songs: [],
        artworkUrl: '',
        duration: 0,
      }

    group.songs.push(song)
    group.duration += song.duration
    if (!group.artworkUrl && song.artworkUrl) {
      group.artworkUrl = song.artworkUrl
    }
    groups.set(albumName, group)
  }

  return [...groups.values()].sort((left, right) => compareArtistText(left.name, right.name))
}

function getEstimatedArtistAlbumHeight(album: AlbumGroup, compact: boolean) {
  const headerHeight = compact ? 88 : ARTIST_ALBUM_CARD_HEADER_HEIGHT
  const songRowHeight = compact ? 42 : ARTIST_ALBUM_SONG_ROW_HEIGHT
  const cardGap = compact ? 12 : ARTIST_ALBUM_CARD_GAP
  return headerHeight + album.songs.length * songRowHeight + cardGap
}

function getArtistAlbumVirtualWindow(heights: number[], scrollTop: number, viewportHeight: number) {
  const overscanHeight = ARTIST_ALBUM_OVERSCAN_ROWS * (ARTIST_ALBUM_CARD_HEADER_HEIGHT + ARTIST_ALBUM_SONG_ROW_HEIGHT)
  const windowTop = Math.max(0, scrollTop - overscanHeight)
  const windowBottom = scrollTop + viewportHeight + overscanHeight
  let startIndex = 0
  let endIndex = heights.length
  let offset = 0
  let topSpacerHeight = 0

  for (let index = 0; index < heights.length; index += 1) {
    const nextOffset = offset + heights[index]!
    if (nextOffset > windowTop) {
      startIndex = index
      topSpacerHeight = offset
      break
    }
    offset = nextOffset
  }

  offset = topSpacerHeight
  for (let index = startIndex; index < heights.length; index += 1) {
    offset += heights[index]!
    if (offset >= windowBottom) {
      endIndex = index + 1
      break
    }
  }

  const totalHeight = heights.reduce((sum, height) => sum + height, 0)
  const renderedHeight = heights.slice(startIndex, endIndex).reduce((sum, height) => sum + height, 0)
  const bottomSpacerHeight = Math.max(0, totalHeight - topSpacerHeight - renderedHeight)

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  }
}

function getArtistRoute(routeBase: string, artistName: string) {
  const encodedArtist = encodeURIComponent(artistName)
  return routeBase ? `${routeBase}/artists/${encodedArtist}` : `/artists?artist=${encodedArtist}`
}

function getAlbumRoute(routeBase: string, albumName: string) {
  const encodedAlbum = encodeURIComponent(albumName)
  return routeBase ? `${routeBase}/albums/${encodedAlbum}` : `/albums?album=${encodedAlbum}`
}

function ArtistListArtwork({ artist }: { artist: ArtistGroup }) {
  const { artworkUrl, refreshArtwork } = useSongArtwork(artist.artworkSongId, artist.artworkUrl)
  return (
    <ArtworkImage
      className="artist-list-artwork"
      src={artworkUrl}
      title={artist.name}
      onError={refreshArtwork}
      renderFallback={() => (
        <span className="artist-list-avatar" aria-hidden="true">
          <Icon name="users" />
        </span>
      )}
    />
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
