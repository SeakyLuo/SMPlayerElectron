import { useEffect, useMemo, useState } from 'react'

import { getDisplayArtists } from '../shared/artists'
import type { AppSettingsUpdate, LibrarySong, LyricsSnapshot, SettingsSnapshot } from '../shared/contracts'
import { getDesktopLyricsFontCss } from '../shared/desktopLyricsFonts'
import { createTranslator } from '../shared/i18n'
import { getCurrentLyricsLine } from '../shared/lyrics'
import { useLibraryStore } from '../state/useLibraryStore'
import { usePlaybackProgress } from '../state/playbackProgressStore'

interface DesktopLyricsBridgeOptions {
  currentSong: LibrarySong | null
  isPlaying: boolean
  settings: SettingsSnapshot
  nightModeActive: boolean
  onNext: () => void
  onOpenSettings: () => void
  onPrevious: () => void
  onTogglePlayPause: () => void
  updateSettings: (update: AppSettingsUpdate) => Promise<void> | void
}

const lyricsOffsetMinMs = -10_000
const lyricsOffsetMaxMs = 10_000

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useDesktopLyricsBridge({
  currentSong,
  isPlaying,
  settings,
  nightModeActive,
  onNext,
  onOpenSettings,
  onPrevious,
  onTogglePlayPause,
  updateSettings,
}: DesktopLyricsBridgeOptions) {
  const [lyrics, setLyrics] = useState<{ songId: number; snapshot: LyricsSnapshot } | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const updateSongLyricsOffset = useLibraryStore((state) => state.updateSongLyricsOffset)
  const { progressSeconds, durationSeconds } = usePlaybackProgress()
  const currentSongId = currentSong?.id
  const lyricsOffsetMs = currentSong?.lyricsOffsetMs ?? 0
  const artist = currentSong ? getDisplayArtists(currentSong, '') : ''
  const effectiveDuration = durationSeconds || currentSong?.duration || 0
  const adjustedProgressSeconds = Math.max(0, progressSeconds + lyricsOffsetMs / 1000)
  const progressRatio = effectiveDuration > 0
    ? Math.min(Math.max(adjustedProgressSeconds / effectiveDuration, 0), 1)
    : 0
  const currentLyrics = lyrics && lyrics.songId === currentSongId ? lyrics.snapshot : null
  const t = useMemo(
    () => createTranslator(settings.preferredLanguage),
    [settings.preferredLanguage],
  )
  const lyricText = useMemo(
    () => getCurrentLyricsLine(currentLyrics, adjustedProgressSeconds, progressRatio),
    [adjustedProgressSeconds, currentLyrics, progressRatio],
  )

  useEffect(() => {
    if (!settings.desktopLyricsEnabled || currentSongId == null) {
      setLyrics(null)
      setLyricsLoading(false)
      return
    }

    let disposed = false
    setLyrics(null)
    setLyricsLoading(true)
    void window.smplayer!.getLyrics(currentSongId, settings.playerLyricsSource).then((snapshot) => {
      if (!disposed) {
        setLyrics({ songId: currentSongId, snapshot })
        setLyricsLoading(false)
      }
    })

    return () => {
      disposed = true
    }
  }, [currentSongId, settings.desktopLyricsEnabled, settings.playerLyricsSource])

  useEffect(() => window.smplayer?.onDesktopLyricsCommand((command) => {
    if (command.type === 'disable') {
      void updateSettings({ desktopLyricsEnabled: false })
    } else if (command.type === 'next') {
      onNext()
    } else if (command.type === 'open-settings') {
      onOpenSettings()
    } else if (command.type === 'play-pause') {
      onTogglePlayPause()
    } else if (command.type === 'previous') {
      onPrevious()
    } else if (command.type === 'toggle-lock') {
      void updateSettings({ desktopLyricsLocked: !settings.desktopLyricsLocked })
    } else if (command.type === 'offset') {
      if (currentSongId) {
        void updateSongLyricsOffset(currentSongId, clamp(lyricsOffsetMs + command.deltaMs, lyricsOffsetMinMs, lyricsOffsetMaxMs))
      }
    } else if (currentSongId) {
      void updateSongLyricsOffset(currentSongId, 0)
    }
  }), [
    currentSongId,
    lyricsOffsetMs,
    onNext,
    onOpenSettings,
    onPrevious,
    onTogglePlayPause,
    settings.desktopLyricsLocked,
    updateSettings,
    updateSongLyricsOffset,
  ])

  useEffect(() => {
    void window.smplayer?.updateDesktopLyricsState({
      visible: settings.desktopLyricsEnabled && currentSong != null,
      loading: lyricsLoading,
      playing: isPlaying,
      locked: settings.desktopLyricsLocked,
      nightMode: nightModeActive,
      opacity: settings.desktopLyricsOpacity,
      fontSize: settings.desktopLyricsFontSize,
      fontFamily: getDesktopLyricsFontCss(settings.desktopLyricsFontFamily),
      textColor: settings.desktopLyricsColor,
      strokeColor: settings.desktopLyricsStrokeColor,
      lyricText,
      fallbackText: currentSong ? `${currentSong.title}${artist ? ` - ${artist}` : ''}` : '',
      songTitle: currentSong?.title ?? '',
      artist,
      progressSeconds: adjustedProgressSeconds,
      offsetMs: lyricsOffsetMs,
      labels: {
        close: t('common.close'),
        lock: t('settings.desktopLyricsLockAction'),
        next: t('player.next'),
        playPause: isPlaying ? t('player.pause') : t('player.play'),
        previous: t('player.previous'),
        settings: t('common.settings'),
        unlock: t('settings.desktopLyricsUnlockAction'),
        resetOffset: t('settings.desktopLyricsResetOffset'),
      },
    })
  }, [
    adjustedProgressSeconds,
    artist,
    currentSong,
    isPlaying,
    lyricText,
    lyricsLoading,
    nightModeActive,
    settings.desktopLyricsEnabled,
    settings.desktopLyricsColor,
    settings.desktopLyricsStrokeColor,
    settings.desktopLyricsFontFamily,
    settings.desktopLyricsFontSize,
    settings.desktopLyricsLocked,
    settings.desktopLyricsOpacity,
    lyricsOffsetMs,
    t,
  ])
}
