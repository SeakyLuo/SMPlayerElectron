import { useCallback, useEffect, useState } from 'react'

import { Icon } from '../components/icons'
import type { HiddenStorageItem } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface HiddenFoldersPageProps {
  active: boolean
  t: Translator
  onResumeHiddenStorageItem: (item: HiddenStorageItem) => Promise<void>
}

export function HiddenFoldersPage({ active, t, onResumeHiddenStorageItem }: HiddenFoldersPageProps) {
  const [hiddenStorageItems, setHiddenStorageItems] = useState<HiddenStorageItem[]>([])

  const loadHiddenStorageItems = useCallback(async () => {
    const items = await window.smplayer!.getHiddenStorageItems()
    setHiddenStorageItems(items)
  }, [])

  useEffect(() => {
    if (active) {
      void loadHiddenStorageItems()
    }
  }, [active, loadHiddenStorageItems])

  const resumeHiddenStorageItem = async (item: HiddenStorageItem) => {
    await onResumeHiddenStorageItem(item)
    await loadHiddenStorageItems()
  }

  return (
    <section className="page-panel hidden-folders-page">
      <p className="hidden-folders-introduction">{t('hiddenFolders.introduction')}</p>
      <div className="hidden-storage-list">
        {hiddenStorageItems.length > 0 ? (
          hiddenStorageItems.map((item, index) => (
            <article className="hidden-storage-item" data-row={index % 2 === 0 ? 'even' : 'odd'} key={`${item.type}-${item.path}`}>
              <span className="hidden-storage-item-icon">
                <Icon name={item.type === 'folder' ? 'folder' : 'songs'} />
              </span>
              <span className="hidden-storage-item-path">{item.path}</span>
              <button
                className="hidden-storage-resume-button"
                type="button"
                onClick={() => {
                  void resumeHiddenStorageItem(item)
                }}
              >
                {t('hiddenFolders.resume')}
              </button>
            </article>
          ))
        ) : (
          <div className="empty-state compact hidden-storage-empty">
            <h3>{t('hiddenFolders.empty')}</h3>
          </div>
        )}
      </div>
    </section>
  )
}
