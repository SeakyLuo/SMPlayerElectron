import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { AlbumArtControl } from '../components/AlbumArtControl'
import { Icon } from '../components/icons'
import { MenuFlyout } from '../components/MenuFlyout'
import {
  getAddToPlaylistMenuFlyoutItem,
  getMusicMenuFlyoutItems,
  getPreferenceMenuFlyoutItem,
  getShuffleMenuItems,
  type MenuFlyoutItem,
  type MenuFlyoutPosition,
} from '../components/MenuFlyoutHelper'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { getDisplayArtists } from '../shared/artists'
import { mergePlainLyricsWithTimedRaw, stripLyricsTimestamps } from '../shared/lyrics'
import type {
  LibraryPlaylist,
  LibrarySong,
  LyricsSnapshot,
  PlaybackMode,
  PreferenceItemSnapshot,
  SongPropertiesSnapshot,
} from '../shared/contracts'
import { formatBytes, formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { quickPlay, randomLibrary } from '../shared/mediaHelper'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackProgress } from '../state/playbackProgressStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

const QUICK_PLAY_LIMIT = 100
const DEFAULT_ARTWORK_URL = '/monotone_bg_wide.png'
const LYRICS_RESTORE_DELAY_MS = 5000

type FullPanel = 'playlist' | 'info' | 'lyrics' | 'album-art'

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
  currentSong: LibrarySong | null
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
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
  currentSong,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
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
  const [displayLyrics, setDisplayLyrics] = useState<{ trackId: number; lyrics: LyricsSnapshot } | null>(null)
  const [songArtwork, setSongArtwork] = useState<{ trackId: number; artworkUrl: string } | null>(null)
  const [moreMenu, setMoreMenu] = useState<MenuFlyoutPosition | null>(null)
  const [preferenceItem, setPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const [isProgressSeeking, setIsProgressSeeking] = useState(false)
  const [draftProgressSeconds, setDraftProgressSeconds] = useState(0)
  const [isLyricPreviewing, setIsLyricPreviewing] = useState(false)
  const [isLyricDragging, setIsLyricDragging] = useState(false)
  const [lyricPreviewIndex, setLyricPreviewIndex] = useState<number | null>(null)
  const isProgressSeekingRef = useRef(false)
  const lyricStageRef = useRef<HTMLDivElement | null>(null)
  const lyricLineRefs = useRef<Array<HTMLDivElement | null>>([])
  const lyricRestoreTimerRef = useRef<number | null>(null)
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
  const displayProgressSeconds = isProgressSeeking ? draftProgressSeconds : progressSeconds
  const progressValue = Math.min(Math.max(displayProgressSeconds, 0), effectiveDuration)
  const progressFill = effectiveDuration > 0 ? (progressValue / effectiveDuration) * 100 : 0
  const volumeValue = Math.min(Math.max(volume, 0), 100)
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
  void onRefresh
  void NowPlayingFullSongPanel
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
    if (currentSongId === undefined) {
      return
    }

    let canceled = false
    void window.smplayer!.getSongArtwork(currentSongId).then((nextArtworkUrl) => {
      if (!canceled) {
        setSongArtwork({ trackId: currentSongId, artworkUrl: nextArtworkUrl })
        if (nextArtworkUrl) {
          onArtworkResolved(currentSongId, nextArtworkUrl)
        }
      }
    })

    return () => {
      canceled = true
    }
  }, [currentSongId, onArtworkResolved])

  useEffect(() => {
    if (currentSongId === undefined) {
      return
    }

    let canceled = false
    void window.smplayer!.getLyrics(currentSongId, 'auto').then((snapshot) => {
      if (!canceled) {
        setDisplayLyrics({ trackId: currentSongId, lyrics: snapshot })
      }
    })

    return () => {
      canceled = true
    }
  }, [currentSongId])

  useEffect(() => {
    activeLyricsIndexRef.current = activeLyricsIndex
  }, [activeLyricsIndex])

  const clearLyricRestoreTimer = useCallback(() => {
    if (lyricRestoreTimerRef.current != null) {
      window.clearTimeout(lyricRestoreTimerRef.current)
      lyricRestoreTimerRef.current = null
    }
  }, [])

  const scrollLyricsToIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const container = lyricStageRef.current
    const line = lyricLineRefs.current[index]
    if (!container || !line) {
      return
    }

    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2,
      behavior,
    })
  }, [])

  const restoreLyricsToPlayback = useCallback(() => {
    setIsLyricPreviewing(false)
    setIsLyricDragging(false)
    setLyricPreviewIndex(null)
    const activeIndex = activeLyricsIndexRef.current
    if (activeIndex >= 0) {
      scrollLyricsToIndex(activeIndex, 'smooth')
    }
  }, [scrollLyricsToIndex])

  const scheduleLyricRestore = useCallback(() => {
    clearLyricRestoreTimer()
    lyricRestoreTimerRef.current = window.setTimeout(restoreLyricsToPlayback, LYRICS_RESTORE_DELAY_MS)
  }, [clearLyricRestoreTimer, restoreLyricsToPlayback])

  const updateLyricPreviewFromViewport = useCallback(() => {
    const container = lyricStageRef.current
    if (!container || displayLyricsLines.length === 0) {
      return
    }

    const centerY = container.getBoundingClientRect().top + container.clientHeight / 2
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
  }, [displayLyricsLines.length])

  useEffect(() => {
    if (!isLyricPreviewing && activeLyricsIndex >= 0) {
      window.requestAnimationFrame(() => scrollLyricsToIndex(activeLyricsIndex, 'smooth'))
    }
  }, [activeLyricsIndex, displayLyricsLines.length, isLyricPreviewing, scrollLyricsToIndex])

  useEffect(() => () => {
    clearLyricRestoreTimer()
  }, [clearLyricRestoreTimer])

  const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMoreMenu({ x: rect.left, y: rect.top })
    void refreshPreferenceItem()
  }

  const beginProgressSeek = (event: PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    isProgressSeekingRef.current = true
    setIsProgressSeeking(true)
    setDraftProgressSeconds(Number(event.currentTarget.value))
    onBeginSeek()
  }

  const commitProgressSeek = (seconds: number) => {
    if (!isProgressSeekingRef.current) {
      return
    }

    isProgressSeekingRef.current = false
    onSeek(seconds)
    onEndSeek()
    setIsProgressSeeking(false)
  }

  const beginLyricsDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || displayLyricsLines.length === 0) {
      return
    }

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
      window.requestAnimationFrame(updateLyricPreviewFromViewport)
      scheduleLyricRestore()
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

  const moreItems = getNowPlayingFullMoreItems({
    currentSong,
    songs,
    librarySongs,
    recentSongs,
    playlists,
    folders,
    queueSongIds,
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
  })

  return (
    <section
      className="now-playing-full-page"
      style={{ '--now-playing-full-artwork': `url("${displayArtworkUrl}")` } as CSSProperties}
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
          setShowPlaylistPanel((current) => !current)
        }}
      >
        <Icon name="nowPlaying" />
        {t('nowPlaying.playlist')}
        <Icon name="chevronDown" />
      </button>

      <div className="now-playing-full-content">
        <section className="now-playing-full-immersive">
          <div className="now-playing-full-left">
            <div className="now-playing-full-cover-wrap">
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
              {displayLyricsLines.length > 0 ? displayLyricsLines.map((line, index) => (
                <div
                  key={line.id}
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

        <div className="now-playing-full-progress">
          <span>{formatDuration(progressValue)}</span>
          <input
            className="now-playing-full-slider"
            type="range"
            min="0"
            max={effectiveDuration}
            step="0.1"
            value={progressValue}
            style={{ '--range-progress': `${progressFill}%` } as CSSProperties}
            disabled={disabled}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value)
              setDraftProgressSeconds(nextValue)
              if (!isProgressSeekingRef.current) {
                onSeek(nextValue)
              }
            }}
            onPointerDown={beginProgressSeek}
            onPointerUp={(event) => {
              commitProgressSeek(Number(event.currentTarget.value))
            }}
            onPointerCancel={(event) => {
              commitProgressSeek(Number(event.currentTarget.value))
            }}
            onLostPointerCapture={(event) => {
              commitProgressSeek(Number(event.currentTarget.value))
            }}
            aria-label={t('player.trackProgress')}
            title={formatDuration(progressValue)}
          />
          <span>{formatDuration(effectiveDuration)}</span>
        </div>

        <div className="now-playing-full-media-control">
          <div className="now-playing-full-transport">
            <IconButton icon="previous" label={t('player.previous')} disabled={disabled} onClick={onPrevious} />
            <IconButton
              icon={isPlaying ? 'pause' : 'play'}
              label={isPlaying ? t('player.pause') : t('player.play')}
              disabled={disabled}
              primary
              onClick={onTogglePlayPause}
            />
            <IconButton icon="next" label={t('player.next')} disabled={disabled} onClick={onNext} />
            <span className="now-playing-full-separator" aria-hidden="true" />
            <IconButton
              icon={isMuted ? 'volumeMuted' : 'volume'}
              label={isMuted ? t('player.unmute') : t('player.mute')}
              disabled={disabled}
              active={isMuted}
              onClick={onToggleMute}
            />
            <input
              className="now-playing-full-slider now-playing-full-volume"
              type="range"
              min="0"
              max="100"
              value={volumeValue}
              style={{ '--range-progress': `${volumeValue}%` } as CSSProperties}
              disabled={disabled}
              onChange={(event) => {
                onVolumeChange(Number(event.currentTarget.value))
              }}
              aria-label={t('player.volume')}
              title={String(volumeValue)}
            />
            <IconButton icon="shuffle" label={mode === 'shuffle' ? t('player.shuffleEnabled') : t('player.shuffleDisabled')} disabled={disabled} active={mode === 'shuffle'} onClick={onToggleShuffle} />
            <IconButton icon="repeat" label={mode === 'repeat' ? t('player.repeatEnabled') : t('player.repeatDisabled')} disabled={disabled} active={mode === 'repeat'} onClick={onToggleRepeat} />
            <IconButton icon="repeatOne" label={mode === 'repeat-one' ? t('player.repeatOneEnabled') : t('player.repeatOneDisabled')} disabled={disabled} active={mode === 'repeat-one'} onClick={onToggleRepeatOne} />
            <IconButton icon="voice" label={t('player.voiceAssistant')} disabled={disabled} onClick={() => {}} />
            <IconButton
              icon={currentSong?.favorite ? 'heartFilled' : 'heart'}
              label={currentSong?.favorite ? t('player.unlike') : t('player.like')}
              disabled={disabled}
              active={currentSong?.favorite}
              onClick={() => {
                if (currentSong) {
                  onToggleFavorite(currentSong.id, !currentSong.favorite)
                }
              }}
            />
            <IconButton icon="moreHorizontal" label={t('player.more')} disabled={false} onClick={openMoreMenu} />
          </div>
          <div className="now-playing-full-panel-buttons">
            <IconButton icon="fullscreen" label={t('nowPlaying.exitFullScreen')} onClick={goBack} />
          </div>
        </div>

        {error ? <div className="now-playing-full-error">{error}</div> : null}

        {showPlaylistPanel ? (
          <NowPlayingFullPlaylist
            songs={songs}
            playlists={playlists}
            t={t}
            selectedTrackId={selectedTrackId}
            selectedQueueIndex={selectedQueueIndex}
            isPlaying={isPlaying}
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
            onClose={goBack}
            onPanelRequest={() => {
              setShowPlaylistPanel(false)
            }}
          />
        ) : null}
      </div>
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
  songs,
  playlists,
  t,
  selectedTrackId,
  selectedQueueIndex,
  isPlaying,
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
  songs: LibrarySong[]
  playlists: LibraryPlaylist[]
  t: Translator
  selectedTrackId: number | null
  selectedQueueIndex: number | null
  isPlaying: boolean
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
  onPanelRequest: (panel: Exclude<FullPanel, 'playlist'>) => void
}) {
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedQueueIndexes, setSelectedQueueIndexes] = useState<Set<number>>(new Set())
  const [songMenu, setSongMenu] = useState<NowPlayingSongMenuState | null>(null)
  const [addToMenu, setAddToMenu] = useState<NowPlayingAddToMenuState | null>(null)
  const [songPreferenceItem, setSongPreferenceItem] = useState<PreferenceItemSnapshot | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const listShellRef = useRef<HTMLElement | null>(null)
  const draggedQueueIndexRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const createPlaylist = useLibraryStore((state) => state.createPlaylist)
  const folders = useLibraryStore((state) => state.snapshot.folders)
  const moveSongToFolder = useLibraryStore((state) => state.moveSongToFolder)
  const removeSongFromPlaylist = useLibraryStore((state) => state.removeSongFromPlaylist)
  const setSongFavorite = useLibraryStore((state) => state.setSongFavorite)
  const refresh = useLibraryStore((state) => state.refresh)
  const hideMultiSelectCommandBarAfterOperation = useLibraryStore(
    (state) => state.snapshot.settings.hideMultiSelectCommandBarAfterOperation,
  )
  const showUndoableNotification = useUndoableNotificationStore((state) => state.show)
  const queueSongIds = useMemo(() => songs.map((song) => song.id), [songs])
  const selectedEntries = useMemo(
    () => songs
      .map((song, queueIndex) => ({ song, queueIndex }))
      .filter((entry) => selectedQueueIndexes.has(entry.queueIndex)),
    [selectedQueueIndexes, songs],
  )
  const selectedSongIds = useMemo(() => selectedEntries.map((entry) => entry.song.id), [selectedEntries])
  const selectedQueueIndexList = useMemo(() => selectedEntries.map((entry) => entry.queueIndex), [selectedEntries])
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const favoritePlaylist = useMemo(
    () => playlists.find((playlist) => playlist.isBuiltIn && playlist.name === t('common.myFavorites'))!,
    [playlists, t],
  )
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
    if (songs.length === 0) {
      return
    }

    window.requestAnimationFrame(() => {
      currentRowRef.current?.scrollIntoView({ block: 'center' })
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
          onAddSongsToPlaylist(favoritePlaylist.id, addToMenu.songIds)
          showUndo(
            addToMenu.songIds.length === 1
              ? t('notification.songAddedTo', {
                  title: songs.find((song) => song.id === addToMenu.songIds[0])!.title,
                  target: t('common.myFavorites'),
                })
              : t('notification.songsAddedTo', { count: addToMenu.songIds.length, target: t('common.myFavorites') }),
            () => Promise.all(addToMenu.songIds.map((songId) => removeSongFromPlaylist(favoritePlaylist.id, songId))).then(() => undefined),
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
            () => Promise.all(addToMenu.songIds.map((songId) => removeSongFromPlaylist(playlistId, songId))).then(() => undefined),
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
      <section className="now-playing-full-panel now-playing-full-empty-panel now-playing-full-queue-popover">
        <h3>{t('nowPlaying.queueEmpty')}</h3>
        <p>{t('nowPlaying.queueEmptyHelp')}</p>
      </section>
    )
  }

  return (
    <section className="now-playing-full-panel now-playing-full-playlist-panel now-playing-full-queue-popover">
      <header className="now-playing-full-playlist-title">
        <strong>{t('common.nowPlaying')}</strong>
        <span>{t('playlists.songCount', { count: songs.length })}</span>
      </header>
      <div className="now-playing-full-table-header">
        <span>{t('table.title')}</span>
        <span>{t('table.artist')}</span>
        <span>{t('table.album')}</span>
        <span>{t('table.duration')}</span>
      </div>
      <section className="now-playing-full-list-shell" ref={listShellRef}>
        {songs.map((song, queueIndex) => {
          const current = selectedQueueIndex !== null
            ? queueIndex === selectedQueueIndex
            : song.id === selectedTrackId
          return (
            <PlaylistControlItem
              key={`now-playing-full-${queueIndex}-${song.id}`}
              containerRef={current ? currentRowRef : undefined}
              song={song}
              t={t}
              current={current}
              isPlaying={isPlaying}
              selected={selectedQueueIndexes.has(queueIndex)}
              selectionMode={multiSelect}
              queueSongIds={queueSongIds}
              draggable
              showArtist
              showAlbum
              rowNumber={queueIndex + 1}
              onPlayTrack={(trackId, nextQueueSongIds) => {
                onPlayTrack(trackId, nextQueueSongIds, queueIndex)
              }}
              onTogglePlayPause={onTogglePlayPause}
              onSelect={() => toggleSelection(queueIndex)}
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
              onArtistClick={(artist) => {
                navigate(`/artists/${encodeURIComponent(artist)}`)
                onClose()
              }}
              onAlbumClick={(album) => {
                navigate(`/albums/${encodeURIComponent(album)}`)
                onClose()
              }}
              onDragStart={(event) => {
                draggedQueueIndexRef.current = queueIndex
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                const draggedQueueIndex = draggedQueueIndexRef.current
                draggedQueueIndexRef.current = null
                if (draggedQueueIndex == null || draggedQueueIndex === queueIndex) {
                  return
                }

                const nextSongIds = queueSongIds.slice()
                const [draggedSongId] = nextSongIds.splice(draggedQueueIndex, 1)
                const targetIndex = draggedQueueIndex < queueIndex ? queueIndex - 1 : queueIndex
                nextSongIds.splice(targetIndex, 0, draggedSongId!)
                onReplaceQueue(nextSongIds)
              }}
            />
          )
        })}
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
              navigate(`/artists/${encodeURIComponent(artist)}`)
              onClose()
            },
            onSeeAlbum: () => {
              navigate(`/albums/${encodeURIComponent(songMenu.song.album || t('common.albumUnknown'))}`)
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

function NowPlayingFullSongPanel({
  panel,
  song,
  t,
  currentTrackId,
  isPlaying,
  queueSongIds,
  onPlayTrack,
  onTogglePlayPause,
  onArtworkResolved,
  onSaved,
}: {
  panel: Exclude<FullPanel, 'playlist'>
  song: LibrarySong | null
  t: Translator
  currentTrackId: number | null
  isPlaying: boolean
  queueSongIds: number[]
  onPlayTrack: (trackId: number, queueSongIds: number[], queueIndex?: number) => void
  onTogglePlayPause: () => void
  onArtworkResolved: (trackId: number, artworkUrl: string) => void
  onSaved: () => void | Promise<void>
}) {
  const [properties, setProperties] = useState<SongPropertiesSnapshot | null>(null)
  const [originalProperties, setOriginalProperties] = useState<SongPropertiesSnapshot | null>(null)
  const [lyrics, setLyrics] = useState<LyricsSnapshot | null>(null)
  const [lyricsText, setLyricsText] = useState('')
  const [originalLyricsText, setOriginalLyricsText] = useState('')
  const [lyricsRawText, setLyricsRawText] = useState('')
  const [showLyricsTimestamps, setShowLyricsTimestamps] = useState(true)
  const [artworkUrl, setArtworkUrl] = useState('')
  const [artworkSourcePath, setArtworkSourcePath] = useState('')
  const [showArtworkDeleteConfirm, setShowArtworkDeleteConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const songId = song?.id
  const baseArtworkUrl = song?.artworkUrl || ''
  const isCurrentSong = song?.id === currentTrackId
  const currentLyricsRawText = showLyricsTimestamps
    ? lyricsText
    : mergePlainLyricsWithTimedRaw(lyricsRawText, lyricsText)
  const canPause = isCurrentSong && isPlaying
  const playQueue = useMemo(() => {
    if (!song) {
      return queueSongIds
    }

    return queueSongIds.includes(song.id) ? queueSongIds : [...queueSongIds, song.id]
  }, [queueSongIds, song])

  useEffect(() => {
    if (songId === undefined) {
      return
    }

    let canceled = false
    setStatusMessage('')

    if (panel === 'info') {
      setLoading(true)
      void window.smplayer!.getSongProperties(songId).then((snapshot) => {
        if (!canceled) {
          setProperties(snapshot)
          setOriginalProperties(snapshot)
          setLoading(false)
        }
      })
    }

    if (panel === 'lyrics') {
      setLoading(true)
      void window.smplayer!.getLyrics(songId, 'auto').then((snapshot) => {
        if (!canceled) {
          setLyrics(snapshot)
          setLyricsRawText(snapshot.rawText)
          setLyricsText(snapshot.rawText)
          setOriginalLyricsText(snapshot.rawText)
          setLoading(false)
        }
      })
    }

    if (panel === 'album-art') {
      setLoading(true)
      setArtworkUrl(baseArtworkUrl)
      setArtworkSourcePath('')
      setShowArtworkDeleteConfirm(false)
      void window.smplayer!.getSongArtwork(songId).then((nextArtworkUrl) => {
        if (!canceled) {
          setArtworkUrl(nextArtworkUrl || baseArtworkUrl)
          setLoading(false)
        }
      })
    }

    return () => {
      canceled = true
    }
  }, [baseArtworkUrl, panel, songId])

  const updateProperty = (key: keyof SongPropertiesSnapshot, value: string) => {
    setProperties((current) => current ? { ...current, [key]: value } : current)
  }

  const updateNumericProperty = (key: keyof SongPropertiesSnapshot, value: string) => {
    setProperties((current) => current ? { ...current, [key]: Number(value) || 0 } : current)
  }

  const play = () => {
    if (!song) {
      return
    }

    if (canPause || isCurrentSong && !isPlaying) {
      onTogglePlayPause()
      return
    }

    onPlayTrack(song.id, playQueue)
  }

  const saveProperties = async () => {
    if (!song || !properties) {
      return
    }

    setSaving(true)
    try {
      await window.smplayer!.updateSongProperties(song.id, {
        title: properties.title,
        subtitle: properties.subtitle,
        artist: properties.artist,
        album: properties.album,
        albumArtist: properties.albumArtist,
        publisher: properties.publisher,
        trackNumber: properties.trackNumber,
        year: properties.year,
        genre: properties.genre,
        composers: properties.composers,
        playCount: properties.playCount,
      })
      setOriginalProperties(properties)
      setStatusMessage(t('common.saved'))
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const saveLyrics = async () => {
    if (!song) {
      return
    }

    setSaving(true)
    try {
      await window.smplayer!.saveSongLyrics(song.id, currentLyricsRawText)
      setLyricsRawText(currentLyricsRawText)
      setOriginalLyricsText(currentLyricsRawText)
      setLyrics((current) => current ? { ...current, rawText: currentLyricsRawText } : current)
      setStatusMessage(t('common.saved'))
    } finally {
      setSaving(false)
    }
  }

  const searchLyrics = async () => {
    if (!song) {
      return
    }

    setSaving(true)
    try {
      const snapshot = await window.smplayer!.getLyrics(song.id, 'internet')
      if (snapshot.rawText.trim()) {
        setLyrics(snapshot)
        setLyricsRawText(snapshot.rawText)
        setLyricsText(showLyricsTimestamps ? snapshot.rawText : stripLyricsTimestamps(snapshot.rawText))
        setStatusMessage('')
        return
      }

      await window.smplayer!.openLyricsSearchInBrowser(song.id)
      setStatusMessage(t('song.lyricsSearchOpened'))
    } finally {
      setSaving(false)
    }
  }

  const importLyrics = async () => {
    const result = await window.smplayer!.importLyrics()
    if (!result.canceled) {
      setLyricsRawText(result.rawText)
      setLyricsText(showLyricsTimestamps ? result.rawText : stripLyricsTimestamps(result.rawText))
      setStatusMessage('')
    }
  }

  const toggleLyricsTimestamps = (checked: boolean) => {
    const rawText = currentLyricsRawText
    setShowLyricsTimestamps(checked)
    setLyricsRawText(rawText)
    setLyricsText(checked ? rawText : stripLyricsTimestamps(rawText))
  }

  const changeArtwork = async () => {
    const result = await window.smplayer!.pickSongArtworkSource()
    if (!result.canceled) {
      setArtworkUrl(result.artworkUrl)
      setArtworkSourcePath(result.sourcePath)
      setShowArtworkDeleteConfirm(false)
      setStatusMessage('')
    }
  }

  const saveArtwork = async () => {
    if (!song || !artworkSourcePath) {
      return
    }

    setSaving(true)
    try {
      await window.smplayer!.saveSongArtwork(song.id, artworkSourcePath)
      setArtworkSourcePath('')
      setStatusMessage(t('common.saved'))
      if (artworkUrl) {
        onArtworkResolved(song.id, artworkUrl)
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const deleteArtwork = async () => {
    if (!song) {
      return
    }

    setSaving(true)
    try {
      await window.smplayer!.deleteSongArtwork(song.id)
      setArtworkUrl('')
      setArtworkSourcePath('')
      setShowArtworkDeleteConfirm(false)
      setStatusMessage(t('common.saved'))
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const resetActivePage = () => {
    if (panel === 'info' && originalProperties) {
      setProperties(originalProperties)
    }
    if (panel === 'lyrics') {
      setLyricsRawText(originalLyricsText)
      setLyricsText(showLyricsTimestamps ? originalLyricsText : stripLyricsTimestamps(originalLyricsText))
    }
  }

  if (!song) {
    return (
      <section className="now-playing-full-panel now-playing-full-empty-panel">
        <h3>{t('nowPlaying.noActiveTrack')}</h3>
        <p>{t('nowPlaying.noActiveTrackCopy')}</p>
      </section>
    )
  }

  if (panel === 'info') {
    return (
      <section className="now-playing-full-panel now-playing-full-details">
        <PanelHeader title={t('context.seeMusicInfo')} statusMessage={statusMessage}>
          <button type="button" onClick={play}>
            <Icon name={canPause ? 'pause' : 'play'} />
            {canPause ? t('context.pause') : t('context.play')}
          </button>
          <button type="button" className="now-playing-full-primary" disabled={saving || loading} onClick={() => void saveProperties()}>
            {t('settings.save')}
          </button>
          <button type="button" disabled={loading} onClick={resetActivePage}>
            {t('common.reset')}
          </button>
        </PanelHeader>
        {loading || !properties ? (
          <p className="now-playing-full-loading">{t('nowPlaying.loading')}</p>
        ) : (
          <>
            <div className="now-playing-full-form-grid">
              <label>
                <span>{t('table.title')}</span>
                <input value={properties.title} onChange={(event) => updateProperty('title', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('song.subtitle')}</span>
                <input value={properties.subtitle} onChange={(event) => updateProperty('subtitle', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('common.artist')}</span>
                <input value={properties.artist} onChange={(event) => updateProperty('artist', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('common.album')}</span>
                <input value={properties.album} onChange={(event) => updateProperty('album', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('song.albumArtist')}</span>
                <input value={properties.albumArtist} onChange={(event) => updateProperty('albumArtist', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('common.playCount')}</span>
                <span className="now-playing-full-inline-field">
                  <input type="number" value={properties.playCount} onChange={(event) => updateNumericProperty('playCount', event.currentTarget.value)} />
                  <button type="button" onClick={() => updateNumericProperty('playCount', '0')}>{t('common.clear')}</button>
                </span>
              </label>
              <label>
                <span>{t('song.publisher')}</span>
                <input value={properties.publisher} onChange={(event) => updateProperty('publisher', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('song.trackNumber')}</span>
                <input type="number" value={properties.trackNumber || ''} onChange={(event) => updateNumericProperty('trackNumber', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('song.year')}</span>
                <input type="number" value={properties.year || ''} onChange={(event) => updateNumericProperty('year', event.currentTarget.value)} />
              </label>
              <label>
                <span>{t('song.bitrate')}</span>
                <input value={properties.bitrate ? `${Math.round(properties.bitrate / 1000)} kbps` : ''} readOnly />
              </label>
              <label>
                <span>{t('song.composers')}</span>
                <input value={properties.composers} readOnly />
              </label>
              <label>
                <span>{t('song.dateCreated')}</span>
                <input value={new Date(properties.dateCreated).toLocaleString()} readOnly />
              </label>
              <label>
                <span>{t('song.dateModified')}</span>
                <input value={new Date(properties.dateModified).toLocaleString()} readOnly />
              </label>
              <label>
                <span>{t('common.duration')}</span>
                <input value={formatDuration(properties.duration)} readOnly />
              </label>
              <label>
                <span>{t('song.fileSize')}</span>
                <input value={formatBytes(properties.fileSize)} readOnly />
              </label>
              <label>
                <span>{t('song.fileType')}</span>
                <input value={properties.fileType} readOnly />
              </label>
              <label>
                <span>{t('song.genre')}</span>
                <input value={properties.genre} onChange={(event) => updateProperty('genre', event.currentTarget.value)} />
              </label>
            </div>
            <label className="now-playing-full-path">
              <span>{t('local.path')}</span>
              <span className="now-playing-full-inline-field">
                <input value={properties.path} readOnly />
                <button type="button" onClick={() => window.smplayer!.revealItemInFolder(properties.path)}>
                  {t('local.openFolder')}
                </button>
              </span>
            </label>
          </>
        )}
      </section>
    )
  }

  if (panel === 'lyrics') {
    return (
      <section className="now-playing-full-panel now-playing-full-lyrics">
        <PanelHeader title={t('nowPlaying.lyrics')} statusMessage={statusMessage}>
          <button type="button" disabled={saving} onClick={() => void searchLyrics()}>
            <Icon name="search" />
            {t('common.search')}
          </button>
          <button type="button" onClick={() => void importLyrics()}>{t('common.import')}</button>
          <button type="button" className="now-playing-full-primary" disabled={saving} onClick={() => void saveLyrics()}>{t('settings.save')}</button>
          <button type="button" onClick={resetActivePage}>{t('common.reset')}</button>
          <label className="now-playing-full-lyrics-toggle">
            <input
              type="checkbox"
              checked={showLyricsTimestamps}
              onChange={(event) => toggleLyricsTimestamps(event.currentTarget.checked)}
            />
            {t('song.showLyricsTimestamps')}
          </label>
        </PanelHeader>
        {loading ? <p className="now-playing-full-loading">{t('nowPlaying.loadingLyrics')}</p> : null}
        <textarea
          value={lyricsText}
          placeholder={lyrics?.source === 'none' ? t('nowPlaying.noLyrics') : ''}
          onChange={(event) => {
            const nextText = event.currentTarget.value
            setLyricsText(nextText)
            if (showLyricsTimestamps) {
              setLyricsRawText(nextText)
            }
            setStatusMessage('')
          }}
        />
      </section>
    )
  }

  return (
    <section className="now-playing-full-panel now-playing-full-artwork">
      <PanelHeader title={t('context.seeAlbumArt')} statusMessage={statusMessage}>
        <button type="button" onClick={() => void changeArtwork()}>{t('song.changeArtwork')}</button>
        <button type="button" className="now-playing-full-primary" disabled={saving || !artworkSourcePath} onClick={() => void saveArtwork()}>{t('settings.save')}</button>
        <button type="button" disabled={saving} onClick={() => setShowArtworkDeleteConfirm(true)}>{t('playlists.delete')}</button>
      </PanelHeader>
      {loading ? <p className="now-playing-full-loading">{t('nowPlaying.loading')}</p> : null}
      <AlbumArtControl title={song.title} artworkUrl={artworkUrl} />
      {showArtworkDeleteConfirm ? (
        <div className="now-playing-full-warning">
          <p>{t('song.deleteArtworkConfirm')}</p>
          <button type="button" onClick={() => void deleteArtwork()}>{t('common.yes')}</button>
          <button type="button" onClick={() => setShowArtworkDeleteConfirm(false)}>{t('common.cancel')}</button>
        </div>
      ) : null}
    </section>
  )
}

function PanelHeader({
  title,
  statusMessage,
  children,
}: {
  title: string
  statusMessage: string
  children: ReactNode
}) {
  return (
    <header className="now-playing-full-panel-header">
      <h3>{title}</h3>
      <div className="now-playing-full-panel-actions">{children}</div>
      {statusMessage ? <span>{statusMessage}</span> : null}
    </header>
  )
}

function IconButton({
  icon,
  label,
  disabled,
  active,
  primary,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  label: string
  disabled?: boolean
  active?: boolean
  primary?: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={clsx('now-playing-full-icon-button', { 'is-active': active, 'is-primary': primary })}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

function getNowPlayingFullMoreItems({
  currentSong,
  songs,
  librarySongs,
  recentSongs,
  playlists,
  folders,
  queueSongIds,
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
}: {
  currentSong: LibrarySong | null
  songs: LibrarySong[]
  librarySongs: LibrarySong[]
  recentSongs: LibrarySong[]
  playlists: LibraryPlaylist[]
  folders: ReturnType<typeof useLibraryStore.getState>['snapshot']['folders']
  queueSongIds: number[]
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
}) {
  const items: MenuFlyoutItem[] = [
    { key: 'quick-play', text: t('nowPlaying.quickPlay'), icon: 'shuffle', onClick: onQuickPlay },
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
    { key: 'save-playlist', text: t('nowPlaying.savePlaylist'), icon: 'plus', disabled: queueSongIds.length === 0, onClick: onSavePlaylist },
    { key: 'clear-now-playing', text: t('nowPlaying.clearNowPlaying'), icon: 'close', disabled: queueSongIds.length === 0, onClick: onClearQueue },
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
