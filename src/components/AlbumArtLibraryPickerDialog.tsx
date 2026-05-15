import { useEffect, useMemo, useRef, useState } from 'react'

import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import { getDisplayArtists, getSongArtists } from '../shared/artists'
import type { LibrarySong, SongArtworkSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { AlbumArtControl } from './AlbumArtControl'
import { CustomScrollbar } from './CustomScrollbar'
import { PopupDialog } from './PopupDialog'
import { SearchField } from './SearchField'
import { SearchHistoryPanel } from './SearchHistoryPanel'

export interface AlbumArtLibraryChoice {
  song: LibrarySong
  artworkUrl: string
  sourceUrl: string
  sourcePath: string
}

interface RankedSong {
  song: LibrarySong
  score: number
}

export function AlbumArtLibraryPickerDialog({
  albumName,
  currentSong,
  songs,
  t,
  onApply,
  onClose,
}: {
  albumName: string
  currentSong: LibrarySong | undefined
  songs: LibrarySong[]
  t: Translator
  onApply: (choice: AlbumArtLibraryChoice) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [snapshotsBySongId, setSnapshotsBySongId] = useState<Map<number, SongArtworkSnapshot>>(new Map())
  const [selectedSongId, setSelectedSongId] = useState<number | null>(null)
  const recentSearches = useLibraryStore((state) => state.snapshot.search.recentSearches)
  const addRecentSearch = useLibraryStore((state) => state.addRecentSearch)
  const removeRecentSearch = useLibraryStore((state) => state.removeRecentSearch)
  const clearRecentSearches = useLibraryStore((state) => state.clearRecentSearches)
  const listFrameRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const normalizedQuery = normalizeSearchText(query)
  const artistKeys = useMemo(() => {
    if (currentSong) {
      return new Set(getSongArtists(currentSong).map((artist) => artist.toLocaleLowerCase()))
    }

    const albumSongs = songs.filter((song) => song.album === albumName)
    return new Set(albumSongs.flatMap((song) => getSongArtists(song)).map((artist) => artist.toLocaleLowerCase()))
  }, [albumName, currentSong, songs])
  const rankedSongs = useMemo(
    () => getRankedArtworkSourceSongs(songs, albumName, currentSong, artistKeys, normalizedQuery),
    [albumName, artistKeys, currentSong, normalizedQuery, songs],
  )
  const candidateSongIds = useMemo(
    () => rankedSongs.slice(0, 320).map(({ song }) => song.id),
    [rankedSongs],
  )
  const choices = useMemo(() => {
    return rankedSongs
      .slice(0, 320)
      .map(({ song }) => {
        const snapshot = snapshotsBySongId.get(song.id)
        if (!snapshot || snapshot.source === 'none' || snapshot.sourcePath === '' || snapshot.sourceUrl === '') {
          return null
        }

        return {
          song,
          artworkUrl: snapshot.artworkUrl,
          sourceUrl: snapshot.sourceUrl,
          sourcePath: snapshot.sourcePath,
        }
      })
      .filter((choice): choice is AlbumArtLibraryChoice => choice != null)
      .slice(0, normalizedQuery ? 160 : undefined)
  }, [normalizedQuery, rankedSongs, snapshotsBySongId])
  const selectedChoice = choices.find((choice) => choice.song.id === selectedSongId) ?? choices[0] ?? null
  const visibleRecentSearches = useMemo(
    () => recentSearches.filter((entry) => entry.type === 'sidebar').slice(0, 10),
    [recentSearches],
  )
  const showRecentSearches = searchFocused && visibleRecentSearches.length > 0
  const onScrollbarPointerDown = useCustomScrollbar({
    frameRef: listFrameRef,
    scrollContainerRef: listRef,
    scrollbarTrackRef,
    refreshDependencies: [choices.length, loading, normalizedQuery],
  })

  useEffect(() => {
    let canceled = false
    const missingSongIds = candidateSongIds.filter((songId) => !snapshotsBySongId.has(songId))
    if (missingSongIds.length === 0) {
      setLoading(false)
      return
    }

    setLoading(true)
    void window.smplayer?.getSongArtworkSnapshots(missingSongIds).then((snapshots) => {
      if (canceled) {
        return
      }

      setSnapshotsBySongId((current) => {
        const next = new Map(current)
        for (const snapshot of snapshots) {
          next.set(snapshot.songId, snapshot)
        }
        return next
      })
      setLoading(false)
    }).catch(() => {
      if (!canceled) {
        setLoading(false)
      }
    })

    return () => {
      canceled = true
    }
  }, [candidateSongIds, snapshotsBySongId])

  useEffect(() => {
    if (!selectedChoice) {
      setSelectedSongId(null)
      return
    }

    setSelectedSongId(selectedChoice.song.id)
  }, [selectedChoice])

  return (
    <PopupDialog
      t={t}
      overlayClassName="album-art-library-picker-overlay"
      className="album-art-library-picker-dialog ContentDialog"
      navClassName="album-art-library-picker-nav"
      navLabel={t('song.chooseArtworkFromLibrary')}
      ariaLabel={t('song.chooseArtworkFromLibrary')}
      onClose={onClose}
      navChildren={(
        <div className="popup-dialog-title-block">
          <h2>{t('song.chooseArtworkFromLibrary')}</h2>
        </div>
      )}
      footer={(
        <div className="album-art-library-picker-footer">
          <button type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="song-dialog-primary-button"
            disabled={!selectedChoice}
            onClick={() => {
              if (selectedChoice) {
                onApply(selectedChoice)
              }
            }}
          >
            {t('song.useSelectedArtwork')}
          </button>
        </div>
      )}
    >
      <div className="album-art-library-picker">
        <div className="album-art-library-picker-search-shell">
          <SearchField
            id="album-art-library-search"
            label={t('common.search')}
            value={query}
            placeholder={t('song.searchLibraryArtwork')}
            searchLabel={t('common.search')}
            clearLabel={t('common.clear')}
            onSubmit={(event) => {
              event.preventDefault()
              if (query.trim()) {
                void addRecentSearch(query, 'sidebar')
              }
              setSearchFocused(false)
            }}
            onFocus={() => setSearchFocused(true)}
            onValueChange={setQuery}
            onClear={() => {
              setQuery('')
              setSearchFocused(true)
            }}
            dropdown={showRecentSearches ? (
              <>
                <div className="dropdown-dismiss-layer" onPointerDown={() => setSearchFocused(false)} />
                <SearchHistoryPanel
                  className="album-art-library-picker-suggestions"
                  title={t('sidebar.recentSearches')}
                  clearLabel={t('common.clear')}
                  items={visibleRecentSearches.map((entry) => ({
                    key: String(entry.id),
                    label: entry.query,
                    value: entry,
                  }))}
                  onClear={() => {
                    void clearRecentSearches()
                  }}
                  onSelect={(item) => {
                    setQuery(item.value.query)
                    void addRecentSearch(item.value.query, item.value.type)
                    setSearchFocused(false)
                  }}
                  onRemove={(item) => {
                    void removeRecentSearch(item.value.id)
                  }}
                  getRemoveLabel={(item) => t('sidebar.removeRecentSearch', {
                    query: item.value.query,
                  })}
                />
              </>
            ) : null}
          />
        </div>
        <div className="album-art-library-picker-content">
          <div className="album-art-library-picker-list-frame custom-scrollbar-frame" ref={listFrameRef}>
            <div className="album-art-library-picker-list custom-scrollbar-container" ref={listRef} role="listbox" aria-label={t('song.chooseArtworkFromLibrary')}>
              {loading ? <p className="album-art-library-picker-message">{t('nowPlaying.loading')}</p> : null}
              {!loading && choices.length === 0 ? <p className="album-art-library-picker-message">{t('song.noLibraryArtwork')}</p> : null}
              {choices.map((choice) => (
                <div
                  key={choice.song.id}
                  role="option"
                  aria-selected={selectedChoice?.song.id === choice.song.id}
                  tabIndex={0}
                  className={`recent-song-tile album-art-library-picker-source-item${selectedChoice?.song.id === choice.song.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedSongId(choice.song.id)}
                  onDoubleClick={() => onApply(choice)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onApply(choice)
                    } else if (event.key === ' ') {
                      event.preventDefault()
                      setSelectedSongId(choice.song.id)
                    }
                  }}
                >
                  <span className="recent-song-artwork-wrap album-art-library-picker-artwork-wrap">
                    <AlbumArtControl title={choice.song.title} artworkUrl={choice.artworkUrl} songId={choice.song.id} className="recent-song-artwork album-art-library-picker-artwork" />
                  </span>
                  <span className="recent-song-copy album-art-library-picker-copy">
                    <strong>{choice.song.title}</strong>
                    <span>{getDisplayArtists(choice.song, t('common.artistUnknown'), t('common.artistSeparator'))}</span>
                    <small>{choice.song.album || t('common.albumUnknown')}</small>
                  </span>
                </div>
              ))}
            </div>
            <CustomScrollbar
              className="album-art-library-picker-scrollbar"
              scrollbarTrackRef={scrollbarTrackRef}
              onThumbPointerDown={onScrollbarPointerDown}
            />
          </div>
          <aside className="album-art-library-picker-preview">
            {selectedChoice ? (
              <>
                <AlbumArtControl title={selectedChoice.song.title} artworkUrl={selectedChoice.artworkUrl} songId={selectedChoice.song.id} />
                <strong>{selectedChoice.song.title}</strong>
                <span>{getDisplayArtists(selectedChoice.song, t('common.artistUnknown'), t('common.artistSeparator'))}</span>
                <span>{selectedChoice.song.album || t('common.albumUnknown')}</span>
              </>
            ) : null}
          </aside>
        </div>
      </div>
    </PopupDialog>
  )
}

function rankSong(
  song: LibrarySong,
  albumName: string,
  currentSong: LibrarySong | undefined,
  artistKeys: Set<string>,
  normalizedQuery: string,
) {
  const searchableText = normalizeSearchText(`${song.title} ${song.album} ${getSongArtists(song).join(' ')}`)
  if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
    return null
  }

  const sameAlbum = albumName !== '' && song.album === albumName
  const sameArtist = isSameArtistSong(song, artistKeys)
  const similarTitle = currentSong ? isSimilarArtworkTitle(currentSong.title, song.title) : false

  return {
    song,
    score: (sameAlbum ? 40 : 0) + (sameArtist ? 20 : 0) + (similarTitle ? 12 : 0) + Math.min(song.playCount, 5),
  }
}

function getRankedArtworkSourceSongs(
  songs: LibrarySong[],
  albumName: string,
  currentSong: LibrarySong | undefined,
  artistKeys: Set<string>,
  normalizedQuery: string,
) {
  const librarySongs = songs.filter((song) => song.id !== currentSong?.id)

  if (normalizedQuery) {
    return librarySongs
      .map((song) => rankSong(song, albumName, currentSong, artistKeys, normalizedQuery))
      .filter((rankedSong): rankedSong is RankedSong => rankedSong != null)
      .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title))
  }

  const sameArtistSongs = librarySongs.filter((song) => isSameArtistSong(song, artistKeys))
  if (sameArtistSongs.length > 0) {
    return sameArtistSongs
      .map((song) => rankSong(song, albumName, currentSong, artistKeys, ''))
      .filter((rankedSong): rankedSong is RankedSong => rankedSong != null)
      .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title))
  }

  return librarySongs.slice(0, 20).map((song, index) => ({
    song,
    score: 20 - index,
  }))
}

function isSameArtistSong(song: LibrarySong, artistKeys: Set<string>) {
  return getSongArtists(song).some((artist) => artistKeys.has(artist.toLocaleLowerCase()))
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/gu, '')
}

function normalizeArtworkMatchText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\(.*?\)|\[.*?\]/gu, '')
    .replace(/[\s\-_.:/\\|]+/gu, '')
    .trim()
}

function isSimilarArtworkTitle(left: string, right: string) {
  const normalizedLeft = normalizeArtworkMatchText(left)
  const normalizedRight = normalizeArtworkMatchText(right)

  return normalizedLeft.length >= 2 &&
    normalizedRight.length >= 2 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
}
