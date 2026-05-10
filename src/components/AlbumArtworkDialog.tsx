import { useState } from 'react'
import { createPortal } from 'react-dom'

import type { Translator } from '../shared/i18n'
import { AlbumArtControl } from './AlbumArtControl'
import { CommandBar, CommandBarButton } from './CommandBar'
import { Icon } from './icons'

interface AlbumArtworkDialogProps {
  albumName: string
  artworkUrl: string
  t: Translator
  onClose: () => void
  onSaved: () => void
}

export function AlbumArtworkDialog({
  albumName,
  artworkUrl,
  t,
  onClose,
  onSaved,
}: AlbumArtworkDialogProps) {
  const [currentArtworkUrl, setCurrentArtworkUrl] = useState(artworkUrl)
  const [artworkSourcePath, setArtworkSourcePath] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const changeArtwork = async () => {
    const result = await window.smplayer?.pickAlbumArtworkSource()
    if (result && !result.canceled) {
      setCurrentArtworkUrl(result.artworkUrl)
      setArtworkSourcePath(result.sourcePath)
      setShowDeleteConfirm(false)
      setStatusMessage('')
    }
  }

  const saveArtwork = async () => {
    if (!artworkSourcePath) {
      setStatusMessage('')
      return
    }

    setSaving(true)
    try {
      await window.smplayer?.saveAlbumArtwork(albumName, artworkSourcePath)
      setArtworkSourcePath('')
      setStatusMessage(t('common.saved'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const deleteArtwork = async () => {
    setSaving(true)
    try {
      await window.smplayer?.deleteAlbumArtwork(albumName)
      setCurrentArtworkUrl('')
      setArtworkSourcePath('')
      setShowDeleteConfirm(false)
      setStatusMessage(t('common.saved'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="song-dialog-overlay">
      <section
        className="song-dialog album-artwork-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('context.seeAlbumArt')}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
      >
        <nav className="song-dialog-tabs" aria-label={t('context.seeAlbumArt')}>
          <button type="button" className="is-active">
            <Icon name="albums" />
            {t('context.seeAlbumArt')}
          </button>
          <button type="button" className="song-dialog-icon-button" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </nav>
        {statusMessage ? <p className="song-dialog-status">{statusMessage}</p> : null}
        <div className="song-dialog-body song-dialog-artwork">
          <CommandBar className="song-dialog-commandbar" overflowLabel={t('player.more')}>
            <CommandBarButton icon="albums" label={t('song.changeArtwork')} disabled={saving} onClick={() => void changeArtwork()} />
            <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button" disabled={saving} onClick={() => void saveArtwork()} />
            <CommandBarButton icon="trash" label={t('playlists.delete')} disabled={saving} onClick={() => setShowDeleteConfirm(true)} />
          </CommandBar>
          <AlbumArtControl title={albumName} artworkUrl={currentArtworkUrl} />
          {showDeleteConfirm ? (
            <div className="song-dialog-warning">
              <p>{t('song.deleteArtworkConfirm')}</p>
              <button type="button" disabled={saving} onClick={() => void deleteArtwork()}>{t('common.yes')}</button>
              <button type="button" disabled={saving} onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel')}</button>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
