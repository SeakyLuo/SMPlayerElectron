import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { DEFAULT_ALBUM_ARTWORK_URL } from '../shared/staticAssets'
import { requestTextDialog } from '../components/dialogService'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import { MusicDialog } from '../components/MusicDialog'
import { MediaControlSurface, type VoiceAssistantResponse } from '../components/MediaControl'
import type { MenuFlyoutPosition } from '../components/MenuFlyoutHelper'
import { getDisplayArtists } from '../shared/artists'
import { extractArtworkColorRgb, getDefaultArtworkColorRgb } from '../shared/artworkColor'
import type {
  LibraryPlaylist,
  LibrarySong,
  LyricsSnapshot,
  PlaybackMode,
  PreferenceItemSnapshot,
} from '../shared/contracts'
import { formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { randomLibrary } from '../shared/RandomPlayHelper'
import { quickPlay } from '../shared/QuickPlayHelper'
import { removeQueueRange } from '../shared/queueUndo'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import {
  getCurrentClockMinute,
  getDefaultNewPlaylistName,
  getNowPlayingFullMoreItems,
  isMinuteInNightRange,
  QUICK_PLAY_LIMIT,
  timeToMinute,
} from './nowPlayingFullModel'
import { NowPlayingFullPlaylist } from './NowPlayingFullPlaylist'

const DEFAULT_ARTWORK_URL = DEFAULT_ALBUM_ARTWORK_URL
const LYRICS_RESTORE_DELAY_MS = 5000
const LYRICS_SCROLL_DURATION_MS = 360
const PLAYER_BAR_AUTO_HIDE_DELAY_MS = 5000
const COMPACT_IMMERSIVE_QUERY = '(max-width: 760px)'

type FullDialogMode = 'properties' | 'lyrics' | 'album-art'

interface ImmersiveLyricsLine {
  id: number
  text: string
  seekSeconds: number
  active: boolean
}

interface NowPlayingFullPageProps {
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  currentSong: LibrarySong | null
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
  loading: boolean
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  resolvedArtworkUrl: string
  error: string | null
  onClose: () => void
  onTogglePlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onBeginSeek: () => void
  onEndSeek: () => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  voiceLanguage: string
  onPlayTrack: (trackId: number, queueSongIds: number[], queueIndex?: number) => void
  onReplaceQueue: (songIds: number[]) => void
  onPlayNext: (songId: number, queueIndex?: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongs: (songIds: number[]) => void
  onDeleteSongFromDisk: (songId: number) => void
  onClearQueue: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
  onRefresh: () => void | Promise<void>
}

export function NowPlayingFullPage({
  songs,
  librarySongs,
  recentSongs,
  playlists,
  favoritePlaylistId,
  currentSong,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
  loading,
  volume,
  isMuted,
  mode,
  resolvedArtworkUrl,
  error,
  onClose,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onBeginSeek,
  onEndSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
  onVoiceCommand,
  getVoiceHint,
  voiceLanguage,
  onPlayTrack,
  onReplaceQueue,
  onPlayNext,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onToggleFavorite,
  onRemoveSongs,
  onDeleteSongFromDisk,
  onClearQueue,
  onArtworkResolved,
  onRefresh,
}: NowPlayingFullPageProps) {
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false)
  const [dialogMode, setDialogMode] = useState<FullDialogMode | null>(null)
  const [displayLyrics, setDisplayLyrics] = useState<{ trackId: number; lyrics: LyricsSnapshot } | null>(null)
  const [songArtwork, setSongArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const [moreMenu, setMoreMenu] = useState<MenuFlyoutPosition | null>(null)
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [isLyricPreviewing, setIsLyricPreviewing] = useState(false)
  const [isLyricDragging, setIsLyricDragging] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricPreviewIndex, setLyricPreviewIndex] = useState<number | null>(null)
  const [isPlayerBarRaised, setIsPlayerBarRaised] = useState(true)
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultArtworkColorRgb)
  const coverWrapRef = useRef<HTMLDivElement | null>(null)
  const lyricStageRef = useRef<HTMLDivElement | null>(null)
  const lyricLineRefs = useRef<Array<HTMLDivElement | null>>([])
  const lyricRestoreTimerRef = useRef<number | null>(null)
  const playerBarHideTimerRef = useRef<number | null>(null)
  const playerBarPinnedRef = useRef(false)
  const lyricScrollAnimationRef = useRef<number | null>(null)
  const activeLyricsIndexRef = useRef(-1)
  const [isCompactImmersive, setIsCompactImmersive] = useState(() => window.matchMedia(COMPACT_IMMERSIVE_QUERY).matches)
  const isCompactImmersiveRef = useRef(window.matchMedia(COMPACT_IMMERSIVE_QUERY).matches)
  const lyricDragRef = useRef<{ pointerId: number; clientY: number; scrollTop: number; moved: boolean } | null>(null)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const nightMode = useLibraryStore((state) => state.snapshot.settings.nightMode)
  const nightModeStartTime = useLibraryStore((state) => state.snapshot.settings.nightModeStartTime)
  const nightModeEndTime = useLibraryStore((state) => state.snapshot.settings.nightModeEndTime)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const [currentClockMinute, setCurrentClockMinute] = useState(getCurrentClockMinute)
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const currentSongId = currentSong?.id
  const effectiveDuration = durationSeconds || currentSong?.duration || 0
  const progressValue = Math.min(Math.max(progressSeconds, 0), effectiveDuration)
  const artworkUrl =
    currentSong?.artworkUrl ||
    (songArtwork && songArtwork.trackId === currentSong?.id ? songArtwork.artworkUrl : '') ||
    resolvedArtworkUrl
  const displayArtworkUrl = artworkUrl || DEFAULT_ARTWORK_URL
  const artistLabel = currentSong ? getDisplayArtists(currentSong, t('common.artistUnknown')) : t('common.artistUnknown')
  const albumLabel = currentSong?.album || t('common.albumUnknown')
  const disabled = !currentSong
  const currentLyrics = displayLyrics && displayLyrics.trackId === currentSongId ? displayLyrics.lyrics : null
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const lyricsProgressRatio = effectiveDuration > 0 ? progressValue / effectiveDuration : 0
  const displayLyricsLines = useMemo(
    () => getImmersiveLyricsLines(currentLyrics, progressValue, lyricsProgressRatio, effectiveDuration),
    [currentLyrics, effectiveDuration, lyricsProgressRatio, progressValue],
  )
  const activeLyricsIndex = useMemo(
    () => displayLyricsLines.findIndex((line) => line.active),
    [displayLyricsLines],
  )
  const previewLyricIndex = isLyricPreviewing ? lyricPreviewIndex : null
  const isPlayerBarPinned = dialogMode !== null || moreMenu !== null
  const immersiveNightActive = nightMode === 'on' || (
    nightMode === 'auto' &&
    isMinuteInNightRange(currentClockMinute, timeToMinute(nightModeStartTime), timeToMinute(nightModeEndTime))
  )

  const refreshPreferenceItem = async () => {
    if (currentSong) {
      const settings = await window.smplayer!.getPreferenceSettings()
      setPreferenceItem(settings.songs.find((item) => item.itemId === String(currentSong.id)) ?? null)
    }
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_IMMERSIVE_QUERY)
    const updateCompactImmersive = () => {
      isCompactImmersiveRef.current = mediaQuery.matches
      setIsCompactImmersive(mediaQuery.matches)
    }

    updateCompactImmersive()
    mediaQuery.addEventListener('change', updateCompactImmersive)
    return () => {
      mediaQuery.removeEventListener('change', updateCompactImmersive)
    }
  }, [])

  useEffect(() => {
    let canceled = false

    extractArtworkColorRgb(artworkUrl)
      .then((nextColor) => {
        if (!canceled) {
          setCoverColorRgb(nextColor)
        }
      })
      .catch(() => {
        if (!canceled) {
          setCoverColorRgb(getDefaultArtworkColorRgb())
        }
      })

    return () => {
      canceled = true
    }
  }, [artworkUrl])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentClockMinute(getCurrentClockMinute())
    }, 60_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (currentSongId === undefined) {
      return
    }

    let canceled = false
    void window.smplayer!.getSongArtworkSnapshot(currentSongId).then((snapshot) => {
      if (!canceled) {
        setSongArtwork({ trackId: currentSongId, artworkUrl: snapshot.artworkUrl })
        if (snapshot.artworkUrl) {
          onArtworkResolved(currentSongId, snapshot.artworkUrl)
        }
      }
    })

    return () => {
      canceled = true
    }
  }, [currentSongId, onArtworkResolved])

  const refreshDisplayLyrics = useCallback(() => {
    if (currentSongId === undefined) {
      return
    }

    setLyricsLoading(true)
    void window.smplayer!.getLyrics(currentSongId, 'auto').then((snapshot) => {
      setDisplayLyrics({ trackId: currentSongId, lyrics: snapshot })
    setLyricsLoading(false)
    })
  }, [currentSongId])

  const cancelLyricScrollAnimation = useCallback(() => {
    if (lyricScrollAnimationRef.current != null) {
      window.cancelAnimationFrame(lyricScrollAnimationRef.current)
      lyricScrollAnimationRef.current = null
    }
  }, [])

  useEffect(() => {
    if (currentSongId === undefined) {
      cancelLyricScrollAnimation()
      setDisplayLyrics(null)
      setLyricsLoading(false)
      return
    }

    let canceled = false
    cancelLyricScrollAnimation()
    setLyricsLoading(true)
    void window.smplayer!.getLyrics(currentSongId, 'auto').then((snapshot) => {
      if (!canceled) {
        setDisplayLyrics({ trackId: currentSongId, lyrics: snapshot })
        setLyricsLoading(false)
      }
    })

    return () => {
      canceled = true
      cancelLyricScrollAnimation()
    }
  }, [cancelLyricScrollAnimation, currentSongId])

  useEffect(() => {
    activeLyricsIndexRef.current = activeLyricsIndex
  }, [activeLyricsIndex])

  const clearLyricRestoreTimer = useCallback(() => {
    if (lyricRestoreTimerRef.current != null) {
      window.clearTimeout(lyricRestoreTimerRef.current)
      lyricRestoreTimerRef.current = null
    }
  }, [])

  const clearPlayerBarHideTimer = useCallback(() => {
    if (playerBarHideTimerRef.current != null) {
      window.clearTimeout(playerBarHideTimerRef.current)
      playerBarHideTimerRef.current = null
    }
  }, [])

  const raisePlayerBar = useCallback(() => {
    clearPlayerBarHideTimer()
    setIsPlayerBarRaised(true)
  }, [clearPlayerBarHideTimer])

  const schedulePlayerBarHide = useCallback(() => {
    clearPlayerBarHideTimer()
    playerBarHideTimerRef.current = window.setTimeout(() => {
      if (!playerBarPinnedRef.current) {
        setIsPlayerBarRaised(false)
      }
    }, PLAYER_BAR_AUTO_HIDE_DELAY_MS)
  }, [clearPlayerBarHideTimer])

  useEffect(() => {
    playerBarPinnedRef.current = isPlayerBarPinned
    if (isPlayerBarPinned) {
      raisePlayerBar()
    } else {
      schedulePlayerBarHide()
    }
  }, [isPlayerBarPinned, raisePlayerBar, schedulePlayerBarHide])

  const scrollLyricsToIndex = useCallback((index: number, animated: boolean) => {
    const container = lyricStageRef.current
    const cover = coverWrapRef.current
    const line = lyricLineRefs.current[index]
    if (!container || !cover || !line) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const coverRect = cover.getBoundingClientRect()
    const anchorOffset = isCompactImmersiveRef.current
      ? containerRect.height / 2
      : coverRect.top + coverRect.height / 2 - containerRect.top
    const targetTop = line.offsetTop - anchorOffset + line.offsetHeight / 2

    cancelLyricScrollAnimation()
    if (!animated) {
      container.scrollTop = targetTop
      return
    }

    const startTop = container.scrollTop
    const distance = targetTop - startTop
    const startedAt = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min((now - startedAt) / LYRICS_SCROLL_DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      container.scrollTop = startTop + distance * eased
      if (elapsed < 1) {
        lyricScrollAnimationRef.current = window.requestAnimationFrame(step)
      } else {
        lyricScrollAnimationRef.current = null
      }
    }

    lyricScrollAnimationRef.current = window.requestAnimationFrame(step)
  }, [cancelLyricScrollAnimation])

  const restoreLyricsToPlayback = useCallback(() => {
    setIsLyricPreviewing(false)
    setIsLyricDragging(false)
    setLyricPreviewIndex(null)
    const activeIndex = activeLyricsIndexRef.current
    if (activeIndex >= 0) {
      scrollLyricsToIndex(activeIndex, true)
    }
  }, [scrollLyricsToIndex])

  const scheduleLyricRestore = useCallback(() => {
    clearLyricRestoreTimer()
    lyricRestoreTimerRef.current = window.setTimeout(restoreLyricsToPlayback, LYRICS_RESTORE_DELAY_MS)
  }, [clearLyricRestoreTimer, restoreLyricsToPlayback])

  const updateLyricPreviewFromViewport = useCallback(() => {
    const container = lyricStageRef.current
    const cover = coverWrapRef.current
    if (!container || !cover || displayLyricsLines.length === 0) {
      return null
    }

    const containerRect = container.getBoundingClientRect()
    const coverRect = cover.getBoundingClientRect()
    const centerY = isCompactImmersiveRef.current
      ? containerRect.top + containerRect.height / 2
      : coverRect.top + coverRect.height / 2
    let nextIndex = 0
    let nextDistance = Number.POSITIVE_INFINITY

    lyricLineRefs.current.slice(0, displayLyricsLines.length).forEach((line, index) => {
      if (!line) {
        return
      }

      const rect = line.getBoundingClientRect()
      const distance = Math.abs(rect.top + rect.height / 2 - centerY)
      if (distance < nextDistance) {
        nextDistance = distance
        nextIndex = index
      }
    })

    setLyricPreviewIndex(nextIndex)
    return nextIndex
  }, [displayLyricsLines.length])

  useEffect(() => {
    if (!isLyricPreviewing && activeLyricsIndex >= 0) {
      window.requestAnimationFrame(() => scrollLyricsToIndex(activeLyricsIndex, true))
    }
  }, [activeLyricsIndex, displayLyricsLines.length, isLyricPreviewing, scrollLyricsToIndex])

  useEffect(() => () => {
    clearLyricRestoreTimer()
    clearPlayerBarHideTimer()
    cancelLyricScrollAnimation()
  }, [cancelLyricScrollAnimation, clearLyricRestoreTimer, clearPlayerBarHideTimer])

  const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMoreMenu({ x: rect.left, y: rect.top })
    void refreshPreferenceItem()
  }

  const beginLyricsDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || displayLyricsLines.length === 0) {
      return
    }

    cancelLyricScrollAnimation()
    event.currentTarget.setPointerCapture(event.pointerId)
    lyricDragRef.current = {
      pointerId: event.pointerId,
      clientY: event.clientY,
      scrollTop: event.currentTarget.scrollTop,
      moved: false,
    }
    clearLyricRestoreTimer()
    setIsLyricDragging(true)
    setIsLyricPreviewing(true)
    window.requestAnimationFrame(updateLyricPreviewFromViewport)
  }

  const moveLyricsDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = lyricDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const deltaY = event.clientY - drag.clientY
    if (!drag.moved && Math.abs(deltaY) < 3) {
      return
    }

    event.preventDefault()
    drag.moved = true
    event.currentTarget.scrollTop = drag.scrollTop - deltaY
    window.requestAnimationFrame(updateLyricPreviewFromViewport)
  }

  const finishLyricsDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = lyricDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    }

    lyricDragRef.current = null
    setIsLyricDragging(false)
    if (drag.moved) {
      window.requestAnimationFrame(() => {
        updateLyricPreviewFromViewport()
        scheduleLyricRestore()
      })
    } else {
      restoreLyricsToPlayback()
    }
  }

  const seekToLyricLine = (line: ImmersiveLyricsLine) => {
    clearLyricRestoreTimer()
    onSeek(line.seekSeconds)
    setIsLyricPreviewing(false)
    setLyricPreviewIndex(null)
  }

  const playQuick = useCallback(async () => {
    const preferences = await window.smplayer!.getPreferenceSettings()
    const songIds = quickPlay({
      songs: librarySongs,
      recentSongs,
      playlists,
      folders,
      preferences,
    }, QUICK_PLAY_LIMIT)
    onReplaceQueue(songIds)
    onPlayTrack(songIds[0]!, songIds)
  }, [folders, librarySongs, onPlayTrack, onReplaceQueue, playlists, recentSongs])

  const playSongIds = (songIds: number[]) => {
    const shuffledSongIds = randomLibrary(songIds, songIds.length)
    onReplaceQueue(shuffledSongIds)
    onPlayTrack(shuffledSongIds[0]!, shuffledSongIds)
  }

  const playCurrentAlbum = () => {
    if (!currentSong) {
      return
    }

    const targetAlbum = currentSong.album || t('common.albumUnknown')
    playSongIds(librarySongs
      .filter((song) => (song.album || t('common.albumUnknown')) === targetAlbum)
      .map((song) => song.id))
  }

  const playCurrentArtist = () => {
    if (!currentSong) {
      return
    }

    const targetArtists = currentSong.artists.length > 0 ? currentSong.artists : [currentSong.artist]
    playSongIds(librarySongs
      .filter((song) => {
        const artists = song.artists.length > 0 ? song.artists : [song.artist]
        return artists.some((artist) => targetArtists.includes(artist))
      })
      .map((song) => song.id))
  }

  const saveQueueAsPlaylist = () => {
    const defaultName = getDefaultNewPlaylistName(t, playlists)
    void requestTextDialog({
      title: t('nowPlaying.savePlaylist'),
      defaultValue: defaultName,
      placeholder: t('playlists.namePlaceholder'),
    }).then((name) => {
      if (name) {
        void createPlaylist(name, queueSongIds)
      }
    })
  }

  const goBack = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().finally(() => {
        onClose()
      })
      return
    }

    onClose()
  }

  const moreItems = moreMenu
    ? getNowPlayingFullMoreItems({
      currentSong,
      songs,
      librarySongs,
      recentSongs,
      folders,
      playlists,
      preferenceItem,
      t,
      onQuickPlay: playQuick,
      onPlaySongs: playSongIds,
      onSavePlaylist: saveQueueAsPlaylist,
      onClearQueue: () => {
        goBack()
        onClearQueue()
      },
      onPlayAlbum: playCurrentAlbum,
      onPlayArtist: playCurrentArtist,
      onAddToNowPlaying: () => {
        if (currentSong) {
          const insertedIndex = queueSongIds.length
          onReplaceQueue([...queueSongIds, currentSong.id])
          showUndo(t('notification.songAddedTo', { title: currentSong.title, target: t('common.nowPlaying') }), () =>
            onReplaceQueue(removeQueueRange(useLibraryStore.getState().snapshot.nowPlaying.songIds, insertedIndex, 1)),
          )
        }
      },
      onCreatePlaylist: (name) => {
        if (currentSong) {
          void createPlaylist(name, [currentSong.id])
        }
      },
      onAddToPlaylist: (playlistId) => {
        if (currentSong) {
          const playlist = playlists.find((item) => item.id === playlistId)!
          onAddSongToPlaylist(playlistId, currentSong.id)
          showUndo(t('notification.songAddedTo', { title: currentSong.title, target: playlist.name }), () =>
            removeSongFromPlaylist(playlistId, currentSong.id),
          )
        }
      },
      onToggleFavorite: () => {
        if (currentSong) {
          onToggleFavorite(currentSong.id, !currentSong.favorite)
        }
      },
      mode,
      volume,
      isMuted,
      isCompact: isCompactImmersive,
      onVolumeChange,
      onToggleMute,
      onToggleShuffle,
      onToggleRepeat,
      onToggleRepeatOne,
      onPreferenceChanged: refreshPreferenceItem,
      onSeeMusicInfo: () => {
        setMoreMenu(null)
        setShowPlaylistPanel(false)
        setDialogMode('properties')
      },
      onSeeLyrics: () => {
        setMoreMenu(null)
        setShowPlaylistPanel(false)
        setDialogMode('lyrics')
      },
      onSeeAlbumArt: () => {
        setMoreMenu(null)
        setShowPlaylistPanel(false)
        setDialogMode('album-art')
      },
    })
    : []

  return (
    <section
      className={clsx('now-playing-full-page', immersiveNightActive ? 'is-night' : 'is-day', {
        'is-player-bar-raised': isPlayerBarRaised,
      })}
      style={{
        '--now-playing-full-artwork': `url("${displayArtworkUrl}")`,
        '--now-playing-full-cover-rgb': coverColorRgb,
      } as CSSProperties}
      onPointerEnter={raisePlayerBar}
      onPointerLeave={schedulePlayerBarHide}
    >
      <div className="now-playing-full-backdrop" aria-hidden="true" />
      <div className="now-playing-full-titlebar" aria-hidden="true" />
      <button
        type="button"
        className="now-playing-full-back-button"
        aria-label={t('sidebar.back')}
        title={t('sidebar.back')}
        onClick={goBack}
      >
        <Icon name="arrowLeft" />
      </button>
      <button
        type="button"
        className={clsx('now-playing-full-queue-button', { 'is-active': showPlaylistPanel })}
        onClick={() => {
          setDialogMode(null)
          setShowPlaylistPanel((current) => !current)
        }}
      >
        <Icon name="songs" />
        {t('common.nowPlaying')}
      </button>

      <div className="now-playing-full-content">
        <section className="now-playing-full-immersive">
          <div className="now-playing-full-left">
            <div className="now-playing-full-cover-wrap" ref={coverWrapRef}>
              <AlbumArtControl title={currentSong?.title || t('common.nowPlaying')} artworkUrl={artworkUrl} songId={currentSong?.id} />
            </div>
            <div className="now-playing-full-copy">
              <h2>{currentSong?.title || t('nowPlaying.noActiveTrack')}</h2>
              <p>{artistLabel}</p>
              <p>{albumLabel}</p>
            </div>
          </div>
          <div
            ref={lyricStageRef}
            className={clsx('now-playing-full-lyric-stage', {
              'is-dragging': isLyricDragging,
            })}
            onPointerDown={beginLyricsDrag}
            onPointerMove={moveLyricsDrag}
            onPointerUp={finishLyricsDrag}
            onPointerCancel={finishLyricsDrag}
          >
            <div className="now-playing-full-lyric-lines">
              {lyricsLoading && displayLyrics?.trackId !== currentSongId ? (
                <div className="now-playing-full-lyric-row is-active is-loading">
                  <p>{t('nowPlaying.loadingLyrics')}</p>
                </div>
              ) : displayLyricsLines.length > 0 ? displayLyricsLines.map((line, index) => (
                <div
                  key={`${currentSongId}-${line.id}`}
                  ref={(element) => {
                    lyricLineRefs.current[index] = element
                  }}
                  className={clsx('now-playing-full-lyric-row', {
                    'is-active': line.active,
                    'is-preview': previewLyricIndex === index,
                  })}
                >
                  <p>{line.text}</p>
                  {previewLyricIndex === index ? (
                    <button
                      type="button"
                      className="now-playing-full-lyric-seek"
                      aria-label={`${t('player.play')} ${formatDuration(line.seekSeconds)}`}
                      title={`${t('player.play')} ${formatDuration(line.seekSeconds)}`}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        seekToLyricLine(line)
                      }}
                    >
                      <Icon name="play" />
                      <span>{formatDuration(line.seekSeconds)}</span>
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="now-playing-full-lyric-row is-loading">
                  <p>{t('nowPlaying.noLyrics')}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer
          className={clsx('player-bar', 'now-playing-full-player-bar', { disabled })}
          style={{ '--player-cover-rgb': coverColorRgb } as CSSProperties}
        >
          <button
            type="button"
            className="player-track now-playing-full-player-exit"
            aria-label={t('nowPlaying.exitImmersiveMode')}
            title={t('nowPlaying.exitImmersiveMode')}
            onClick={goBack}
          >
            <span className="player-artwork-shell">
              <span className="album-swatch" aria-hidden="true" />
              <span className="player-artwork-overlay" aria-hidden="true">
                <Icon name="fullscreenExit" />
              </span>
            </span>
          </button>
          <MediaControlSurface
            trackId={currentSong?.id ?? null}
            isLoading={false}
            favorite={currentSong?.favorite}
            disabled={disabled}
            isPlaying={isPlaying}
            volume={volume}
            currentSong={currentSong}
            mode={mode}
            t={t}
            onTogglePlayPause={onTogglePlayPause}
            onPrevious={onPrevious}
            onNext={onNext}
            onSeek={onSeek}
            onBeginSeek={onBeginSeek}
            onEndSeek={onEndSeek}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
            onToggleShuffle={onToggleShuffle}
            onToggleRepeat={onToggleRepeat}
            onToggleRepeatOne={onToggleRepeatOne}
            onToggleFavorite={() => {
              if (currentSong) {
                onToggleFavorite(currentSong.id, !currentSong.favorite)
              }
            }}
            onVoiceCommand={onVoiceCommand}
            getVoiceHint={getVoiceHint}
            voiceLanguage={voiceLanguage}
            isMuted={isMuted}
            onMoreClick={openMoreMenu}
          />
        </footer>

        {error ? <div className="now-playing-full-error">{error}</div> : null}

      </div>
      <NowPlayingFullPlaylist
        open={showPlaylistPanel}
        songs={songs}
        playlists={playlists}
        favoritePlaylistId={favoritePlaylistId}
        t={t}
        selectedTrackId={selectedTrackId}
        selectedQueueIndex={selectedQueueIndex}
        isPlaying={isPlaying}
        loading={loading}
        onTogglePlayPause={onTogglePlayPause}
        onPlayTrack={onPlayTrack}
        onReplaceQueue={onReplaceQueue}
        onPlayNext={onPlayNext}
        onAddSongToPlaylist={onAddSongToPlaylist}
        onAddSongsToPlaylist={onAddSongsToPlaylist}
        onRevealSong={onRevealSong}
        onToggleFavorite={onToggleFavorite}
        onRemoveSongs={onRemoveSongs}
        onDeleteSongFromDisk={onDeleteSongFromDisk}
        onClose={() => {
          setShowPlaylistPanel(false)
        }}
        onPanelRequest={(panel) => {
          setShowPlaylistPanel(false)
          if (panel !== 'playlist') {
            setDialogMode(panel === 'info' ? 'properties' : panel)
          }
        }}
      />
      {currentSong && dialogMode ? (
        <MusicDialog
          song={currentSong}
          mode={dialogMode}
          t={t}
          currentTrackId={selectedTrackId}
          isPlaying={isPlaying}
          queueSongIds={queueSongIds}
          onClose={() => {
            setDialogMode(null)
            setMoreMenu(null)
          }}
          onPlayTrack={(trackId, nextQueueSongIds) => {
            onPlayTrack(trackId, nextQueueSongIds)
          }}
          onTogglePlayPause={onTogglePlayPause}
          onSaved={() => {
            refreshDisplayLyrics()
            void onRefresh()
          }}
        />
      ) : null}
      {moreMenu ? (
        <MenuFlyout
          position={moreMenu}
          onClose={() => {
            setMoreMenu(null)
          }}
          items={moreItems}
        />
      ) : null}
    </section>
  )
}

function getImmersiveLyricsLines(
  lyrics: LyricsSnapshot | null,
  progressSeconds: number,
  progressRatio: number,
  durationSeconds: number,
): ImmersiveLyricsLine[] {
  if (!lyrics || lyrics.lines.length === 0) {
    return []
  }

  const textLines = lyrics.lines
    .map((line) => ({
      id: line.id,
      timestampMs: line.timestampMs,
      text: line.text.trim(),
    }))
    .filter((line) => line.text)
  const activeLineId = getActiveImmersiveLyricsLineId(textLines, progressSeconds, progressRatio)
  const lastLineIndex = Math.max(textLines.length - 1, 1)

  return textLines.map((line, index) => ({
    id: line.id,
    text: line.text,
    seekSeconds: line.timestampMs != null ? line.timestampMs / 1000 : durationSeconds * (index / lastLineIndex),
    active: line.id === activeLineId,
  }))
}

function getActiveImmersiveLyricsLineId(
  lines: Array<{ id: number; timestampMs: number | null; text: string }>,
  progressSeconds: number,
  progressRatio: number,
) {
  const timedLines = lines.filter((line) => line.timestampMs != null)
  if (timedLines.length > 0) {
    const progressMs = Math.max(0, Math.floor(progressSeconds * 1000))
    let activeLineId = timedLines[0]!.id

    for (const line of timedLines) {
      if (line.timestampMs! > progressMs) {
        break
      }
      activeLineId = line.id
    }

    return activeLineId
  }

  const activeIndex = Math.min(
    lines.length - 1,
    Math.floor(lines.length * Math.min(Math.max(progressRatio, 0), 1)),
  )
  return lines[activeIndex]!.id
}
