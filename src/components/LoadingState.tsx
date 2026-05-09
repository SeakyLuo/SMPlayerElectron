import type { Translator } from '../shared/i18n'

interface LoadingStateProps {
  t: Translator
  compact?: boolean
}

export function LoadingState({ t, compact = false }: LoadingStateProps) {
  return (
    <div className={`empty-state loading-state${compact ? ' compact' : ''}`} role="status" aria-live="polite">
      <span className="loading-state-spinner" aria-hidden="true" />
      <h3>{t('nowPlaying.loading')}</h3>
    </div>
  )
}
