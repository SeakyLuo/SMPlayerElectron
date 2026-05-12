import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

import { normalizeArtists } from '../shared/artists'
import type { LibrarySong, LyricsSnapshot, SongPropertiesSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { hasLyricsTimestamps, mergePlainLyricsWithTimedRaw, stripLyricsTimestamps } from '../shared/lyrics'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useMusicDialogShortcuts } from '../hooks/useMusicDialogShortcuts'
import { requestConfirmDialog } from './dialogService'
import { Icon } from './icons'
import { MusicAlbumArtControl } from './MusicAlbumArtControl'
import { MAX_ARTIST_CELLS, MusicInfoControl } from './MusicInfoControl'
import { MusicLyricsControl } from './MusicLyricsControl'

type SongDialogMode = 'properties' | 'lyrics' | 'album-art'
type PendingLyricsSnapshot = { songId: number; title: string; lyrics: string }

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
  const showButtonedNotification = useUndoableNotificationStore((state) => state.show)
  const showNotificationButtons = useUndoableNotificationStore((state) => state.showButtons)
  const dialogRef = useRef<HTMLElement | null>(null)
  const dialogScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const lyricsScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
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
  const getCurrentTrackTitle = useCallback(() => {
    if (currentTrackId == null) {
      return ''
    }

    return useLibraryStore.getState().snapshot.songs.find((item) => item.id === currentTrackId)?.title ?? song.title
  }, [currentTrackId, song.title])
  const saveLyricsSnapshot = useCallback(async (
    snapshot: PendingLyricsSnapshot,
    refreshLatestLyrics = false,
  ) => {
    setSaving(true)
    try {
      await window.smplayer?.saveSongLyrics(snapshot.songId, snapshot.lyrics)
      if (snapshot.songId === song.id) {
        setLyricsRawText(snapshot.lyrics)
        setOriginalLyricsText(snapshot.lyrics)
        setLyrics((current) => current ? { ...current, rawText: snapshot.lyrics } : current)
        setPendingLyricsSave(null)
        onSaved?.()
      }
      setPendingSwitchLyrics((current) => current?.songId === snapshot.songId ? null : current)
      if (refreshLatestLyrics) {
        const currentTitle = getCurrentTrackTitle() || song.title
        setStatusMessage(t('song.lyricsUpdatedAndRefreshed', { savedTitle: snapshot.title, currentTitle }))
      } else {
        setStatusMessage(t('song.lyricsUpdated', { title: snapshot.title }))
      }
    } catch {
      setStatusMessage(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }, [getCurrentTrackTitle, onSaved, song.id, song.title, t])
  const showSaveLyricsLaterNotification = useCallback((snapshot: PendingLyricsSnapshot) => {
    showButtonedNotification(
      t('song.saveLyricsLater', { title: snapshot.title }),
      t('song.saveImmediately'),
      () => {
        void saveLyricsSnapshot(snapshot)
      },
    )
  }, [saveLyricsSnapshot, showButtonedNotification, t])
  const showPendingSwitchLyricsNotification = useCallback((snapshot: PendingLyricsSnapshot) => {
    showNotificationButtons(
      t('song.pendingSaveLyrics', { title: snapshot.title }),
      [
        {
          text: t('song.saveImmediately'),
          action: () => {
            void saveLyricsSnapshot(snapshot, true)
          },
        },
        {
          text: t('song.discardChanges'),
          action: () => {
            if (snapshot.songId === song.id) {
              setLyricsRawText(originalLyricsText)
              setLyricsText(showLyricsTimestamps ? originalLyricsText : stripLyricsTimestamps(originalLyricsText))
            }
            setPendingSwitchLyrics(null)
            setStatusMessage('')
          },
        },
      ],
    )
  }, [originalLyricsText, saveLyricsSnapshot, showLyricsTimestamps, showNotificationButtons, song.id, t])
  const showPendingSwitchLyricsNotificationRef = useRef(showPendingSwitchLyricsNotification)

  useEffect(() => {
    setActiveMode(mode)
  }, [mode])

  useEffect(() => {
    showPendingSwitchLyricsNotificationRef.current = showPendingSwitchLyricsNotification
  }, [showPendingSwitchLyricsNotification])

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
      const pending = {
        songId: previous.songId,
        title: previous.title,
        lyrics: previous.lyrics,
      }
      setPendingSwitchLyrics(pending)
      showPendingSwitchLyricsNotificationRef.current(pending)
    }
  }, [song.id])

  useEffect(() => {
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
      const pending = {
        songId: latest.songId,
        title: latest.title,
        lyrics: latest.lyrics,
      }
      setPendingSwitchLyrics(pending)
      showPendingSwitchLyricsNotificationRef.current(pending)
    }
  }, [currentTrackId])

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
    if (!pendingLyricsSave || currentTrackId === pendingLyricsSave.songId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void saveLyricsSnapshot(pendingLyricsSave, currentTrackId != null)
    }, 3000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentTrackId, pendingLyricsSave, saveLyricsSnapshot])

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
    if (activeMode === 'lyrics' && lyricsDirty) {
      void requestConfirmDialog({
        title: t('common.confirm'),
        message: t('song.discardLyricsConfirm'),
      }).then((confirmed) => {
        if (confirmed) {
          setActiveMode(nextMode)
          setStatusMessage('')
        }
      })
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
  const getDialogTabLabel = (label: string) => label.replace(/^查看\s*/, '').replace(/^See\s+/i, '')

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
      const pending = { songId: song.id, title: song.title, lyrics: currentLyricsRawText }
      setPendingLyricsSave(pending)
      showSaveLyricsLaterNotification(pending)
      return
    }

    await saveLyricsImmediately()
  }

  const saveLyricsImmediately = async (
    override?: { songId: number; title: string; lyrics: string },
    refreshLatestLyrics = false,
  ) => {
    await saveLyricsSnapshot(
      override ?? { songId: song.id, title: song.title, lyrics: currentLyricsRawText },
      refreshLatestLyrics,
    )
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

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const scrollContainer = dialog?.querySelector('.song-dialog-body')
    if (!dialog || !(scrollContainer instanceof HTMLElement)) {
      return
    }

    let animationFrame = 0
    const updateScrollbar = () => {
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      const trackHeight = scrollContainer.clientHeight
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((trackHeight / scrollContainer.scrollHeight) * trackHeight))
        : trackHeight
      const thumbTop = maxScrollTop > 0
        ? Math.round((scrollContainer.scrollTop / maxScrollTop) * Math.max(0, trackHeight - thumbHeight))
        : 0
      const dialogRect = dialog.getBoundingClientRect()
      const scrollRect = scrollContainer.getBoundingClientRect()

      dialog.style.setProperty('--song-dialog-scrollbar-top', `${scrollRect.top - dialogRect.top}px`)
      dialog.style.setProperty('--song-dialog-scrollbar-bottom', `${dialogRect.bottom - scrollRect.bottom}px`)
      dialog.style.setProperty('--song-dialog-scrollbar-thumb-height', `${thumbHeight}px`)
      dialog.style.setProperty('--song-dialog-scrollbar-thumb-top', `${thumbTop}px`)
      dialog.classList.toggle('has-dialog-scrollbar', maxScrollTop > 1)
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateScrollbar)
    }

    updateScrollbar()
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(dialog)
    resizeObserver.observe(scrollContainer)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [activeMode, loading, saving, properties, lyricsText, pendingLyricsSave, pendingSwitchLyrics, showArtworkDeleteConfirm])

  const onDialogScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current
    const scrollContainer = dialog?.querySelector('.song-dialog-body')
    const scrollbarTrack = dialogScrollbarTrackRef.current
    if (!(scrollContainer instanceof HTMLElement) || !dialog || !scrollbarTrack) {
      return
    }

    event.preventDefault()
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const thumbHeight = Number.parseFloat(getComputedStyle(dialog).getPropertyValue('--song-dialog-scrollbar-thumb-height'))
    const trackRange = Math.max(1, scrollbarTrack.clientHeight - thumbHeight)
    const scrollPerPixel = maxScrollTop / trackRange
    const startY = event.clientY
    const startScrollTop = scrollContainer.scrollTop
    const onPointerMove = (moveEvent: PointerEvent) => {
      scrollContainer.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const textArea = lyricsTextAreaRef.current
    if (!dialog || !textArea || activeMode !== 'lyrics') {
      dialog?.classList.remove('has-lyrics-scrollbar')
      return
    }

    let animationFrame = 0
    const updateScrollbar = () => {
      const maxScrollTop = Math.max(0, textArea.scrollHeight - textArea.clientHeight)
      const trackHeight = textArea.clientHeight
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((trackHeight / textArea.scrollHeight) * trackHeight))
        : trackHeight
      const thumbTop = maxScrollTop > 0
        ? Math.round((textArea.scrollTop / maxScrollTop) * Math.max(0, trackHeight - thumbHeight))
        : 0
      const dialogRect = dialog.getBoundingClientRect()
      const textAreaRect = textArea.getBoundingClientRect()

      dialog.style.setProperty('--song-dialog-lyrics-scrollbar-top', `${textAreaRect.top - dialogRect.top}px`)
      dialog.style.setProperty('--song-dialog-lyrics-scrollbar-bottom', `${dialogRect.bottom - textAreaRect.bottom}px`)
      dialog.style.setProperty('--song-dialog-lyrics-scrollbar-thumb-height', `${thumbHeight}px`)
      dialog.style.setProperty('--song-dialog-lyrics-scrollbar-thumb-top', `${thumbTop}px`)
      dialog.classList.toggle('has-lyrics-scrollbar', maxScrollTop > 1)
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateScrollbar)
    }

    updateScrollbar()
    textArea.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(dialog)
    resizeObserver.observe(textArea)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      textArea.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [activeMode, lyricsText, pendingLyricsSave, pendingSwitchLyrics, saving])

  const onLyricsScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current
    const textArea = lyricsTextAreaRef.current
    const scrollbarTrack = lyricsScrollbarTrackRef.current
    if (!dialog || !textArea || !scrollbarTrack) {
      return
    }

    event.preventDefault()
    const maxScrollTop = Math.max(0, textArea.scrollHeight - textArea.clientHeight)
    const thumbHeight = Number.parseFloat(getComputedStyle(dialog).getPropertyValue('--song-dialog-lyrics-scrollbar-thumb-height'))
    const trackRange = Math.max(1, scrollbarTrack.clientHeight - thumbHeight)
    const scrollPerPixel = maxScrollTop / trackRange
    const startY = event.clientY
    const startScrollTop = textArea.scrollTop
    const onPointerMove = (moveEvent: PointerEvent) => {
      textArea.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return createPortal(
    <div className="song-dialog-overlay music-dialog-overlay MusicDialogOverlay">
      <section
        ref={dialogRef}
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
            <Icon name="info" />
            {getDialogTabLabel(t('context.seeMusicInfo'))}
          </button>
          <button type="button" className={`LyricsItem LyricsPivotItem${activeMode === 'lyrics' ? ' is-active' : ''}`} onClick={() => switchMode('lyrics')}>
            <Icon name="lyrics" />
            {getDialogTabLabel(t('context.seeLyrics'))}
          </button>
          <button type="button" className={`AlbumArtItem AlbumArtPivotItem${activeMode === 'album-art' ? ' is-active' : ''}`} onClick={() => switchMode('album-art')}>
            <Icon name="pictures" />
            {getDialogTabLabel(t('context.seeAlbumArt'))}
          </button>
          <button type="button" className="song-dialog-icon-button music-dialog-close-button CloseButton" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="arrowLeft" className="dialog-back-icon" />
            <Icon name="close" className="dialog-close-icon" />
          </button>
          <span className="dialog-titlebar-title">{t('app.shell')}</span>
        </nav>
        {statusMessage ? <p className="song-dialog-status">{statusMessage}</p> : null}
        {activeMode === 'properties' ? (
          <MusicInfoControl
            song={song}
            t={t}
            loading={loading}
            saving={saving}
            showBusy={showBusy}
            controlsDisabled={controlsDisabled}
            canPause={canPause}
            properties={properties}
            onPlay={play}
            onSave={() => void saveProperties()}
            onReset={resetActivePage}
            onClearPlayCount={() => void clearPlayCount()}
            onUpdateProperty={updateProperty}
            onUpdateArtistCell={updateArtistCell}
            onAddArtistCell={addArtistCell}
            onRemoveArtistCell={removeArtistCell}
            onUpdateNumericProperty={updateNumericProperty}
          />
        ) : null}
        {activeMode === 'lyrics' ? (
          <MusicLyricsControl
            t={t}
            saving={saving}
            showBusy={showBusy}
            lyrics={lyrics}
            lyricsText={lyricsText}
            lyricsTextAreaRef={lyricsTextAreaRef}
            lyricsCanToggleTimestamps={lyricsCanToggleTimestamps}
            showLyricsTimestamps={showLyricsTimestamps}
            onSearch={() => void searchLyrics()}
            onImport={() => void importLyrics()}
            onSave={() => void saveLyrics()}
            onReset={resetActivePage}
            onToggleTimestamps={toggleLyricsTimestamps}
            onLyricsTextChange={(nextText) => {
              setLyricsText(nextText)
              if (showLyricsTimestamps) {
                setLyricsRawText(nextText)
              }
              setPendingLyricsSave(null)
              setStatusMessage('')
            }}
          />
        ) : null}
        {activeMode === 'album-art' ? (
          <MusicAlbumArtControl
            song={song}
            t={t}
            saving={saving}
            showBusy={showBusy}
            artworkUrl={artworkUrl}
            showDeleteConfirm={showArtworkDeleteConfirm}
            onChangeArtwork={() => void changeArtwork()}
            onSaveArtwork={() => void saveArtwork()}
            onRequestDelete={() => setShowArtworkDeleteConfirm(true)}
            onConfirmDelete={() => void deleteArtwork()}
            onCancelDelete={() => setShowArtworkDeleteConfirm(false)}
          />
        ) : null}
        <div className="song-dialog-scrollbar" ref={dialogScrollbarTrackRef} aria-hidden="true">
          <div className="song-dialog-scrollbar-thumb" onPointerDown={onDialogScrollbarPointerDown} />
        </div>
        <div className="song-dialog-lyrics-scrollbar" ref={lyricsScrollbarTrackRef} aria-hidden="true">
          <div className="song-dialog-lyrics-scrollbar-thumb" onPointerDown={onLyricsScrollbarPointerDown} />
        </div>
      </section>
    </div>,
    document.body,
  )
}
