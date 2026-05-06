import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { IconName } from './icons'

export interface MenuFlyoutOption {
  showRemove?: boolean
  showSeeArtistsAndSeeAlbum?: boolean
  showMusicProperties?: boolean
  showSelect?: boolean
  showDelete?: boolean
}

export interface MenuFlyoutItem {
  key: string
  text: string
  pendingText?: string
  icon?: IconName
  disabled?: boolean
  separator?: boolean
  onClick?: () => void | Promise<void>
  submenu?: MenuFlyoutItem[]
}

export interface MenuFlyoutPosition {
  x: number
  y: number
}

export function getAddToPlaylistMenuFlyoutItem({
  playlists,
  songIds,
  t,
  onAddToPlaylist,
  key = 'add-to',
}: {
  playlists: LibraryPlaylist[]
  songIds: number[]
  t: Translator
  onAddToPlaylist: (playlistId: number) => void
  key?: string
}) {
  const addablePlaylists = playlists.filter(
    (playlist) => !playlist.isBuiltIn && songIds.some((songId) => !playlist.songIds.includes(songId)),
  )

  if (addablePlaylists.length === 0) {
    return null
  }

  return {
    key,
    text: t('context.addToPlaylist'),
    icon: 'plus',
    submenu: addablePlaylists.map((playlist) => ({
      key: `${key}-${playlist.id}`,
      text: playlist.name,
      icon: 'playlists',
      onClick: () => {
        onAddToPlaylist(playlist.id)
      },
    })),
  } satisfies MenuFlyoutItem
}

