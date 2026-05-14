import type { SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { SearchHistoryPanel } from './SearchHistoryPanel'

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
    <SearchHistoryPanel
      className="page-search-history-panel"
      title={t('sidebar.recentSearches')}
      clearLabel={t('common.clear')}
      items={entries.map((entry) => ({
        key: String(entry.id),
        label: entry.query,
        value: entry,
      }))}
      onClear={onClear}
      onSelect={(item) => {
        onSelect(item.value.query)
      }}
      onRemove={(item) => {
        onRemove(item.value.id)
      }}
      getRemoveLabel={(item) => t('sidebar.removeRecentSearch', { query: item.value.query })}
    />
  )
}
