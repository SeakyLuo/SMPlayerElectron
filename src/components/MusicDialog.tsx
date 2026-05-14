import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { getDisplayArtists, getSongArtists, normalizeArtists } from '../shared/artists'
import type { LibrarySong, LyricsSnapshot, SongPropertiesSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { hasLyricsTimestamps, mergePlainLyricsWithTimedRaw, stripLyricsTimestamps } from '../shared/lyrics'
import { useLibraryStore } from '../state/useLibraryStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { useMusicDialogShortcuts } from '../hooks/useMusicDialogShortcuts'
import { AlbumArtLibraryPickerDialog, type AlbumArtLibraryChoice } from './AlbumArtLibraryPickerDialog'
import { requestConfirmDialog } from './dialogService'
import { Icon } from './icons'
import { MusicAlbumArtControl, type AlbumArtRecommendation } from './MusicAlbumArtControl'
import { MAX_ARTIST_CELLS, MusicInfoControl } from './MusicInfoControl'
import { MusicLyricsControl } from './MusicLyricsControl'
import { PopupDialog } from './PopupDialog'

type SongDialogMode = 'properties' | 'lyrics' | 'album-art'
type PendingLyricsSnapshot = { songId: number; title: string; lyrics: string }

function normalizeArtworkMatchText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[（(【[].*?[）)】\]]/gu, '')
    .replace(/[\s\-_.·・:：,，/\\|]+/gu, '')
    .trim()
}

function isSimilarArtworkTitle(left: string, right: string) {
  const normalizedLeft = normalizeArtworkMatchText(left)
  const normalizedRight = normalizeArtworkMatchText(right)

  return normalizedLeft.length >= 2 &&
    normalizedRight.length >= 2 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
}

