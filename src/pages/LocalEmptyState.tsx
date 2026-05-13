import { Link } from 'react-router-dom'

import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import type { Translator } from '../shared/i18n'

export function LocalNoRootState({
  loading,
  t,
  onPickLibraryRoot,
}: {
  loading: boolean
  t: Translator
  onPickLibraryRoot: () => void
}) {
  return (
    <section className="page-panel local-page">
      {loading ? (
        <LoadingState t={t} />
      ) : (
        <div className="empty-state">
          <h3>{t('local.noRoot')}</h3>
          <p>{t('local.noRootCopy')}</p>
          <button className="local-command" type="button" onClick={onPickLibraryRoot}>
            <Icon name="folder" />
            {t('library.chooseFolder')}
          </button>
        </div>
      )}
    </section>
  )
}

export function LocalFolderNotFoundState({
  loading,
  t,
}: {
  loading: boolean
  t: Translator
}) {
  return (
    <section className="page-panel local-page">
      {loading ? (
        <LoadingState t={t} />
      ) : (
        <div className="empty-state">
          <h3>{t('local.folderNotFound')}</h3>
          <p>{t('local.folderNotFoundDescription')}</p>
          <Link className="local-command" to="/local">
            <Icon name="arrowLeft" />
            {t('local.backToRoot')}
          </Link>
        </div>
      )}
    </section>
  )
}
