import { useMemo, useState } from 'react'

import { getDisplayArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong, MusicLibrarySortCriterion } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
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
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist?: (playlistId: number, songIds: number[]) => void
  onRemoveSongs?: (songIds: number[]) => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onClear?: () => void
  onEditArtwork?: () => void
  onSortSongs?: (songIds: number[]) => void
  onArtistClick?: (artist: string) => void
  onAlbumClick?: (album: string) => void
  onToggleFavorite?: (songId: number, favorite: boolean) => void
}

const sortOptions: MusicLibrarySortCriterion[] = ['title', 'artist', 'album', 'duration', 'play-count', 'date-added']

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
  onPlayTrack,
  onTogglePlayPause,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongs,
  onRename,
  onDelete,
  onClear,
  onEditArtwork,
  onSortSongs,
  onArtistClick,
  onAlbumClick,
  onToggleFavorite,
}: HeaderedPlaylistControlProps) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set())
  const [addToMenu, setAddToMenu] = useState<(MenuFlyoutPosition & { songIds: number[] }) | null>(null)
  const [sortMenu, setSortMenu] = useState<MenuFlyoutPosition | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [renameDraft, setRenameDraft] = useState(title)
  const [sortCriterion, setSortCriterion] = useState<MusicLibrarySortCriterion>('title')
  const [reversed, setReversed] = useState(false)
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const visibleSongs = useMemo(
    () => sortSongs(songs, sortCriterion, reversed),
    [reversed, songs, sortCriterion],
  )
  const visibleSongIds = visibleSongs.map((song) => song.id)
  const effectiveSelectedSongIds = [...selectedSongIds].filter((songId) => queueSongIds.includes(songId))
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)

  const playFirst = () => {
    onPlayTrack(queueSongIds[0]!, queueSongIds)
  }

  const shuffle = () => {
    const shuffledSongIds = shuffleSongIds(queueSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const clearSelection = () => {
    setSelectedSongIds(new Set())
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

  const commitSort = (criterion: MusicLibrarySortCriterion, reverse: boolean) => {
    setSortCriterion(criterion)
    setReversed(reverse)
    onSortSongs?.(sortSongs(songs, criterion, reverse).map((song) => song.id))
  }

  return (
    <section className={`headered-playlist-control headered-playlist-${type}`}>
      <div className="headered-playlist-backdrop" aria-hidden="true">
        {artworkUrl ? <img src={artworkUrl} alt="" /> : null}
      </div>
      <header className="headered-playlist-hero">
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
          <div className="headered-playlist-primary-actions">
            <button className="is-primary" type="button" disabled={songs.length === 0} onClick={playFirst} title={captionFor('play')}>
              <Icon name="play" />
              <span>{captionFor('play')}</span>
            </button>
            <button type="button" disabled={songs.length === 0} onClick={shuffle} title={captionFor('shuffle')}>
              <Icon name="shuffle" />
              <span>{captionFor('shuffle')}</span>
            </button>
            {onToggleFavorite ? (
              <button
                type="button"
                disabled={songs.length === 0}
                onClick={() => {
                  for (const song of songs) {
                    onToggleFavorite(song.id, true)
                  }
                }}
                title={captionFor('favorite')}
              >
                <Icon name="heart" />
                <span>{captionFor('favorite')}</span>
              </button>
            ) : null}
          </div>
          <div className="headered-playlist-commandbar">
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
            <button
              type="button"
              disabled={songs.length === 0}
              onClick={(event) => {
                setSortMenu({ x: event.clientX, y: event.clientY })
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
      </header>

      <section className={`headered-playlist-list${showAlbum ? ' has-album' : ''}`}>
        <div className="headered-playlist-list-header">
          <span className="headered-playlist-title-head">
            <span>#</span>
            <span>{captionFor('name')}</span>
          </span>
          {showArtist ? <span>{captionFor('artist')}</span> : null}
          {showAlbum ? <span>{captionFor('album')}</span> : null}
          <span aria-hidden="true" />
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
              showFavorite
              showDuration
              removable={removable}
              onRemoveFromListClick={(contextSong) => {
                onRemoveSongs?.([contextSong.id])
              }}
              onAddToPlaylistClick={(contextSong, x, y) => {
                setAddToMenu({ songIds: [contextSong.id], x, y })
              }}
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
        playlists={customPlaylists}
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
            ...sortOptions.map((criterion) => ({
              key: criterion,
              text: captionFor(`sort.${criterion}`),
              icon: criterion === sortCriterion && !reversed ? 'check' as const : undefined,
              onClick: () => {
                commitSort(criterion, false)
              },
            })),
            {
              key: 'reverse',
              text: captionFor('sort.reverse'),
              icon: reversed ? 'check' as const : undefined,
              onClick: () => {
                commitSort(sortCriterion, !reversed)
              },
            },
          ]}
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

const captions: Record<string, string> = {
  album: 'common.album',
  artist: 'common.artist',
  cancel: 'common.cancel',
  clear: 'common.clear',
  delete: 'playlists.delete',
  duration: 'common.duration',
  editArtwork: 'albums.editArtwork',
  favorite: 'common.favorite',
  multiSelect: 'albums.multiSelect',
  name: 'common.name',
  play: 'context.play',
  removeSelected: 'playlists.removeSelected',
  rename: 'playlists.rename',
  save: 'playlists.save',
  shuffle: 'nowPlaying.randomPlay',
  sort: 'common.sort',
  'sort.album': 'table.album',
  'sort.artist': 'table.artist',
  'sort.date-added': 'table.dateAdded',
  'sort.duration': 'table.duration',
  'sort.play-count': 'table.playCount',
  'sort.reverse': 'albums.sort.reverse',
  'sort.title': 'table.title',
}

function sortSongs(songs: LibrarySong[], criterion: MusicLibrarySortCriterion, reversed: boolean) {
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

  return reversed ? sortedSongs.reverse() : sortedSongs
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
