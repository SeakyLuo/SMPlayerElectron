import type { LibraryPlaylist } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getNextPlaylistName } from '../shared/playlistNames'
import type { MenuFlyoutItem } from './MenuFlyoutHelper'

export function getPlaylistCardMenuItems({
  playlist,
  playlists,
  t,
  onCreatePlaylistWithSongs,
  onRequestRenamePlaylist,
  onDeletePlaylist,
}: {
  playlist: LibraryPlaylist
  playlists: LibraryPlaylist[]
  t: Translator
  onCreatePlaylistWithSongs: (name: string, songIds: number[]) => void
  onRequestRenamePlaylist: (playlist: LibraryPlaylist) => void
  onDeletePlaylist: (playlistId: number) => void
}) {
  return [
    {
      key: 'rename-playlist',
      text: t('playlists.rename'),
      icon: 'rename',
      onClick: () => {
        onRequestRenamePlaylist(playlist)
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
  ] satisfies MenuFlyoutItem[]
}
