import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AlbumTile } from '../components/AlbumTile'
import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import { GridViewHolder } from '../components/GridViewHolder'
import { Icon } from '../components/icons'
import { LocalFolderCard } from '../components/LocalFolderCard'
import type { LibraryPlaylist, LibrarySong, SearchSortCriterion } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { SearchResult, SearchResultType } from '../shared/SearchHelper'
import type { FolderNode } from './localFolderModel'
import { getSearchAlbumTileData, getSearchResultCardKey, shuffleSongIds } from './searchPageModel'

const PREVIEW_LIMIT = 5
type SearchFilterKey = 'all' | SearchResultType

export function SearchResultTabs({
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
  const tabs: Array<{ key: SearchFilterKey; label: string; order: number }> = [
    { key: 'all', label: t('common.all'), order: 0 },
    { key: 'artists', label: t('common.artists'), order: 1 },
    { key: 'albums', label: t('common.albums'), order: 2 },
    { key: 'songs', label: t('common.songs'), order: 3 },
    { key: 'playlists', label: t('common.playlists'), order: 4 },
    { key: 'folders', label: t('common.folders'), order: 5 },
  ]
  const orderedTabs = [
    tabs[0]!,
    ...tabs.slice(1).sort((left, right) => {
      const leftEmpty = counts[left.key] === 0
      const rightEmpty = counts[right.key] === 0
      if (leftEmpty !== rightEmpty) {
        return leftEmpty ? 1 : -1
      }

      return left.order - right.order
    }),
  ]

  return (
    <div className="search-result-tabs" role="tablist">
      {orderedTabs.map((tab) => (
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

export function SearchResultSection({
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

export function SearchAlbumResultSection({
  cards,
  title,
  viewAllLabel,
  viewLessLabel,
  sortOptions,
  sortCriterion,
  previewLimit = PREVIEW_LIMIT,
  usesPreview = true,
  expanded,
  songsById,
  t,
  onToggleExpanded,
  onSortChange,
  onOpenContextMenu,
  onPlayTrack,
  onAddAlbum,
  onNavigate,
  selectionMode = false,
  selectedCardKeys,
  onToggleSelection,
}: {
  cards: SearchResult[]
  title: string
  viewAllLabel: string
  viewLessLabel: string
  sortOptions: Array<{ value: SearchSortCriterion; label: string }>
  sortCriterion: SearchSortCriterion
  previewLimit?: number
  usesPreview?: boolean
  expanded: boolean
  songsById: Map<number, LibrarySong>
  t: Translator
  onToggleExpanded: (section: SearchResultType) => void
  onSortChange: (section: SearchResultType, criterion: SearchSortCriterion) => void
  onOpenContextMenu: (sectionKey: SearchResultType, card: SearchResult, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddAlbum: (card: SearchResult, x: number, y: number) => void
  onNavigate: (path: string) => void
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
        sectionKey="albums"
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
      <div className="search-album-result-grid">
        {(expanded ? cards : cards.slice(0, previewLimit)).map((card) => {
          const cardKey = getSearchResultCardKey('albums', card)
          const selected = selectedCardKeys?.has(cardKey) ?? false
          const album = getSearchAlbumTileData(card, songsById, t)

          return (
            <AlbumTile
              key={cardKey}
              album={album}
              multiSelect={selectionMode}
              selected={selected}
              t={t}
              onOpenAlbum={() => {
                if (selectionMode) {
                  onToggleSelection?.('albums', card)
                  return
                }

                onNavigate(card.path)
              }}
              onPlayAlbum={() => {
                const shuffledSongIds = shuffleSongIds(card.songIds)
                if (shuffledSongIds.length > 0) {
                  onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
                }
              }}
              onAddAlbum={(position) => {
                onAddAlbum(card, position.x, position.y)
              }}
              onToggleSelection={() => {
                onToggleSelection?.('albums', card)
              }}
              onOpenContextMenu={(position) => {
                onOpenContextMenu('albums', card, position.x, position.y)
              }}
            />
          )
        })}
      </div>
    </section>
  )
}

export function SearchPlaylistResultSection({
  cards,
  title,
  viewAllLabel,
  viewLessLabel,
  sortOptions,
  sortCriterion,
  previewLimit = PREVIEW_LIMIT,
  usesPreview = true,
  expanded,
  playlistsById,
  songsById,
  t,
  onToggleExpanded,
  onSortChange,
  onOpenContextMenu,
  onPlayTrack,
  onNavigate,
  selectionMode = false,
  selectedCardKeys,
  onToggleSelection,
}: {
  cards: SearchResult[]
  title: string
  viewAllLabel: string
  viewLessLabel: string
  sortOptions: Array<{ value: SearchSortCriterion; label: string }>
  sortCriterion: SearchSortCriterion
  previewLimit?: number
  usesPreview?: boolean
  expanded: boolean
  playlistsById: Map<number, LibraryPlaylist>
  songsById: Map<number, LibrarySong>
  t: Translator
  onToggleExpanded: (section: SearchResultType) => void
  onSortChange: (section: SearchResultType, criterion: SearchSortCriterion) => void
  onOpenContextMenu: (sectionKey: SearchResultType, card: SearchResult, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onNavigate: (path: string) => void
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
        sectionKey="playlists"
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
      <div className="grid-view-holder-grid search-grid-view-holder-grid">
        {(expanded ? cards : cards.slice(0, previewLimit)).map((card) => {
          const playlist = playlistsById.get(Number(card.sourceId))!
          const playlistSongs = playlist.songIds
            .map((songId) => songsById.get(songId))
            .filter((song) => song !== undefined)
          const cardKey = getSearchResultCardKey('playlists', card)
          const selected = selectedCardKeys?.has(cardKey) ?? false

          return (
            <GridViewHolder
              key={cardKey}
              playlist={playlist}
              songs={playlistSongs}
              selected={selected}
              dragging={false}
              t={t}
              selectionMode={selectionMode}
              selectedMark={selectionMode ? (
                <span className={selected ? 'local-card-check is-selected' : 'local-card-check'}>
                  {selected ? <Icon name="check" /> : null}
                </span>
              ) : null}
              showDragHandle={false}
              onOpen={() => {
                if (selectionMode) {
                  onToggleSelection?.('playlists', card)
                  return
                }

                onNavigate(card.path)
              }}
              onPlay={() => {
                const [firstSong] = playlistSongs
                if (firstSong) {
                  onPlayTrack(firstSong.id, playlistSongs.map((song) => song.id))
                }
              }}
              onContextMenu={(x, y) => {
                onOpenContextMenu('playlists', card, x, y)
              }}
            />
          )
        })}
      </div>
    </section>
  )
}

export function SearchFolderResultSection({
  cards,
  title,
  viewAllLabel,
  viewLessLabel,
  sortOptions,
  sortCriterion,
  previewLimit = PREVIEW_LIMIT,
  usesPreview = true,
  expanded,
  nodes,
  songsById,
  t,
  onToggleExpanded,
  onSortChange,
  onOpenContextMenu,
  onOpenFolder,
  onPlayTrack,
  onAddFolder,
  selectionMode = false,
  selectedCardKeys,
  onToggleSelection,
}: {
  cards: SearchResult[]
  title: string
  viewAllLabel: string
  viewLessLabel: string
  sortOptions: Array<{ value: SearchSortCriterion; label: string }>
  sortCriterion: SearchSortCriterion
  previewLimit?: number
  usesPreview?: boolean
  expanded: boolean
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  t: Translator
  onToggleExpanded: (section: SearchResultType) => void
  onSortChange: (section: SearchResultType, criterion: SearchSortCriterion) => void
  onOpenContextMenu: (sectionKey: SearchResultType, card: SearchResult, x: number, y: number) => void
  onOpenFolder: (folderRelativePath: string) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
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
        sectionKey="folders"
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
      <div className="local-folder-grid search-folder-result-grid">
        {(expanded ? cards : cards.slice(0, previewLimit)).map((card) => {
          const folder = nodes.get(card.localFolderRelativePath!)!
          const cardKey = getSearchResultCardKey('folders', card)
          const selected = selectedCardKeys?.has(cardKey) ?? false

          return (
            <LocalFolderCard
              key={cardKey}
              folder={folder}
              selected={selected}
              multiSelect={selectionMode}
              nodes={nodes}
              songsById={songsById}
              t={t}
              draggable={false}
              onPlayFolder={(folder) => {
                const shuffledSongIds = shuffleSongIds(folder.subtreeSongIds)
                if (shuffledSongIds.length > 0) {
                  onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
                }
              }}
              onAddFolder={(event, folder) => {
                onAddFolder(folder, event.clientX, event.clientY)
              }}
              onOpenFolder={onOpenFolder}
              onToggleSelection={() => {
                onToggleSelection?.('folders', card)
              }}
              onOpenFolderMenu={(_folder, x, y) => {
                onOpenContextMenu('folders', card, x, y)
              }}
            />
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
