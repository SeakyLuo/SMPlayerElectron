import { useCallback, useState } from 'react'

import type { HiddenStorageItem } from '../shared/contracts'

export function useHiddenStorageItems() {
  const [hiddenStorageItems, setHiddenStorageItems] = useState<HiddenStorageItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  const loadHiddenStorageItems = useCallback(async () => {
    setItemsLoading(true)
    try {
      const items = await window.smplayer!.getHiddenStorageItems()
      setHiddenStorageItems(items)
    } finally {
      setItemsLoading(false)
    }
  }, [])

  return {
    hiddenStorageItems,
    itemsLoading,
    loadHiddenStorageItems,
  }
}
