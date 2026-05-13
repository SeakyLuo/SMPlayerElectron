import { useEffect } from 'react'

import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { useHiddenStorageItems } from '../hooks/useHiddenStorageItems'
import type { HiddenStorageItem } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface HiddenFoldersPageProps {
  active: boolean
  t: Translator
  loading: boolean
  onResumeHiddenStorageItem: (item: HiddenStorageItem) => Promise<void>
}

export function HiddenFoldersPage({ active, t, loading, onResumeHiddenStorageItem }: HiddenFoldersPageProps) {
  const { hiddenStorageItems, itemsLoading, loadHiddenStorageItems } = useHiddenStorageItems()

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
      {loading ? <div className="root-banner">{t('library.refreshing')}</div> : null}
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
        ) : loading || itemsLoading ? (
          <LoadingState t={t} compact />
        ) : (
          <div className="empty-state compact hidden-storage-empty">
            <h3>{t('hiddenFolders.empty')}</h3>
          </div>
        )}
      </div>
    </section>
  )
}
