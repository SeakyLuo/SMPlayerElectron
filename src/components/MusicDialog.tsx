import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { normalizeArtists } from '../shared/artists'
import type { LibrarySong, LyricsSnapshot, SongPropertiesSnapshot } from '../shared/contracts'
import { formatBytes, formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { hasLyricsTimestamps, mergePlainLyricsWithTimedRaw, stripLyricsTimestamps } from '../shared/lyrics'
import { useLibraryStore } from '../state/useLibraryStore'
import { useMusicDialogShortcuts } from '../hooks/useMusicDialogShortcuts'
import { AlbumArtControl } from './AlbumArtControl'
import { Icon } from './icons'

type SongDialogMode = 'properties' | 'lyrics' | 'album-art'
type PendingLyricsSnapshot = { songId: number; title: string; lyrics: string }
const MAX_ARTIST_CELLS = 6

function PropertyRow({
  label,
  children,
  className,
  labelClassName,
}: {
  label: string
  children: ReactNode
  className?: string
  labelClassName?: string
}) {
  return (
    <div className={`song-dialog-property-row music-property-row${className ? ` ${className}` : ''}`}>
      <span className={`song-dialog-property-label music-property-label${labelClassName ? ` ${labelClassName}` : ''}`}>{label}</span>
      <div className="song-dialog-property-control music-property-control">{children}</div>
    </div>
  )
}

interface MusicDialogProps {
  song: LibrarySong
  mode: SongDialogMode
  t: Translator
  currentTrackId?: number | null
  isPlaying?: boolean
  queueSongIds?: number[]
  onClose: () => void
  onPlayTrack?: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause?: () => void
  onSaved?: () => void
}

export function MusicDialog({
  song,
  mode,
  t,
  currentTrackId = null,
  isPlaying = false,
  queueSongIds = [],
  onClose,
  onPlayTrack,
  onTogglePlayPause,
  onSaved,
}: MusicDialogProps) {
  const [activeMode, setActiveMode] = useState(mode)
  const [properties, setProperties] = useState<SongPropertiesSnapshot | null>(null)
  const [originalProperties, setOriginalProperties] = useState<SongPropertiesSnapshot | null>(null)
  const [lyrics, setLyrics] = useState<LyricsSnapshot | null>(null)
  const [lyricsText, setLyricsText] = useState('')
  const [originalLyricsText, setOriginalLyricsText] = useState('')
  const [lyricsRawText, setLyricsRawText] = useState('')
  const [showLyricsTimestamps, setShowLyricsTimestamps] = useState(true)
  const [artworkUrl, setArtworkUrl] = useState(song.artworkUrl)
  const [artworkSourcePath, setArtworkSourcePath] = useState('')
  const [showArtworkDeleteConfirm, setShowArtworkDeleteConfirm] = useState(false)
  const [pendingLyricsSave, setPendingLyricsSave] = useState<PendingLyricsSnapshot | null>(null)
  const [pendingSwitchLyrics, setPendingSwitchLyrics] = useState<PendingLyricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const lyricsTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const latestLyricsRef = useRef<{
    activeMode: SongDialogMode
    dirty: boolean
    lyrics: string
    originalLyrics: string
    pendingDelayedSave: boolean
    songId: number
    title: string
  } | null>(null)
  const previousTrackIdRef = useRef<number | null>(currentTrackId)
  const currentLyricsRawText = showLyricsTimestamps
    ? lyricsText
    : mergePlainLyricsWithTimedRaw(lyricsRawText, lyricsText)
  const lyricsCanToggleTimestamps = hasLyricsTimestamps(lyricsRawText)
  const lyricsDirty = currentLyricsRawText !== originalLyricsText
  const isCurrentSong = currentTrackId === song.id
  const canPause = isCurrentSong && isPlaying
  const controlsDisabled = saving || loading
  const showBusy = loading || saving
  const playQueue = useMemo(() => {
    return queueSongIds.includes(song.id) ? queueSongIds : [...queueSongIds, song.id]
  }, [queueSongIds, song.id])
  const getCurrentTrackTitle = () => {
    if (currentTrackId == null) {
      return ''
    }

    return useLibraryStore.getState().snapshot.songs.find((item) => item.id === currentTrackId)?.title ?? song.title
  }

  useEffect(() => {
    setActiveMode(mode)
  }, [mode])

  useEffect(() => {
    latestLyricsRef.current = {
      activeMode,
      dirty: lyricsDirty,
      lyrics: currentLyricsRawText,
      originalLyrics: originalLyricsText,
      pendingDelayedSave: pendingLyricsSave != null,
      songId: song.id,
      title: song.title,
    }
  })

  useEffect(() => {
    let canceled = false
    setLoading(true)
    setStatusMessage('')
    void window.smplayer?.getSongProperties(song.id).then((snapshot) => {
      if (canceled) {
        return
      }

      setProperties(snapshot)
      setOriginalProperties(snapshot)
      setLoading(false)
    })

    return () => {
      canceled = true
    }
  }, [song.id, t])

  useEffect(() => {
    const previous = latestLyricsRef.current
    setStatusMessage('')
    if (
      previous &&
      previous.songId !== song.id &&
      previous.activeMode === 'lyrics' &&
      previous.dirty &&
      !previous.pendingDelayedSave
    ) {
      setPendingSwitchLyrics({
        songId: previous.songId,
        title: previous.title,
        lyrics: previous.lyrics,
      })
      setStatusMessage(t('song.pendingSaveLyrics', { title: previous.title }))
    }

    let canceled = false
    void window.smplayer?.getLyrics(song.id, 'auto')
      .then((snapshot) => {
        if (canceled) {
          return
        }

        setLyrics(snapshot)
        setLyricsRawText(snapshot.rawText)
        setLyricsText(snapshot.rawText)
        setOriginalLyricsText(snapshot.rawText)
      })
      .catch(() => {
        if (!canceled) {
          setStatusMessage(t('song.getLyricsFailed'))
        }
      })

    void window.smplayer?.getSongArtworkSnapshot(song.id).then((snapshot) => {
      if (!canceled && snapshot.artworkUrl) {
        setArtworkUrl(snapshot.artworkUrl)
      }
    })

    return () => {
      canceled = true
    }
  }, [song.id, t])

  useEffect(() => {
    const previousTrackId = previousTrackIdRef.current
    previousTrackIdRef.current = currentTrackId
    const latest = latestLyricsRef.current

    if (
      latest &&
      previousTrackId === latest.songId &&
      currentTrackId !== latest.songId &&
      latest.activeMode === 'lyrics' &&
      latest.dirty &&
      !latest.pendingDelayedSave
    ) {
      setPendingSwitchLyrics({
        songId: latest.songId,
        title: latest.title,
        lyrics: latest.lyrics,
      })
      setStatusMessage(t('song.pendingSaveLyrics', { title: latest.title }))
    }
  }, [currentTrackId, t])

  useEffect(() => {
    if (!pendingLyricsSave || currentTrackId === pendingLyricsSave.songId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void window.smplayer?.saveSongLyrics(pendingLyricsSave.songId, pendingLyricsSave.lyrics).then(async () => {
        const currentTitle = getCurrentTrackTitle()
        if (pendingLyricsSave.songId === song.id) {
          setLyricsRawText(pendingLyricsSave.lyrics)
          setOriginalLyricsText(pendingLyricsSave.lyrics)
          setLyrics((current) => current ? { ...current, rawText: pendingLyricsSave.lyrics } : current)
        }
        setPendingLyricsSave(null)
        setStatusMessage(
          currentTrackId == null
            ? t('song.lyricsUpdated', { title: pendingLyricsSave.title })
            : t('song.lyricsUpdatedAndRefreshed', { savedTitle: pendingLyricsSave.title, currentTitle }),
        )
      })
    }, 3000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentTrackId, pendingLyricsSave, song.id, song.title, t])

  const updateProperty = (key: keyof SongPropertiesSnapshot, value: string) => {
    setProperties((current) => current ? { ...current, [key]: value } : current)
  }

  const updateArtistCell = (index: number, value: string) => {
    setProperties((current) => {
      if (!current) {
        return current
      }

      const artists = current.artists.length > 0 ? current.artists.slice(0, MAX_ARTIST_CELLS) : ['']
      artists[index] = value
      return {
        ...current,
        artist: normalizeArtists(artists).join(', '),
        artists,
      }
    })
  }

  const addArtistCell = () => {
    setProperties((current) =>
      current
        ? {
            ...current,
            artists: [...(current.artists.length > 0 ? current.artists : ['']), ''].slice(0, MAX_ARTIST_CELLS),
          }
        : current,
    )
  }

  const removeArtistCell = (index: number) => {
    setProperties((current) => {
      if (!current) {
        return current
      }

      const artists = (current.artists.length > 0 ? current.artists : ['']).filter((_, artistIndex) => artistIndex !== index)
      const nextArtists = artists.length > 0 ? artists : ['']
      return {
        ...current,
        artist: normalizeArtists(nextArtists).join(', '),
        artists: nextArtists,
      }
    })
  }

  const updateNumericProperty = (key: keyof SongPropertiesSnapshot, value: string) => {
    const digits = value.replace(/\D/g, '')
    setProperties((current) => current ? { ...current, [key]: Number(digits) || 0 } : current)
  }

  const formatTagList = (value: string) => value.split(', ').join(t('common.comma'))

  const scrollLyricsToTop = () => {
    lyricsTextAreaRef.current?.scrollTo({ top: 0, left: 0 })
  }

  const updateLyricsEditorRawText = (rawText: string) => {
    setLyricsRawText(rawText)
    setLyricsText(showLyricsTimestamps ? rawText : stripLyricsTimestamps(rawText))
  }

  const toggleLyricsTimestamps = (checked: boolean) => {
    const rawText = currentLyricsRawText
    setShowLyricsTimestamps(checked)
    setLyricsRawText(rawText)
    setLyricsText(checked ? rawText : stripLyricsTimestamps(rawText))
  }

  const isPropertiesModified = (current: SongPropertiesSnapshot, original: SongPropertiesSnapshot) => {
    return current.title !== original.title
      || current.subtitle !== original.subtitle
      || current.artist !== original.artist
      || current.artists.join('\n') !== original.artists.join('\n')
      || current.album !== original.album
      || current.albumArtist !== original.albumArtist
      || current.publisher !== original.publisher
      || current.trackNumber !== original.trackNumber
      || current.year !== original.year
      || current.playCount !== original.playCount
  }

  const switchMode = (nextMode: SongDialogMode) => {
    if (activeMode === 'lyrics' && lyricsDirty && !window.confirm(t('song.discardLyricsConfirm'))) {
      return
    }

    setActiveMode(nextMode)
    setStatusMessage('')
  }

  const play = () => {
    if (canPause) {
      onTogglePlayPause?.()
      return
    }

    if (isCurrentSong && !isPlaying) {
      onTogglePlayPause?.()
      return
    }

    onPlayTrack?.(song.id, playQueue)
  }

  const saveProperties = async () => {
    if (saving || loading || !properties || !originalProperties) {
      return
    }

    setSaving(true)
    try {
      const nextProperties = {
        ...properties,
        title: properties.title.trim(),
        subtitle: properties.subtitle.trim(),
        artists: normalizeArtists(properties.artists).slice(0, MAX_ARTIST_CELLS),
        album: properties.album.trim(),
        albumArtist: properties.albumArtist.trim(),
        publisher: properties.publisher.trim(),
      }
      nextProperties.artist = nextProperties.artists.join(', ')
      if (!isPropertiesModified(nextProperties, originalProperties)) {
        setProperties(nextProperties)
        setOriginalProperties(nextProperties)
        setStatusMessage(t('song.propertiesUpdated'))
        return
      }

      await window.smplayer?.updateSongProperties(song.id, {
        title: nextProperties.title,
        subtitle: nextProperties.subtitle,
        artist: nextProperties.artist,
        artists: nextProperties.artists,
        album: nextProperties.album,
        albumArtist: nextProperties.albumArtist,
        publisher: nextProperties.publisher,
        trackNumber: nextProperties.trackNumber,
        year: nextProperties.year,
        playCount: nextProperties.playCount,
      })
      setProperties(nextProperties)
      setOriginalProperties(nextProperties)
      setStatusMessage(t('song.propertiesUpdated'))
      onSaved?.()
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const clearPlayCount = async () => {
    if (saving || loading) {
      return
    }

    await window.smplayer?.updateSongPlayCount(song.id, 0)
    setProperties((current) => current ? { ...current, playCount: 0 } : current)
    setOriginalProperties((current) => current ? { ...current, playCount: 0 } : current)
    setStatusMessage('')
    onSaved?.()
  }

  const saveLyrics = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    if (currentLyricsRawText === originalLyricsText) {
      setStatusMessage(t('song.nothingChanged'))
      return
    }

    if (isCurrentSong && !useLibraryStore.getState().snapshot.settings.saveLyricsImmediately) {
      setPendingLyricsSave({ songId: song.id, title: song.title, lyrics: currentLyricsRawText })
      setStatusMessage(t('song.saveLyricsLater', { title: song.title }))
      return
    }

    await saveLyricsImmediately()
  }

  const saveLyricsImmediately = async (
    override?: { songId: number; title: string; lyrics: string },
    refreshLatestLyrics = false,
  ) => {
    setSaving(true)
    const targetSongId = override?.songId ?? song.id
    const targetTitle = override?.title ?? song.title
    const targetLyrics = override?.lyrics ?? currentLyricsRawText
    try {
      await window.smplayer?.saveSongLyrics(targetSongId, targetLyrics)
      if (targetSongId === song.id) {
        setLyricsRawText(targetLyrics)
        setOriginalLyricsText(targetLyrics)
        setLyrics((current) => current ? { ...current, rawText: targetLyrics } : current)
        setPendingLyricsSave(null)
        onSaved?.()
      }
      setPendingSwitchLyrics((current) => current?.songId === targetSongId ? null : current)
      if (refreshLatestLyrics) {
        const currentTitle = getCurrentTrackTitle() || song.title
        setStatusMessage(t('song.lyricsUpdatedAndRefreshed', { savedTitle: targetTitle, currentTitle }))
      } else {
        setStatusMessage(t('song.lyricsUpdated', { title: targetTitle }))
      }
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const discardPendingSwitchLyrics = () => {
    if (pendingSwitchLyrics?.songId === song.id) {
      updateLyricsEditorRawText(originalLyricsText)
    }
    setPendingSwitchLyrics(null)
    setStatusMessage('')
  }

  const searchLyrics = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const before = lyricsText
      let snapshot: LyricsSnapshot | undefined
      try {
        snapshot = await window.smplayer?.getLyrics(song.id, 'internet')
      } catch {
        try {
          await window.smplayer?.openLyricsSearchInBrowser(song.id)
          setStatusMessage(t('song.openBrowserSuccessful'))
        } catch {
          setStatusMessage(t('song.searchLyricsFailed'))
        }
        return
      }
      if (snapshot?.rawText.trim()) {
        setLyrics(snapshot)
        updateLyricsEditorRawText(snapshot.rawText)
        if (before === (showLyricsTimestamps ? snapshot.rawText : stripLyricsTimestamps(snapshot.rawText))) {
          setStatusMessage(t('song.nothingChanged'))
          return
        }

        setPendingLyricsSave(null)
        setStatusMessage(t('song.searchLyricsSuccessful'))
        requestAnimationFrame(scrollLyricsToTop)
        return
      }

      try {
        await window.smplayer?.openLyricsSearchInBrowser(song.id)
        setStatusMessage(t('song.openBrowserSuccessful'))
      } catch {
        setStatusMessage(t('song.searchLyricsFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const importLyrics = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const result = await window.smplayer?.importLyrics()
      if (result && !result.canceled) {
        updateLyricsEditorRawText(result.rawText)
        setPendingLyricsSave(null)
        setStatusMessage('')
        requestAnimationFrame(scrollLyricsToTop)
      }
    } catch {
      setStatusMessage(t('song.importLyricsFailed'))
    } finally {
      setSaving(false)
    }
  }

  const changeArtwork = async () => {
    if (saving) {
      setStatusMessage(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const result = await window.smplayer?.pickSongArtworkSource()
      if (result && !result.canceled) {
        if (result.error === 'error') {
          setStatusMessage(t('song.updateFailed'))
          return
        }

        if (result.error === 'no-artwork') {
          setStatusMessage(t('song.musicNoAlbumArt', { title: result.sourceName }))
          return
        }

        setArtworkUrl(result.artworkUrl)
        setArtworkSourcePath(result.sourcePath)
        setShowArtworkDeleteConfirm(false)
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
      await window.smplayer?.saveSongArtwork(song.id, artworkSourcePath)
      setStatusMessage(t('song.albumArtSaved'))
      onSaved?.()
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
      await window.smplayer?.deleteSongArtwork(song.id)
      setArtworkUrl('')
      setArtworkSourcePath('')
      setShowArtworkDeleteConfirm(false)
      setStatusMessage(t('song.albumArtDeleted'))
      onSaved?.()
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const saveActivePage = async () => {
    if (activeMode === 'properties') {
      await saveProperties()
    }
    if (activeMode === 'lyrics') {
      await saveLyrics()
    }
    if (activeMode === 'album-art') {
      await saveArtwork()
    }
  }

  const resetActivePage = () => {
    if (activeMode === 'properties' && originalProperties) {
      setProperties(originalProperties)
      setStatusMessage(t('song.propertiesReset'))
    }
    if (activeMode === 'lyrics') {
      updateLyricsEditorRawText(originalLyricsText)
      setPendingLyricsSave(null)
      requestAnimationFrame(scrollLyricsToTop)
      setStatusMessage(t('song.lyricsReset'))
    }
  }

  useMusicDialogShortcuts({
    activeMode,
    onSave: saveActivePage,
    onReset: resetActivePage,
    onSearchLyrics: searchLyrics,
  })

  return createPortal(
    <div className="song-dialog-overlay music-dialog-overlay MusicDialogOverlay">
      <section
        className="song-dialog music-dialog ContentDialog MusicDialog"
        role="dialog"
        aria-modal="true"
        aria-label={song.title}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
      >
        <nav className="song-dialog-tabs music-dialog-pivot MusicDialogPivot" aria-label={t('context.seeMusicInfo')}>
          <button type="button" className={`PropertiesItem PropertiesPivotItem${activeMode === 'properties' ? ' is-active' : ''}`} onClick={() => switchMode('properties')}>
            <Icon name="songs" />
            {t('context.seeMusicInfo')}
          </button>
          <button type="button" className={`LyricsItem LyricsPivotItem${activeMode === 'lyrics' ? ' is-active' : ''}`} onClick={() => switchMode('lyrics')}>
            <Icon name="voice" />
            {t('context.seeLyrics')}
          </button>
          <button type="button" className={`AlbumArtItem AlbumArtPivotItem${activeMode === 'album-art' ? ' is-active' : ''}`} onClick={() => switchMode('album-art')}>
            <Icon name="albums" />
            {t('context.seeAlbumArt')}
          </button>
          <button type="button" className="song-dialog-icon-button music-dialog-close-button CloseButton" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </nav>
        {statusMessage ? <p className="song-dialog-status">{statusMessage}</p> : null}
        {activeMode === 'properties' ? (
          <div className="song-dialog-commandbar music-info-control-commandbar MusicInfoControllerCommandBar" role="toolbar">
            <button type="button" className={canPause ? 'PauseButton' : 'PlayButton'} onClick={play}>
              <Icon name={canPause ? 'pause' : 'play'} />
              {canPause ? t('context.pause') : t('context.play')}
            </button>
            <button type="button" className="song-dialog-primary-button save-music-properties-button SaveMusicPropertiesButton" disabled={controlsDisabled} onClick={() => void saveProperties()}>
              {t('settings.save')}
            </button>
            <button type="button" className="reset-music-properties-button ResetMusicPropertiesButton" disabled={controlsDisabled} onClick={resetActivePage}>
              {t('common.reset')}
            </button>
            {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
          </div>
        ) : null}
        {activeMode === 'lyrics' ? (
          <div className="song-dialog-commandbar music-info-control-commandbar MusicLyricsControllerCommandBar" role="toolbar">
            <button type="button" className="SearchLyricsButton" disabled={saving} onClick={() => void searchLyrics()}>
              <Icon name="search" />
              {t('common.search')}
            </button>
            <button type="button" className="ImportLyricsButton" disabled={saving} onClick={() => void importLyrics()}>{t('common.import')}</button>
            <button type="button" className="song-dialog-primary-button save-lyrics-button SaveLyricsButton" disabled={saving} onClick={() => void saveLyrics()}>{t('settings.save')}</button>
            <button type="button" className="reset-lyrics-button ResetLyricsButton" disabled={saving} onClick={resetActivePage}>{t('common.reset')}</button>
            {lyricsCanToggleTimestamps ? (
              <label className="song-dialog-lyrics-timestamp-toggle">
                <input
                  type="checkbox"
                  checked={showLyricsTimestamps}
                  onChange={(event) => toggleLyricsTimestamps(event.currentTarget.checked)}
                />
                {t('song.showLyricsTimestamps')}
              </label>
            ) : null}
            {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
          </div>
        ) : null}
        {activeMode === 'album-art' ? (
          <div className="song-dialog-commandbar music-info-control-commandbar AlbumArtControllerCommandBar" role="toolbar">
            <button type="button" className="change-album-art-button ChangeAlbumArtButton" disabled={saving} onClick={() => void changeArtwork()}>{t('song.changeArtwork')}</button>
            <button type="button" className="song-dialog-primary-button save-album-art-button SaveAlbumArtButton" disabled={saving} onClick={() => void saveArtwork()}>{t('settings.save')}</button>
            <button type="button" className="delete-album-art-button DeleteAlbumArtButton" disabled={saving} onClick={() => setShowArtworkDeleteConfirm(true)}>{t('playlists.delete')}</button>
            {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
          </div>
        ) : null}
        {activeMode === 'properties' ? (
          <div className="song-dialog-body music-info-control-scroll-viewer MusicInfoController">
            {loading || !properties ? (
              <div className="song-dialog-loading-placeholder" aria-label={t('nowPlaying.loading')} />
            ) : (
              <div className="song-dialog-property-list music-info-control-properties-grid MusicInfoControlPropertiesGrid">
                <PropertyRow label={t('table.title')} className="TitlePropertyRow" labelClassName="TitleTextBlock">
                  <input className="title-text-box TitleTextBox" value={properties.title} disabled={saving} onChange={(event) => updateProperty('title', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('song.subtitle')} className="SubtitlePropertyRow" labelClassName="SubtitleTextBlock">
                  <input className="subtitle-text-box SubtitleTextBox" value={properties.subtitle} disabled={saving} onChange={(event) => updateProperty('subtitle', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('common.artist')} className="song-dialog-artist-row ArtistPropertyRow" labelClassName="ArtistTextBlock">
                  <span className="song-dialog-artist-editor ArtistTextBoxPanel">
                    <span
                      className="song-dialog-artist-grid ArtistTextBoxGrid"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(properties.artists.length || 1, 2)}, minmax(0, 1fr))`,
                      }}
                    >
                      {(properties.artists.length > 0 ? properties.artists : ['']).slice(0, MAX_ARTIST_CELLS).map((artist, index) => (
                        <span key={index} className="song-dialog-artist-cell ArtistTextBoxCell">
                          <input
                            className="artist-text-box ArtistTextBox"
                            value={artist}
                            disabled={saving}
                            onChange={(event) => updateArtistCell(index, event.currentTarget.value)}
                          />
                          {properties.artists.length > 1 ? (
                            <button
                              type="button"
                              className="song-dialog-artist-remove-button RemoveArtistButton"
                              disabled={saving}
                              onClick={() => removeArtistCell(index)}
                              aria-label={t('playlists.removeSelected')}
                            >
                              <Icon name="close" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </span>
                    <button
                      type="button"
                      className="song-dialog-icon-button song-dialog-add-artist-button AddArtistButton"
                      disabled={saving || properties.artists.length >= MAX_ARTIST_CELLS}
                      onClick={addArtistCell}
                      aria-label={t('common.add')}
                    >
                      <Icon name="plus" />
                    </button>
                  </span>
                </PropertyRow>
                <PropertyRow label={t('common.album')} className="AlbumPropertyRow" labelClassName="AlbumTextBlock">
                  <input className="album-text-box AlbumTextBox" value={properties.album} disabled={saving} onChange={(event) => updateProperty('album', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('song.albumArtist')} className="AlbumArtistPropertyRow" labelClassName="AlbumArtistTextBlock">
                  <input className="album-artist-text-box AlbumArtistTextBox" value={properties.albumArtist} disabled={saving} onChange={(event) => updateProperty('albumArtist', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('common.playCount')} labelClassName="PlayCountTextBlock">
                  <span className="song-dialog-inline-field music-property-inline-field">
                    <input
                      className="play-count-text-block PlayCountTextBlock"
                      value={properties.playCount || ''}
                      disabled
                      title={
                        properties.playCount === 0
                          ? t('song.notPlayedYet', { title: song.title })
                          : t('song.hasBeenPlayed', { title: song.title, count: properties.playCount })
                      }
                    />
                    {properties.playCount > 0 ? (
                      <button type="button" className="clear-play-count-button ClearPlayCountButton" onClick={() => void clearPlayCount()}>{t('song.clearPlayCount')}</button>
                    ) : null}
                  </span>
                </PropertyRow>
                <PropertyRow label={t('song.publisher')} labelClassName="PublisherTextBlock">
                  <input className="publisher-text-box PublisherTextBox" value={properties.publisher} disabled={saving} onChange={(event) => updateProperty('publisher', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('song.trackNumber')} labelClassName="TrackNumberTextBlock">
                  <input className="track-number-text-box TrackNumberTextBox" inputMode="numeric" value={properties.trackNumber || ''} disabled={saving} onChange={(event) => updateNumericProperty('trackNumber', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('song.year')} labelClassName="YearTextBlock">
                  <input className="year-text-box YearTextBox" inputMode="numeric" value={properties.year || ''} disabled={saving} onChange={(event) => updateNumericProperty('year', event.currentTarget.value)} />
                </PropertyRow>
                <PropertyRow label={t('song.bitrate')} labelClassName="BitrateTextBlock">
                  <input className="bitrate-text-box BitRateTextBox" value={properties.bitrate || ''} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.composers')} labelClassName="ComposersTextBlock">
                  <input className="composers-text-box ComposersTextBox" value={formatTagList(properties.composers)} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.dateCreated')} labelClassName="DateCreatedTextBlock">
                  <input className="date-created-text-box DateCreatedTextBox" value={new Date(properties.dateCreated).toLocaleString()} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.dateModified')} labelClassName="DateModifiedTextBlock">
                  <input className="date-modified-text-box DateModifiedTextBox" value={new Date(properties.dateModified).toLocaleString()} disabled />
                </PropertyRow>
                <PropertyRow label={t('common.duration')} labelClassName="DurationTextBlock">
                  <input className="duration-text-box DurationTextBox" value={formatDuration(properties.duration)} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.fileSize')} labelClassName="FileSizeTextBlock">
                  <input className="file-size-text-box FileSizeTextBox" value={formatBytes(properties.fileSize)} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.fileType')} labelClassName="FileTypeTextBlock">
                  <input className="file-type-text-box FileTypeTextBox" value={properties.fileType} disabled />
                </PropertyRow>
                <PropertyRow label={t('song.genre')} labelClassName="GenreTextBlock">
                  <input className="genre-text-box GenreTextBox" value={formatTagList(properties.genre)} disabled />
                </PropertyRow>
                <PropertyRow label={t('local.path')} labelClassName="PathTextBlock">
                  <span className="song-dialog-inline-field music-property-inline-field">
                    <input className="path-text-box PathTextBox" value={properties.path} disabled />
                    <button type="button" className="show-in-explorer-button ShowInExplorerButton" onClick={() => window.smplayer?.revealItemInFolder(properties.path)}>
                      {t('song.showInExplorer')}
                    </button>
                  </span>
                </PropertyRow>
              </div>
            )}
          </div>
        ) : null}
        {activeMode === 'lyrics' ? (
          <div className="song-dialog-body song-dialog-lyrics MusicLyricsControl MusicLyricsController">
            {pendingSwitchLyrics ? (
              <div className="song-dialog-warning save-lyrics-later-panel pending-switch-lyrics-panel">
                <p>{t('song.pendingSaveLyrics', { title: pendingSwitchLyrics.title })}</p>
                <button
                  type="button"
                  className="SaveLyricsButton"
                  disabled={saving}
                  onClick={() => void saveLyricsImmediately(pendingSwitchLyrics, true)}
                >
                  {t('song.saveImmediately')}
                </button>
                <button type="button" className="DiscardLyricsButton" disabled={saving} onClick={discardPendingSwitchLyrics}>
                  {t('song.discardChanges')}
                </button>
              </div>
            ) : null}
            {pendingLyricsSave ? (
              <div className="song-dialog-warning save-lyrics-later-panel">
                <p>{t('song.saveLyricsLater', { title: pendingLyricsSave.title })}</p>
                <button type="button" className="SaveLyricsButton" disabled={saving} onClick={() => void saveLyricsImmediately(pendingLyricsSave)}>{t('song.saveImmediately')}</button>
              </div>
            ) : null}
            <textarea
              className="LyricsTextBox"
              ref={lyricsTextAreaRef}
              value={lyricsText}
              disabled={saving}
              placeholder={lyrics?.source === 'none' ? t('nowPlaying.noLyrics') : ''}
              onChange={(event) => {
                const nextText = event.currentTarget.value
                setLyricsText(nextText)
                if (showLyricsTimestamps) {
                  setLyricsRawText(nextText)
                }
                setPendingLyricsSave(null)
                setStatusMessage('')
              }}
            />
          </div>
        ) : null}
        {activeMode === 'album-art' ? (
          <div className="song-dialog-body song-dialog-artwork AlbumArtControl AlbumArtController AlbumArtControlPanel">
            <AlbumArtControl
              title={song.title}
              artworkUrl={artworkUrl}
              className="AlbumArt"
              fallbackClassName="NoAlbumArtTextBlock"
              fallbackText={t('song.noAlbumArt')}
            />
            {showArtworkDeleteConfirm ? (
              <div className="song-dialog-warning RemoveAlbumArtWarningPanel">
                <p className="RemoveAlbumArtWarningTextBlock">{t('song.removeAlbumArt', { title: song.title })}</p>
                <button type="button" className="ConfirmButton" disabled={saving} onClick={() => void deleteArtwork()}>{t('common.yes')}</button>
                <button type="button" className="CancelButton" disabled={saving} onClick={() => setShowArtworkDeleteConfirm(false)}>{t('common.cancel')}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
