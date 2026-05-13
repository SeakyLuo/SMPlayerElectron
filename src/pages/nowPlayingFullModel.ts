import { getVolumeIconName } from '../components/volumeIcon'
import {
  getAddToPlaylistMenuFlyoutItem,
  getPreferenceMenuFlyoutItem,
  getShuffleMenuItems,
  type MenuFlyoutItem,
  type MenuFlyoutPosition,
} from '../components/MenuFlyoutHelper'
import type {
  LibraryFolder,
  LibraryPlaylist,
  LibrarySong,
  PlaybackMode,
  PreferenceItemSnapshot,
} from '../shared/contracts'
import type { Translator } from '../shared/i18n'

export const QUICK_PLAY_LIMIT = 100

export interface NowPlayingSongMenuState {
  song: LibrarySong
  queueIndex: number
  x: number
  y: number
}

export interface NowPlayingAddToMenuState extends MenuFlyoutPosition {
  songIds: number[]
  defaultPlaylistName: string
}

function getPlaybackModeName(t: Translator, mode: PlaybackMode) {
  switch (mode) {
    case 'shuffle':
      return t('player.playbackModeShuffle')
    case 'repeat':
      return t('player.playbackModeRepeat')
    case 'repeat-one':
      return t('player.playbackModeRepeatOne')
    default:
      return t('player.playbackModeList')
  }
}

function getPlaybackModeIcon(mode: PlaybackMode): NonNullable<MenuFlyoutItem['icon']> {
  switch (mode) {
    case 'shuffle':
      return 'shuffle'
    case 'repeat':
      return 'repeat'
    case 'repeat-one':
      return 'repeatOne'
    default:
      return 'nowPlaying'
  }
}

function getPlaybackModeMenuItems(t: Translator, mode: PlaybackMode, setPlaybackMode: (mode: PlaybackMode) => void): MenuFlyoutItem[] {
  return [
    { key: 'playback-mode-list', text: getPlaybackModeName(t, 'once'), icon: 'nowPlaying', checked: mode === 'once', onClick: () => setPlaybackMode('once') },
    { key: 'playback-mode-shuffle', text: getPlaybackModeName(t, 'shuffle'), icon: 'shuffle', checked: mode === 'shuffle', onClick: () => setPlaybackMode('shuffle') },
    { key: 'playback-mode-repeat', text: getPlaybackModeName(t, 'repeat'), icon: 'repeat', checked: mode === 'repeat', onClick: () => setPlaybackMode('repeat') },
    { key: 'playback-mode-repeat-one', text: getPlaybackModeName(t, 'repeat-one'), icon: 'repeatOne', checked: mode === 'repeat-one', onClick: () => setPlaybackMode('repeat-one') },
  ]
}

