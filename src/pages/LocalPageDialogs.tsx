import { InputDialog } from '../components/InputDialog'
import { MusicMenuFlyout } from '../components/MusicMenuFlyout'
import { RemoveDialog } from '../components/RemoveDialog'
import type { MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import type { LibraryPlaylist, LibrarySong, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { PlaybackCommands } from '../shared/PlaybackCommands'
import type { FolderNode } from './localFolderModel'
import { FolderUpdateResultDialog } from './FolderUpdateResultDialog'

interface FolderUpdateResultDialogState {
  folder: FolderNode
  result: ScanLibraryResult
}

interface FolderUpdateResultSongMenuState extends MenuFlyoutPosition {
  song: LibrarySong
}

interface LocalSongMenuState extends MenuFlyoutPosition {
  song: LibrarySong
}

export function LocalPageDialogs({
  t,
  songs,
  playlists,
  queueSongIds,
  selectedTrackId,
  isPlaying,
  songMenu,
  folderUpdateResultDialog,
  folderUpdateResultSongMenu,
  inputDialog,
  removeDialog,
  onCloseSongMenu,
  onCloseFolderUpdateResultDialog,
  onCloseFolderUpdateResultSongMenu,
  onOpenFolderUpdateResultSongMenu,
  onCloseInputDialog,
  onCloseRemoveDialog,
  onPlayTrack,
  onMoveToMusicOrPlay,
  onTogglePlayPause,
  onPlayNext,
  onRevealSong,
  onDeleteSongFromDisk,
  onToggleFavorite,
  onAddSongToPlaylist,
  onSelectSong,
}: {
  t: Translator
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  queueSongIds: number[]
  selectedTrackId: number | null
  isPlaying: boolean
  songMenu: LocalSongMenuState | null
  folderUpdateResultDialog: FolderUpdateResultDialogState | null
  folderUpdateResultSongMenu: FolderUpdateResultSongMenuState | null
  inputDialog: {
    title: string
    defaultValue: string
    validate: (value: string) => string
    onConfirm: (value: string) => void | Promise<void>
  } | null
  removeDialog: {
    title: string
    message: string
    onConfirm: () => void | Promise<void>
  } | null
  onCloseSongMenu: () => void
  onCloseFolderUpdateResultDialog: () => void
  onCloseFolderUpdateResultSongMenu: () => void
  onOpenFolderUpdateResultSongMenu: (song: LibrarySong, x: number, y: number) => void
  onCloseInputDialog: () => void
  onCloseRemoveDialog: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onMoveToMusicOrPlay: (songId: number) => void
  onTogglePlayPause: () => void
  onPlayNext: (songId: number) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onDeleteSongFromDisk: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onSelectSong: (songId: number) => void
}) {
  return (
    <>
      {songMenu ? (
        <MusicMenuFlyout
          menu={songMenu}
          playlists={playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onClose={onCloseSongMenu}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          onAddSongToPlaylist={onAddSongToPlaylist}
          showSelect
          showMoveToFolder
          showHideFile
          onSelectSong={onSelectSong}
        />
      ) : null}
      {folderUpdateResultDialog ? (
        <FolderUpdateResultDialog
          t={t}
          result={folderUpdateResultDialog.result}
          folder={folderUpdateResultDialog.folder}
          songs={songs}
          selectedTrackId={selectedTrackId}
          songMenuOpen={folderUpdateResultSongMenu != null}
          onPlaySong={(songId) => {
            void PlaybackCommands.addNextAndPlay(songId)
          }}
          onOpenSongMenu={onOpenFolderUpdateResultSongMenu}
          onClose={onCloseFolderUpdateResultDialog}
        />
      ) : null}
      {folderUpdateResultSongMenu ? (
        <MusicMenuFlyout
          menu={folderUpdateResultSongMenu}
          playlists={playlists}
          queueSongIds={queueSongIds}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          t={t}
          onClose={onCloseFolderUpdateResultSongMenu}
          onPlayTrack={onPlayTrack}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onTogglePlayPause={onTogglePlayPause}
          onPlayNext={onPlayNext}
          onRevealSong={onRevealSong}
          onDeleteSongFromDisk={onDeleteSongFromDisk}
          onToggleFavorite={onToggleFavorite}
          onAddSongToPlaylist={onAddSongToPlaylist}
          showSelect={false}
          showMusicProperties={false}
          showDelete={false}
          menuLayer="dialog"
        />
      ) : null}
      {inputDialog ? (
        <InputDialog
          t={t}
          title={inputDialog.title}
          defaultValue={inputDialog.defaultValue}
          validate={inputDialog.validate}
          onCancel={onCloseInputDialog}
          onConfirm={(value) => {
            void inputDialog.onConfirm(value)
          }}
        />
      ) : null}
      {removeDialog ? (
        <RemoveDialog
          t={t}
          title={removeDialog.title}
          message={removeDialog.message}
          onCancel={onCloseRemoveDialog}
          onConfirm={() => {
            void removeDialog.onConfirm()
          }}
        />
      ) : null}
    </>
  )
}
