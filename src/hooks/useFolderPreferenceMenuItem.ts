import { useEffect, useState } from 'react'

import type { PreferenceItemSnapshot, PreferenceLevel, PreferenceSettingsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { usePreferenceStore } from '../state/usePreferenceStore'
import type { MenuFlyoutItem } from '../components/MenuFlyoutHelper'

interface FolderPreferenceTarget {
  id: number
  name: string
}

const preferenceLevels: PreferenceLevel[] = ['very-high', 'higher', 'high', 'normal', 'dislike', 'do-not-appear']

export function useFolderPreferenceMenuItem(t: Translator) {
  const [folderPreferenceItems, setFolderPreferenceItems] = useState<Map<string, PreferenceItemSnapshot>>(new Map())
  const refreshPreferences = usePreferenceStore((state) => state.refresh)
  const addPreferenceItem = usePreferenceStore((state) => state.addItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)

  const refreshFolderPreferenceItems = async (snapshot?: PreferenceSettingsSnapshot | null) => {
    const settings = snapshot ?? await refreshPreferences()
    if (!settings) {
      return
    }
    setFolderPreferenceItems(new Map(settings.folders.map((item) => [item.itemId, item])))
  }

  const getFolderPreferenceMenuItem = (folder: FolderPreferenceTarget, keyPrefix: string): MenuFlyoutItem => {
    const preferenceItem = folderPreferenceItems.get(String(folder.id))

    return {
      key: `${keyPrefix}-folder-preference`,
      text: t('settings.preferenceSettings'),
      icon: 'star',
      submenu: [
        ...(preferenceItem
          ? [
              {
                key: `${keyPrefix}-folder-preference-undo`,
                text: t('preferences.undoPrefer'),
                onClick: () => {
                  void removePreferenceItem(preferenceItem).then(() => refreshFolderPreferenceItems(usePreferenceStore.getState().snapshot))
                },
              },
              { key: `${keyPrefix}-folder-preference-undo-separator`, text: '', separator: true },
            ] satisfies MenuFlyoutItem[]
          : []),
        ...preferenceLevels.map((level) => ({
          key: `${keyPrefix}-folder-preference-${level}`,
          text: t(`preferences.level.${level}`),
          icon: preferenceItem?.level === level ? 'check' as const : undefined,
          onClick: () => {
            void addPreferenceItem('folder', String(folder.id), folder.name, level).then(refreshFolderPreferenceItems)
          },
        })),
      ],
    }
  }

  useEffect(() => {
    void refreshFolderPreferenceItems()
  }, [])

  return {
    getFolderPreferenceMenuItem,
    refreshFolderPreferenceItems,
  }
}
