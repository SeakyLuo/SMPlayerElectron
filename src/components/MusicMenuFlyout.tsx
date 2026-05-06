import { useNavigate } from 'react-router-dom'

import type { LibraryPlaylist, LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { MenuFlyout } from './MenuFlyout'
import { getMusicMenuFlyoutItems } from './MenuFlyoutHelper'

export interface MusicMenuFlyoutState {
  song: LibrarySong
  x: number
  y: number
}

interface MusicMenuFlyoutProps {
  menu: MusicMenuFlyoutState
  playlists: LibraryPlaylist[]
  queueSongIds: number[]
  t: Translator
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onClose: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onPlayNext: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
}

export function MusicMenuFlyout({
  menu,
  playlists,
  queueSongIds,
  t,
  onAddSongToPlaylist,
  onClose,
  onPlayTrack,
  onPlayNext,
  onRevealSong,
  onDeleteSongFromDisk,
  onToggleFavorite,
}: MusicMenuFlyoutProps) {
  const navigate = useNavigate()

  return (
    <MenuFlyout
      position={menu}
      onClose={onClose}
      items={getMusicMenuFlyoutItems({
        song: menu.song,
        option: {
          showMusicProperties: false,
          showSelect: false,
        },
        playlists,
        queueSongIds,
        currentTrackId: null,
        isPlaying: false,
        t,
        onPlay: () => {
          onPlayTrack(menu.song.id, queueSongIds)
        },
        onPause: () => {},
        onPlayNext: () => {
          onPlayNext(menu.song.id)
        },
        onAddToPlaylist: (playlistId) => {
          onAddSongToPlaylist(playlistId, menu.song.id)
        },
        onRemove: () => {},
        onSelect: () => {},
        onToggleFavorite: () => {
          onToggleFavorite(menu.song.id, !menu.song.favorite)
        },
        onReveal: () => {
          onRevealSong(menu.song.path)
        },
        onDelete: () => {
          onDeleteSongFromDisk(menu.song.id)
        },
        onSeeArtist: () => {
          navigate(`/artists/${encodeURIComponent(menu.song.artists[0] || menu.song.artist)}`)
        },
        onSeeAlbum: () => {
          navigate(`/albums/${encodeURIComponent(menu.song.album || t('common.albumUnknown'))}`)
        },
        onSeeMusicInfo: () => {},
        onSeeLyrics: () => {},
        onSeeAlbumArt: () => {},
      })}
    />
  )
}
