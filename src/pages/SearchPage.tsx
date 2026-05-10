import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { requestTextDialog } from '../components/dialogService'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { AppSettingsUpdate, LibraryFolder, LibraryPlaylist, LibrarySong, PreferenceEntityType, PreferenceItemSnapshot, PreferenceSettingsSnapshot, SearchSortCriterion } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import {
  buildSearchResults,
  getRelativeFolderPath,
  getSearchCriterionSetting,
  getSortOptions,
  isFolderUnderFolder,
  isSongUnderFolder,
  sortSearchResults,
  sortSearchSongs,
  type SearchResult,
  type SearchResultType,
} from '../shared/SearchHelper'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'

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
  onOpenLocalFolder: (folderRelativePath: string) => void
  onSearchDirectory: (query: string, folderRelativePath: string) => void
}

interface SearchResultContextMenuState {
  sectionKey: SearchResultType
  card: SearchResult
  x: number
  y: number
}

interface SearchSongAddMenuState {
  songIds: number[]
  defaultPlaylistName: string
  x: number
  y: number
}

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
  onOpenLocalFolder,
  onSearchDirectory,
}: SearchPageProps) {
  const navigate = useNavigate()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<SearchFilterKey>('all')
  const [songContextMenu, setSongContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [songAddMenu, setSongAddMenu] = useState<SearchSongAddMenuState | null>(null)
  const [cardContextMenu, setCardContextMenu] = useState<SearchResultContextMenuState | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<SearchResult | null>(null)
  const [searchSelectionMode, setSearchSelectionMode] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [selectedCardKeys, setSelectedCardKeys] = useState<Set<string>>(new Set())
  const [preferenceItems, setPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const normalizedRequestedQuery = requestedQuery.trim().toLocaleLowerCase()
  const searchableSongs = useMemo(
    () => searchFolderPath ? songs.filter((song) => isSongUnderFolder(song.path, searchFolderPath)) : songs,
    [searchFolderPath, songs],
  )
  const searchableFolders = useMemo(
    () => searchFolderPath ? folders.filter((folder) => isFolderUnderFolder(folder.path, searchFolderPath)) : folders,
    [folders, searchFolderPath],
  )
  const results = useMemo(
    () => buildSearchResults(searchableSongs, searchableFolders, playlists, rootPath, normalizedQuery, t),
    [normalizedQuery, playlists, rootPath, searchableFolders, searchableSongs, t],
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
  const visibleSearchSongs = showSongs
    ? usesPreview && !expandedSections.has('songs')
      ? sortedResults.songs.slice(0, SONG_PREVIEW_LIMIT)
      : sortedResults.songs
    : []
  const selectableSearchSongIds = showSongs ? sortedResults.songs.map((song) => song.id) : []
  const selectableSearchSongIdSet = new Set(selectableSearchSongIds)
  const selectedSearchSongIds = [...selectedSongIds].filter((songId) => selectableSearchSongIdSet.has(songId))
  const selectableSearchCards = [
    ...(showArtists ? sortedResults.artists.map((card) => ({ sectionKey: 'artists' as const, card })) : []),
    ...(showAlbums ? sortedResults.albums.map((card) => ({ sectionKey: 'albums' as const, card })) : []),
    ...(showPlaylists ? sortedResults.playlists.map((card) => ({ sectionKey: 'playlists' as const, card })) : []),
    ...(showFolders ? sortedResults.folders.map((card) => ({ sectionKey: 'folders' as const, card })) : []),
  ]
  const selectedSearchCards = selectableSearchCards.filter((item) => selectedCardKeys.has(getSearchResultCardKey(item.sectionKey, item.card)))
  const selectedSearchSongIdsForOperation = getUniqueSongIds([
    ...selectedSearchSongIds,
    ...selectedSearchCards.flatMap((item) => item.card.songIds),
  ])
  const selectedSearchItemCount = selectedSearchSongIds.length + selectedSearchCards.length
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const favoriteSongIdSet = useMemo(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)), [songs])

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
    setSongAddMenu(null)
    setCardContextMenu({ sectionKey, card, x, y })
  }
  const clearSongSelection = () => {
    setSelectedSongIds(new Set())
    setSelectedCardKeys(new Set())
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
  const selectSongFromMenu = (songId: number) => {
    setSearchSelectionMode(true)
    setSelectedSongIds(new Set([songId]))
  }
  const toggleCardSelection = (sectionKey: SearchResultType, card: SearchResult) => {
    const cardKey = getSearchResultCardKey(sectionKey, card)
    setSelectedCardKeys((current) => {
      const next = new Set(current)
      if (next.has(cardKey)) {
        next.delete(cardKey)
      } else {
        next.add(cardKey)
      }
      return next
    })
  }
  const selectCardFromMenu = (sectionKey: SearchResultType, card: SearchResult) => {
    setSearchSelectionMode(true)
    setSelectedCardKeys(new Set([getSearchResultCardKey(sectionKey, card)]))
  }
  const hideSongSelectionAfterOperation = () => {
    if (hideMultiSelectCommandBarAfterOperation) {
      setSearchSelectionMode(false)
      clearSongSelection()
    }
  }
  const playSelectedSongs = () => {
    const shuffledSongIds = shuffleSongIds(selectedSearchSongIdsForOperation)
    if (shuffledSongIds.length > 0) {
      onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
    }
  }
  const selectAllSearchResults = () => {
    setSelectedSongIds(new Set(selectableSearchSongIds))
    setSelectedCardKeys(new Set(selectableSearchCards.map((item) => getSearchResultCardKey(item.sectionKey, item.card))))
  }
  const reverseSearchSelection = () => {
    setSelectedSongIds((current) => new Set(selectableSearchSongIds.filter((songId) => !current.has(songId))))
    setSelectedCardKeys((current) => new Set(
      selectableSearchCards
        .map((item) => getSearchResultCardKey(item.sectionKey, item.card))
        .filter((cardKey) => !current.has(cardKey)),
    ))
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

  useEffect(() => {
    setActiveFilter('all')
    setExpandedSections(new Set())
    setSearchSelectionMode(false)
    clearSongSelection()
    setSongContextMenu(null)
    setSongAddMenu(null)
    setCardContextMenu(null)
  }, [normalizedQuery, searchFolderPath])

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
          <div className="search-result-toolbar">
            <SearchResultTabs
              activeFilter={activeFilter}
              counts={resultCounts}
              t={t}
              onChange={setActiveFilter}
            />
            <button
              type="button"
              className={searchSelectionMode ? 'search-multi-select-button is-active' : 'search-multi-select-button'}
              onClick={() => {
                setSearchSelectionMode((current) => !current)
                clearSongSelection()
              }}
            >
              <Icon name="menu" />
              <span>{t('common.multiSelect')}</span>
            </button>
          </div>
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
              onOpenLocalFolder={onOpenLocalFolder}
              selectionMode={searchSelectionMode}
              selectedCardKeys={selectedCardKeys}
              onToggleSelection={toggleCardSelection}
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
              selectionMode={searchSelectionMode}
              selectedCardKeys={selectedCardKeys}
              onToggleSelection={toggleCardSelection}
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
                {visibleSearchSongs.map((song) => (
                  <PlaylistControlItem
                    key={song.id}
                    song={song}
                    t={t}
                    current={song.id === selectedTrackId}
                    playing={isPlaying}
                    queueSongIds={queueSongIds}
                    selectionMode={searchSelectionMode}
                    selected={selectedSongIds.has(song.id)}
                    dropPosition={null}
                    draggable={false}
                    showAlbum
                    onPlayTrack={onPlayTrack}
                    onTogglePlayPause={onTogglePlayPause}
                    onToggleSelection={() => {
                      toggleSongSelection(song.id)
                    }}
                    onAddToPlaylistClick={(contextSong, x, y) => {
                      setSongContextMenu(null)
                      setCardContextMenu(null)
                      setSongAddMenu({ songIds: [contextSong.id], defaultPlaylistName: contextSong.title, x, y })
                    }}
                    onContextMenu={(contextSong, x, y) => {
                      setSongAddMenu(null)
                      setSongContextMenu({ song: contextSong, x, y })
                    }}
                    onSeeArtist={(artist) => {
                      navigate(`/artists?artist=${encodeURIComponent(artist)}`)
                    }}
                    onSeeAlbum={(contextSong) => {
                      navigate(`/albums?album=${encodeURIComponent(contextSong.album || t('common.albumUnknown'))}`)
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
              selectionMode={searchSelectionMode}
              selectedCardKeys={selectedCardKeys}
              onToggleSelection={toggleCardSelection}
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
              selectionMode={searchSelectionMode}
              selectedCardKeys={selectedCardKeys}
              onToggleSelection={toggleCardSelection}
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
              showSelect
              onSelectSong={selectSongFromMenu}
            />
          ) : null}
          <MultiSelectCommandBar
            visible={searchSelectionMode}
            selectedCount={selectedSearchItemCount}
            t={t}
            playlists={customPlaylists}
            showPlay
            showAddTo
            onPlay={playSelectedSongs}
            onAddToPlaylistMenuClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setSongAddMenu({
                songIds: selectedSearchSongIdsForOperation,
                defaultPlaylistName: normalizedQuery || t('common.songs'),
                x: rect.left,
                y: rect.top - 8,
              })
            }}
            onSelectAll={selectAllSearchResults}
            onReverseSelection={reverseSearchSelection}
            onClearSelection={clearSongSelection}
            onCancel={() => {
              setSearchSelectionMode(false)
              clearSongSelection()
            }}
          />
          {songAddMenu ? (
            <MenuFlyout
              position={songAddMenu}
              onClose={() => {
                setSongAddMenu(null)
              }}
              items={(() => {
                const addToItem = getAddToPlaylistMenuFlyoutItem({
                  playlists,
                  songIds: songAddMenu.songIds,
                  t,
                  defaultPlaylistName: songAddMenu.defaultPlaylistName,
                  includeNowPlaying: true,
                  includeFavorites: songAddMenu.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
                  onAddToNowPlaying: () => {
                    onAddSongsToNowPlaying(songAddMenu.songIds)
                    hideSongSelectionAfterOperation()
                  },
                  onToggleFavorite: () => {
                    onAddSongsToPlaylist(favoritePlaylistId, songAddMenu.songIds.filter((songId) => !favoriteSongIdSet.has(songId)))
                    hideSongSelectionAfterOperation()
                  },
                  onCreatePlaylist: (name) => {
                    onCreatePlaylistWithSongs(name, songAddMenu.songIds)
                    hideSongSelectionAfterOperation()
                  },
                  onAddToPlaylist: (playlistId) => {
                    if (songAddMenu.songIds.length === 1) {
                      onAddSongToPlaylist(playlistId, songAddMenu.songIds[0]!)
                    } else {
                      onAddSongsToPlaylist(playlistId, songAddMenu.songIds)
                    }
                    hideSongSelectionAfterOperation()
                  },
                })

                return addToItem ? [addToItem] : []
              })()}
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
                favoriteSongIdSet,
                t,
                onSelect: selectCardFromMenu,
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
  onOpenLocalFolder,
  selectionMode = false,
  selectedCardKeys,
  onToggleSelection,
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
  onOpenLocalFolder?: (folderRelativePath: string) => void
  selectionMode?: boolean
  selectedCardKeys?: Set<string>
  onToggleSelection?: (sectionKey: SearchResultType, card: SearchResult) => void
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
        {(expanded ? cards : cards.slice(0, previewLimit)).map((card) => {
          const cardKey = getSearchResultCardKey(sectionKey, card)
          const selected = selectedCardKeys?.has(cardKey) ?? false
          return (
            <Link
              className={`search-result-card${selectionMode ? ' is-selecting' : ''}${selected ? ' is-selected' : ''}`}
              key={cardKey}
              to={card.path}
              onClick={(event) => {
                if (selectionMode) {
                  event.preventDefault()
                  onToggleSelection?.(sectionKey, card)
                  return
                }

                if (sectionKey === 'folders') {
                  onOpenLocalFolder?.(card.localFolderRelativePath!)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onOpenContextMenu(sectionKey, card, event.clientX, event.clientY)
              }}
            >
              {selectionMode || selected ? (
                <span className={selected ? 'search-result-card-check is-selected' : 'search-result-card-check'}>
                  {selected ? <Icon name="check" /> : null}
                </span>
              ) : null}
              <SearchArtwork title={card.title} artworkUrl={card.artworkUrl} />
              <strong>{card.title}</strong>
              <span>{card.subtitle}</span>
            </Link>
          )
        })}
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

    const closeSortMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && sortMenuRef.current?.contains(target)) {
        return
      }

      setIsSortOpen(false)
    }

    document.addEventListener('pointerdown', closeSortMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeSortMenu, true)
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
            <>
              <div className="dropdown-dismiss-layer" onPointerDown={() => setIsSortOpen(false)} />
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
            </>
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
  favoriteSongIdSet,
  t,
  onSelect,
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
  favoriteSongIdSet: Set<number>
  t: Translator
  onSelect: (sectionKey: SearchResultType, card: SearchResult) => void
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
      onClick: () => {
        const shuffledSongIds = shuffleSongIds(card.songIds)
        if (shuffledSongIds.length > 0) {
          onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
        }
      },
    },
  ]
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: card.songIds,
    t,
    defaultPlaylistName: card.title,
    includeNowPlaying: true,
    includeFavorites: card.songIds.some((songId) => !favoriteSongIdSet.has(songId)),
    onAddToNowPlaying: () => {
      onAddSongsToNowPlaying(card.songIds)
    },
    onToggleFavorite: () => {
      onAddSongsToPlaylist(favoritePlaylistId, card.songIds.filter((songId) => !favoriteSongIdSet.has(songId)))
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

  items.push({
    key: 'select',
    text: t('context.select'),
    icon: 'menu',
    onClick: () => {
      onSelect(sectionKey, card)
    },
  })

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
        icon: 'local',
        onClick: () => window.smplayer?.revealItemInFolder(card.sourcePath!),
      },
      {
        key: 'search-directory',
        text: t('local.searchDirectory'),
        icon: 'search',
        onClick: () => {
          void requestTextDialog({
            title: t('local.searchDirectoryPrompt', { name: card.title }),
            defaultValue: '',
          }).then((query) => {
            if (query) {
              onSearchDirectory(query, getRelativeFolderPath(card.sourcePath!, rootPath))
            }
          })
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

function getSearchResultCardKey(sectionKey: SearchResultType, card: SearchResult) {
  return `${sectionKey}:${card.path}:${card.title}`
}

function getUniqueSongIds(songIds: number[]) {
  return [...new Set(songIds)]
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
