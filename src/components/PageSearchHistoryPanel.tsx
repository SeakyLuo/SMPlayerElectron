import { Icon } from './icons'
import type { SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface PageSearchHistoryPanelProps {
  entries: SearchHistoryEntry[]
  t: Translator
  onSelect: (query: string) => void
  onRemove: (entryId: number) => void
  onClear: () => void
}

export function PageSearchHistoryPanel({
  entries,
  t,
  onSelect,
  onRemove,
  onClear,
}: PageSearchHistoryPanelProps) {
  return (
    <div className="search-history-panel page-search-history-panel">
      <div className="search-history-header">
        <span>{t('sidebar.recentSearches')}</span>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={onClear}
        >
          {t('common.clear')}
        </button>
      </div>
      <div className="search-history-list">
        {entries.map((entry) => (
          <div className="search-history-item" key={entry.id}>
            <button
              type="button"
              className="search-history-select"
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                onSelect(entry.query)
              }}
            >
              <span>{entry.query}</span>
            </button>
            <button
              type="button"
              className="search-history-remove"
              aria-label={t('sidebar.removeRecentSearch', { query: entry.query })}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                onRemove(entry.id)
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
