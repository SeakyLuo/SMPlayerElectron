import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { GridViewHolder } from '../components/GridViewHolder'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import { MenuFlyout } from '../components/MenuFlyout'
import { getAddToPlaylistMenuFlyoutItem, getPreferenceMenuFlyoutItem, type MenuFlyoutItem } from '../components/MenuFlyoutHelper'
import type { LibraryPlaylist, LibrarySnapshot, PlaylistSortCriterion, PreferenceItemSnapshot, PreferenceLevel } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface PlaylistsPageProps {
  snapshot: LibrarySnapshot
  t: Translator
  selectedTrackId: number | null
  isPlaying: boolean
  searchQuery: string
  error: string | null
  initialPlaylistId: number
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onTogglePlayPause: () => void
  onSelectPlaylist: (playlistId: number) => void
  onDeletePlaylist: (playlistId: number) => void
  onRenamePlaylist: (playlistId: number, name: string) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onSetPlaylistPreferred: (playlistId: number, name: string, level: PreferenceLevel) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRemoveSongsFromPlaylist: (playlistId: number, songIds: number[]) => void
  onReorderPlaylistSongs: (playlistId: number, songIds: number[], sortCriterion?: PlaylistSortCriterion) => void
}

function movePlaylist(playlistIds: number[], playlistId: number, offset: -1 | 1) {
  const currentIndex = playlistIds.findIndex((value) => value === playlistId)
  const nextPlaylistIds = playlistIds.slice()
  ;[nextPlaylistIds[currentIndex], nextPlaylistIds[currentIndex + offset]] = [
    nextPlaylistIds[currentIndex + offset],
    nextPlaylistIds[currentIndex],
  ]

  return nextPlaylistIds
}