function getAlbumArtRecommendationCandidates(song: LibrarySong, songs: LibrarySong[]) {
  const artistKeys = new Set(getSongArtists(song).map((artist) => artist.toLocaleLowerCase()))

  return songs
    .filter((candidate) => candidate.id !== song.id)
    .map((candidate) => {
      const sameArtist = getSongArtists(candidate).some((artist) => artistKeys.has(artist.toLocaleLowerCase()))
      if (!sameArtist) {
        return null
      }

      const sameAlbum = song.album.trim() !== '' && candidate.album === song.album
      const similarTitle = isSimilarArtworkTitle(song.title, candidate.title)
      if (!sameAlbum && !similarTitle) {
        return null
      }

      return {
        song: candidate,
        score: (sameAlbum ? 10 : 0) + (similarTitle ? 4 : 0) + (candidate.playCount > 0 ? 1 : 0),
      }
    })
    .filter((candidate): candidate is { song: LibrarySong; score: number } => candidate != null)
    .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title))
    .slice(0, 24)
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
  const [originalArtworkUrl, setOriginalArtworkUrl] = useState(song.artworkUrl)
  const [artworkSourcePath, setArtworkSourcePath] = useState('')
  const [artworkMissing, setArtworkMissing] = useState(false)
  const [originalArtworkMissing, setOriginalArtworkMissing] = useState(false)
  const [artworkLoading, setArtworkLoading] = useState(true)
  const [artworkRecommendation, setArtworkRecommendation] = useState<AlbumArtRecommendation | null>(null)
  const [libraryArtworkPickerOpen, setLibraryArtworkPickerOpen] = useState(false)
  const [showArtworkDeleteConfirm, setShowArtworkDeleteConfirm] = useState(false)
  const [pendingSwitchLyrics, setPendingSwitchLyrics] = useState<PendingLyricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [lyricsLoading, setLyricsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const showNotificationButtons = useUndoableNotificationStore((state) => state.showButtons)
  const showNotification = useUndoableNotificationStore((state) => state.showMessage)
  const librarySongs = useLibraryStore((state) => state.snapshot.songs)
  const dialogRef = useRef<HTMLElement | null>(null)
  const dialogScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const lyricsScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const lyricsTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const latestLyricsRef = useRef<{
    activeMode: SongDialogMode
    dirty: boolean
    lyrics: string
    originalLyrics: string
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
  const propertiesBusy = loading || saving
  const lyricsBusy = lyricsLoading || saving
  const playQueue = useMemo(() => {
    return queueSongIds.includes(song.id) ? queueSongIds : [...queueSongIds, song.id]
  }, [queueSongIds, song.id])
  const albumArtRecommendationCandidates = useMemo(
    () => getAlbumArtRecommendationCandidates(song, librarySongs),
    [librarySongs, song],
  )
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
        onSaved?.()
      }
      setPendingSwitchLyrics((current) => current?.songId === snapshot.songId ? null : current)
      if (refreshLatestLyrics) {
        const currentTitle = getCurrentTrackTitle() || song.title
        showNotification(t('song.lyricsUpdatedAndRefreshed', { savedTitle: snapshot.title, currentTitle }))
      } else {
        showNotification(t('song.lyricsUpdated', { title: snapshot.title }))
      }
    } catch {
      showNotification(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }, [getCurrentTrackTitle, onSaved, showNotification, song.id, song.title, t])
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
    if (
      previous &&
      previous.songId !== song.id &&
      previous.activeMode === 'lyrics' &&
      previous.dirty
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
    setLyricsLoading(true)
    void window.smplayer?.getLyrics(song.id, 'embedded')
      .then((snapshot) => {
        if (canceled) {
          return
        }

        setLyrics(snapshot)
        setLyricsRawText(snapshot.rawText)
        setLyricsText(snapshot.rawText)
        setOriginalLyricsText(snapshot.rawText)
        setLyricsLoading(false)
      })
      .catch(() => {
        if (!canceled) {
          setLyricsLoading(false)
          showNotification(t('song.getLyricsFailed'))
        }
      })

    setArtworkLoading(true)
    setArtworkUrl(song.artworkUrl)
    setOriginalArtworkUrl(song.artworkUrl)
    setArtworkSourcePath('')
    setArtworkMissing(false)
    setOriginalArtworkMissing(false)
    setArtworkRecommendation(null)
    setShowArtworkDeleteConfirm(false)
    void window.smplayer?.getSongArtworkSnapshot(song.id)
      .then((snapshot) => {
        if (!canceled) {
          const missing = snapshot.source === 'none' || !snapshot.artworkUrl
          setArtworkUrl(snapshot.artworkUrl)
          setOriginalArtworkUrl(snapshot.artworkUrl)
          setArtworkMissing(missing)
          setOriginalArtworkMissing(missing)
        }
      })
      .finally(() => {
        if (!canceled) {
          setArtworkLoading(false)
        }
      })

    return () => {
      canceled = true
    }
  }, [showNotification, song.id, t])

  useEffect(() => {
    if (!artworkMissing) {
      setArtworkRecommendation(null)
      return
    }

    let canceled = false
    const candidateSongIds = albumArtRecommendationCandidates.map((candidate) => candidate.song.id)
    if (candidateSongIds.length === 0) {
      setArtworkRecommendation(null)
      return
    }

    void window.smplayer?.getSongArtworkSnapshots(candidateSongIds).then((snapshots) => {
      if (canceled) {
        return
      }

      const snapshotsBySongId = new Map(snapshots.map((snapshot) => [snapshot.songId, snapshot]))
      const recommendationCandidate = albumArtRecommendationCandidates.find((candidate) => {
        const snapshot = snapshotsBySongId.get(candidate.song.id)!
        return snapshot.source !== 'none' && snapshot.sourcePath !== '' && snapshot.sourceUrl !== ''
      })
      if (!recommendationCandidate) {
        setArtworkRecommendation(null)
        return
      }

      const snapshot = snapshotsBySongId.get(recommendationCandidate.song.id)!
      setArtworkRecommendation({
        song: recommendationCandidate.song,
        artworkUrl: snapshot.artworkUrl,
        sourceUrl: snapshot.sourceUrl,
        sourcePath: snapshot.sourcePath,
        artistName: getDisplayArtists(recommendationCandidate.song, t('common.artistUnknown')),
      })
    })

    return () => {
      canceled = true
    }
  }, [albumArtRecommendationCandidates, artworkMissing, t])

  useEffect(() => {
    const previousTrackId = previousTrackIdRef.current
    previousTrackIdRef.current = currentTrackId
    const latest = latestLyricsRef.current

    if (
      latest &&
      previousTrackId === latest.songId &&
      currentTrackId !== latest.songId &&
      latest.activeMode === 'lyrics' &&
      latest.dirty
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
      songId: song.id,
      title: song.title,
    }
  })

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
  const propertiesDirty = properties != null && originalProperties != null &&
    isPropertiesModified(properties, originalProperties)

  const switchMode = (nextMode: SongDialogMode) => {
    setActiveMode(nextMode)
  }

  const requestClose = () => {
    if (!lyricsDirty) {
      onClose()
      return
    }

    void requestConfirmDialog({
      title: t('common.confirm'),
      message: t('song.discardLyricsConfirm'),
    }).then((confirmed) => {
      if (confirmed) {
        onClose()
      }
    })
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
        showNotification(t('song.propertiesUpdated'))
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
      showNotification(t('song.propertiesUpdated'))
      onSaved?.()
    } catch {
      showNotification(t('song.updateFailed'))
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
    onSaved?.()
  }

  const saveLyrics = async () => {
    if (saving) {
      showNotification(t('song.processingRequest'))
      return
    }

    if (currentLyricsRawText === originalLyricsText) {
      showNotification(t('song.nothingChanged'))
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
      showNotification(t('song.processingRequest'))
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
          showNotification(t('song.openBrowserSuccessful'))
        } catch {
          showNotification(t('song.searchLyricsFailed'))
        }
        return
      }
      if (snapshot?.rawText.trim()) {
        setLyrics(snapshot)
        updateLyricsEditorRawText(snapshot.rawText)
        if (before === (showLyricsTimestamps ? snapshot.rawText : stripLyricsTimestamps(snapshot.rawText))) {
          showNotification(t('song.nothingChanged'))
          return
        }

        showNotification(t('song.searchLyricsSuccessful'))
        requestAnimationFrame(scrollLyricsToTop)
        return
      }

      try {
        await window.smplayer?.openLyricsSearchInBrowser(song.id)
        showNotification(t('song.openBrowserSuccessful'))
      } catch {
        showNotification(t('song.searchLyricsFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const importLyrics = async () => {
    if (saving) {
      showNotification(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const result = await window.smplayer?.importLyrics()
      if (result && !result.canceled) {
        updateLyricsEditorRawText(result.rawText)
        requestAnimationFrame(scrollLyricsToTop)
      }
    } catch {
      showNotification(t('song.importLyricsFailed'))
    } finally {
      setSaving(false)
    }
  }

  const changeArtwork = async () => {
    if (saving) {
      showNotification(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      const result = await window.smplayer?.pickSongArtworkSource()
      if (result && !result.canceled) {
        if (result.error === 'error') {
          showNotification(t('song.updateFailed'))
          return
        }

        if (result.error === 'no-artwork') {
          showNotification(t('song.musicNoAlbumArt', { title: result.sourceName }))
          return
        }

        setArtworkUrl(result.artworkUrl)
        setArtworkSourcePath(result.sourcePath)
        setArtworkMissing(false)
        setArtworkRecommendation(null)
        setShowArtworkDeleteConfirm(false)
      }
    } catch {
      showNotification(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const saveArtwork = async () => {
    if (saving) {
      showNotification(t('song.processingRequest'))
      return
    }

    if (!artworkSourcePath) {
      return
    }

    setSaving(true)
    try {
      await window.smplayer?.saveSongArtwork(song.id, artworkSourcePath)
      setOriginalArtworkUrl(artworkUrl)
      setOriginalArtworkMissing(false)
      setArtworkSourcePath('')
      showNotification(t('song.albumArtSaved'))
      onSaved?.()
    } catch {
      showNotification(t('song.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const deleteArtwork = async () => {
    if (saving) {
      showNotification(t('song.processingRequest'))
      return
    }

    setSaving(true)
    try {
      await window.smplayer?.deleteSongArtwork(song.id)
      setArtworkUrl('')
      setOriginalArtworkUrl('')
      setArtworkSourcePath('')
      setArtworkMissing(true)
      setOriginalArtworkMissing(true)
      setShowArtworkDeleteConfirm(false)
      showNotification(t('song.albumArtDeleted'))
      onSaved?.()
    } catch {
      showNotification(t('song.updateFailed'))
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

  const applyAlbumArtRecommendation = (recommendation: AlbumArtRecommendation) => {
    setArtworkUrl(recommendation.sourceUrl)
    setArtworkSourcePath(recommendation.sourcePath)
    setArtworkMissing(false)
    setShowArtworkDeleteConfirm(false)
  }

  const applyAlbumArtLibraryChoice = (choice: AlbumArtLibraryChoice) => {
    setArtworkUrl(choice.sourceUrl)
    setArtworkSourcePath(choice.sourcePath)
    setArtworkMissing(false)
    setArtworkRecommendation(null)
    setShowArtworkDeleteConfirm(false)
    setLibraryArtworkPickerOpen(false)
  }

  const resetArtwork = () => {
    setArtworkUrl(originalArtworkUrl)
    setArtworkSourcePath('')
    setArtworkMissing(originalArtworkMissing)
    setArtworkRecommendation(null)
    setShowArtworkDeleteConfirm(false)
    showNotification(t('song.albumArtReset'))
  }

  const resetActivePage = () => {
    if (activeMode === 'properties' && propertiesDirty && originalProperties) {
      setProperties(originalProperties)
      showNotification(t('song.propertiesReset'))
    }
    if (activeMode === 'lyrics' && lyricsDirty) {
      updateLyricsEditorRawText(originalLyricsText)
      requestAnimationFrame(scrollLyricsToTop)
      showNotification(t('song.lyricsReset'))
    }
    if (activeMode === 'album-art' && artworkSourcePath) {
      resetArtwork()
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
  }, [activeMode, loading, saving, properties, lyricsText, pendingSwitchLyrics, showArtworkDeleteConfirm])

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
  }, [activeMode, lyricsText, pendingSwitchLyrics, saving])

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

  return (
    <>
      <PopupDialog
      t={t}
      dialogRef={dialogRef}
      overlayClassName="music-dialog-overlay MusicDialogOverlay"
      className="music-dialog ContentDialog MusicDialog"
      navClassName="music-dialog-pivot MusicDialogPivot"
      navLabel={t('context.seeMusicInfo')}
      ariaLabel={song.title}
      onClose={requestClose}
      navChildren={(
        <>
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
        </>
      )}
      footer={(
        <>
          <div className="song-dialog-scrollbar" ref={dialogScrollbarTrackRef} aria-hidden="true">
            <div className="song-dialog-scrollbar-thumb" onPointerDown={onDialogScrollbarPointerDown} />
          </div>
          <div className="song-dialog-lyrics-scrollbar" ref={lyricsScrollbarTrackRef} aria-hidden="true">
            <div className="song-dialog-lyrics-scrollbar-thumb" onPointerDown={onLyricsScrollbarPointerDown} />
          </div>
        </>
      )}
    >
        {activeMode === 'properties' ? (
          <MusicInfoControl
            song={song}
            t={t}
            loading={loading}
            saving={saving}
            showBusy={propertiesBusy}
            controlsDisabled={controlsDisabled}
            canPause={canPause}
            properties={properties}
            onPlay={play}
            onSave={() => void saveProperties()}
            {...(propertiesDirty ? { onReset: resetActivePage } : {})}
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
            loading={lyricsLoading}
            saving={saving}
            showBusy={lyricsBusy}
            lyrics={lyrics}
            lyricsText={lyricsText}
            lyricsTextAreaRef={lyricsTextAreaRef}
            lyricsCanToggleTimestamps={lyricsCanToggleTimestamps}
            showLyricsTimestamps={showLyricsTimestamps}
            onSearch={() => void searchLyrics()}
            onImport={() => void importLyrics()}
            onSave={() => void saveLyrics()}
            {...(lyricsDirty ? { onReset: resetActivePage } : {})}
            onToggleTimestamps={toggleLyricsTimestamps}
            onLyricsTextChange={(nextText) => {
              setLyricsText(nextText)
              if (showLyricsTimestamps) {
                setLyricsRawText(nextText)
              }
            }}
          />
        ) : null}
        {activeMode === 'album-art' ? (
          <MusicAlbumArtControl
            song={song}
            t={t}
            loading={artworkLoading}
            saving={saving}
            showBusy={artworkLoading || saving}
            artworkUrl={artworkUrl}
            recommendation={artworkMissing ? artworkRecommendation : null}
            showDeleteConfirm={showArtworkDeleteConfirm}
            onApplyRecommendation={applyAlbumArtRecommendation}
            onChangeArtwork={() => void changeArtwork()}
            onChooseArtworkFromLibrary={() => setLibraryArtworkPickerOpen(true)}
            onSaveArtwork={() => void saveArtwork()}
            {...(artworkSourcePath ? { onResetArtwork: resetArtwork } : {})}
            onRequestDelete={() => setShowArtworkDeleteConfirm(true)}
            onConfirmDelete={() => void deleteArtwork()}
            onCancelDelete={() => setShowArtworkDeleteConfirm(false)}
          />
        ) : null}
      </PopupDialog>
      {libraryArtworkPickerOpen ? (
        <AlbumArtLibraryPickerDialog
          albumName={song.album}
          currentSong={song}
          songs={librarySongs}
          t={t}
          onApply={applyAlbumArtLibraryChoice}
          onClose={() => setLibraryArtworkPickerOpen(false)}
        />
      ) : null}
    </>
  )
}
