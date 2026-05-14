import { Icon } from './icons'

export interface SearchHistoryPanelItem<TValue> {
  key: string
  label: string
  value: TValue
}

interface SearchHistoryPanelProps<TValue> {
  items: SearchHistoryPanelItem<TValue>[]
  title: string
  onSelect: (item: SearchHistoryPanelItem<TValue>) => void
  className?: string
  clearLabel?: string
  onClear?: () => void
  onRemove?: (item: SearchHistoryPanelItem<TValue>) => void
  getRemoveLabel?: (item: SearchHistoryPanelItem<TValue>) => string
}

export function SearchHistoryPanel<TValue>({
  items,
  title,
  onSelect,
  className = '',
  clearLabel,
  onClear,
  onRemove,
  getRemoveLabel,
}: SearchHistoryPanelProps<TValue>) {
  return (
    <div className={`search-history-panel${className ? ` ${className}` : ''}`}>
      <div className="search-history-header">
        <span>{title}</span>
        {onClear && clearLabel ? (
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={onClear}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      <div className="search-history-list">
        {items.map((item) => (
          <div className={`search-history-item${onRemove ? ' has-remove' : ''}`} key={item.key}>
            <button
              type="button"
              className="search-history-select"
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                onSelect(item)
              }}
            >
              <span>{item.label}</span>
            </button>
            {onRemove && getRemoveLabel ? (
              <button
                type="button"
                className="search-history-remove"
                aria-label={getRemoveLabel(item)}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  onRemove(item)
                }}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
