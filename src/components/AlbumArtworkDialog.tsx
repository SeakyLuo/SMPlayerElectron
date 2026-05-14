import { useState } from 'react'

import type { Translator } from '../shared/i18n'
import { useLibraryStore } from '../state/useLibraryStore'
import { AlbumArtLibraryPickerDialog, type AlbumArtLibraryChoice } from './AlbumArtLibraryPickerDialog'
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
  const [originalArtworkUrl, setOriginalArtworkUrl] = useState(artworkUrl)
  const [artworkSourcePath, setArtworkSourcePath] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [libraryArtworkPickerOpen, setLibraryArtworkPickerOpen] = useState(false)
  const librarySongs = useLibraryStore((state) => state.snapshot.songs)
  const currentSong = librarySongs.find((song) => song.id === songId)

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
      setOriginalArtworkUrl(currentArtworkUrl)
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
      setOriginalArtworkUrl('')
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

  const applyLibraryArtwork = (choice: AlbumArtLibraryChoice) => {
    setCurrentArtworkUrl(choice.sourceUrl)
    setArtworkSourcePath(choice.sourcePath)
    setShowDeleteConfirm(false)
    setStatusMessage('')
    setLibraryArtworkPickerOpen(false)
  }

  const resetArtwork = () => {
    setCurrentArtworkUrl(originalArtworkUrl)
    setArtworkSourcePath('')
    setShowDeleteConfirm(false)
    setStatusMessage(t('song.albumArtReset'))
  }

  return (
    <>
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
          onChooseArtworkFromLibrary={() => setLibraryArtworkPickerOpen(true)}
          onSaveArtwork={() => void saveArtwork()}
          onResetArtwork={artworkSourcePath ? resetArtwork : undefined}
          onRequestDelete={() => setShowDeleteConfirm(true)}
          onConfirmDelete={() => void deleteArtwork()}
          onCancelDelete={() => setShowDeleteConfirm(false)}
        />
      </PopupDialog>
      {libraryArtworkPickerOpen ? (
        <AlbumArtLibraryPickerDialog
          albumName={albumName}
          currentSong={currentSong}
          songs={librarySongs}
          t={t}
          onApply={applyLibraryArtwork}
          onClose={() => setLibraryArtworkPickerOpen(false)}
        />
      ) : null}
    </>
  )
}
