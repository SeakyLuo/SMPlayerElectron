import { useEffect, useMemo, useState, type MouseEvent } from 'react'

import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { AlbumArtControl } from './AlbumArtControl'
import { CommandBar, CommandBarButton } from './CommandBar'
import { MenuFlyout } from './MenuFlyout'
import type { MenuFlyoutItem, MenuFlyoutPosition } from './MenuFlyoutHelper'

export interface AlbumArtRecommendation {
  song: LibrarySong
  artworkUrl: string
  sourceUrl: string
  sourcePath: string
  artistName: string
}

export function MusicAlbumArtControl({
  song,
  t,
  loading,
  saving,
  showBusy,
  artworkUrl,
  recommendation,
  showDeleteConfirm,
  onApplyRecommendation,
  onChangeArtwork,
  onChooseArtworkFromLibrary,
  onSaveArtwork,
  onResetArtwork,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  song: LibrarySong
  t: Translator
  loading: boolean
  saving: boolean
  showBusy: boolean
  artworkUrl: string
  recommendation: AlbumArtRecommendation | null
  showDeleteConfirm: boolean
  onApplyRecommendation: (recommendation: AlbumArtRecommendation) => void
  onChangeArtwork: () => void
  onChooseArtworkFromLibrary: () => void
  onSaveArtwork: () => void
  onResetArtwork?: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <AlbumArtEditorControl
      title={song.title}
      t={t}
      loading={loading}
      saving={saving}
      showBusy={showBusy}
      artworkUrl={artworkUrl}
      recommendation={recommendation}
      songId={song.id}
      fallbackArtwork
      showDeleteConfirm={showDeleteConfirm}
      onApplyRecommendation={onApplyRecommendation}
      onChangeArtwork={onChangeArtwork}
      onChooseArtworkFromLibrary={onChooseArtworkFromLibrary}
      onSaveArtwork={onSaveArtwork}
      onResetArtwork={onResetArtwork}
      onRequestDelete={onRequestDelete}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={onCancelDelete}
    />
  )
}

