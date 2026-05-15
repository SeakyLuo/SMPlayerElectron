import { useState, type CSSProperties } from 'react'

import type { ScanLibraryProgress, ScanLibraryProgressStage } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { Icon } from './icons'
import { RemoveDialog } from './RemoveDialog'

export function ScanProgressOverlay({
  progress,
  t,
  onCancel,
}: {
  progress: ScanLibraryProgress
  t: Translator
  onCancel: () => void
}) {
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const progressRatio = Math.min(1, progress.progress / progress.max)
  const progressPercent = Math.round(progressRatio * 100)
  const currentFolderName = progress.folderName ?? t('local.updateFolderProgressPreparing')
  const progressAction = getProgressAction(progress.stage, t)
  const progressDescription = getProgressDescription(progress, currentFolderName, t)

  return (
    <div className="local-refresh-overlay" role="status" aria-live="polite">
      <div className="app-window-drag-strip" aria-hidden="true" />
      <section className="local-refresh-dialog">
        <header className="local-refresh-header">
          <span className="local-refresh-header-icon" aria-hidden="true">
            <Icon name="refresh" />
          </span>
          <h3>{t('local.updateFolderProgressTitle')}</h3>
        </header>
        <div className="local-refresh-progress-card">
          <div className="local-refresh-progress-summary">
            <strong style={{ '--local-refresh-progress-ratio': progressRatio } as CSSProperties}>
              {progressPercent}%
            </strong>
            <div>
              <b>{progressAction}</b>
              <span>{progressDescription}</span>
            </div>
          </div>
          <div className="local-refresh-stats">
            <span className="is-added">
              <small>{t('local.updateFolderProgressAdded')}</small>
              <strong>{progress.addedCount}</strong>
              <em>{t('local.updateFolderProgressSongUnit')}</em>
            </span>
            <span className="is-updated">
              <small>{t('local.updateFolderProgressUpdated')}</small>
              <strong>{progress.updatedCount}</strong>
              <em>{t('local.updateFolderProgressSongUnit')}</em>
            </span>
            <span className="is-missing">
              <small>{t('local.updateFolderProgressMissing')}</small>
              <strong>{progress.missingCount}</strong>
              <em>{t('local.updateFolderProgressSongUnit')}</em>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="local-refresh-stop-button"
          disabled={!progress.canCancel}
          onClick={() => {
            setStopConfirmOpen(true)
          }}
        >
          {t('local.updateFolderProgressStop')}
        </button>
        {stopConfirmOpen && progress.canCancel ? (
          <RemoveDialog
            t={t}
            title={t('local.updateFolderProgressStopConfirmTitle')}
            message={t('local.updateFolderProgressStopConfirmMessage')}
            confirmText={t('local.updateFolderProgressStopConfirm')}
            onCancel={() => {
              setStopConfirmOpen(false)
            }}
            onConfirm={() => {
              setStopConfirmOpen(false)
              onCancel()
            }}
          />
        ) : null}
      </section>
    </div>
  )
}

function getProgressAction(stage: ScanLibraryProgressStage, t: Translator) {
  if (stage === 'reading') {
    return t('local.updateFolderProgressActionReading')
  }

  if (stage === 'updating') {
    return t('local.updateFolderProgressActionUpdating')
  }

  return t('local.updateFolderProgressActionChecking')
}

function getProgressDescription(progress: ScanLibraryProgress, currentFolderName: string, t: Translator) {
  if (progress.stage === 'checking') {
    return [
      t('local.updateFolderProgressCurrentFolder', { name: currentFolderName }),
      t('local.updateFolderProgressChecked', {
        count: progress.checkedFolderCount,
        total: progress.folderCount,
      }),
    ].join(' · ')
  }

  if (progress.stage === 'updating') {
    return t('local.updateFolderProgressProcessedItems', {
      count: progress.progress,
      total: progress.max,
    })
  }

  return t('local.updateFolderProgressProcessedSongs', {
    count: progress.processedSongCount,
    total: progress.songCount,
  })
}
