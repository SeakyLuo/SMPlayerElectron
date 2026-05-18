import { PopupDialog } from './PopupDialog'
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
    preferredLanguage === 'zh-Hant' ||
    (preferredLanguage === 'system' && navigator.language.toLowerCase().startsWith('zh'))
      ? 'zh'
      : 'en'
  const releaseNotes = getReleaseNotes(releaseNoteLanguage, t)

  return (
    <PopupDialog
      t={t}
      overlayClassName="music-dialog-overlay ReleaseNotesDialogOverlay"
      className="release-notes-dialog ContentDialog ReleaseNotesDialog"
      navClassName="music-dialog-pivot ReleaseNotesDialogPivot"
      navLabel={t('settings.releaseNotes')}
      ariaLabelledBy="release-notes-title"
      onClose={onClose}
      navChildren={(
        <>
          <h2 id="release-notes-title" className="popup-dialog-title">{t('settings.releaseNotes')}</h2>
        </>
      )}
    >
      <div className="song-dialog-body release-notes-list">
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
    </PopupDialog>
  )
}
