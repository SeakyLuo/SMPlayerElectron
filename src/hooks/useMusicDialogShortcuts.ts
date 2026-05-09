import { useEffect } from 'react'

interface MusicDialogShortcutsOptions {
  activeMode: 'properties' | 'lyrics' | 'album-art'
  onSave: () => void | Promise<void>
  onReset: () => void
  onSearchLyrics: () => void | Promise<void>
}

export function useMusicDialogShortcuts({
  activeMode,
  onSave,
  onReset,
  onSearchLyrics,
}: MusicDialogShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) {
        return
      }

      if (event.key.toLocaleLowerCase() === 's') {
        event.preventDefault()
        void onSave()
      }

      if (event.key.toLocaleLowerCase() === 'r') {
        event.preventDefault()
        onReset()
      }

      if (event.key.toLocaleLowerCase() === 'f' && activeMode === 'lyrics') {
        event.preventDefault()
        void onSearchLyrics()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeMode, onReset, onSave, onSearchLyrics])
}
