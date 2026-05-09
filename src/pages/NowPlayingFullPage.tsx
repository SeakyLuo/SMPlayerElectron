import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MenuFlyout } from '../components/MenuFlyout'
import { MusicDialog } from '../components/MusicDialog'
import { NowPlayingQueueItem } from '../components/NowPlayingQueueItem'
import { MediaControlSurface, type VoiceAssistantResponse } from '../components/MediaControl'
import {
  getAddToPlaylistMenuFlyoutItem,
  getMusicMenuFlyoutItems,
  getPreferenceMenuFlyoutItem,
  getShuffleMenuItems,
  type MenuFlyoutItem,
  type MenuFlyoutPosition,
} from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
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
import { quickPlay, randomLibrary } from '../shared/mediaHelper'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

const QUICK_PLAY_LIMIT = 100
const DEFAULT_ARTWORK_URL = '/monotone_bg_wide.png'
const LYRICS_RESTORE_DELAY_MS = 5000
const LYRICS_SCROLL_DURATION_MS = 360

type FullPanel = 'playlist' | 'info' | 'lyrics' | 'album-art'
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
  getVoiceHelpText: () => string
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
  getVoiceHelpText,
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
  const [coverColorRgb, setCoverColorRgb] = useState(getDefaultArtworkColorRgb)
  const coverWrapRef = useRef<HTMLDivElement | null>(null)
  const lyricStageRef = useRef<HTMLDivElement | null>(null)
  const lyricLineRefs = useRef<Array<HTMLDivElement | null>>([])
  const lyricRestoreTimerRef = useRef<number | null>(null)
  const lyricScrollAnimationRef = useRef<number | null>(null)
  const activeLyricsIndexRef = useRef(-1)
  const lyricDragRef = useRef<{ pointerId: number; clientY: number; scrollTop: number; moved: boolean } | null>(null)
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const currentSongId = currentSong?.id
  const effectiveDuration = durationSeconds || currentSong?.duration || 0
  const progressValue = Math.min(Math.max(progressSeconds, 0), effectiveDuration)
  const artworkUrl =
    currentSong?.artworkUrl ||
    (songArtwork && songArtwork.trackId === currentSong?.id ? songArtwork.artworkUrl : '') ||
    resolvedArtworkUrl
  const displayArtworkUrl = artworkUrl || DEFAULT_ARTWORK_URL
  const artistLabel = currentSong ? getDisplayArtists(currentSong) || t('common.artistUnknown') : t('common.artistUnknown')
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

  const refreshPreferenceItem = async () => {
    if (currentSong) {
      const settings = await window.smplayer!.getPreferenceSettings()
      setPreferenceItem(settings.songs.find((item) => item.itemId === String(currentSong.id)) ?? null)
    }
  }

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

  const scrollLyricsToIndex = useCallback((index: number, animated: boolean) => {
    const container = lyricStageRef.current
    const cover = coverWrapRef.current
    const line = lyricLineRefs.current[index]
    if (!container || !cover || !line) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const coverRect = cover.getBoundingClientRect()
    const anchorOffset = coverRect.top + coverRect.height / 2 - containerRect.top
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

    const coverRect = cover.getBoundingClientRect()
    const centerY = coverRect.top + coverRect.height / 2
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
    cancelLyricScrollAnimation()
  }, [cancelLyricScrollAnimation, clearLyricRestoreTimer])

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
    const name = window.prompt(t('nowPlaying.savePlaylist'), defaultName)
    const nextName = name?.trim()
    if (nextName) {
      void createPlaylist(nextName, queueSongIds)
    }
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
      playlists,
      folders,
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
          const previousQueueSongIds = queueSongIds
          onReplaceQueue([...queueSongIds, currentSong.id])
          showUndo(t('notification.songAddedTo', { title: currentSong.title, target: t('common.nowPlaying') }), () =>
            onReplaceQueue(previousQueueSongIds),
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
      className="now-playing-full-page"
      style={{ '--now-playing-full-artwork': `url("${displayArtworkUrl}")` } as CSSProperties}
    >
      <div className="now-playing-full-backdrop" aria-hidden="true" />
      <div className="now-playing-full-titlebar" aria-hidden="true" />
      <button
        type="button"
        className={clsx('now-playing-full-queue-button', { 'is-active': showPlaylistPanel })}
        onClick={() => {
          setDialogMode(null)
          setShowPlaylistPanel((current) => !current)
        }}
      >
        <Icon name="nowPlaying" />
        {t('nowPlaying.playlist')}
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
            className={clsx('now-playing-full-lyric-stage', { 'is-dragging': isLyricDragging })}
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
                <div className="now-playing-full-lyric-row is-active">
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
            aria-label={t('nowPlaying.exitFullScreen')}
            title={t('nowPlaying.exitFullScreen')}
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
            getVoiceHelpText={getVoiceHelpText}
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

function NowPlayingFullPlaylist({
  open,
  songs,
  playlists,
  favoritePlaylistId,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
  loading,
  onTogglePlayPause,
  onPlayTrack,
  onReplaceQueue,
  onPlayNext,
  onAddSongToPlaylist,
  onAddSongsToPlaylist,
  onRevealSong,
  onToggleFavorite,
  onRemoveSongs,
  onDeleteSongFromDisk,
  onClose,
  onPanelRequest,
}: {
  open: boolean
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  favoritePlaylistId: number
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
  loading: boolean
  onTogglePlayPause: () => void
  onPlayTrack: (trackId: number, queueSongIds: number[], queueIndex?: number) => void
  onReplaceQueue: (songIds: number[]) => void
  onPlayNext: (songId: number, queueIndex?: number) => void
  onAddSongToPlaylist: (playlistId: number, songId: number) => void
  onAddSongsToPlaylist: (playlistId: number, songIds: number[]) => void
  onRevealSong: (songPath: string) => void | Promise<void>
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onRemoveSongs: (songIds: number[]) => void
  onDeleteSongFromDisk: (songId: number) => void
  onClose: () => void
  onPanelRequest: (panel: FullPanel) => void
}) {
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedQueueIndexes, setSelectedQueueIndexes] = useState<Set<number>>(new Set())
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ queueIndex: number; position: 'before' | 'after' } | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const draggedQueueIndexRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const removeSongsFromPlaylist = useLibraryStore((state) => state.removeSongsFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const queueEntryKeys = useMemo(() => {
    const occurrenceCounts = new Map<number, number>()
    return songs.map((song) => {
      const occurrence = occurrenceCounts.get(song.id) ?? 0
      occurrenceCounts.set(song.id, occurrence + 1)
      return `now-playing-full-${song.id}-${occurrence}`
    })
  }, [songs])
  const selectedEntries = useMemo(
    () => songs
      .map((song, queueIndex) => ({ song, queueIndex }))
      .filter((entry) => selectedQueueIndexes.has(entry.queueIndex)),
    [selectedQueueIndexes, songs],
  )
  const selectedSongIds = useMemo(() => selectedEntries.map((entry) => entry.song.id), [selectedEntries])
  const selectedQueueIndexList = useMemo(() => selectedEntries.map((entry) => entry.queueIndex), [selectedEntries])
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const defaultNewPlaylistName = useMemo(() => getDefaultNewPlaylistName(t, playlists), [playlists, t])
  const showUndo = (message: string, action: () => void | Promise<void>) => {
    showUndoableNotification(message, t('common.undo'), action)
  }
  const songMenuSongId = songMenu?.song.id

  useEffect(() => {
    if (songMenuSongId !== undefined) {
      void window.smplayer!.getPreferenceSettings().then((settings) => {
        setSongPreferenceItem(settings.songs.find((item) => item.itemId === String(songMenuSongId)) ?? null)
      })
    }
  }, [songMenuSongId])

  useEffect(() => {
    if (!open || songs.length === 0) {
      return
    }

    window.requestAnimationFrame(() => {
      currentRowRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [open, selectedQueueIndex, selectedTrackId, songs.length])

  useEffect(() => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const queueIndex of current) {
        if (queueIndex < songs.length) {
          next.add(queueIndex)
        }
      }
      return next
    })
  }, [songs.length])

  const addToMenuItem = addToMenu
    ? getAddToPlaylistMenuFlyoutItem({
        playlists: customPlaylists,
        songIds: addToMenu.songIds,
        t,
        defaultPlaylistName: addToMenu.defaultPlaylistName,
        currentPlaylistName: t('common.nowPlaying'),
        includeFavorites: true,
        onToggleFavorite: () => {
          onAddSongsToPlaylist(favoritePlaylistId, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: t('common.myFavorites'),
                })
              : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: t('common.myFavorites') }),
            () => removeSongsFromPlaylist(favoritePlaylistId, addToMenu.songIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onCreatePlaylist: (name) => {
          void createPlaylist(name, addToMenu.songIds)
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
        onAddToPlaylist: (playlistId) => {
          const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
          onAddSongsToPlaylist(playlistId, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: targetPlaylist.name,
                })
              : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: targetPlaylist.name }),
            () => removeSongsFromPlaylist(playlistId, addToMenu.songIds),
          )
          if (hideMultiSelectCommandBarAfterOperation) {
            setMultiSelect(false)
            setSelectedQueueIndexes(new Set())
          }
        },
      })
    : null

  const clearSelection = () => {
    setSelectedQueueIndexes(new Set())
  }

  const toggleSelection = (queueIndex: number) => {
    setSelectedQueueIndexes((current) => {
      const next = new Set(current)
      if (next.has(queueIndex)) {
        next.delete(queueIndex)
      } else {
        next.add(queueIndex)
      }
      return next
    })
  }

  const playSelected = () => {
    const [firstSongId] = selectedSongIds
    onReplaceQueue(selectedSongIds)
    onPlayTrack(firstSongId!, selectedSongIds)
  }

  const getDropPosition = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  const reverseSelection = () => {
    setSelectedQueueIndexes((current) => {
      const next = new Set<number>()
      for (const queueIndex of songs.keys()) {
        if (!current.has(queueIndex)) {
          next.add(queueIndex)
        }
      }
      return next
    })
  }

  if (songs.length === 0) {
    return (
      <section
        className={clsx('now-playing-full-panel now-playing-full-empty-panel now-playing-full-queue-popover', {
          'is-open': open,
        })}
        aria-hidden={!open}
      >
        {loading ? (
          <LoadingState t={t} compact />
        ) : (
          <>
            <h3>{t('nowPlaying.queueEmpty')}</h3>
            <p>{t('nowPlaying.queueEmptyHelp')}</p>
          </>
        )}
      </section>
    )
  }

  return (
    <section
      className={clsx('now-playing-full-panel now-playing-full-playlist-panel now-playing-full-queue-popover', {
        'is-open': open,
      })}
      aria-hidden={!open}
    >
      <header className="now-playing-full-playlist-title">
        <div>
          <strong>{t('nowPlaying.playlist')}</strong>
          <span>{t('playlists.songCount', { count: songs.length })}</span>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <section className="now-playing-full-list-shell" ref={listShellRef}>
        <div className="now-playing-playlist-control now-playing-full-queue-list">
          {songs.map((song, queueIndex) => {
            const current = selectedQueueIndex !== null
              ? queueIndex === selectedQueueIndex
              : song.id === selectedTrackId
            return (
              <NowPlayingQueueItem
                key={queueEntryKeys[queueIndex]}
                containerRef={current ? currentRowRef : undefined}
                song={song}
                t={t}
                current={current}
                playing={isPlaying}
                selected={selectedQueueIndexes.has(queueIndex)}
                selectionMode={multiSelect}
                dropPosition={dropIndicator?.queueIndex === queueIndex ? dropIndicator.position : null}
                queueSongIds={queueSongIds}
                rowNumber={queueIndex + 1}
                onPlayTrack={(trackId, nextQueueSongIds) => {
                  onPlayTrack(trackId, nextQueueSongIds, queueIndex)
                }}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={() => toggleSelection(queueIndex)}
                onToggleFavorite={onToggleFavorite}
                onRemoveFromListClick={(contextSong) => {
                  const previousQueueSongIds = queueSongIds
                  onReplaceQueue(queueSongIds.filter((_, index) => index !== queueIndex))
                  showUndo(t('notification.removedFrom', { title: contextSong.title, target: t('common.nowPlaying') }), () =>
                    onReplaceQueue(previousQueueSongIds),
                  )
                }}
                onAddToPlaylistClick={(contextSong, x, y) => {
                  setAddToMenu({
                    x,
                    y,
                    songIds: [contextSong.id],
                    defaultPlaylistName: getNextPlaylistName(contextSong.title, playlists),
                  })
                }}
                onContextMenu={(contextSong, x, y) => {
                  setSongMenu({ song: contextSong, queueIndex, x, y })
                }}
                onSeeAlbum={(contextSong) => {
                  navigate(`/albums?album=${encodeURIComponent(contextSong.album || t('common.albumUnknown'))}`)
                  onClose()
                }}
                onSeeArtist={(artist) => {
                  navigate(`/artists?artist=${encodeURIComponent(artist)}`)
                  onClose()
                }}
                onDragStart={(event) => {
                  draggedQueueIndexRef.current = queueIndex
                  setDropIndicator(null)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(queueIndex))
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropIndicator({
                    queueIndex,
                    position: getDropPosition(event),
                  })
                }}
                onDragLeave={() => {
                  setDropIndicator((currentDrop) => currentDrop?.queueIndex === queueIndex ? null : currentDrop)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedQueueIndex = draggedQueueIndexRef.current
                  draggedQueueIndexRef.current = null
                  const insertAfter = getDropPosition(event) === 'after'
                  setDropIndicator(null)
                  if (draggedQueueIndex == null || draggedQueueIndex === queueIndex) {
                    return
                  }

                  const nextSongIds = queueSongIds.slice()
                  const [draggedSongId] = nextSongIds.splice(draggedQueueIndex, 1)
                  const targetIndex = draggedQueueIndex < queueIndex + (insertAfter ? 1 : 0)
                    ? queueIndex + (insertAfter ? 1 : 0) - 1
                    : queueIndex + (insertAfter ? 1 : 0)
                  nextSongIds.splice(targetIndex, 0, draggedSongId!)
                  onReplaceQueue(nextSongIds)
                }}
                onDragEnd={() => {
                  draggedQueueIndexRef.current = null
                  setDropIndicator(null)
                }}
              />
            )
          })}
        </div>
      </section>
      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedSongIds.length}
        t={t}
        playlists={playlists}
        removeLabel={t('nowPlaying.remove')}
        onPlay={playSelected}
        onAddToPlaylist={(playlistId) => {
          onAddSongsToPlaylist(playlistId, selectedSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddToMenu({
            x: rect.left,
            y: rect.top - 8,
            songIds: selectedSongIds,
            defaultPlaylistName: defaultNewPlaylistName,
          })
        }}
        onRemove={() => {
          const previousQueueSongIds = queueSongIds
          onReplaceQueue(queueSongIds.filter((_, index) => !selectedQueueIndexList.includes(index)))
          showUndo(t('notification.songsRemovedFrom', { count: selectedSongIds.length, target: t('common.nowPlaying') }), () =>
            onReplaceQueue(previousQueueSongIds),
          )
          clearSelection()
        }}
        onSelectAll={() => {
          setSelectedQueueIndexes(new Set(songs.map((_, queueIndex) => queueIndex)))
        }}
        onReverseSelection={reverseSelection}
        onClearSelection={clearSelection}
        onCancel={() => {
          setMultiSelect(false)
          clearSelection()
        }}
      />
      {songMenu ? (
        <MenuFlyout
          position={songMenu}
          onClose={() => {
            setSongMenu(null)
          }}
          items={getMusicMenuFlyoutItems({
            song: songMenu.song,
            option: {
              showRemove: true,
              showSelect: true,
              showDelete: true,
            },
            playlists,
            folders,
            currentPlaylistName: t('common.nowPlaying'),
            excludePlaylistName: '',
            queueSongIds,
            currentTrackId: selectedTrackId,
            songIndex: songMenu.queueIndex,
            isPlaying,
            t,
            onPlay: () => {
              onPlayTrack(songMenu.song.id, queueSongIds, songMenu.queueIndex)
            },
            onPause: onTogglePlayPause,
            onPlayNext: () => {
              onPlayNext(songMenu.song.id, songMenu.queueIndex)
            },
            onAddToNowPlaying: () => {
              const previousQueueSongIds = queueSongIds
              onReplaceQueue([...queueSongIds, songMenu.song.id])
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(previousQueueSongIds),
              )
            },
            onCreatePlaylist: (name) => {
              void createPlaylist(name, [songMenu.song.id])
            },
            onAddToPlaylist: (playlistId) => {
              const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)!
              onAddSongToPlaylist(playlistId, songMenu.song.id)
              showUndo(t('notification.songAddedTo', { title: songMenu.song.title, target: targetPlaylist.name }), () =>
                removeSongFromPlaylist(playlistId, songMenu.song.id),
              )
            },
            onRemove: () => {
              const previousQueueSongIds = queueSongIds
              onReplaceQueue(queueSongIds.filter((_, index) => index !== songMenu.queueIndex))
              showUndo(t('notification.removedFrom', { title: songMenu.song.title, target: t('common.nowPlaying') }), () =>
                onReplaceQueue(previousQueueSongIds),
              )
            },
            onSelect: () => {
              setMultiSelect(true)
              setSelectedQueueIndexes(new Set([songMenu.queueIndex]))
            },
            preferenceItem: songPreferenceItem,
            onUndoPreference: () => {
              void window.smplayer?.removePreferenceItem(songPreferenceItem!.id).then(() => refreshSongPreferenceItem(songMenu.song.id, setSongPreferenceItem))
            },
            onSetPreference: (level) => {
              void window.smplayer?.addPreferenceItem('song', String(songMenu.song.id), songMenu.song.title, level).then(() => refreshSongPreferenceItem(songMenu.song.id, setSongPreferenceItem))
            },
            onMoveToFolder: (folderPath) => {
              const originalFolderPath = getParentFolderPath(songMenu.song.path)
              void moveSongToFolder(songMenu.song.id, folderPath)
              showUndo(t('notification.movedSong', { title: songMenu.song.title }), () =>
                moveSongToFolder(songMenu.song.id, originalFolderPath),
              )
            },
            onToggleFavorite: () => {
              onToggleFavorite(songMenu.song.id, !songMenu.song.favorite)
              const target = t('common.myFavorites')
              showUndo(
                songMenu.song.favorite
                  ? t('notification.removedFrom', { title: songMenu.song.title, target })
                  : t('notification.songAddedTo', { title: songMenu.song.title, target }),
                () => setSongFavorite(songMenu.song.id, songMenu.song.favorite),
              )
            },
            onReveal: () => {
              onRevealSong(songMenu.song.path)
            },
            onDelete: () => {
              if (window.confirm(t('context.deleteSongConfirm', { title: songMenu.song.title }))) {
                onDeleteSongFromDisk(songMenu.song.id)
              }
            },
            onHide: async () => {
              const previousQueueSongIds = queueSongIds
              await window.smplayer?.hideSong(songMenu.song.id)
              onRemoveSongs([songMenu.song.id])
              showUndo(t('notification.hiddenStorageItem', { name: songMenu.song.title }), async () => {
                const hiddenItems = await window.smplayer!.getHiddenStorageItems()
                const hiddenItem = hiddenItems.find((item) => item.path === songMenu.song.path)
                await window.smplayer!.resumeHiddenStorageItem(hiddenItem!)
                onReplaceQueue(previousQueueSongIds)
                await refresh()
              })
            },
            onSeeArtist: (artist) => {
              navigate(`/artists?artist=${encodeURIComponent(artist)}`)
              onClose()
            },
            onSeeAlbum: () => {
              navigate(`/albums?album=${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
              onClose()
            },
            onSeeMusicInfo: () => {
              setSongMenu(null)
              onPanelRequest('info')
            },
            onSeeLyrics: () => {
              setSongMenu(null)
              onPanelRequest('lyrics')
            },
            onSeeAlbumArt: () => {
              setSongMenu(null)
              onPanelRequest('album-art')
            },
          })}
        />
      ) : null}
      {addToMenuItem?.submenu ? (
        <MenuFlyout
          position={addToMenu!}
          onClose={() => {
            setAddToMenu(null)
          }}
          items={addToMenuItem.submenu}
        />
      ) : null}
    </section>
  )
}

function getNowPlayingFullMoreItems({
  currentSong,
  songs,
  librarySongs,
  recentSongs,
  playlists,
  folders,
  preferenceItem,
  t,
  onQuickPlay,
  onPlaySongs,
  onSavePlaylist,
  onClearQueue,
  onPlayAlbum,
  onPlayArtist,
  onAddToNowPlaying,
  onCreatePlaylist,
  onAddToPlaylist,
  onToggleFavorite,
  onPreferenceChanged,
  onSeeMusicInfo,
  onSeeLyrics,
  onSeeAlbumArt,
}: {
  currentSong: LibrarySong | null
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  folders: ReturnType<typeof useLibraryStore.getState>['snapshot']['folders']
  preferenceItem: PreferenceItemSnapshot | null
  t: Translator
  onQuickPlay: () => void | Promise<void>
  onPlaySongs: (songIds: number[]) => void
  onSavePlaylist: () => void
  onClearQueue: () => void
  onPlayAlbum: () => void
  onPlayArtist: () => void
  onAddToNowPlaying: () => void
  onCreatePlaylist: (name: string) => void
  onAddToPlaylist: (playlistId: number) => void
  onToggleFavorite: () => void
  onPreferenceChanged: () => void | Promise<void>
  onSeeMusicInfo: () => void
  onSeeLyrics: () => void
  onSeeAlbumArt: () => void
}) {
  const items: MenuFlyoutItem[] = [
    { key: 'quick-play', text: t('nowPlaying.quickPlay'), icon: 'play', onClick: onQuickPlay },
    {
      key: 'shuffle-sources',
      text: t('nowPlaying.randomPlay'),
      icon: 'shuffle',
      submenu: getShuffleMenuItems({
        songs,
        librarySongs,
        recentSongs,
        playlists,
        folders,
        randomLimit: QUICK_PLAY_LIMIT,
        t,
        onPlaySongs,
        onQuickPlay,
      }),
    },
    { key: 'save-playlist', text: t('nowPlaying.savePlaylist'), icon: 'plus', onClick: onSavePlaylist },
    { key: 'clear-now-playing', text: t('nowPlaying.clearNowPlaying'), icon: 'close', onClick: onClearQueue },
  ]

  if (!currentSong) {
    return items
  }

  const addToItem = getAddToPlaylistMenuFlyoutItem({
    playlists,
    songIds: [currentSong.id],
    t,
    defaultPlaylistName: currentSong.title,
    includeNowPlaying: true,
    includeFavorites: !currentSong.favorite,
    onAddToNowPlaying,
    onToggleFavorite,
    onCreatePlaylist,
    onAddToPlaylist,
  })

  if (addToItem) {
    items.push({ key: 'current-song-separator', text: '', separator: true }, addToItem)
  }

  items.push(
    getPreferenceMenuFlyoutItem({
      type: 'song',
      itemId: String(currentSong.id),
      name: currentSong.title,
      preferenceItem,
      t,
      onUpdated: onPreferenceChanged,
    }),
    { key: 'play-artist', text: t('detail.playArtist'), icon: 'users', onClick: onPlayArtist },
    { key: 'play-album', text: t('detail.playAlbum'), icon: 'albums', onClick: onPlayAlbum },
    { key: 'see-music-info', text: t('context.seeMusicInfo'), icon: 'info', keepOpen: true, onClick: onSeeMusicInfo },
    { key: 'see-lyrics', text: t('context.seeLyrics'), icon: 'songs', keepOpen: true, onClick: onSeeLyrics },
    { key: 'see-album-art', text: t('context.seeAlbumArt'), icon: 'albums', keepOpen: true, onClick: onSeeAlbumArt },
  )

  return items
}

async function refreshSongPreferenceItem(songId: number, setPreferenceItem: (item: PreferenceItemSnapshot | null) => void) {
  const settings = await window.smplayer!.getPreferenceSettings()
  setPreferenceItem(settings.songs.find((item) => item.itemId === String(songId)) ?? null)
}

function getDefaultNewPlaylistName(t: Translator, playlists: LibraryPlaylist[]) {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return getNextPlaylistName(`${t('common.nowPlaying')} - ${year}/${month}/${day}`, playlists)
}

function getNextPlaylistName(name: string, playlists: LibraryPlaylist[]) {
  const playlistNames = new Set(playlists.map((playlist) => playlist.name))
  const siblingCount = playlists.filter((playlist) => playlist.name.startsWith(name)).length
  for (let index = 1; index <= siblingCount; index += 1) {
    const nextName = `${name} (${index})`
    if (!playlistNames.has(nextName)) {
      return nextName
    }
  }

  return name
}

function getParentFolderPath(filePath: string) {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return filePath.slice(0, index)
}

interface NowPlayingSongMenuState {
  song: LibrarySong
  queueIndex: number
  x: number
  y: number
}

interface NowPlayingAddToMenuState {
  songIds: number[]
  defaultPlaylistName: string
  x: number
  y: number
}
