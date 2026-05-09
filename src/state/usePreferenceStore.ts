import { create } from 'zustand'

import type {
  PreferenceEntityType,
  PreferenceItemSnapshot,
  PreferenceItemUpdate,
  PreferenceLevel,
  PreferenceSettingsSnapshot,
  PreferenceSettingsUpdate,
} from '../shared/contracts'

type PreferenceSectionKey = 'songs' | 'artists' | 'albums' | 'playlists' | 'folders'

interface PreferenceStoreState {
  snapshot: PreferenceSettingsSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => Promise<PreferenceSettingsSnapshot | null>
  updateSettings: (update: PreferenceSettingsUpdate) => Promise<void>
  addItem: (type: PreferenceEntityType, itemId: string, name: string, level?: PreferenceLevel) => Promise<PreferenceSettingsSnapshot | null>
  updateItem: (item: PreferenceItemSnapshot, update: PreferenceItemUpdate) => Promise<void>
  removeItem: (item: PreferenceItemSnapshot) => Promise<void>
  clearInvalidItems: (type: PreferenceEntityType) => Promise<void>
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Preference settings operation failed.'
}

function preferenceSectionForType(type: PreferenceEntityType): PreferenceSectionKey | null {
  switch (type) {
    case 'song':
      return 'songs'
    case 'artist':
      return 'artists'
    case 'album':
      return 'albums'
    case 'playlist':
      return 'playlists'
    case 'folder':
      return 'folders'
    default:
      return null
  }
}

export const usePreferenceStore = create<PreferenceStoreState>((set, get) => ({
  snapshot: null,
  loading: false,
  error: null,
  refresh: async () => {
    if (!window.smplayer) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const snapshot = await window.smplayer.getPreferenceSettings()
      set({ snapshot })
      return snapshot
    } catch (error) {
      set({ error: getErrorMessage(error) })
      return null
    } finally {
      set({ loading: false })
    }
  },
  updateSettings: async (update) => {
    if (!window.smplayer) {
      return
    }

    await window.smplayer.updatePreferenceSettings(update)
    set((state) => state.snapshot ? ({
      error: null,
      snapshot: {
        ...state.snapshot,
        enabled: {
          ...state.snapshot.enabled,
          ...update,
        },
      },
    }) : { error: null })
  },
  addItem: async (type, itemId, name, level) => {
    if (!window.smplayer) {
      return null
    }

    await window.smplayer.addPreferenceItem(type, itemId, name, level)
    return get().refresh()
  },
  updateItem: async (item, update) => {
    if (!window.smplayer) {
      return
    }

    await window.smplayer.updatePreferenceItem(item.id, update)
    set((state) => {
      if (!state.snapshot) {
        return { error: null }
      }

      const section = preferenceSectionForType(item.type)
      const patchItem = (candidate: PreferenceItemSnapshot) =>
        candidate.id === item.id ? { ...candidate, ...update } : candidate

      return {
        error: null,
        snapshot: section
          ? { ...state.snapshot, [section]: state.snapshot[section].map(patchItem) }
          : { ...state.snapshot, others: state.snapshot.others.map(patchItem) },
      }
    })
  },
  removeItem: async (item) => {
    if (!window.smplayer) {
      return
    }

    await window.smplayer.removePreferenceItem(item.id)
    set((state) => {
      if (!state.snapshot) {
        return { error: null }
      }

      const section = preferenceSectionForType(item.type)
      const removeById = (candidate: PreferenceItemSnapshot) => candidate.id !== item.id

      return {
        error: null,
        snapshot: section
          ? { ...state.snapshot, [section]: state.snapshot[section].filter(removeById) }
          : { ...state.snapshot, others: state.snapshot.others.filter(removeById) },
      }
    })
  },
  clearInvalidItems: async (type) => {
    if (!window.smplayer) {
      return
    }

    await window.smplayer.clearInvalidPreferenceItems(type)
    const section = preferenceSectionForType(type)
    set((state) => state.snapshot && section
      ? {
          error: null,
          snapshot: {
            ...state.snapshot,
            [section]: state.snapshot[section].filter((item) => item.isValid),
          },
        }
      : { error: null })
  },
}))
