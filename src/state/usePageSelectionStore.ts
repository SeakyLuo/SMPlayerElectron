import { useCallback, type SetStateAction } from 'react'
import { create } from 'zustand'

interface PageSelectionState {
  multiSelect: boolean
  selectedSongIds: Set<number>
  selectedQueueIndexes: Set<number>
  selectedSearchIds: Set<number>
  selectedAlbumNames: Set<string>
  selectedFolderPaths: Set<string>
  selectedCollectionKeys: Set<string>
  selectedCardKeys: Set<string>
  selectionAnchorSongId: number | null
}

type NumberSetField = 'selectedSongIds' | 'selectedQueueIndexes' | 'selectedSearchIds'
type StringSetField = 'selectedAlbumNames' | 'selectedFolderPaths' | 'selectedCollectionKeys' | 'selectedCardKeys'

const emptyNumberSets: Record<NumberSetField, Set<number>> = {
  selectedSongIds: new Set(),
  selectedQueueIndexes: new Set(),
  selectedSearchIds: new Set(),
}

const emptyStringSets: Record<StringSetField, Set<string>> = {
  selectedAlbumNames: new Set(),
  selectedFolderPaths: new Set(),
  selectedCollectionKeys: new Set(),
  selectedCardKeys: new Set(),
}

interface PageSelectionStore {
  states: Record<string, PageSelectionState>
  setMultiSelect: (key: string, value: SetStateAction<boolean>) => void
  setNumberSet: (key: string, field: NumberSetField, value: SetStateAction<Set<number>>) => void
  setStringSet: (key: string, field: StringSetField, value: SetStateAction<Set<string>>) => void
  setSelectionAnchorSongId: (key: string, value: SetStateAction<number | null>) => void
}

function createDefaultSelectionState(): PageSelectionState {
  return {
    multiSelect: false,
    selectedSongIds: new Set(),
    selectedQueueIndexes: new Set(),
    selectedSearchIds: new Set(),
    selectedAlbumNames: new Set(),
    selectedFolderPaths: new Set(),
    selectedCollectionKeys: new Set(),
    selectedCardKeys: new Set(),
    selectionAnchorSongId: null,
  }
}

function resolveStateAction<T>(value: SetStateAction<T>, current: T) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value
}

export const usePageSelectionStore = create<PageSelectionStore>((set) => ({
  states: {},
  setMultiSelect: (key, value) => {
    set((store) => {
      const current = store.states[key] ?? createDefaultSelectionState()
      return {
        states: {
          ...store.states,
          [key]: {
            ...current,
            multiSelect: resolveStateAction(value, current.multiSelect),
          },
        },
      }
    })
  },
  setNumberSet: (key, field, value) => {
    set((store) => {
      const current = store.states[key] ?? createDefaultSelectionState()
      return {
        states: {
          ...store.states,
          [key]: {
            ...current,
            [field]: resolveStateAction(value, current[field]),
          },
        },
      }
    })
  },
  setStringSet: (key, field, value) => {
    set((store) => {
      const current = store.states[key] ?? createDefaultSelectionState()
      return {
        states: {
          ...store.states,
          [key]: {
            ...current,
            [field]: resolveStateAction(value, current[field]),
          },
        },
      }
    })
  },
  setSelectionAnchorSongId: (key, value) => {
    set((store) => {
      const current = store.states[key] ?? createDefaultSelectionState()
      return {
        states: {
          ...store.states,
          [key]: {
            ...current,
            selectionAnchorSongId: resolveStateAction(value, current.selectionAnchorSongId),
          },
        },
      }
    })
  },
}))

export function useStoredMultiSelect(key: string) {
  const value = usePageSelectionStore((store) => store.states[key]?.multiSelect ?? false)
  const setValue = usePageSelectionStore((store) => store.setMultiSelect)

  return [
    value,
    useCallback((nextValue: SetStateAction<boolean>) => {
      setValue(key, nextValue)
    }, [key, setValue]),
  ] as const
}

export function useStoredNumberSet(key: string, field: NumberSetField) {
  const value = usePageSelectionStore((store) => store.states[key]?.[field] ?? emptyNumberSets[field])
  const setValue = usePageSelectionStore((store) => store.setNumberSet)

  return [
    value,
    useCallback((nextValue: SetStateAction<Set<number>>) => {
      setValue(key, field, nextValue)
    }, [field, key, setValue]),
  ] as const
}

export function useStoredStringSet(key: string, field: StringSetField) {
  const value = usePageSelectionStore((store) => store.states[key]?.[field] ?? emptyStringSets[field])
  const setValue = usePageSelectionStore((store) => store.setStringSet)

  return [
    value,
    useCallback((nextValue: SetStateAction<Set<string>>) => {
      setValue(key, field, nextValue)
    }, [field, key, setValue]),
  ] as const
}

export function useStoredSelectionAnchorSongId(key: string) {
  const value = usePageSelectionStore((store) => store.states[key]?.selectionAnchorSongId ?? null)
  const setValue = usePageSelectionStore((store) => store.setSelectionAnchorSongId)

  return [
    value,
    useCallback((nextValue: SetStateAction<number | null>) => {
      setValue(key, nextValue)
    }, [key, setValue]),
  ] as const
}
