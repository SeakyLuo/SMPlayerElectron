import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { GridViewHolder } from '../components/GridViewHolder'
import { HeaderedPlaylistControl } from '../components/HeaderedPlaylistControl'
import { Icon } from '../components/icons'
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

function reorderPlaylistByDrop(playlistIds: number[], draggedPlaylistId: number, targetPlaylistId: number, insertAfter: boolean) {
  const nextPlaylistIds = playlistIds.filter((playlistId) => playlistId !== draggedPlaylistId)
  const targetIndex = nextPlaylistIds.indexOf(targetPlaylistId)
  nextPlaylistIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedPlaylistId)
  return nextPlaylistIds
}

export function PlaylistsPage({
  snapshot,
  t,
  selectedTrackId,
  isPlaying,
  searchQuery,
  error,
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
  const draggedPlaylistIdRef = useRef<number | null>(null)
  const [playlistMenu, setPlaylistMenu] = useState<{ playlist: LibraryPlaylist; x: number; y: number } | null>(null)
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<number | null>(null)
  const [previewPlaylistIds, setPreviewPlaylistIds] = useState<number[] | null>(null)
  const [playlistPreferenceItems, setPlaylistPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [pendingCreatedPlaylistName, setPendingCreatedPlaylistName] = useState('')
  const routePlaylistId = params.playlistId ? Number(params.playlistId) : null
  const songsById = useMemo(
    () => new Map(snapshot.songs.map((song) => [song.id, song])),
    [snapshot.songs],
  )
  const visiblePlaylists = useMemo(() => {
    const customPlaylists = snapshot.playlists.filter((playlist) => !playlist.isBuiltIn)
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedSearchQuery) {
      return customPlaylists
    }

    return customPlaylists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedSearchQuery))
  }, [searchQuery, snapshot.playlists])
  const selectedPlaylistId =
    routePlaylistId != null && snapshot.playlists.some((playlist) => playlist.id === routePlaylistId)
      ? routePlaylistId
      : 0
  const selectedPlaylist = snapshot.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const customPlaylistIds = snapshot.playlists
    .filter((playlist) => !playlist.isBuiltIn)
    .map((playlist) => playlist.id)
  const orderedVisiblePlaylists = useMemo(() => {
    const visiblePlaylistMap = new Map(visiblePlaylists.map((playlist) => [playlist.id, playlist]))
    const orderedIds = previewPlaylistIds ?? customPlaylistIds
    return orderedIds
      .map((playlistId) => visiblePlaylistMap.get(playlistId))
      .filter((playlist) => playlist !== undefined)
  }, [customPlaylistIds, previewPlaylistIds, visiblePlaylists])
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

  useEffect(() => {
    if (!pendingCreatedPlaylistName) {
      return
    }

    const playlist = snapshot.playlists.find((item) => item.name === pendingCreatedPlaylistName)
    if (playlist) {
      navigate(`/playlists/${playlist.id}`)
      onSelectPlaylist(playlist.id)
      setPendingCreatedPlaylistName('')
    }
  }, [navigate, onSelectPlaylist, pendingCreatedPlaylistName, snapshot.playlists])

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
      <div className="now-playing-commandbar playlists-commandbar">
        <button
          type="button"
          className="now-playing-command"
          onClick={() => {
            setIsCreateDialogOpen(true)
          }}
        >
          <Icon name="plus" />
          {t('playlists.newName')}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {orderedVisiblePlaylists.length === 0 ? (
        <div className="empty-state compact">
          <h3>{t('playlists.none')}</h3>
          <p>{t('playlists.noneCopy')}</p>
        </div>
      ) : (
        <div className="grid-view-holder-grid">
          {orderedVisiblePlaylists.map((playlist) => {
            const playlistSongs = playlist.songIds
              .map((songId) => songsById.get(songId))
              .filter((song) => song !== undefined)

            return (
              <Fragment key={playlist.id}>
                {draggingPlaylistId === playlist.id ? (
                  <div
                    className="grid-view-holder-drop-target"
                    aria-hidden="true"
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const nextPlaylistIds = previewPlaylistIds ?? customPlaylistIds
                      draggedPlaylistIdRef.current = null
                      setDraggingPlaylistId(null)
                      setPreviewPlaylistIds(null)
                      onReorderPlaylists(nextPlaylistIds)
                    }}
                  >
                    <Icon name="plus" />
                    <span>{t('playlists.dropHere')}</span>
                  </div>
                ) : null}
                <GridViewHolder
                  playlist={playlist}
                  songs={playlistSongs}
                  selected={false}
                  dragging={draggingPlaylistId === playlist.id}
                  t={t}
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
                  onDragStart={(event) => {
                    draggedPlaylistIdRef.current = playlist.id
                    setDraggingPlaylistId(playlist.id)
                    setPreviewPlaylistIds(customPlaylistIds)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('application/x-smplayer-playlist-id', String(playlist.id))
                    event.dataTransfer.setData('text/plain', String(playlist.id))
                  }}
                  onDragEnd={() => {
                    draggedPlaylistIdRef.current = null
                    setDraggingPlaylistId(null)
                    setPreviewPlaylistIds(null)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    const draggedPlaylistId = draggedPlaylistIdRef.current
                    if (draggedPlaylistId === null || draggedPlaylistId === playlist.id) {
                      return
                    }
                    const targetRect = event.currentTarget.getBoundingClientRect()
                    const insertAfter = event.clientX > targetRect.left + targetRect.width / 2
                    setPreviewPlaylistIds((current) => reorderPlaylistByDrop(current ?? customPlaylistIds, draggedPlaylistId, playlist.id, insertAfter))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const nextPlaylistIds = previewPlaylistIds ?? customPlaylistIds
                    draggedPlaylistIdRef.current = null
                    setDraggingPlaylistId(null)
                    setPreviewPlaylistIds(null)
                    onReorderPlaylists(nextPlaylistIds)
                  }}
                  onContextMenu={(x, y) => {
                    setPlaylistMenu({ playlist, x, y })
                  }}
                />
              </Fragment>
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
      {isCreateDialogOpen ? (
        <PlaylistNameDialog
          t={t}
          playlists={snapshot.playlists}
          defaultName={getNextPlaylistName(t('common.playlist'), snapshot.playlists, t)}
          onCancel={() => {
            setIsCreateDialogOpen(false)
          }}
          onConfirm={(name) => {
            setIsCreateDialogOpen(false)
            setPendingCreatedPlaylistName(name)
            onCreatePlaylistWithSongs(name, [])
          }}
        />
      ) : null}
    </section>
  )
}

function PlaylistNameDialog({
  t,
  playlists,
  defaultName,
  onCancel,
  onConfirm,
}: {
  t: Translator
  playlists: LibraryPlaylist[]
  defaultName: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const nextName = name.trim()
    const validationError = validatePlaylistName(nextName, playlists, t)
    if (validationError) {
      setError(validationError)
      return
    }

    onConfirm(nextName)
  }

  return (
    <div className="playlist-name-dialog-overlay" role="presentation">
      <section className="playlist-name-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-name-dialog-title">
        <h3 id="playlist-name-dialog-title">{t('playlists.createNew')}</h3>
        <input
          ref={inputRef}
          type="text"
          value={name}
          placeholder={t('playlists.namePlaceholder')}
          onChange={(event) => {
            setName(event.currentTarget.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              confirm()
            } else if (event.key === 'Escape') {
              onCancel()
            }
          }}
        />
        {error ? <p className="playlist-name-dialog-error">{error}</p> : null}
        <div className="playlist-name-dialog-actions">
          <button type="button" className="playlist-name-dialog-primary" onClick={confirm}>
            {t('common.confirm')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
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
          onCreatePlaylistWithSongs(getNextPlaylistName(playlist.name, playlists, t), playlist.songIds)
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

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  const existingNames = new Set(playlists.map((playlist) => playlist.name))
  if (!existingNames.has(name)) {
    return name
  }

  for (let index = 1; ; index += 1) {
    const nextName = t('playlists.nameTemplate', { name, index })
    if (!existingNames.has(nextName)) {
      return nextName
    }
  }
}

function validatePlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  if (!name) {
    return t('playlists.nameEmpty')
  }

  if (name.length > 50) {
    return t('playlists.nameTooLong')
  }

  if (playlists.some((playlist) => playlist.name === name)) {
    return t('playlists.nameUsed')
  }

  if (name.includes('+++++') || name.includes('{0}') || name.includes('{1}')) {
    return t('playlists.nameSpecial')
  }

  return ''
}