export function getNowPlayingFullMoreItems({
  currentSong,
  songs,
  librarySongs,
  recentSongs,
  folders,
  playlists,
  preferenceItem,
  t,
  onQuickPlay,
  onPlaySongs,
  onSavePlaylist,
  onClearQueue,
  onPlayAlbum,
  onPlayArtist,
  onAddToNowPlaying,
  onCreatePlaylist,
  onAddToPlaylist,
  onToggleFavorite,
  mode,
  volume,
  isMuted,
  isCompact,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
  onPreferenceChanged,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
}: {
  currentSong: LibrarySong | null
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  folders: LibraryFolder[]
  playlists: LibraryPlaylist[]
  preferenceItem: PreferenceItemSnapshot | null
  t: Translator
  onQuickPlay: () => void | Promise<void>
  onPlaySongs: (songIds: number[]) => void
  onSavePlaylist: () => void
  onClearQueue: () => void
  onPlayAlbum: () => void
  onPlayArtist: () => void
  onAddToNowPlaying: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  onToggleFavorite: () => void
  mode: PlaybackMode
  volume: number
  isMuted: boolean
  isCompact: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
  onPreferenceChanged: () => void | Promise<void>
  onSeeMusicInfo: () => void
  onSeeLyrics: () => void
  onSeeAlbumArt: () => void
}) {
  const volumeValue = Math.min(Math.max(volume, 0), 100)

  const setPlaybackMode = (targetMode: PlaybackMode) => {
    if (mode === targetMode) {
      return
    }

    if (targetMode === 'shuffle') {
      onToggleShuffle()
    } else if (targetMode === 'repeat') {
      onToggleRepeat()
    } else if (targetMode === 'repeat-one') {
      onToggleRepeatOne()
    } else if (mode === 'shuffle') {
      onToggleShuffle()
    } else if (mode === 'repeat') {
      onToggleRepeat()
    } else if (mode === 'repeat-one') {
      onToggleRepeatOne()
    }
  }

  const items: MenuFlyoutItem[] = [
    { key: 'quick-play', text: t('nowPlaying.quickPlay'), icon: 'play', onClick: onQuickPlay },
    {
      key: 'random-play',
      text: t('nowPlaying.randomPlay'),
      icon: 'shuffle',
      disabled: songs.length === 0 && librarySongs.length === 0,
      submenu: getShuffleMenuItems({
        songs,
        librarySongs,
        recentSongs,
        playlists,
        folders,
        randomLimit: QUICK_PLAY_LIMIT,
        t,
        onPlaySongs,
        onQuickPlay,
      }),
    },
  ]

  if (isCompact) {
    items.push(
      {
        key: 'playback-mode',
        text: `${t('player.playbackMode')}: ${getPlaybackModeName(t, mode)}`,
        icon: getPlaybackModeIcon(mode),
        submenu: getPlaybackModeMenuItems(t, mode, setPlaybackMode),
      },
      {
        key: 'player-volume',
        text: t('player.volume'),
        icon: getVolumeIconName(volumeValue, isMuted),
        kind: 'volume',
        keepOpen: true,
        volumeValue,
        volumeMuted: isMuted,
        onVolumeChange,
        onToggleMute,
      },
      {
        key: 'player-favorite',
        text: currentSong?.favorite ? t('player.unlike') : t('player.like'),
        icon: currentSong?.favorite ? 'heartFilled' : 'heart',
        ...(currentSong?.favorite ? { iconTone: 'favorite' as const } : {}),
        disabled: !currentSong,
        onClick: onToggleFavorite,
      },
    )
  }

  items.push(
    { key: 'save-playlist', text: t('nowPlaying.savePlaylist'), icon: 'plus', onClick: onSavePlaylist },
    { key: 'clear-now-playing', text: t('nowPlaying.clearNowPlaying'), icon: 'close', onClick: onClearQueue },
  )

  if (!currentSong) {
    return items
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [currentSong.id],
    t,
    defaultPlaylistName: currentSong.title,
    includeNowPlaying: true,
    includeFavorites: !isCompact && !currentSong.favorite,
    onAddToNowPlaying,
    onToggleFavorite,
    onCreatePlaylist,
    onAddToPlaylist,
  })

  if (addToItem) {
    items.push({ key: 'current-song-separator', text: '', separator: true }, addToItem)
  }

  const viewItems: MenuFlyoutItem[] = [
    { key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', keepOpen: true, onClick: onSeeMusicInfo },
    { key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'lyrics', keepOpen: true, onClick: onSeeLyrics },
    { key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'pictures', keepOpen: true, onClick: onSeeAlbumArt },
  ]

  items.push(
    getPreferenceMenuFlyoutItem({
      type: 'song',
      itemId: String(currentSong.id),
      name: currentSong.title,
      preferenceItem,
      t,
      onUpdated: onPreferenceChanged,
    }),
    { key: 'play-artist', text: t('detail.playArtist'), icon: 'users', onClick: onPlayArtist },
    { key: 'play-album', text: t('detail.playAlbum'), icon: 'albums', onClick: onPlayAlbum },
    {
      key: 'view',
      text: t('context.view'),
      icon: 'view',
      submenu: viewItems,
    },
  )

  return items
}

export function getDefaultNewPlaylistName(t: Translator, playlists: LibraryPlaylist[]) {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return getNextPlaylistName(`${t('common.nowPlaying')} - ${year}/${month}/${day}`, playlists)
}

export function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  const playlistNames = new Set(playlists.map((playlist) => playlist.name))
  const siblingCount = playlists.filter((playlist) => playlist.name.startsWith(name)).length
  for (let index = 1; index <= siblingCount; index += 1) {
    const nextName = `${name} (${index})`
    if (!playlistNames.has(nextName)) {
      return nextName
    }
  }

  return name
}

export function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

export async function refreshSongPreferenceItem(songId: number, setPreferenceItem: (item: PreferenceItemSnapshot | null) => void) {
  const settings = await window.smplayer!.getPreferenceSettings()
  setPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
}

export function getCurrentClockMinute() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function isMinuteInNightRange(current: number, start: number, end: number) {
  if (start < end) {
    return current >= start && current < end
  }

  return current >= start || current < end
}
