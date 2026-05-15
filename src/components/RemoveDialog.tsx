import type { Translator } from '../shared/i18n'

export function RemoveDialog({
  t,
  title,
  message,
  confirmText = t('common.confirm'),
  pendingText,
  destructive = true,
  submitting = false,
  onCancel,
  onConfirm,
}: {
  t: Translator
  title: string
  message: string
  confirmText?: string
  pendingText?: string
  destructive?: boolean
  submitting?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="input-dialog-overlay" role="presentation">
      <div className="app-window-drag-strip" aria-hidden="true" />
      <section className="input-dialog remove-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-dialog-title">
        <h3 id="remove-dialog-title">{title}</h3>
        <p className="remove-dialog-message">{message}</p>
        <div className="input-dialog-actions">
          <button
            type="button"
            className={`input-dialog-primary${destructive ? ' remove-dialog-primary' : ''}`}
            disabled={submitting}
            aria-busy={submitting || undefined}
            onClick={onConfirm}
          >
            {submitting ? <span className="input-dialog-button-spinner" aria-hidden="true" /> : null}
            {submitting ? pendingText ?? confirmText : confirmText}
          </button>
          <button type="button" disabled={submitting} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
