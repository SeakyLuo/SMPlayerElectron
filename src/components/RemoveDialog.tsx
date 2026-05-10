import type { Translator } from '../shared/i18n'

export function RemoveDialog({
  t,
  title,
  message,
  confirmText = t('common.confirm'),
  onCancel,
  onConfirm,
}: {
  t: Translator
  title: string
  message: string
  confirmText?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="input-dialog-overlay" role="presentation">
      <section className="input-dialog remove-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-dialog-title">
        <h3 id="remove-dialog-title">{title}</h3>
        <p className="remove-dialog-message">{message}</p>
        <div className="input-dialog-actions">
          <button type="button" className="input-dialog-primary remove-dialog-primary" onClick={onConfirm}>
            {confirmText}
          </button>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
