import { Icon } from '../components/icons'
import type { Translator } from '../shared/i18n'

export type RecentTab = 'added' | 'played' | 'searches'
export type RecentPlayedFilter = 'songs' | 'artists' | 'albums' | 'playlists'

export function RecentTabButton({
  active,
  count,
  label,
  showCount,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  showCount: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
      <span>{label}</span>
      {showCount ? <strong>{count}</strong> : null}
    </button>
  )
}

export function RecentPlayedFilterBar({
  activeFilter,
  t,
  onChange,
}: {
  activeFilter: RecentPlayedFilter
  t: Translator
  onChange: (filter: RecentPlayedFilter) => void
}) {
  const filters: Array<{ key: RecentPlayedFilter; label: string; icon?: 'songs' | 'users' | 'albums' | 'playlists' }> = [
    { key: 'songs', label: t('common.songs'), icon: 'songs' },
    { key: 'artists', label: t('common.artists'), icon: 'users' },
    { key: 'albums', label: t('common.albums'), icon: 'albums' },
    { key: 'playlists', label: t('common.playlists'), icon: 'playlists' },
  ]

  return (
    <div className="recent-played-filters" role="tablist" aria-label={t('recent.played')}>
      {filters.map((filter) => (
        <button
          type="button"
          className={filter.key === activeFilter ? 'is-active' : ''}
          key={filter.key}
          onClick={() => onChange(filter.key)}
        >
          {filter.icon ? <Icon name={filter.icon} /> : null}
          <span>{filter.label}</span>
        </button>
      ))}
    </div>
  )
}
