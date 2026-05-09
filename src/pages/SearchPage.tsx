import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { getSongArtists } from '../shared/artists'
import type { AppSettingsUpdate, LibraryFolder, LibraryPlaylist, LibrarySong, PreferenceEntityType, PreferenceItemSnapshot, PreferenceSettingsSnapshot, SearchSortCriterion } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { buildLocalRoute } from './localPagePaths'

interface SearchPageProps {
  t: Translator
  query: string
  requestedQuery: string
  loading: boolean
  songs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  rootPath: string
  searchFolderPath: string
  searchFolderName: string
  selectedTrackId: number | null
  isPlaying: boolean
  showCount: boolean
  sortCriteria: SearchCriteria
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void
  onDeleteSongFromDisk: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onUpdateSettings: (update: AppSettingsUpdate) => void
  onSearchDirectory: (query: string, folderRelativePath: string) => void
}

export interface SearchResult {
  title: string
  subtitle: string
  artworkUrl: string
  path: string
  score: number
  songCount: number
  playCount: number
  duration: number
  albumCount: number
  songIds: number[]
  sourceId?: string
  sourcePath?: string
}

interface SearchResultContextMenuState {
  sectionKey: SearchResultType
  card: SearchResult
  x: number
  y: number
}

export type SearchResultType = 'artists' | 'albums' | 'songs' | 'playlists' | 'folders'
type SearchFilterKey = 'all' | SearchResultType
export type SearchCriteria = Record<SearchResultType, SearchSortCriterion>