export function AlbumArtEditorControl({
  title,
  t,
  loading = false,
  saving,
  showBusy,
  artworkUrl,
  recommendation,
  songId,
  fallbackArtwork = false,
  showDeleteConfirm,
  onApplyRecommendation,
  onChangeArtwork,
  onChooseArtworkFromLibrary,
  onSaveArtwork,
  onResetArtwork,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  title: string
  t: Translator
  loading?: boolean
  saving: boolean
  showBusy: boolean
  artworkUrl: string
  recommendation?: AlbumArtRecommendation | null
  songId?: number
  fallbackArtwork?: boolean
  showDeleteConfirm: boolean
  onApplyRecommendation?: (recommendation: AlbumArtRecommendation) => void
  onChangeArtwork: () => void
  onChooseArtworkFromLibrary?: () => void
  onSaveArtwork: () => void
  onResetArtwork?: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const [sourceMenuPosition, setSourceMenuPosition] = useState<MenuFlyoutPosition | null>(null)
  const [loadedArtworkUrl, setLoadedArtworkUrl] = useState('')
  const sourceMenuItems = useMemo<MenuFlyoutItem[]>(() => [
    {
      key: 'local',
      text: t('song.chooseArtworkFromLocal'),
      icon: 'pictures',
      onClick: onChangeArtwork,
    },
    {
      key: 'library',
      text: t('song.chooseArtworkFromLibrary'),
      icon: 'musicLibrary',
      disabled: !onChooseArtworkFromLibrary,
      onClick: onChooseArtworkFromLibrary,
    },
  ], [onChangeArtwork, onChooseArtworkFromLibrary, t])

  const openSourceMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setSourceMenuPosition({
      x: rect.left,
      y: rect.bottom + 6,
      anchor: event.currentTarget,
    })
  }
  const controlsDisabled = loading || saving
  const imageLoading = loading || (artworkUrl !== '' && loadedArtworkUrl !== artworkUrl)

  useEffect(() => {
    if (!artworkUrl) {
      setLoadedArtworkUrl('')
    }
  }, [artworkUrl])

  return (
    <>
      <CommandBar className="song-dialog-commandbar music-info-control-commandbar AlbumArtControllerCommandBar" overflowLabel={t('player.more')}>
        <CommandBarButton
          icon="edit"
          label={t('song.changeArtwork')}
          className="change-album-art-button ChangeAlbumArtButton"
          disabled={controlsDisabled}
          ariaHasPopup="menu"
          ariaExpanded={sourceMenuPosition ? true : undefined}
          onClick={openSourceMenu}
        />
        <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button save-album-art-button SaveAlbumArtButton" disabled={controlsDisabled} busy={saving} onClick={onSaveArtwork} />
        {onResetArtwork ? <CommandBarButton icon="undo" label={t('common.reset')} className="reset-album-art-button ResetAlbumArtButton" disabled={controlsDisabled} onClick={onResetArtwork} /> : null}
        <CommandBarButton icon="trash" label={t('playlists.delete')} className="delete-album-art-button DeleteAlbumArtButton" disabled={controlsDisabled} onClick={onRequestDelete} />
        {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
      </CommandBar>
      {sourceMenuPosition ? (
        <MenuFlyout
          layer="dialog"
          position={sourceMenuPosition}
          items={sourceMenuItems}
          onClose={() => setSourceMenuPosition(null)}
        />
      ) : null}
      <div className="song-dialog-body song-dialog-artwork AlbumArtControl AlbumArtController AlbumArtControlPanel">
        <div className={`song-dialog-artwork-shell${imageLoading ? ' is-loading' : ''}`}>
          {artworkUrl || !loading ? (
            <AlbumArtControl
              title={title}
              artworkUrl={artworkUrl}
              songId={songId}
              className="AlbumArt"
              fallbackClassName="NoAlbumArtTextBlock"
              fallbackArtwork={fallbackArtwork}
              fallbackText={(
                <AlbumArtFallbackText
                  title={title}
                  t={t}
                  recommendation={recommendation ?? null}
                  onApplyRecommendation={onApplyRecommendation}
                />
              )}
              onLoad={() => setLoadedArtworkUrl(artworkUrl)}
            />
          ) : (
            <div className="album-art-control AlbumArt song-dialog-artwork-loading-placeholder" aria-hidden="true" />
          )}
          {imageLoading ? (
            <div className="song-dialog-artwork-loading" role="status" aria-label={t('nowPlaying.loading')}>
              <div className="song-dialog-loading" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        {showDeleteConfirm ? (
          <div className="song-dialog-warning RemoveAlbumArtWarningPanel">
            <p className="RemoveAlbumArtWarningTextBlock">{t('song.removeAlbumArt', { title })}</p>
            <button type="button" className="ConfirmButton" disabled={controlsDisabled} onClick={onConfirmDelete}>{t('common.yes')}</button>
            <button type="button" className="CancelButton" disabled={controlsDisabled} onClick={onCancelDelete}>{t('common.cancel')}</button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function AlbumArtFallbackText({
  t,
  recommendation,
  onApplyRecommendation,
}: {
  title: string
  t: Translator
  recommendation: AlbumArtRecommendation | null
  onApplyRecommendation?: (recommendation: AlbumArtRecommendation) => void
}) {
  if (!recommendation) {
    return <span>{t('song.noAlbumArt')}</span>
  }

  return (
    <span className="album-art-recommendation">
      <span>{t('song.noAlbumArt')}</span>
      <span>
        {t('song.albumArtRecommendationPrefix', { artist: recommendation.artistName })}
        <button
          type="button"
          className="album-art-recommendation-button"
          onClick={() => onApplyRecommendation?.(recommendation)}
        >
          {t('song.albumArtRecommendationTitle', { title: recommendation.song.title })}
          <span className="album-art-recommendation-preview">
            <AlbumArtControl title={recommendation.song.title} artworkUrl={recommendation.artworkUrl} songId={recommendation.song.id} />
          </span>
        </button>
        {t('song.albumArtRecommendationSuffix')}
      </span>
    </span>
  )
}
