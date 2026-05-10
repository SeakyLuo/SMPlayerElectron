import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryPlaylist, LibrarySong, PreferenceItemSnapshot, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePreferenceStore } from '../state/usePreferenceStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { requestConfirmDialog } from './dialogService'
import { MenuFlyout } from './MenuFlyout'
import { getMusicMenuFlyoutItems } from './MenuFlyoutHelper'
import { MusicDialog } from './MusicDialog'

export interface MusicMenuFlyoutState {
  song: LibrarySong
  x: number
  y: number
}

interface MusicMenuFlyoutProps {
  menu: MusicMenuFlyoutState
  playlists: LibraryPlaylist[]
  queueSongIds: number[]
  currentTrackId: number | null
  isPlaying: boolean
  t: Translator
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onClose: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay?: (songId: number) => void
  onTogglePlayPause?: () => void
  onPlayNext: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  showSelect?: boolean
  showMoveToFolder?: boolean
  showHideFile?: boolean
  onSelectSong?: (songId: number) => void
}

export function MusicMenuFlyout({
  menu,
  playlists,
  queueSongIds,
  currentTrackId,
  isPlaying,
  t,
  onAddSongToPlaylist,
  onClose,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onRevealSong,
  onDeleteSongFromDisk,
  onToggleFavorite,
  showSelect,
  showMoveToFolder,
  showHideFile,
  onSelectSong,
}: MusicMenuFlyoutProps) {
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const hideSong = useLibraryStore((state) => state.hideSong)
  const resumeHiddenStorageItemByPath = useLibraryStore((state) => state.resumeHiddenStorageItemByPath)
  const refresh = useLibraryStore((state) => state.refresh)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const nowPlayingSongIds = useLibraryStore((state) => state.snapshot.nowPlaying.songIds)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const replaceNowPlaying = useLibraryStore((state) => state.replaceNowPlaying)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const [dialogMode, setDialogMode] = useState<'properties' | 'lyrics' | 'album-art' | null>(null)
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const refreshPreferenceItem = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setPreferenceItem(settings.songs.find((item) => item.itemId === String(menu.song.id)) ?? null)
  }

  useEffect(() => {
    void refreshPreferenceItem()
  }, [menu.song.id])

  return (
    <>
      {!dialogMode ? (
        <MenuFlyout
          position={menu}
          onClose={onClose}
          items={getMusicMenuFlyoutItems({
            song: menu.song,
            option: {
              showSelect: showSelect ?? true,
              showMoveToFolder: showMoveToFolder ?? false,
              showHideFile: showHideFile ?? false,
            },
            playlists,
            folders,
            queueSongIds,
            playbackSongIds: nowPlayingSongIds,
            currentTrackId,
            isPlaying,
            t,
            onPlay: () => {
              if (onMoveToMusicOrPlay) {
                onMoveToMusicOrPlay(menu.song.id)
                return
              }

              onPlayTrack(menu.song.id, queueSongIds)
            },
            onPause: () => {
              onTogglePlayPause?.()
            },
            onPlayNext: () => {
              onPlayNext(menu.song.id)
            },
            onAddToNowPlaying: () => {
              const insertedIndex = nowPlayingSongIds.length
              void replaceNowPlaying([...nowPlayingSongIds, menu.song.id])
              showUndo(t('notification.songAddedTo', { title: menu.song.title, target: t('common.nowPlaying') }), () =>
                replaceNowPlaying(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
              )
            },
            onCreatePlaylist: (name) => {
              void createPlaylist(name, [menu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const playlist = playlists.find((item) => item.id === playlistId)!
              onAddSongToPlaylist(playlistId, menu.song.id)
              showUndo(t('notification.songAddedTo', { title: menu.song.title, target: playlist.name }), () =>
                removeSongFromPlaylist(playlistId, menu.song.id),
              )
            },
            onRemove: () => {},
            onSelect: () => {
              onSelectSong?.(menu.song.id)
            },
            preferenceItem,
            onUndoPreference: () => {
              if (preferenceItem) {
                void removePreferenceItem(preferenceItem).then(() => refreshPreferenceItem(usePreferenceStore.getState().snapshot))
              }
            },
            onSetPreference: (level) => {
              void addPreferenceItem('song', String(menu.song.id), menu.song.title, level).then(refreshPreferenceItem)
            },
            onMoveToFolder: (folderPath) => {
              const originalFolderPath = getParentFolderPath(menu.song.path)
              void moveSongToFolder(menu.song.id, folderPath)
              showUndo(t('notification.movedSong', { title: menu.song.title }), () =>
                moveSongToFolder(menu.song.id, originalFolderPath),
              )
            },
            onToggleFavorite: () => {
              onToggleFavorite(menu.song.id, !menu.song.favorite)
              const target = t('common.myFavorites')
              showUndo(
                menu.song.favorite
                  ? t('notification.removedFrom', { title: menu.song.title, target })
                  : t('notification.songAddedTo', { title: menu.song.title, target }),
                () => setSongFavorite(menu.song.id, menu.song.favorite),
              )
            },
            onReveal: () => {
              onRevealSong(menu.song.path)
            },
            onDelete: () => {
              void requestConfirmDialog({
                title: t('playlists.delete'),
                message: t('context.deleteSongConfirm', { title: menu.song.title }),
                confirmText: t('playlists.delete'),
              }).then((confirmed) => {
                if (confirmed) {
                  onDeleteSongFromDisk(menu.song.id)
                }
              })
            },
            onHide: async () => {
              await hideSong(menu.song.id)
              showUndo(t('notification.hiddenStorageItem', { name: menu.song.title }), async () => {
                await resumeHiddenStorageItemByPath(menu.song.path)
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists/${encodeURIComponent(artist)}`)
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(menu.song.album || t('common.albumUnknown'))}`)
            },
            onSeeMusicInfo: () => {
              setDialogMode('properties')
            },
            onSeeLyrics: () => {
              setDialogMode('lyrics')
            },
            onSeeAlbumArt: () => {
              setDialogMode('album-art')
            },
          })}
        />
      ) : null}
      {dialogMode ? (
        <MusicDialog
          song={menu.song}
          mode={dialogMode}
          t={t}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onClose={() => {
            setDialogMode(null)
            onClose()
          }}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}
