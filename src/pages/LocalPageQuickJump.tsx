import { Icon } from '../components/icons'
import type { Translator } from '../shared/i18n'
import { getQuickJumpTooltip } from '../shared/quickJumpTooltip'
import { LOCAL_TEXT_QUICK_JUMP_KEYS } from '../shared/textCompare'

export function LocalContentSection({
  title,
  count,
  expanded,
  children,
  onToggle,
}: {
  title: string
  count: number
  expanded: boolean
  children: React.ReactNode
  onToggle: () => void
}) {
  return (
    <section className={expanded ? 'local-content-section is-expanded' : 'local-content-section'}>
      <button className={expanded ? 'local-content-section-header is-expanded' : 'local-content-section-header'} type="button" onClick={onToggle}>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
        <span>{title}</span>
        <span className="local-content-section-count">{count}</span>
      </button>
      {expanded ? children : null}
    </section>
  )
}

export function LocalTableSectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <tr className="local-table-section-row">
      <td colSpan={3}>
        <button className={expanded ? 'local-content-section-header is-expanded' : 'local-content-section-header'} type="button" onClick={onToggle}>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
          <span>{title}</span>
          <span className="local-content-section-count">{count}</span>
        </button>
      </td>
    </tr>
  )
}

export function LocalSongQuickJump({
  basisName,
  enabledKeys,
  t,
  visible,
  onJump,
}: {
  basisName: string
  enabledKeys: Map<string, number>
  t: Translator
  visible: boolean
  onJump: (key: string) => void
}) {
  if (!visible) {
    return null
  }

  return (
    <nav className="local-song-quick-jump" aria-label={t('common.search')}>
      {LOCAL_TEXT_QUICK_JUMP_KEYS.map((key) => {
        const enabled = enabledKeys.has(key)

        return (
          <button
            disabled={!enabled}
            key={key}
            title={getQuickJumpTooltip(key, enabled, t('common.songs'), basisName, t)}
            type="button"
            onClick={() => {
              onJump(key)
            }}
          >
            {key}
          </button>
        )
      })}
    </nav>
  )
}