const ARTIST_PREVIEW_LIMIT = 10
const PREVIEW_LIMIT = 5
const SONG_PREVIEW_LIMIT = 5
export function SearchPage({
  t,
  query,
  requestedQuery,
  loading,
  songs,
  folders,
  playlists,
  favoritePlaylistId,
  rootPath,
  searchFolderPath,
  searchFolderName,
  selectedTrackId,
  isPlaying,
  showCount,
  sortCriteria,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onDeleteSongFromDisk,
  onToggleFavorite,
  onUpdateSettings,
  onSearchDirectory,
}: SearchPageProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<SearchFilterKey>('all')
  const [songContextMenu, setSongContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [cardContextMenu, setCardContextMenu] = useState<SearchResultContextMenuState | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<SearchResult | null>(null)
  const [preferenceItems, setPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const normalizedRequestedQuery = requestedQuery.trim().toLocaleLowerCase()
  const searchableSongs = useMemo(
    () => searchFolderPath ? songs.filter((song) => isSongUnderFolder(song.path, searchFolderPath)) : songs,
    [searchFolderPath, songs],
  )
  const results = useMemo(
    () => buildSearchResults(searchableSongs, songs, folders, playlists, rootPath, normalizedQuery, t),
    [folders, normalizedQuery, playlists, rootPath, searchableSongs, songs, t],
  )
  const sortedResults = useMemo(
    () => ({
      artists: sortSearchResults(results.artists, sortCriteria.artists),
      albums: sortSearchResults(results.albums, sortCriteria.albums),
      songs: sortSearchSongs(results.songs, sortCriteria.songs),
      playlists: sortSearchResults(results.playlists, sortCriteria.playlists),
      folders: sortSearchResults(results.folders, sortCriteria.folders),
    }),
    [results, sortCriteria],
  )
  const hasResults =
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.songs.length > 0 ||
    results.playlists.length > 0 ||
    results.folders.length > 0
  const queueSongIds = sortedResults.songs.map((song) => song.id)
  const resultCounts: Record<SearchFilterKey, number> = {
    all:
      results.artists.length +
      results.albums.length +
      results.songs.length +
      results.playlists.length +
      results.folders.length,
    artists: results.artists.length,
    albums: results.albums.length,
    songs: results.songs.length,
    playlists: results.playlists.length,
    folders: results.folders.length,
  }
  const showArtists = (activeFilter === 'all' || activeFilter === 'artists') && results.artists.length > 0
  const showAlbums = (activeFilter === 'all' || activeFilter === 'albums') && results.albums.length > 0
  const showSongs = (activeFilter === 'all' || activeFilter === 'songs') && results.songs.length > 0
  const showPlaylists = (activeFilter === 'all' || activeFilter === 'playlists') && results.playlists.length > 0
  const showFolders = (activeFilter === 'all' || activeFilter === 'folders') && results.folders.length > 0
  const usesPreview = activeFilter === 'all'

  const isExpanded = (section: string) => expandedSections.has(section)
  const toggleExpanded = (section: string) => {
    setExpandedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }
  const updateSortCriterion = (section: SearchResultType, criterion: SearchSortCriterion) => {
    onUpdateSettings({ [getSearchCriterionSetting(section)]: criterion })
  }
  const openCardContextMenu = (sectionKey: SearchResultType, card: SearchResult, x: number, y: number) => {
    setSongContextMenu(null)
    setCardContextMenu({ sectionKey, card, x, y })
  }
  const refreshPreferenceItems = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setPreferenceItems(new Map([
      ...settings.artists,
      ...settings.albums,
      ...settings.playlists,
      ...settings.folders,
    ].map((item) => [`${item.type}:${item.itemId}`, item])))
  }

  useEffect(() => {
    void refreshPreferenceItems()
  }, [])

  return (
    <section className="page-panel search-page">
      {loading && normalizedRequestedQuery ? (
        <div className="search-loading-state" role="status" aria-live="polite">
          <span className="search-loading-spinner" aria-hidden="true" />
          <strong>{t('nowPlaying.loading')}</strong>
        </div>
      ) : !normalizedQuery ? (
        <div className="empty-state">
          <h3>{t('search.enterKeyword')}</h3>
        </div>
      ) : !hasResults ? (
        <div className="empty-state">
          <h3>{t('search.noResult')}</h3>
        </div>
      ) : (
        <div className="search-result-stack">
          {searchFolderName ? (
            <div className="search-directory-context">
              {t('search.directoryResultOf', { query: requestedQuery, folder: searchFolderName })}
            </div>
          ) : null}
          <SearchResultTabs
            activeFilter={activeFilter}
            counts={resultCounts}
            t={t}
            onChange={setActiveFilter}
          />
          {showArtists ? (
            <SearchResultSection
              cards={sortedResults.artists}
              sectionKey="artists"
              title={showCount ? t('search.artistsWithCount', { count: results.artists.length }) : t('common.artists')}
              viewAllLabel={t('search.viewAll')}
              viewLessLabel={t('search.viewLess')}
              sortOptions={getSortOptions('artists', t)}
              sortCriterion={sortCriteria.artists}
              previewLimit={ARTIST_PREVIEW_LIMIT}
              usesPreview={usesPreview}
              expanded={!usesPreview || isExpanded('artists')}
              onToggleExpanded={toggleExpanded}
              onSortChange={updateSortCriterion}
              onOpenContextMenu={openCardContextMenu}
            />
          ) : null}
          {showAlbums ? (
            <SearchResultSection
              cards={sortedResults.albums}
              sectionKey="albums"
              title={showCount ? t('search.albumsWithCount', { count: results.albums.length }) : t('common.albums')}
              viewAllLabel={t('search.viewAll')}
              viewLessLabel={t('search.viewLess')}
              sortOptions={getSortOptions('albums', t)}
              sortCriterion={sortCriteria.albums}
              usesPreview={usesPreview}
              expanded={!usesPreview || isExpanded('albums')}
              onToggleExpanded={toggleExpanded}
              onSortChange={updateSortCriterion}
              onOpenContextMenu={openCardContextMenu}
            />
          ) : null}
          {showSongs ? (
            <section className="search-result-section">
              <SearchSectionHeader
                sectionKey="songs"
                title={showCount ? t('search.songsWithCount', { count: results.songs.length }) : t('common.songs')}
                viewAllLabel={t('search.viewAll')}
                viewLessLabel={t('search.viewLess')}
                sortOptions={getSortOptions('songs', t)}
                sortCriterion={sortCriteria.songs}
                showViewAll={usesPreview && results.songs.length > SONG_PREVIEW_LIMIT}
                expanded={!usesPreview || isExpanded('songs')}
                onToggleExpanded={toggleExpanded}
                onSortChange={updateSortCriterion}
              />
              <div className="search-song-list">
                {(!usesPreview || isExpanded('songs') ? sortedResults.songs : sortedResults.songs.slice(0, SONG_PREVIEW_LIMIT)).map((song) => (
                  <PlaylistControlItem
                    key={song.id}
                    song={song}
                    t={t}
                    current={song.id === selectedTrackId}
                    isPlaying={isPlaying}
                    queueSongIds={queueSongIds}
                    showAlbum
                    showArtist
                    onPlayTrack={onPlayTrack}
                    onTogglePlayPause={onTogglePlayPause}
                    onAddToPlaylistClick={(contextSong, x, y) => {
                      setSongContextMenu({ song: contextSong, x, y })
                    }}
                    onContextMenu={(contextSong, x, y) => {
                      setSongContextMenu({ song: contextSong, x, y })
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {showPlaylists ? (
            <SearchResultSection
              cards={sortedResults.playlists}
              sectionKey="playlists"
              title={showCount ? t('search.playlistsWithCount', { count: results.playlists.length }) : t('common.playlists')}
              viewAllLabel={t('search.viewAll')}
              viewLessLabel={t('search.viewLess')}
              sortOptions={getSortOptions('playlists', t)}
              sortCriterion={sortCriteria.playlists}
              usesPreview={usesPreview}
              expanded={!usesPreview || isExpanded('playlists')}
              onToggleExpanded={toggleExpanded}
              onSortChange={updateSortCriterion}
              onOpenContextMenu={openCardContextMenu}
            />
          ) : null}
          {showFolders ? (
            <SearchResultSection
              cards={sortedResults.folders}
              sectionKey="folders"
              title={showCount ? t('search.foldersWithCount', { count: results.folders.length }) : t('common.folders')}
              viewAllLabel={t('search.viewAll')}
              viewLessLabel={t('search.viewLess')}
              sortOptions={getSortOptions('folders', t)}
              sortCriterion={sortCriteria.folders}
              usesPreview={usesPreview}
              expanded={!usesPreview || isExpanded('folders')}
              onToggleExpanded={toggleExpanded}
              onSortChange={updateSortCriterion}
              onOpenContextMenu={openCardContextMenu}
            />
          ) : null}
          {songContextMenu ? (
            <MusicMenuFlyout
              menu={songContextMenu}
              playlists={playlists}
              queueSongIds={queueSongIds}
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
              showSelect={false}
            />
          ) : null}
          {cardContextMenu ? (
            <MenuFlyout
              position={cardContextMenu}
              onClose={() => {
                setCardContextMenu(null)
              }}
              items={getSearchResultMenuItems({
                menu: cardContextMenu,
                playlists,
                favoritePlaylistId,
                t,
                onPlayTrack,
                onAddSongsToNowPlaying,
                onCreatePlaylistWithSongs,
                onAddSongsToPlaylist,
                onSearchDirectory,
                rootPath,
                preferenceItem: getSearchResultExistingPreferenceItem(cardContextMenu, preferenceItems),
                onPreferenceChanged: refreshPreferenceItems,
                onSeeAlbumArt: setAlbumArtPreview,
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
                <AlbumArtControl title={albumArtPreview.title} artworkUrl={albumArtPreview.artworkUrl} songId={albumArtPreview.songIds[0]!} />
                <strong title={albumArtPreview.title}>{albumArtPreview.title}</strong>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function SearchResultTabs({
  activeFilter,
  counts,
  t,
  onChange,
}: {
  activeFilter: SearchFilterKey
  counts: Record<SearchFilterKey, number>
  t: Translator
  onChange: (filter: SearchFilterKey) => void
}) {
  const tabs: Array<{ key: SearchFilterKey; label: string }> = [
    { key: 'all', label: t('common.all') },
    { key: 'artists', label: t('common.artists') },
    { key: 'albums', label: t('common.albums') },
    { key: 'songs', label: t('common.songs') },
    { key: 'playlists', label: t('common.playlists') },
    { key: 'folders', label: t('common.folders') },
  ]

  return (
    <div className="search-result-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === tab.key}
          disabled={tab.key !== 'all' && counts[tab.key] === 0}
          className={activeFilter === tab.key ? 'is-active' : ''}
          key={tab.key}
          onClick={() => {
            onChange(tab.key)
          }}
        >
          <span>{tab.label}</span>
          <strong>{counts[tab.key]}</strong>
        </button>
      ))}
    </div>
  )
}

function SearchResultSection({
  cards,
  sectionKey,
  title,
  viewAllLabel,
  viewLessLabel,
  sortOptions,
  sortCriterion,
  previewLimit = PREVIEW_LIMIT,
  usesPreview = true,
  expanded,
  onToggleExpanded,
  onSortChange,
  onOpenContextMenu,
}: {
  cards: SearchResult[]
  sectionKey: SearchResultType
  title: string
  viewAllLabel: string
  viewLessLabel: string
  sortOptions: Array<{ value: SearchSortCriterion; label: string }>
  sortCriterion: SearchSortCriterion
  previewLimit?: number
  usesPreview?: boolean
  expanded: boolean
  onToggleExpanded: (section: SearchResultType) => void
  onSortChange: (section: SearchResultType, criterion: SearchSortCriterion) => void
  onOpenContextMenu: (sectionKey: SearchResultType, card: SearchResult, x: number, y: number) => void
}) {
  if (cards.length === 0) {
    return null
  }

  return (
    <section className="search-result-section">
      <SearchSectionHeader
        sectionKey={sectionKey}
        title={title}
        viewAllLabel={viewAllLabel}
        viewLessLabel={viewLessLabel}
        sortOptions={sortOptions}
        sortCriterion={sortCriterion}
        showViewAll={usesPreview && cards.length > previewLimit}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        onSortChange={onSortChange}
      />
      <div className="search-card-row">
        {(expanded ? cards : cards.slice(0, previewLimit)).map((card) => (
          <Link
            className="search-result-card"
            key={`${card.path}-${card.title}`}
            to={card.path}
            onContextMenu={(event) => {
              event.preventDefault()
              onOpenContextMenu(sectionKey, card, event.clientX, event.clientY)
            }}
          >
            <SearchArtwork title={card.title} artworkUrl={card.artworkUrl} />
            <strong>{card.title}</strong>
            <span>{card.subtitle}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function SearchSectionHeader({
  sectionKey,
  title,
  viewAllLabel,
  viewLessLabel,
  sortOptions,
  sortCriterion,
  showViewAll,
  expanded,
  onToggleExpanded,
  onSortChange,
}: {
  sectionKey: SearchResultType
  title: string
  viewAllLabel: string
  viewLessLabel: string
  sortOptions: Array<{ value: SearchSortCriterion; label: string }>
  sortCriterion: SearchSortCriterion
  showViewAll: boolean
  expanded: boolean
  onToggleExpanded: (section: SearchResultType) => void
  onSortChange: (section: SearchResultType, criterion: SearchSortCriterion) => void
}) {
  const [isSortOpen, setIsSortOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const activeSortLabel = sortOptions.find((option) => option.value === sortCriterion)?.label ?? sortOptions[0].label

  useEffect(() => {
    if (!isSortOpen) {
      return
    }

    const closeSortMenu = () => {
      setIsSortOpen(false)
    }

    window.addEventListener('pointerdown', closeSortMenu)
    return () => {
      window.removeEventListener('pointerdown', closeSortMenu)
    }
  }, [isSortOpen])

  return (
    <header className="search-section-header">
      <h2>{title}</h2>
      <div className="search-section-actions">
        {showViewAll ? (
          <button
            type="button"
            onClick={() => {
              onToggleExpanded(sectionKey)
            }}
          >
            <Icon name="albums" />
            <span>{expanded ? viewLessLabel : viewAllLabel}</span>
          </button>
        ) : null}
        <div
          className="search-sort-control"
          ref={sortMenuRef}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
        >
          <button
            type="button"
            className="search-sort-trigger"
            aria-expanded={isSortOpen}
            onClick={() => {
              setIsSortOpen((current) => !current)
            }}
          >
            <Icon name="sort" />
            <span>{activeSortLabel}</span>
          </button>
          {isSortOpen ? (
            <div className="search-sort-menu" role="menu">
              {sortOptions.map((option) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === sortCriterion}
                  className={option.value === sortCriterion ? 'is-active' : ''}
                  key={option.value}
                  onClick={() => {
                    onSortChange(sectionKey, option.value)
                    setIsSortOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function SearchArtwork({ title, artworkUrl }: { title: string; artworkUrl: string }) {
  return (
    <ArtworkImage
      className="search-card-artwork"
      src={artworkUrl}
      title={title}
      renderFallback={() => (
        <span className="search-card-artwork search-card-artwork-fallback" aria-hidden="true">
          <DefaultAlbumArtwork className="search-card-artwork-fallback-image" />
        </span>
      )}
    />
  )
}

function getSearchResultMenuItems({
  menu,
  playlists,
  favoritePlaylistId,
  t,
  onPlayTrack,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onAddSongsToPlaylist,
  onSearchDirectory,
  rootPath,
  preferenceItem,
  onPreferenceChanged,
  onSeeAlbumArt,
}: {
  menu: SearchResultContextMenuState
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onSearchDirectory: (query: string, folderRelativePath: string) => void
  rootPath: string
  preferenceItem: PreferenceItemSnapshot | null
  onPreferenceChanged: (snapshot?: PreferenceSettingsSnapshot | null) => void | Promise<void>
  onSeeAlbumArt: (card: SearchResult) => void
}) {
  const { card, sectionKey } = menu
  const items: MenuFlyoutItem[] = [
    {
      key: 'shuffle',
      text: t('nowPlaying.randomPlay'),
      icon: 'shuffle',
      disabled: card.songIds.length === 0,
      onClick: () => {
        const shuffledSongIds = shuffleSongIds(card.songIds)
        onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
      },
    },
  ]
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: card.songIds,
    t,
    defaultPlaylistName: card.title,
    includeNowPlaying: true,
    includeFavorites: true,
    onAddToNowPlaying: () => {
      onAddSongsToNowPlaying(card.songIds)
    },
    onToggleFavorite: () => {
      onAddSongsToPlaylist(favoritePlaylistId, card.songIds)
    },
    onCreatePlaylist: (name) => {
      onCreatePlaylistWithSongs(name, card.songIds)
    },
    onAddToPlaylist: (playlistId) => {
      onAddSongsToPlaylist(playlistId, card.songIds)
    },
  })

  if (addToItem) {
    items.push(addToItem)
  }

  const preferenceMenuItem = getSearchResultPreferenceItem(sectionKey, card, t, preferenceItem, onPreferenceChanged)
  if (preferenceMenuItem) {
    items.push(preferenceMenuItem)
  }

  if (sectionKey === 'albums') {
    items.push({
      key: 'see-album-art',
      text: t('context.seeAlbumArt'),
      icon: 'albums',
      onClick: () => {
        onSeeAlbumArt(card)
      },
    })
  }

  if (sectionKey === 'folders') {
    items.push(
      {
        key: 'show-in-explorer',
        text: t('context.reveal'),
        pendingText: t('context.openingLocal'),
        icon: 'folder',
        onClick: () => window.smplayer?.revealItemInFolder(card.sourcePath!),
      },
      {
        key: 'search-directory',
        text: t('local.searchDirectory'),
        icon: 'search',
        onClick: () => {
          const query = window.prompt(t('local.searchDirectoryPrompt', { name: card.title }))
          if (query?.trim()) {
            onSearchDirectory(query, getRelativeFolderPath(card.sourcePath!, rootPath))
          }
        },
      },
    )
  }

  return items
}

function getSearchResultPreferenceItem(
  sectionKey: SearchResultType,
  card: SearchResult,
  t: Translator,
  preferenceItem: PreferenceItemSnapshot | null,
  onPreferenceChanged: (snapshot?: PreferenceSettingsSnapshot | null) => void | Promise<void>,
): MenuFlyoutItem | null {
  const preferenceTypeBySection = {
    artists: 'artist',
    albums: 'album',
    playlists: 'playlist',
    folders: 'folder',
  } as const
  const preferenceType = preferenceTypeBySection[sectionKey as keyof typeof preferenceTypeBySection]

  if (!preferenceType) {
    return null
  }

  return getPreferenceMenuFlyoutItem({
    type: preferenceType,
    itemId: getSearchResultPreferenceId(preferenceType, card),
    name: card.title,
    preferenceItem,
    t,
    onUpdated: onPreferenceChanged,
  })
}

function getSearchResultExistingPreferenceItem(
  menu: SearchResultContextMenuState,
  preferenceItems: Map<string, PreferenceItemSnapshot>,
) {
  const type = getSearchResultPreferenceType(menu.sectionKey)
  if (!type) {
    return null
  }

  return preferenceItems.get(`${type}:${getSearchResultPreferenceId(type, menu.card)}`) ?? null
}

function getSearchResultPreferenceType(sectionKey: SearchResultType): PreferenceEntityType | null {
  const preferenceTypeBySection = {
    artists: 'artist',
    albums: 'album',
    playlists: 'playlist',
    folders: 'folder',
  } as const

  return preferenceTypeBySection[sectionKey as keyof typeof preferenceTypeBySection] ?? null
}

function getSearchResultPreferenceId(type: PreferenceEntityType, card: SearchResult) {
  return type === 'folder' || type === 'playlist' ? card.sourceId! : card.title
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

function getSortOptions(
  section: SearchResultType,
  t: Translator,
): Array<{ value: SearchSortCriterion; label: string }> {
  const baseOptions: Array<{ value: SearchSortCriterion; label: string }> = [
    { value: 'default', label: t('search.sortDefault') },
  ]

  switch (section) {
    case 'artists':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'album', label: t('common.albums') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'albums':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'songs':
      return [
        ...baseOptions,
        { value: 'title', label: t('search.sortTitle') },
        { value: 'artist', label: t('common.artist') },
        { value: 'album', label: t('common.album') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
        { value: 'date-added', label: t('common.dateAdded') },
      ]
    case 'playlists':
      return [
        ...baseOptions,
        { value: 'name', label: t('search.sortName') },
        { value: 'play-count', label: t('common.playCount') },
        { value: 'duration', label: t('common.duration') },
      ]
    case 'folders':
      return [...baseOptions, { value: 'name', label: t('search.sortName') }]
  }
}

function getSearchCriterionSetting(section: SearchResultType): keyof AppSettingsUpdate {
  switch (section) {
    case 'artists':
      return 'searchArtistsCriterion'
    case 'albums':
      return 'searchAlbumsCriterion'
    case 'songs':
      return 'searchSongsCriterion'
    case 'playlists':
      return 'searchPlaylistsCriterion'
    case 'folders':
      return 'searchFoldersCriterion'
  }
}

function sortSearchResults(cards: SearchResult[], criterion: SearchSortCriterion) {
  const sorted = cards.slice()

  switch (criterion) {
    case 'name':
    case 'title':
      return sorted.sort((left, right) => left.title.localeCompare(right.title))
    case 'album':
      return sorted.sort((left, right) => right.albumCount - left.albumCount || left.title.localeCompare(right.title))
    case 'play-count':
      return sorted.sort((left, right) => right.playCount - left.playCount || left.title.localeCompare(right.title))
    case 'duration':
      return sorted.sort((left, right) => right.duration - left.duration || left.title.localeCompare(right.title))
    default:
      return sorted
  }
}

function sortSearchSongs(songs: LibrarySong[], criterion: SearchSortCriterion) {
  const sorted = songs.slice()

  switch (criterion) {
    case 'title':
    case 'name':
      return sorted.sort((left, right) => left.title.localeCompare(right.title) || right.playCount - left.playCount)
    case 'artist':
      return sorted.sort((left, right) => getPrimaryArtist(left).localeCompare(getPrimaryArtist(right)) || right.playCount - left.playCount)
    case 'album':
      return sorted.sort((left, right) => left.album.localeCompare(right.album) || right.playCount - left.playCount)
    case 'play-count':
      return sorted.sort((left, right) => right.playCount - left.playCount || left.title.localeCompare(right.title))
    case 'duration':
      return sorted.sort((left, right) => left.duration - right.duration || right.playCount - left.playCount)
    case 'date-added':
      return sorted.sort((left, right) => Date.parse(left.dateAdded) - Date.parse(right.dateAdded) || right.playCount - left.playCount)
    default:
      return sorted
  }
}

function getPrimaryArtist(song: LibrarySong) {
  return getSongArtists(song)[0]
}

function buildSearchResults(
  scopedSongs: LibrarySong[],
  allSongs: LibrarySong[],
  folders: LibraryFolder[],
  playlists: LibraryPlaylist[],
  rootPath: string,
  normalizedQuery: string,
  t: Translator,
) {
  const matchedSongs = normalizedQuery
    ? scopedSongs
        .map((song) => ({ entity: song, score: matchSong(song, normalizedQuery) }))
        .filter((result) => result.score > 0)
        .sort(sortByScoreThenTitle)
        .map((result) => result.entity)
    : []
  const artists = buildArtistResults(scopedSongs, matchedSongs, normalizedQuery, t)
  const albums = buildAlbumResults(scopedSongs, matchedSongs, normalizedQuery, t)
  const folderResults = buildFolderResults(allSongs, folders, matchedSongs, rootPath, normalizedQuery, t)
  const scopedSongsById = new Map(scopedSongs.map((song) => [song.id, song]))
  const playlistResults = playlists
    .map((playlist) => ({
      entity: playlist,
      score: Math.max(
        evaluateString(playlist.name, normalizedQuery),
        playlist.songIds.some((songId) => matchedSongs.some((song) => song.id === songId)) ? 1 : 0,
      ),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entity.name.localeCompare(right.entity.name))
    .map(({ entity, score }) => {
      const playlistSongs = entity.songIds.map((songId) => scopedSongsById.get(songId)).filter((song) => song !== undefined)
      return {
        score,
        title: entity.name,
        subtitle: t('cards.songCount', { count: entity.songCount }),
        artworkUrl: playlistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        path: `/playlists/${entity.id}`,
        songCount: entity.songCount,
        playCount: playlistSongs.reduce((sum, song) => sum + song.playCount, 0),
        duration: playlistSongs.reduce((sum, song) => sum + song.duration, 0),
        albumCount: 0,
        songIds: playlistSongs.map((song) => song.id),
        sourceId: String(entity.id),
      }
    })

  return {
    artists,
    albums,
    songs: matchedSongs,
    playlists: playlistResults,
    folders: folderResults,
  }
}

function buildArtistResults(
  allSongs: LibrarySong[],
  _matchedSongs: LibrarySong[],
  normalizedQuery: string,
  t: Translator,
) {
  const groups = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    for (const artist of getSongArtists(song)) {
      if (artist.toLocaleLowerCase().includes(normalizedQuery)) {
        groups.set(artist, [...(groups.get(artist) ?? []), song])
      }
    }
  }

  return [...groups.entries()]
    .map(([artist, artistSongs]) => ({
      artist,
      artistSongs,
      score: evaluateString(artist, normalizedQuery),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.artist.localeCompare(right.artist))
    .map(({ artist, artistSongs, score }) => {
      const albums = new Set(artistSongs.map((song) => song.album).filter(Boolean))
      return {
        score,
        title: artist,
        subtitle: t('artists.artistSummary', { albums: albums.size, songs: artistSongs.length }),
        artworkUrl: artistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
        path: `/artists/${encodeURIComponent(artist)}`,
        songCount: artistSongs.length,
        playCount: artistSongs.reduce((sum, song) => sum + song.playCount, 0),
        duration: artistSongs.reduce((sum, song) => sum + song.duration, 0),
        albumCount: albums.size,
        songIds: artistSongs.map((song) => song.id),
      }
    })
}

function buildAlbumResults(
  allSongs: LibrarySong[],
  _matchedSongs: LibrarySong[],
  normalizedQuery: string,
  t: Translator,
) {
  const groups = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    const album = song.album || t('common.albumUnknown')
    const artists = getSongArtists(song)
    if (
      album.toLocaleLowerCase().includes(normalizedQuery) ||
      artists.some((artist) => artist.toLocaleLowerCase().includes(normalizedQuery))
    ) {
      groups.set(album, [...(groups.get(album) ?? []), song])
    }
  }

  return [...groups.entries()]
    .map(([album, albumSongs]) => {
      const artists = [...new Set(albumSongs.flatMap((song) => getSongArtists(song)))]
      const artistScore = Math.max(0, ...artists.map((artist) => evaluateString(artist, normalizedQuery) - 10))
      return {
        album,
        albumSongs,
        artists,
        score: Math.max(evaluateString(album, normalizedQuery), artistScore),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.album.localeCompare(right.album))
    .map(({ album, albumSongs, artists, score }) => ({
      score,
      title: album,
      subtitle: t('cards.albumSubtitle', {
        tracks: t('cards.trackCount', { count: albumSongs.length }),
        artists: t('cards.artistCount', { count: artists.length }),
      }),
      artworkUrl: albumSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
      path: `/albums/${encodeURIComponent(album)}`,
      songCount: albumSongs.length,
      playCount: albumSongs.reduce((sum, song) => sum + song.playCount, 0),
      duration: albumSongs.reduce((sum, song) => sum + song.duration, 0),
      albumCount: 0,
      songIds: albumSongs.map((song) => song.id),
    }))
}

function buildFolderResults(
  allSongs: LibrarySong[],
  folders: LibraryFolder[],
  matchedSongs: LibrarySong[],
  rootPath: string,
  normalizedQuery: string,
  t: Translator,
) {
  const matchedFolderPaths = new Set(matchedSongs.map((song) => getFolderPath(song.path)))
  const candidateFolderPaths = new Set<string>()
  const folderByPath = new Map(folders.map((folder) => [folder.path, folder]))

  for (const folder of folders) {
    const folderName = getPathLabel(folder.path)
    if (evaluateString(folderName, normalizedQuery) > 0 || evaluateString(folder.path, normalizedQuery) > 0) {
      candidateFolderPaths.add(folder.path)
    }
  }

  for (const folderPath of matchedFolderPaths) {
    candidateFolderPaths.add(folderPath)
  }

  const songsByFolder = new Map<string, LibrarySong[]>()
  for (const song of allSongs) {
    for (const candidateFolderPath of candidateFolderPaths) {
      if (isSongUnderFolder(song.path, candidateFolderPath)) {
        songsByFolder.set(candidateFolderPath, [...(songsByFolder.get(candidateFolderPath) ?? []), song])
      }
    }
  }

  return [...candidateFolderPaths]
    .map((folderPath) => {
      const folderSongs = songsByFolder.get(folderPath) ?? []
      const folderName = getPathLabel(folderPath) || t('local.libraryRoot')
      return {
        folderPath,
        folderSongs,
        score: Math.max(
          evaluateString(folderName, normalizedQuery),
          evaluateString(folderPath, normalizedQuery),
          matchedFolderPaths.has(folderPath) ? 1 : 0,
        ),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.folderPath.localeCompare(right.folderPath))
    .map(({ folderPath, folderSongs, score }) => ({
      score,
      title: getPathLabel(folderPath) || t('local.libraryRoot'),
      subtitle: t('cards.songCount', { count: folderSongs.length }),
      artworkUrl: folderSongs.find((song) => song.artworkUrl)?.artworkUrl ?? '',
      path: buildLocalRoute(getRelativeFolderPath(folderPath, rootPath)),
      songCount: folderSongs.length,
      playCount: folderSongs.reduce((sum, song) => sum + song.playCount, 0),
      duration: folderSongs.reduce((sum, song) => sum + song.duration, 0),
      albumCount: 0,
      songIds: folderSongs.map((song) => song.id),
      sourceId: String(folderByPath.get(folderPath)!.id),
      sourcePath: folderPath,
    }))
}

function matchSong(song: LibrarySong, normalizedQuery: string) {
  const artistScore = Math.max(...getSongArtists(song).map((artist) => evaluateString(artist, normalizedQuery)))
  const baseScore = Math.max(
    evaluateString(song.title, normalizedQuery),
    artistScore - 10,
    evaluateString(song.album, normalizedQuery) - 20,
    0,
  )

  return baseScore === 0 ? 0 : baseScore + Math.min(song.playCount / 10, 10)
}

function evaluateString(value: string, normalizedQuery: string, offset = 0) {
  if (!value) {
    return 0
  }

  const normalizedValue = value.toLocaleLowerCase()
  if (value === normalizedQuery) {
    return 100 + offset
  }
  if (normalizedValue === normalizedQuery) {
    return 95 + offset
  }
  if (value.startsWith(normalizedQuery)) {
    return 90 + offset
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    return 85 + offset
  }
  if (value.includes(normalizedQuery)) {
    return 80 + offset
  }
  if (normalizedValue.includes(normalizedQuery)) {
    return 75 + offset
  }
  if (normalizedQuery.includes(normalizedValue)) {
    return 70 + offset
  }

  const editDistance = getEditDistance(normalizedValue, normalizedQuery)
  const ratio = Math.floor((editDistance * 100) / Math.max(normalizedValue.length, normalizedQuery.length))
  return ratio <= 60 ? 70 - ratio + offset : 0
}

function getEditDistance(target: string, given: string) {
  const dp = Array.from({ length: target.length + 1 }, (_, rowIndex) =>
    Array.from({ length: given.length + 1 }, (__, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  )

  for (let rowIndex = 1; rowIndex <= target.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= given.length; columnIndex += 1) {
      const replaceCost = target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1
      dp[rowIndex][columnIndex] = Math.min(
        dp[rowIndex - 1][columnIndex] + 1,
        dp[rowIndex][columnIndex - 1] + 1,
        dp[rowIndex - 1][columnIndex - 1] + replaceCost,
      )
    }
  }

  return dp[target.length][given.length]
}

function sortByScoreThenTitle(
  left: { entity: LibrarySong; score: number },
  right: { entity: LibrarySong; score: number },
) {
  return right.score - left.score || left.entity.title.localeCompare(right.entity.title)
}

function getFolderPath(filePath: string) {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : ''
}

function getPathLabel(path: string) {
  const segments = path.split(/[/\\]+/).filter(Boolean)
  return segments.at(-1) ?? path
}

function getRelativeFolderPath(folderPath: string, rootPath: string) {
  const normalizedFolder = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')

  if (normalizedFolder === normalizedRoot) {
    return ''
  }

  if (normalizedFolder.startsWith(`${normalizedRoot}/`)) {
    return normalizedFolder.slice(normalizedRoot.length + 1)
  }

  return folderPath
}

function isSongUnderFolder(songPath: string, folderPath: string) {
  const normalizedSongPath = songPath.replace(/\\/g, '/')
  const normalizedFolderPath = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')

  return normalizedSongPath.startsWith(`${normalizedFolderPath}/`)
}
