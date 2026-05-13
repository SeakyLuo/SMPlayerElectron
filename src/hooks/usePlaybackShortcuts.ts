import { useEffect } from 'react'

interface PlaybackShortcutsOptions {
  onTogglePlayPause: () => void
  onPlayNext: () => void
  onPlayPrevious: () => void
  onSeekBySeconds: (offsetSeconds: number) => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleRepeatOne: () => void
}

export function usePlaybackShortcuts({
  onTogglePlayPause,
  onPlayNext,
  onPlayPrevious,
  onSeekBySeconds,
  onToggleShuffle,
  onToggleRepeat,
  onToggleRepeatOne,
}: PlaybackShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isEditableTarget) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        onTogglePlayPause()
        return
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLocaleLowerCase()
        if (key === 's') {
          event.preventDefault()
          onToggleShuffle()
          return
        }

        if (key === 'r') {
          event.preventDefault()
          onToggleRepeat()
          return
        }

        if (event.key === '1') {
          event.preventDefault()
          onToggleRepeatOne()
          return
        }
      }

      if (event.altKey || event.metaKey) {
        return
      }

      if (event.ctrlKey && event.key === 'ArrowRight') {
        event.preventDefault()
        onPlayNext()
        return
      }

      if (event.ctrlKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        onPlayPrevious()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onSeekBySeconds(event.shiftKey ? 30 : 5)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onSeekBySeconds(event.shiftKey ? -30 : -5)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onPlayNext, onPlayPrevious, onSeekBySeconds, onTogglePlayPause, onToggleRepeat, onToggleRepeatOne, onToggleShuffle])
}
