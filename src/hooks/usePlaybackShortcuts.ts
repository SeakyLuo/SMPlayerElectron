import { useEffect } from 'react'

interface PlaybackShortcutsOptions {
  onTogglePlayPause: () => void
  onPlayNext: () => void
  onPlayPrevious: () => void
  onSeekBySeconds: (offsetSeconds: number) => void
}

export function usePlaybackShortcuts({
  onTogglePlayPause,
  onPlayNext,
  onPlayPrevious,
  onSeekBySeconds,
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
  }, [onPlayNext, onPlayPrevious, onSeekBySeconds, onTogglePlayPause])
}
