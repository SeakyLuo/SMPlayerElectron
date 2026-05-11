import { Icon } from './icons'
import { getReleaseNotes } from '../shared/releaseNotes'
import type { PreferredLanguage } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

export function ReleaseNotesDialog({
  t,
  preferredLanguage,
  onClose,
}: {
  t: Translator
  preferredLanguage: PreferredLanguage
  onClose: () => void
}) {
  const releaseNoteLanguage =
    preferredLanguage === 'zh-CN' ||
    (preferredLanguage === 'system' && navigator.language.toLowerCase().startsWith('zh'))
      ? 'zh'
      : 'en'
  const releaseNotes = getReleaseNotes(releaseNoteLanguage)

  return (
    <div className="settings-modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
        <header>
          <h2 id="release-notes-title">{t('settings.releaseNotes')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="arrowLeft" className="dialog-back-icon" />
            <Icon name="close" className="dialog-close-icon" />
          </button>
          <span className="dialog-titlebar-title">{t('app.shell')}</span>
        </header>
        <div className="release-notes-list">
          {releaseNotes.map((entry) => (
            <section className="release-note-version" key={entry.version}>
              <h3>
                {entry.version === 'History Updates'
                  ? t('settings.releaseNotesIntro')
                  : `${t('settings.releaseNotesVersion')} ${entry.version}`}
              </h3>
              <ol>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
