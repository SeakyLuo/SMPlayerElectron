import type { LibraryFolder, LibraryPlaylist, LibrarySong, PreferenceEntityType, PreferenceItemSnapshot, PreferenceLevel, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { usePreferenceStore } from '../state/usePreferenceStore'
import {
  getParentPath,
  isSongDirectlyInFolder,
  randomAlbum,
  randomArtist,
  randomFolder,
  randomLeastPlayed,
  randomLibrary,
  randomMostPlayed,
  randomPlaylist,
  randomRecentAdded,
  randomRecentPlayed,
} from '../shared/RandomPlayHelper'
import type { IconName } from './icons'

export interface MenuFlyoutOption {
  showRemove?: boolean
  showSeeArtistsAndSeeAlbum?: boolean
  showMusicProperties?: boolean
  showSelect?: boolean
  showDelete?: boolean
  showHideFile?: boolean
  showPreference?: boolean
  showMoveToFolder?: boolean
  showAlbumArt?: boolean
}

export interface MenuFlyoutItem {
  key: string
  text: string
  pendingText?: string
  icon?: IconName
  disabled?: boolean
  separator?: boolean
  keepOpen?: boolean
  onClick?: () => void | Promise<void>
  submenu?: MenuFlyoutItem[]
}

export interface MenuFlyoutPosition {
  x: number
  y: number
}

const preferenceLevels: PreferenceLevel[] = ['do-not-appear', 'dislike', 'normal', 'high', 'higher', 'very-high']

export function getPreferenceMenuFlyoutItem({
  key = 'preference',
  type,
  itemId,
  name,
  preferenceItem,
  t,
  onUpdated,
  onSetPreference,
}: {
  key?: string
  type: PreferenceEntityType
  itemId: string
  name: string
  preferenceItem?: PreferenceItemSnapshot | null
  t: Translator
  onUpdated?: (snapshot?: PreferenceSettingsSnapshot | null) => void | Promise<void>
  onSetPreference?: (level: PreferenceLevel) => void | Promise<void>
}) {
  const submenu: MenuFlyoutItem[] = []

  if (preferenceItem) {
    submenu.push(
      {
        key: `${key}-undo`,
        text: t('preferences.undoPrefer'),
        onClick: () => {
          void usePreferenceStore.getState().removeItem(preferenceItem).then(() => onUpdated?.(usePreferenceStore.getState().snapshot))
        },
      },
      { key: `${key}-undo-separator`, text: '', separator: true },
    )
  }

  submenu.push(...preferenceLevels.map((level) => ({
    key: `${key}-${level}`,
    text: t(`preferences.level.${level}`),
    icon: preferenceItem?.level === level ? 'check' as const : undefined,
    onClick: () => {
      if (onSetPreference) {
        void Promise.resolve(onSetPreference(level)).then(() => onUpdated?.(usePreferenceStore.getState().snapshot))
        return
      }

      void usePreferenceStore.getState().addItem(type, itemId, name, level).then(onUpdated)
    },
  })))

  return {
    key,
    text: t('settings.preferenceSettings'),
    icon: 'star',
    submenu,
  } satisfies MenuFlyoutItem
}

export function getAddToPlaylistMenuFlyoutItem({
  playlists,
  songIds,
  t,
  defaultPlaylistName,
  currentPlaylistName,
  excludePlaylistName,
  includeNowPlaying,
  includeFavorites,
  onAddToNowPlaying,
  onToggleFavorite,
  onRequestCreatePlaylist,
  onCreatePlaylist,
  onAddToPlaylist,
  key = 'add-to',
}: {
  playlists: LibraryPlaylist[]
  songIds: number[]
  t: Translator
  defaultPlaylistName?: string
  currentPlaylistName?: string
  excludePlaylistName?: string
  includeNowPlaying?: boolean
  includeFavorites?: boolean
  onAddToNowPlaying?: () => void
  onToggleFavorite?: () => void
  onRequestCreatePlaylist?: () => void
  onCreatePlaylist?: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  key?: string
}) {
  const addablePlaylists = playlists.filter((playlist) => {
    if (playlist.isBuiltIn || playlist.name === (excludePlaylistName ?? currentPlaylistName)) {
      return false
    }

    if (songIds.length !== 1) {
      return true
    }

    const playlistSongIds = new Set(playlist.songIds)
    return !playlistSongIds.has(songIds[0]!)
  })
  const submenu: MenuFlyoutItem[] = []

  if (includeNowPlaying) {
    submenu.push({
      key: `${key}-now-playing`,
      text: t('common.nowPlaying'),
      icon: 'next',
      onClick: onAddToNowPlaying,
    })
  }

  if (includeFavorites && onToggleFavorite) {
    submenu.push({
      key: `${key}-favorites`,
      text: t('common.myFavorites'),
      icon: 'heart',
      onClick: onToggleFavorite,
    })
  }

  if ((includeNowPlaying || (includeFavorites && onToggleFavorite)) && (onCreatePlaylist || addablePlaylists.length > 0)) {
    submenu.push({ key: `${key}-built-in-separator`, text: '', separator: true })
  }

  if (onCreatePlaylist) {
    submenu.push({
      key: `${key}-new-playlist`,
      text: t('playlists.newPlaylist'),
      icon: 'plus',
      onClick: () => {
        if (onRequestCreatePlaylist) {
          onRequestCreatePlaylist()
          return
        }

        const name = window.prompt(t('playlists.newName'), defaultPlaylistName ?? t('playlists.newName'))
        const nextName = name?.trim()
        if (nextName) {
          onCreatePlaylist(nextName)
        }
      },
    })
  }

  submenu.push(...addablePlaylists.map((playlist) => ({
    key: `${key}-${playlist.id}`,
    text: playlist.name,
    icon: 'playlists' as const,
    onClick: () => {
      onAddToPlaylist(playlist.id)
    },
  })))

  if (submenu.length === 0) {
    return null
  }

  return {
    key,
    text: t('context.addToPlaylist'),
    icon: 'plus',
    submenu,
  } satisfies MenuFlyoutItem
}

export function getMusicMenuFlyoutItems({
  song,
  option,
  playlists,
  folders = [],
  currentPlaylistName,
  excludePlaylistName,
  queueSongIds,
  playbackSongIds,
  currentTrackId,
  currentTrackIndex,
  songIndex: targetSongIndex,
  isPlaying,
  t,
  onPlay,
  onPause,
  onPlayNext,
  onAddToNowPlaying,
  onCreatePlaylist,
  onAddToPlaylist,
  onRemove,
  onSelect,
  onToggleFavorite,
  onSetPreference,
  preferenceItem,
  onUndoPreference,
  onMoveToFolder,
  onReveal,
  onDelete,
  onHide,
  onSeeArtist,
  onSeeAlbum,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
}: {
  song: LibrarySong
  option?: MenuFlyoutOption
  playlists: LibraryPlaylist[]
  folders?: LibraryFolder[]
  currentPlaylistName?: string
  excludePlaylistName?: string
  queueSongIds: number[]
  playbackSongIds?: number[]
  currentTrackId: number | null
  currentTrackIndex?: number | null
  songIndex?: number
  isPlaying: boolean
  t: Translator
  onPlay: () => void
  onPause: () => void
  onPlayNext: () => void
  onAddToNowPlaying: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  onRemove: () => void
  onSelect: () => void
  onToggleFavorite: () => void
  onSetPreference: (level: 'do-not-appear' | 'dislike' | 'normal' | 'high' | 'higher' | 'very-high') => void
  preferenceItem?: PreferenceItemSnapshot | null
  onUndoPreference?: () => void
  onMoveToFolder?: (folderPath: string) => void | Promise<void>
  onReveal: () => void | Promise<void>
  onDelete?: () => void
  onHide: () => void | Promise<void>
  onSeeArtist: (artist: string) => void
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
    showHideFile: option?.showHideFile ?? false,
    showPreference: option?.showPreference ?? true,
    showMoveToFolder: option?.showMoveToFolder ?? false,
    showAlbumArt: option?.showAlbumArt ?? true,
  }
  const playbackQueueSongIds = playbackSongIds ?? queueSongIds
  const songIndex = targetSongIndex ?? queueSongIds.indexOf(song.id)
  const currentIndex =
    currentTrackIndex != null && currentTrackIndex > -1 && playbackQueueSongIds[currentTrackIndex] === currentTrackId
      ? currentTrackIndex
      : currentTrackId == null
        ? -1
        : playbackQueueSongIds.indexOf(currentTrackId)
  const items: MenuFlyoutItem[] = []

  items.push(
    songIndex > -1 && currentIndex === songIndex && isPlaying
      ? { key: 'pause', text: t('context.pause'), icon: 'pause', onClick: onPause }
      : { key: 'play', text: t('context.play'), icon: 'play', onClick: onPlay },
  )

  if (currentIndex !== -1 && currentIndex !== songIndex && currentIndex !== songIndex - 1) {
    items.push({ key: 'play-next', text: t('context.playNext'), icon: 'next', onClick: onPlayNext })
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [song.id],
    t,
    defaultPlaylistName: song.title,
    currentPlaylistName,
    excludePlaylistName: excludePlaylistName ?? currentPlaylistName,
    includeNowPlaying: currentPlaylistName !== t('common.nowPlaying'),
    includeFavorites: currentPlaylistName !== t('common.myFavorites') && !song.favorite,
    onAddToNowPlaying,
    onToggleFavorite,
    onCreatePlaylist: (name) => {
      onCreatePlaylist(name)
    },
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

  if (normalizedOption.showPreference) {
    const preferenceItems: MenuFlyoutItem[] = []

    if (preferenceItem && onUndoPreference) {
      preferenceItems.push(
        {
          key: 'preference-undo',
          text: t('preferences.undoPrefer'),
          onClick: onUndoPreference,
        },
        { key: 'preference-undo-separator', text: '', separator: true },
      )
    }

    for (const level of preferenceLevels) {
      preferenceItems.push({
        key: `preference-${level}`,
        text: t(`preferences.level.${level}`),
        icon: preferenceItem?.level === level ? 'check' : undefined,
        onClick: () => {
          onSetPreference(level)
        },
      })
    }

    items.push({
      key: 'preference',
      text: t('settings.preferenceSettings'),
      icon: 'star',
      submenu: preferenceItems,
    })
  }

  if (normalizedOption.showMoveToFolder && onMoveToFolder) {
    const moveToFolderItem = getMoveToFolderMenuFlyoutItem({
      folders,
      songPath: song.path,
      t,
      onMoveToFolder,
    })
    if (moveToFolderItem) {
      items.push(moveToFolderItem)
    }
  }

  items.push({
    key: 'show-in-explorer',
    text: t('context.reveal'),
    pendingText: t('context.openingLocal'),
    icon: 'local',
    onClick: onReveal,
  })

  if (normalizedOption.showDelete) {
    items.push({ key: 'delete', text: t('context.deleteFromDisk'), icon: 'trash', onClick: onDelete })
  }

  if (normalizedOption.showHideFile) {
    items.push({ key: 'hide-file', text: t('context.hideFile'), icon: 'close', onClick: onHide })
  }

  if (normalizedOption.showMusicProperties) {
    if (normalizedOption.showSeeArtistsAndSeeAlbum) {
      items.push({ key: 'see-artist', text: t('context.seeArtist'), icon: 'users', onClick: () => onSeeArtist(song.artist) })
      items.push({ key: 'see-album', text: t('context.seeAlbum'), icon: 'albums', onClick: onSeeAlbum })
    }
    items.push({ key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', keepOpen: true, onClick: onSeeMusicInfo })
    items.push({ key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'songs', keepOpen: true, onClick: onSeeLyrics })
    if (normalizedOption.showAlbumArt) {
      items.push({ key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'albums', keepOpen: true, onClick: onSeeAlbumArt })
    }
  }

  return items
}

function getMoveToFolderMenuFlyoutItem({
  folders,
  songPath,
  t,
  onMoveToFolder,
}: {
  folders: LibraryFolder[]
  songPath: string
  t: Translator
  onMoveToFolder: (folderPath: string) => void | Promise<void>
}) {
  const currentFolderPath = getParentPath(songPath)
  const targetFolders = folders.filter((folder) => folder.path !== currentFolderPath)

  if (targetFolders.length === 0) {
    return null
  }

  const childrenByParentId = new Map<number, LibraryFolder[]>()
  for (const folder of targetFolders) {
    childrenByParentId.set(folder.parentId, [...(childrenByParentId.get(folder.parentId) ?? []), folder])
  }

  const toItem = (folder: LibraryFolder): MenuFlyoutItem => {
    const children = (childrenByParentId.get(folder.id) ?? [])
      .slice()
      .sort((left, right) => getPathName(left.path).localeCompare(getPathName(right.path)))

    return {
      key: `move-folder-${folder.id}`,
      text: getPathName(folder.path),
      icon: 'folder',
      onClick: children.length === 0
        ? () => onMoveToFolder(folder.path)
        : undefined,
      submenu: children.length > 0
        ? [
            {
              key: `move-folder-${folder.id}-self`,
              text: getPathName(folder.path),
              icon: 'folder',
              onClick: () => onMoveToFolder(folder.path),
            },
            { key: `move-folder-${folder.id}-separator`, text: '', separator: true },
            ...children.map(toItem),
          ]
        : undefined,
    }
  }

  const roots = targetFolders
    .filter((folder) => folder.parentId === 0 || !targetFolders.some((item) => item.id === folder.parentId))
    .sort((left, right) => getPathName(left.path).localeCompare(getPathName(right.path)))

  return {
    key: 'move-to-folder',
    text: t('context.moveToFolder'),
    icon: 'folder',
    submenu: roots.map(toItem),
  } satisfies MenuFlyoutItem
}


function getPathName(path: string) {
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return separatorIndex > -1 ? path.slice(separatorIndex + 1) : path
}

export function getShuffleMenuItems({
  songs,
  librarySongs,
  recentSongs,
  playlists,
  folders,
  randomLimit,
  t,
  onPlaySongs,
  onQuickPlay,
}: {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  folders: LibraryFolder[]
  randomLimit: number
  t: Translator
  onPlaySongs: (songIds: number[]) => void
  onQuickPlay?: () => void | Promise<void>
}) {
  const playSongs = (sourceSongs: LibrarySong[]) => {
    onPlaySongs(randomLibrary(sourceSongs.map((song) => song.id), randomLimit))
  }

  const playableFolders = folders.filter((folder) => librarySongs.some((song) => isSongDirectlyInFolder(song, folder.path)))
  const playablePlaylists = playlists.filter((playlist) => playlist.songIds.length > 0)
  const items: MenuFlyoutItem[] = [
    { key: 'quick', text: t('nowPlaying.quickPlay'), onClick: onQuickPlay ?? (() => playSongs(librarySongs)) },
  ]

  if (songs.length > 0) {
    items.push(
      { key: 'now-playing-separator', text: '', separator: true },
      { key: 'now-playing', text: t('common.nowPlaying'), onClick: () => playSongs(songs) },
    )
  }

  if (librarySongs.length === 0) {
    return items
  }

  items.push(
    { key: 'shuffle-library-separator', text: '', separator: true },
    { key: 'library', text: t('random.musicLibrary'), onClick: () => playSongs(librarySongs) },
    { key: 'artist', text: t('common.artist'), onClick: () => onPlaySongs(randomArtist(librarySongs, randomLimit)) },
    { key: 'album', text: t('common.album'), onClick: () => onPlaySongs(randomAlbum(librarySongs, randomLimit)) },
  )

  if (playablePlaylists.length > 0) {
    items.push({
      key: 'playlist',
      text: t('common.playlist'),
      onClick: () => {
        onPlaySongs(randomPlaylist(librarySongs, playablePlaylists, randomLimit))
      },
    })
  }

  if (playableFolders.length > 0) {
    items.push({ key: 'folder', text: t('random.localFolder'), onClick: () => onPlaySongs(randomFolder(librarySongs, playableFolders, randomLimit)) })
  }

  items.push({
    key: 'recent-added',
    text: t('common.recentAdded'),
    onClick: () => onPlaySongs(randomRecentAdded(librarySongs, randomLimit)),
  })

  if (recentSongs.length > 0) {
    items.push({ key: 'recent-played', text: t('random.recentPlayed'), onClick: () => onPlaySongs(randomRecentPlayed(recentSongs)) })
  }

  if (librarySongs.length > randomLimit) {
    items.push(
      { key: 'shuffle-history-separator', text: '', separator: true },
      {
        key: 'most-played',
        text: t('random.mostPlayed'),
        onClick: () => onPlaySongs(randomMostPlayed(librarySongs, randomLimit)),
      },
      {
        key: 'least-played',
        text: t('random.leastPlayed'),
        onClick: () => onPlaySongs(randomLeastPlayed(librarySongs, randomLimit)),
      },
    )
  }

  return items
}