export function PlaylistsPage({
  snapshot,
  t,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
  initialPlaylistId,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onPlayNext,
  onTogglePlayPause,
  onSelectPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onCreatePlaylistWithSongs,
  onAddSongsToNowPlaying,
  onReorderPlaylists,
  onSetPlaylistPreferred,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  onReorderPlaylistSongs,
}: PlaylistsPageProps) {
  const navigate = useNavigate()
  const params = useParams()
  const [playlistMenu, setPlaylistMenu] = useState<{ playlist: LibraryPlaylist; x: number; y: number } | null>(null)
  const [playlistPreferenceItems, setPlaylistPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const routePlaylistId = params.playlistId ? Number(params.playlistId) : null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const visiblePlaylists = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return snapshot.playlists
    }

    return snapshot.playlists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedSearchQuery))
  }, [searchQuery, snapshot.playlists])
  const selectedPlaylistId =
    routePlaylistId != null && snapshot.playlists.some((playlist) => playlist.id === routePlaylistId)
      ? routePlaylistId
      : snapshot.playlists.some((playlist) => playlist.id === initialPlaylistId)
        ? initialPlaylistId
        : (snapshot.playlists[0]?.id ?? 0)
  const selectedPlaylist = snapshot.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const customPlaylistIds = snapshot.playlists
    .filter((playlist) => !playlist.isBuiltIn)
    .map((playlist) => playlist.id)
  const selectedPlaylistSongs = useMemo(
    () =>
      (selectedPlaylist?.songIds ?? [])
        .map((songId) => songsById.get(songId))
        .filter((song) => song !== undefined),
    [selectedPlaylist?.songIds, songsById],
  )
  const filteredPlaylistSongs = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return selectedPlaylistSongs
    }

    return selectedPlaylistSongs.filter((song) =>
      [song.title, song.artist, ...song.artists, song.album].join(' ').toLocaleLowerCase().includes(normalizedSearchQuery),
    )
  }, [searchQuery, selectedPlaylistSongs])
  const refreshPlaylistPreferenceItems = async () => {
    const settings = await window.smplayer!.getPreferenceSettings()
    setPlaylistPreferenceItems(new Map([...settings.playlists, ...settings.others].map((item) => [`${item.type}:${item.itemId}`, item])))
  }

  useEffect(() => {
    void window.smplayer!.getPreferenceSettings().then((settings) => {
      setPlaylistPreferenceItems(new Map([...settings.playlists, ...settings.others].map((item) => [`${item.type}:${item.itemId}`, item])))
    })
  }, [])

  if (routePlaylistId != null && selectedPlaylist) {
    return (
      <section className="page-panel immersive-detail-page">
        {error ? <div className="error-banner">{error}</div> : null}
        <HeaderedPlaylistControl
          type={selectedPlaylist.isBuiltIn ? 'favorites' : 'playlist'}
          title={selectedPlaylist.name}
          headerSongs={selectedPlaylistSongs}
          t={t}
          songs={filteredPlaylistSongs}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          playlists={snapshot.playlists}
          artworkUrl={selectedPlaylistSongs.find((song) => song.artworkUrl)?.artworkUrl ?? ''}
          removable
          showAlbum
          showArtist
          canRename={!selectedPlaylist.isBuiltIn}
          canDelete={!selectedPlaylist.isBuiltIn}
          canClear={selectedPlaylistSongs.length > 0}
          canSetPreferred
          sortCriterion={selectedPlaylist.sortCriterion}
          preferenceType={selectedPlaylist.isBuiltIn ? 'my-favorites' : 'playlist'}
          preferenceItemId={selectedPlaylist.isBuiltIn ? '6' : String(selectedPlaylist.id)}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onPlayNext={onPlayNext}
          onTogglePlayPause={onTogglePlayPause}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onAddSongsToPlaylist={onAddSongsToPlaylist}
          onRemoveSongs={(songIds) => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, songIds)
          }}
          onRename={(name) => {
            onRenamePlaylist(selectedPlaylist.id, name)
          }}
          onDelete={() => {
            onDeletePlaylist(selectedPlaylist.id)
            navigate('/playlists')
          }}
          onClear={() => {
            onRemoveSongsFromPlaylist(selectedPlaylist.id, selectedPlaylistSongs.map((song) => song.id))
          }}
          onSetPreferred={(level) => {
            onSetPlaylistPreferred(selectedPlaylist.id, selectedPlaylist.name, level)
          }}
          onSortSongs={(songIds, sortCriterion) => {
            onReorderPlaylistSongs(selectedPlaylist.id, songIds, sortCriterion)
          }}
          onArtistClick={(artist) => {
            navigate(`/artists/${encodeURIComponent(artist)}`)
          }}
          onAlbumClick={(album) => {
            navigate(`/albums/${encodeURIComponent(album)}`)
          }}
        />
      </section>
    )
  }

  return (
    <section className="playlists-page page-panel">
      <header className="playlists-header">
        <h2>{t('common.playlists')}</h2>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {visiblePlaylists.length === 0 ? (
        <div className="empty-state compact">
          <h3>{t('playlists.none')}</h3>
          <p>{t('playlists.noneCopy')}</p>
        </div>
      ) : (
        <div className="grid-view-holder-grid">
          {visiblePlaylists.map((playlist) => {
            const playlistSongs = playlist.songIds
              .map((songId) => songsById.get(songId))
              .filter((song) => song !== undefined)
            const customPlaylistIndex = customPlaylistIds.indexOf(playlist.id)
            const canMovePlaylistUp = customPlaylistIndex > 0
            const canMovePlaylistDown =
              customPlaylistIndex >= 0 && customPlaylistIndex < customPlaylistIds.length - 1

            return (
              <GridViewHolder
                key={playlist.id}
                playlist={playlist}
                songs={playlistSongs}
                selected={playlist.id === selectedPlaylistId}
                t={t}
                canMoveUp={canMovePlaylistUp}
                canMoveDown={canMovePlaylistDown}
                onOpen={() => {
                  navigate(`/playlists/${playlist.id}`)
                  onSelectPlaylist(playlist.id)
                }}
                onPlay={() => {
                  const [firstSong] = playlistSongs
                  if (firstSong) {
                    onPlayTrack(firstSong.id, playlistSongs.map((song) => song.id))
                  }
                }}
                onMoveUp={() => {
                  onReorderPlaylists(movePlaylist(customPlaylistIds, playlist.id, -1))
                }}
                onMoveDown={() => {
                  onReorderPlaylists(movePlaylist(customPlaylistIds, playlist.id, 1))
                }}
                onContextMenu={(x, y) => {
                  setPlaylistMenu({ playlist, x, y })
                }}
              />
            )
          })}
        </div>
      )}
      {playlistMenu ? (
        <MenuFlyout
          position={playlistMenu}
          onClose={() => {
            setPlaylistMenu(null)
          }}
          items={getPlaylistCardMenuItems({
            playlist: playlistMenu.playlist,
            playlists: snapshot.playlists,
            favoritePlaylist: snapshot.playlists.find((playlist) => playlist.isBuiltIn)!,
            t,
            onPlayTrack,
            onAddSongsToNowPlaying,
            onCreatePlaylistWithSongs,
            onAddSongsToPlaylist,
            preferenceItem: playlistPreferenceItems.get(`${playlistMenu.playlist.isBuiltIn ? 'my-favorites' : 'playlist'}:${playlistMenu.playlist.isBuiltIn ? '6' : String(playlistMenu.playlist.id)}`) ?? null,
            onPreferenceChanged: refreshPlaylistPreferenceItems,
            onRenamePlaylist,
            onDeletePlaylist,
          })}
        />
      ) : null}
    </section>
  )
}

