import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import clsx from 'clsx'
import { Link, useNavigate } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem } from '../components/MenuFlyoutHelper'
import { MusicMenuFlyout, type MusicMenuFlyoutState } from '../components/MusicMenuFlyout'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { getSongArtists } from '../shared/artists'
import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'

interface ArtistsPageProps {
  t: Translator
  songs: LibrarySong[]
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  playlists: LibraryPlaylist[]
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
}

interface ArtistGroup {
  name: string
  songs: LibrarySong[]
  albumCount: number
  artworkUrl: string
}

interface AlbumGroup {
  name: string
  songs: LibrarySong[]
  artworkUrl: string
  duration: number
}

const ARTIST_ROW_HEIGHT = 48
const ARTIST_OVERSCAN_ROWS = 10

export function ArtistsPage({
  t,
  songs,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  playlists,
  onPlayTrack,
  onTogglePlayPause,
  onPlayNext,
  onToggleFavorite,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onDeleteSongFromDisk,
}: ArtistsPageProps) {
  const [artistSearch, setArtistSearch] = useState('')
  const [selectedArtistName, setSelectedArtistName] = useState('')
  const [songContextMenu, setSongContextMenu] = useState<MusicMenuFlyoutState | null>(null)
  const [groupMenu, setGroupMenu] = useState<GroupContextMenuState | null>(null)
  const artistListRef = useRef<HTMLDivElement | null>(null)
  const [artistScrollTop, setArtistScrollTop] = useState(0)
  const [artistViewportHeight, setArtistViewportHeight] = useState(640)
  const navigate = useNavigate()
  const artistGroups = useMemo(() => buildArtistGroups(songs, t), [songs, t])
  const visibleArtists = useMemo(() => {
    const query = (artistSearch || searchQuery).trim().toLocaleLowerCase()

    if (!query) {
      return artistGroups
    }

    return artistGroups.filter((artist) => artist.name.toLocaleLowerCase().includes(query))
  }, [artistGroups, artistSearch, searchQuery])
  const selectedArtist =
    visibleArtists.find((artist) => artist.name === selectedArtistName) ?? visibleArtists[0] ?? null
  const selectedArtistSongs = useMemo(() => selectedArtist?.songs ?? [], [selectedArtist])
  const selectedQueueSongIds = useMemo(
    () => selectedArtistSongs.map((song) => song.id),
    [selectedArtistSongs],
  )
  const selectedAlbums = useMemo(() => buildAlbumGroups(selectedArtistSongs, t), [selectedArtistSongs, t])
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

  return (
    <section className="page-panel artists-page">
      {error ? <div className="error-banner">{error}</div> : null}

      <aside className="artists-master">
        <div className="artists-search">
          <Icon name="search" />
          <input
            type="search"
            value={artistSearch}
            placeholder={t('artists.searchPlaceholder')}
            onChange={(event) => {
              setArtistSearch(event.currentTarget.value)
              setArtistScrollTop(0)
              if (artistListRef.current) {
                artistListRef.current.scrollTop = 0
              }
            }}
          />
        </div>

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
                  setSelectedArtistName(artist.name)
                }}
                onContextMenu={(event) => {
                  setSelectedArtistName(artist.name)
                  openGroupMenu(event, 'artist', artist.name, artist.songs)
                }}
              >
                <span className="artist-list-avatar">
                  <Icon name="users" />
                </span>
                <span className="artist-list-copy">
                  <strong>{artist.name}</strong>
                  <small>
                    {t('artists.artistSummary', {
                      albums: artist.albumCount,
                      songs: artist.songs.length,
                    })}
                  </small>
                </span>
              </button>
            </div>
          ))}
          {artistBottomSpacerHeight > 0 ? (
            <div className="artists-virtual-spacer" style={{ height: artistBottomSpacerHeight }} />
          ) : null}
        </div>
      </aside>

      <main className="artists-detail">
        {selectedArtist ? (
          <>
            <header className="artist-detail-header">
              <div>
                <h2>{selectedArtist.name}</h2>
                <p>
                  {t('artists.artistSummary', {
                    albums: selectedArtist.albumCount,
                    songs: selectedArtist.songs.length,
                  })}
                </p>
              </div>
              <button
                className="artist-more-button"
                type="button"
                title={t('detail.playArtist')}
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
            </header>

            <div className="artist-album-list">
              {selectedAlbums.map((album) => (
                <section className="artist-album-section" key={album.name}>
                  <header className="artist-album-header">
                    <AlbumArtwork title={album.name} artworkUrl={album.artworkUrl} />
                    <div className="artist-album-copy">
                      <Link to={`/albums/${encodeURIComponent(album.name)}`}>{album.name}</Link>
                      <p>
                        {t('artists.albumSummary', {
                          songs: album.songs.length,
                          duration: formatDuration(album.duration),
                        })}
                      </p>
                    </div>
                    <button
                      className="artist-album-more"
                      type="button"
                      title={album.name}
                      onClick={(event) => {
                        openGroupMenu(event, 'album', album.name, album.songs)
                      }}
                      onContextMenu={(event) => {
                        openGroupMenu(event, 'album', album.name, album.songs)
                      }}
                    >
                      <Icon name="moreHorizontal" />
                    </button>
                  </header>

                  <div className="artist-song-list">
                    {album.songs.map((song) => (
                      <PlaylistControlItem
                        key={song.id}
                        song={song}
                        t={t}
                        current={song.id === selectedTrackId}
                        isPlaying={isPlaying}
                        queueSongIds={selectedQueueSongIds}
                        onPlayTrack={onPlayTrack}
                        onTogglePlayPause={onTogglePlayPause}
                        onToggleFavorite={onToggleFavorite}
                        onAddToPlaylistClick={(contextSong, x, y) => {
                          setGroupMenu(null)
                          setSongContextMenu({
                            song: contextSong,
                            x,
                            y,
                          })
                        }}
                        onContextMenu={(contextSong, x, y) => {
                          setGroupMenu(null)
                          setSongContextMenu({
                            song: contextSong,
                            x,
                            y,
                          })
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>{t('collection.noArtists')}</h3>
            <p>{t('artists.emptyCopy')}</p>
          </div>
        )}
      </main>
      {groupMenu ? (
        <ArtistGroupContextMenu
          menu={groupMenu}
          playlists={playlists}
          t={t}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onClose={() => {
            setGroupMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onLocateArtist={(artistName) => {
            setSelectedArtistName(artistName)
            const artistIndex = visibleArtists.findIndex((artist) => artist.name === artistName)
            if (artistIndex > -1 && artistListRef.current) {
              artistListRef.current.scrollTo({ top: artistIndex * ARTIST_ROW_HEIGHT, behavior: 'smooth' })
            }
          }}
          onSeeAlbum={(albumName) => {
            navigate(`/albums/${encodeURIComponent(albumName)}`)
          }}
        />
      ) : null}
      {songContextMenu ? (
        <MusicMenuFlyout
          menu={songContextMenu}
          playlists={playlists}
          queueSongIds={selectedQueueSongIds}
          t={t}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => {
            setSongContextMenu(null)
          }}
          onPlayTrack={onPlayTrack}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
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
  onClose,
  onPlayTrack,
  onLocateArtist,
  onSeeAlbum,
}: {
  menu: GroupContextMenuState
  playlists: LibraryPlaylist[]
  t: Translator
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onClose: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onLocateArtist: (artistName: string) => void
  onSeeAlbum: (albumName: string) => void
}) {
  const songIds = useMemo(() => menu.songs.map((song) => song.id), [menu.songs])
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds,
    t,
    onAddToPlaylist: (playlistId) => {
      onAddSongsToPlaylist(playlistId, songIds)
    },
  })

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
            const shuffledSongIds = shuffleSongIds(songIds)
            onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
          },
        },
        ...(addToItem ? [addToItem] : []),
        menu.type === 'artist'
          ? {
              key: 'locate-artist',
              text: t('artists.locateArtist'),
              icon: 'nowPlaying',
              onClick: () => {
                onLocateArtist(menu.label)
              },
            }
          : {
              key: 'see-album',
              text: t('context.seeAlbum'),
              icon: 'albums',
              onClick: () => {
                onSeeAlbum(menu.label)
              },
            },
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

function buildArtistGroups(songs: LibrarySong[], t: Translator) {
  const groups = new Map<string, ArtistGroup>()

  for (const song of songs) {
    for (const rawArtist of getSongArtists(song)) {
      const artistName = rawArtist || t('common.artistUnknown')
      const group =
        groups.get(artistName) ?? {
          name: artistName,
          songs: [],
          albumCount: 0,
          artworkUrl: '',
        }

      group.songs.push(song)
      if (!group.artworkUrl && song.artworkUrl) {
        group.artworkUrl = song.artworkUrl
      }
      groups.set(artistName, group)
    }
  }

  return [...groups.values()]
    .map((artist) => ({
      ...artist,
      albumCount: new Set(artist.songs.map((song) => song.album || t('common.albumUnknown'))).size,
      songs: artist.songs.slice().sort((left, right) =>
        (left.album || '').localeCompare(right.album || '') || left.title.localeCompare(right.title),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
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

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function AlbumArtwork({ title, artworkUrl }: { title: string; artworkUrl: string }) {
  return (
    <ArtworkImage
      className="artist-album-artwork"
      src={artworkUrl}
      title={title}
      renderFallback={() => (
        <div className="artist-album-artwork artist-album-artwork-fallback" aria-hidden="true">
          <Icon name="albums" />
        </div>
      )}
    />
  )
}