export function getMusicMenuFlyoutItems({
  song,
  option,
  playlists,
  queueSongIds,
  currentTrackId,
  isPlaying,
  t,
  onPlay,
  onPause,
  onPlayNext,
  onAddToPlaylist,
  onRemove,
  onSelect,
  onToggleFavorite,
  onReveal,
  onDelete,
  onSeeArtist,
  onSeeAlbum,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
}: {
  song: LibrarySong
  option?: MenuFlyoutOption
  playlists: LibraryPlaylist[]
  queueSongIds: number[]
  currentTrackId: number | null
  isPlaying: boolean
  t: Translator
  onPlay: () => void
  onPause: () => void
  onPlayNext: () => void
  onAddToPlaylist: (playlistId: number) => void
  onRemove: () => void
  onSelect: () => void
  onToggleFavorite: () => void
  onReveal: () => void | Promise<void>
  onDelete?: () => void
  onSeeArtist: () => void
  onSeeAlbum: () => void
  onSeeMusicInfo: () => void
  onSeeLyrics: () => void
  onSeeAlbumArt: () => void
}) {
  const normalizedOption: Required<MenuFlyoutOption> = {
    showRemove: option?.showRemove ?? false,
    showSeeArtistsAndSeeAlbum: option?.showSeeArtistsAndSeeAlbum ?? true,
    showMusicProperties: option?.showMusicProperties ?? true,
    showSelect: option?.showSelect ?? true,
    showDelete: option?.showDelete ?? true,
  }
  const songIndex = queueSongIds.indexOf(song.id)
  const currentIndex = currentTrackId == null ? -1 : queueSongIds.indexOf(currentTrackId)
  const items: MenuFlyoutItem[] = []

  items.push(
    songIndex > -1 && currentIndex === songIndex && isPlaying
      ? { key: 'pause', text: t('context.pause'), icon: 'pause', onClick: onPause }
      : { key: 'play', text: t('context.play'), icon: 'play', onClick: onPlay },
  )

  if (currentIndex === -1 || (currentIndex !== songIndex && currentIndex !== songIndex - 1)) {
    items.push({ key: 'play-next', text: t('context.playNext'), icon: 'next', onClick: onPlayNext })
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [song.id],
    t,
    onAddToPlaylist,
  })
  if (addToItem) {
    items.push(addToItem)
  }

  if (normalizedOption.showRemove) {
    items.push({ key: 'remove', text: t('context.removeFromList'), icon: 'close', onClick: onRemove })
  }

  if (normalizedOption.showSelect) {
    items.push({ key: 'select', text: t('context.select'), icon: 'menu', onClick: onSelect })
  }

  items.push({ key: 'favorite', text: song.favorite ? t('context.removeFavorite') : t('context.addFavorite'), icon: song.favorite ? 'heartFilled' : 'heart', onClick: onToggleFavorite })
  items.push({
    key: 'show-in-explorer',
    text: t('context.reveal'),
    pendingText: t('context.openingLocal'),
    icon: 'folder',
    onClick: onReveal,
  })

  if (normalizedOption.showDelete) {
    items.push({ key: 'delete', text: t('context.deleteFromDisk'), icon: 'songs', onClick: onDelete })
  }

  if (normalizedOption.showMusicProperties) {
    if (normalizedOption.showSeeArtistsAndSeeAlbum) {
      items.push({ key: 'see-artist', text: t('context.seeArtist'), icon: 'users', onClick: onSeeArtist })
      items.push({ key: 'see-album', text: t('context.seeAlbum'), icon: 'albums', onClick: onSeeAlbum })
    }
    items.push({ key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', onClick: onSeeMusicInfo })
    items.push({ key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'songs', onClick: onSeeLyrics })
    items.push({ key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'albums', onClick: onSeeAlbumArt })
  }

  return items
}

export function getShuffleMenuItems({
  songs,
  librarySongs,
  recentSongs,
  playlists,
  randomLimit,
  t,
  onPlaySongs,
}: {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  randomLimit: number
  t: Translator
  onPlaySongs: (songIds: number[]) => void
}) {
  const playSongs = (sourceSongs: LibrarySong[]) => {
    onPlaySongs(shuffleSongIds(sourceSongs).slice(0, randomLimit))
  }
  const groupsByArtist = new Map<string, LibrarySong[]>()
  const groupsByAlbum = new Map<string, LibrarySong[]>()
  const groupsByFolder = new Map<string, LibrarySong[]>()

  for (const song of librarySongs) {
    const artistName = song.artist || t('common.artistUnknown')
    groupsByArtist.set(artistName, [...(groupsByArtist.get(artistName) ?? []), song])
    const albumName = song.album || t('common.albumUnknown')
    groupsByAlbum.set(albumName, [...(groupsByAlbum.get(albumName) ?? []), song])
    const separatorIndex = Math.max(song.path.lastIndexOf('\\'), song.path.lastIndexOf('/'))
    const folderPath = separatorIndex >= 0 ? song.path.slice(0, separatorIndex) : song.path
    groupsByFolder.set(folderPath, [...(groupsByFolder.get(folderPath) ?? []), song])
  }

  const playlistSongById = new Map(librarySongs.map((song) => [song.id, song]))
  const playablePlaylists = playlists.filter((playlist) => playlist.songIds.length > 0)
  const randomGroup = (groups: Map<string, LibrarySong[]>) => {
    const values = [...groups.values()]
    return values[Math.floor(Math.random() * values.length)] ?? []
  }

  return [
    { key: 'quick', text: t('nowPlaying.quickPlay'), disabled: librarySongs.length === 0, onClick: () => playSongs(librarySongs) },
    { key: 'now-playing', text: t('common.nowPlaying'), disabled: songs.length === 0, onClick: () => playSongs(songs) },
    { key: 'library', text: t('random.musicLibrary'), disabled: librarySongs.length === 0, onClick: () => playSongs(librarySongs) },
    { key: 'artist', text: t('common.artist'), disabled: groupsByArtist.size === 0, onClick: () => playSongs(randomGroup(groupsByArtist)) },
    { key: 'album', text: t('common.album'), disabled: groupsByAlbum.size === 0, onClick: () => playSongs(randomGroup(groupsByAlbum)) },
    {
      key: 'playlist',
      text: t('common.playlists'),
      disabled: playablePlaylists.length === 0,
      onClick: () => {
        const playlist = playablePlaylists[Math.floor(Math.random() * playablePlaylists.length)]!
        const playlistSongs = playlist.songIds.map((songId) => playlistSongById.get(songId)!)
        onPlaySongs(shuffleSongIds(playlistSongs).slice(0, randomLimit))
      },
    },
    { key: 'folder', text: t('random.localFolder'), disabled: groupsByFolder.size === 0, onClick: () => playSongs(randomGroup(groupsByFolder)) },
    {
      key: 'recent-added',
      text: t('common.recentAdded'),
      disabled: librarySongs.length === 0,
      onClick: () => playSongs(librarySongs.slice().sort((left, right) => right.dateAdded.localeCompare(left.dateAdded)).slice(0, randomLimit)),
    },
    { key: 'recent-played', text: t('random.recentPlayed'), disabled: recentSongs.length === 0, onClick: () => playSongs(recentSongs) },
    {
      key: 'most-played',
      text: t('random.mostPlayed'),
      disabled: librarySongs.length <= randomLimit,
      onClick: () => playSongs(librarySongs.slice().sort((left, right) => right.playCount - left.playCount).slice(0, randomLimit)),
    },
    {
      key: 'least-played',
      text: t('random.leastPlayed'),
      disabled: librarySongs.length <= randomLimit,
      onClick: () => playSongs(librarySongs.slice().sort((left, right) => left.playCount - right.playCount).slice(0, randomLimit)),
    },
  ]
}

function shuffleSongIds(songs: LibrarySong[]) {
  const songIds = songs.map((song) => song.id)

  for (let index = songIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = songIds[index]
    songIds[index] = songIds[randomIndex]
    songIds[randomIndex] = current
  }

  return songIds
}
