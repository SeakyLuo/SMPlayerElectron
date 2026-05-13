import { useState } from 'react'

import type { Translator } from '../shared/i18n'
import { Icon } from './icons'
import { AlbumArtEditorControl } from './MusicAlbumArtControl'
import { PopupDialog } from './PopupDialog'

interface AlbumArtworkDialogProps {
  albumName: string
  artworkUrl: string
  songId: number
  t: Translator
  onClose: () => void
  onSaved: () => void
}

export function AlbumArtworkDialog({
  albumName,
  artworkUrl,
  songId,
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
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const result = await window.smplayer?.pickAlbumArtworkSource()
      if (result && !result.canceled) {
        if (result.error === 'error') {
          setStatusMessage(t('song.updateFailed'))
          return
        }

        if (result.error === 'no-artwork') {
          setStatusMessage(t('song.musicNoAlbumArt', { title: result.sourceName }))
          return
        }

        setCurrentArtworkUrl(result.artworkUrl)
        setArtworkSourcePath(result.sourcePath)
        setShowDeleteConfirm(false)
        setStatusMessage('')
      }
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const saveArtwork = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    if (!artworkSourcePath) {
      setStatusMessage('')
      return
    }

    setSaving(true)
    try {
      await window.smplayer?.saveAlbumArtwork(albumName, artworkSourcePath)
      setArtworkSourcePath('')
      setStatusMessage(t('song.albumArtSaved'))
      onSaved()
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const deleteArtwork = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      await window.smplayer?.deleteAlbumArtwork(albumName)
      setCurrentArtworkUrl('')
      setArtworkSourcePath('')
      setShowDeleteConfirm(false)
      setStatusMessage(t('song.albumArtDeleted'))
      onSaved()
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PopupDialog
      t={t}
      overlayClassName="music-dialog-overlay AlbumDialogOverlay"
      className="album-artwork-dialog ContentDialog AlbumDialog"
      navClassName="music-dialog-pivot AlbumDialogPivot"
      navLabel={t('song.albumArt')}
      ariaLabel={t('song.albumArt')}
      onClose={onClose}
      navChildren={(
        <>
          <button type="button" className="AlbumArtItem AlbumArtPivotItem is-active">
            <Icon name="albums" />
            {t('song.albumArt')}
          </button>
        </>
      )}
      afterNav={statusMessage ? <p className="song-dialog-status">{statusMessage}</p> : null}
    >
      <AlbumArtEditorControl
        title={albumName}
        t={t}
        saving={saving}
        showBusy={saving}
        artworkUrl={currentArtworkUrl}
        songId={songId}
        showDeleteConfirm={showDeleteConfirm}
        onChangeArtwork={() => void changeArtwork()}
        onSaveArtwork={() => void saveArtwork()}
        onRequestDelete={() => setShowDeleteConfirm(true)}
        onConfirmDelete={() => void deleteArtwork()}
        onCancelDelete={() => setShowDeleteConfirm(false)}
      />
    </PopupDialog>
  )
}
