import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { AlbumArtControl } from './AlbumArtControl'
import { CommandBar, CommandBarButton } from './CommandBar'

export function MusicAlbumArtControl({
  song,
  t,
  saving,
  showBusy,
  artworkUrl,
  showDeleteConfirm,
  onChangeArtwork,
  onSaveArtwork,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  song: LibrarySong
  t: Translator
  saving: boolean
  showBusy: boolean
  artworkUrl: string
  showDeleteConfirm: boolean
  onChangeArtwork: () => void
  onSaveArtwork: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <>
      <CommandBar className="song-dialog-commandbar music-info-control-commandbar AlbumArtControllerCommandBar">
        <CommandBarButton icon="albums" label={t('song.changeArtwork')} className="change-album-art-button ChangeAlbumArtButton" disabled={saving} onClick={onChangeArtwork} />
        <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button save-album-art-button SaveAlbumArtButton" disabled={saving} onClick={onSaveArtwork} />
        <CommandBarButton icon="trash" label={t('playlists.delete')} className="delete-album-art-button DeleteAlbumArtButton" disabled={saving} onClick={onRequestDelete} />
        {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
      </CommandBar>
      <div className="song-dialog-body song-dialog-artwork AlbumArtControl AlbumArtController AlbumArtControlPanel">
        <AlbumArtControl title={song.title} artworkUrl={artworkUrl} className="AlbumArt" fallbackClassName="NoAlbumArtTextBlock" fallbackText={t('song.noAlbumArt')} />
        {showDeleteConfirm ? (
          <div className="song-dialog-warning RemoveAlbumArtWarningPanel">
            <p className="RemoveAlbumArtWarningTextBlock">{t('song.removeAlbumArt', { title: song.title })}</p>
            <button type="button" className="ConfirmButton" disabled={saving} onClick={onConfirmDelete}>{t('common.yes')}</button>
            <button type="button" className="CancelButton" disabled={saving} onClick={onCancelDelete}>{t('common.cancel')}</button>
          </div>
        ) : null}
      </div>
    </>
  )
}
