import { useCallback } from 'react'

export function useRevealItem() {
  return useCallback((itemPath: string) => {
    void window.smplayer?.revealItemInFolder(itemPath)
  }, [])
}