function getPlaylistCardMenuItems({
  playlist,
  playlists,
  favoritePlaylist,
  t,
  onPlayTrack,
  onAddSongsToNowPlaying,
  onCreatePlaylistWithSongs,
  onAddSongsToPlaylist,
  preferenceItem,
  onPreferenceChanged,
  onRenamePlaylist,
  onDeletePlaylist,
}: {
  playlist: LibraryPlaylist
  playlists: LibraryPlaylist[]
  favoritePlaylist: LibraryPlaylist
  t: Translator
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onAddSongsToNowPlaying: (songIds: number[]) => void
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  preferenceItem: PreferenceItemSnapshot | null
  onPreferenceChanged: () => void | Promise<void>
  onRenamePlaylist: (playlistId: number, name: string) => void
  onDeletePlaylist: (playlistId: number) => void
}) {
  const items: MenuFlyoutItem[] = [
    {
      key: 'shuffle',
      text: t('nowPlaying.randomPlay'),
      icon: 'shuffle',
      disabled: playlist.songIds.length === 0,
      onClick: () => {
        const shuffledSongIds = shuffleSongIds(playlist.songIds)
        onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
      },
    },
  ]
  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: playlist.songIds,
    t,
    defaultPlaylistName: playlist.name,
    currentPlaylistName: playlist.name,
    includeNowPlaying: true,
    includeFavorites: playlist.name !== t('common.myFavorites'),
    onAddToNowPlaying: () => {
      onAddSongsToNowPlaying(playlist.songIds)
    },
    onToggleFavorite: () => {
      onAddSongsToPlaylist(favoritePlaylist.id, playlist.songIds)
    },
    onCreatePlaylist: (name) => {
      onCreatePlaylistWithSongs(name, playlist.songIds)
    },
    onAddToPlaylist: (playlistId) => {
      onAddSongsToPlaylist(playlistId, playlist.songIds)
    },
  })

  if (addToItem) {
    items.push(addToItem)
  }

  items.push(getPreferenceMenuFlyoutItem({
    type: playlist.isBuiltIn ? 'my-favorites' : 'playlist',
    itemId: playlist.isBuiltIn ? '6' : String(playlist.id),
    name: playlist.name,
    preferenceItem,
    t,
    onUpdated: onPreferenceChanged,
  }))

  if (!playlist.isBuiltIn) {
    items.push(
      {
        key: 'rename-playlist',
        text: t('playlists.rename'),
        icon: 'info',
        onClick: () => {
          const name = window.prompt(t('playlists.rename'), playlist.name)
          const nextName = name?.trim()
          if (nextName) {
            onRenamePlaylist(playlist.id, nextName)
          }
        },
      },
      {
        key: 'duplicate-playlist',
        text: t('playlists.duplicate'),
        icon: 'copy',
        onClick: () => {
          onCreatePlaylistWithSongs(getNextPlaylistName(playlist.name, playlists), playlist.songIds)
        },
      },
      {
        key: 'delete-playlist',
        text: t('playlists.delete'),
        icon: 'trash',
        onClick: () => {
          onDeletePlaylist(playlist.id)
        },
      },
    )
  }

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

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  const existingNames = new Set(playlists.map((playlist) => playlist.name))
  for (let index = 2; ; index += 1) {
    const nextName = `${name} (${index})`
    if (!existingNames.has(nextName)) {
      return nextName
    }
  }
}
