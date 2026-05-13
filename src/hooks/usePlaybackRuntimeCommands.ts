import { useEffect } from 'react'

import type { MusicData, PlaybackRuntimeSettings } from '../shared/contracts'

type SmplayerPlaybackSettingsApi = Omit<NonNullable<typeof window.smplayer>, 'getPlaybackSettingsImmediate'> & {
  getPlaybackSettingsImmediate?: () => PlaybackRuntimeSettings
}

function getSmplayerPlaybackSettingsApi() {
  return window.smplayer as SmplayerPlaybackSettingsApi | undefined
}

export function readInitialPlaybackSettings(snapshot: MusicData): PlaybackRuntimeSettings {
  return getSmplayerPlaybackSettingsApi()?.getPlaybackSettingsImmediate?.() ?? {
    volume: snapshot.settings.volume,
    isMuted: snapshot.settings.isMuted,
    mode: snapshot.settings.mode,
  }
}

export function usePlaybackRuntimeSettingsRestore(onRestoreSettings: () => void) {
  useEffect(() => {
    return window.smplayer?.onTrayCommand((command) => {
      if (command === 'show-window') {
        onRestoreSettings()
      }
    })
  }, [onRestoreSettings])
}

export function useGlobalPlaybackCommands({
  onTogglePlayPause,
  onPlayNext,
  onPlayPrevious,
  onStop,
}: {
  onTogglePlayPause: () => void
  onPlayNext: () => void
  onPlayPrevious: () => void
  onStop: () => void
}) {
  useEffect(() => {
    if (!window.smplayer) {
      return
    }

    return window.smplayer.onGlobalMediaCommand((command) => {
      if (command === 'play-pause') {
        onTogglePlayPause()
        return
      }

      if (command === 'next') {
        onPlayNext()
        return
      }

      if (command === 'previous') {
        onPlayPrevious()
        return
      }

      onStop()
    })
  }, [onPlayNext, onPlayPrevious, onStop, onTogglePlayPause])
}
