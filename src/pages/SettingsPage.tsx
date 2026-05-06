import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from '../components/icons'
import type {
  AppSettingsUpdate,
  LibrarySnapshot,
  LyricsRequestMode,
  NotificationDisplayMode,
  NotificationSendMode,
  PreferredLanguage,
} from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { PreferenceSettingsPage } from './PreferenceSettingsPage'

interface SettingsPageProps {
  t: Translator
  snapshot: LibrarySnapshot
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onUpdateSettings: (update: AppSettingsUpdate) => Promise<void> | void
}

interface ToggleSettingRowProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

interface SelectSettingRowProps<T extends string> {
  label: string
  value: T
  options: Array<{
    value: T
    label: string
  }>
  onChange: (value: T) => void
}

function ToggleSettingRow({ label, hint, checked, onChange }: ToggleSettingRowProps) {
  return (
    <label className="settings-row">
      <input
        className="settings-switch"
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked)
        }}
      />
      <span className="settings-row-copy">
        <strong>
          {label}
          {hint ? (
            <span className="settings-hint-icon" title={hint} aria-label={hint}>
              <Icon name="info" />
            </span>
          ) : null}
        </strong>
      </span>
    </label>
  )
}

function SelectSettingRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectSettingRowProps<T>) {
  return (
    <label className="settings-row settings-row-with-control">
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <select
        className="settings-select"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value as T)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <header className="settings-card-header">
        <h3>{title}</h3>
      </header>
      <div className="settings-card-body">{children}</div>
    </section>
  )
}

function SettingsActionButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      className="settings-link-button"
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function SettingsPage({
  t,
  snapshot,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onScanLibrary,
  onUpdateSettings,
}: SettingsPageProps) {
  const notificationSendOptions: Array<{
    value: NotificationSendMode
    label: string
  }> = [
    { value: 'music-changed', label: t('settings.notificationSendMusicChanged') },
    { value: 'never', label: t('settings.notificationSendNever') },
  ]
  const notificationDisplayOptions: Array<{
    value: NotificationDisplayMode
    label: string
  }> = [
    { value: 'reminder', label: t('settings.notificationModeReminder') },
    { value: 'normal', label: t('settings.notificationModeNormal') },
    { value: 'quick', label: t('settings.notificationModeQuick') },
  ]
  const notificationLyricsSourceOptions: Array<{
    value: LyricsRequestMode
    label: string
  }> = [
    { value: 'internet', label: t('settings.sourceInternet') },
    { value: 'local', label: t('settings.sourceLocal') },
    { value: 'embedded', label: t('settings.sourceEmbedded') },
  ]
  const preferredLanguageOptions: Array<{
    value: PreferredLanguage
    label: string
  }> = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en-US', label: t('settings.languageEnglish') },
    { value: 'zh-CN', label: t('settings.languageChinese') },
  ]
  const showSystemLog = () => {
    void window.smplayer?.revealSystemLogs()
  }
  const [actionMessage, setActionMessage] = useState('')
  const [dataTransferState, setDataTransferState] = useState<'idle' | 'importing' | 'exporting' | 'reloading'>('idle')
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showPreferenceSettings, setShowPreferenceSettings] = useState(false)
  const [showFeedbackOptions, setShowFeedbackOptions] = useState(false)
  const feedbackMenuRef = useRef<HTMLDivElement | null>(null)
  const [lyricsJob, setLyricsJob] = useState({
    status: 'idle' as 'idle' | 'running' | 'stopping' | 'done',
    currentIndex: 0,
    total: snapshot.songs.length,
    currentSong: '',
    saved: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
    message: '',
  })
  const stopLyricsJobRef = useRef(false)
  const lyricsJobRunIdRef = useRef(0)
  const mountedRef = useRef(true)
  const lyricsJobActive = lyricsJob.status === 'running' || lyricsJob.status === 'stopping'
  const lyricsProgressRatio = lyricsJob.total > 0 ? lyricsJob.currentIndex / lyricsJob.total : 0

  useEffect(() => {
    return () => {
      mountedRef.current = false
      stopLyricsJobRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!showFeedbackOptions) {
      return
    }

    const closeFeedbackOptions = (event: MouseEvent) => {
      if (feedbackMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setShowFeedbackOptions(false)
    }

    document.addEventListener('mousedown', closeFeedbackOptions)

    return () => {
      document.removeEventListener('mousedown', closeFeedbackOptions)
    }
  }, [showFeedbackOptions])

  const updateLyricsJob = (update: Partial<typeof lyricsJob>) => {
    if (mountedRef.current) {
      setLyricsJob((current) => ({ ...current, ...update }))
    }
  }

  const waitForLyricsThrottle = (durationMs: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, durationMs)
    })

  const stopLyricsJob = () => {
    stopLyricsJobRef.current = true
    lyricsJobRunIdRef.current += 1
    updateLyricsJob({
      status: 'done',
      currentSong: '',
      message: t('settings.lyricsBatchStopped'),
    })
  }

  const startLyricsJob = async () => {
    const songs = snapshot.songs
    const runId = lyricsJobRunIdRef.current + 1
    lyricsJobRunIdRef.current = runId
    stopLyricsJobRef.current = false
    setLyricsJob({
      status: 'running',
      currentIndex: 0,
      total: songs.length,
      currentSong: '',
      saved: 0,
      skipped: 0,
      missing: 0,
      failed: 0,
      message: t('settings.lyricsBatchStarting'),
    })
    await waitForLyricsThrottle(0)

    let saved = 0
    let skipped = 0
    let missing = 0
    let failed = 0
    let lastRequestStartedAt = 0

    for (const [index, song] of songs.entries()) {
      if (lyricsJobRunIdRef.current !== runId) {
        return
      }

      if (stopLyricsJobRef.current) {
        updateLyricsJob({
          status: 'done',
          message: t('settings.lyricsBatchStopped'),
        })
        return
      }

      const elapsedSinceLastRequest = Date.now() - lastRequestStartedAt
      if (lastRequestStartedAt > 0 && elapsedSinceLastRequest < 1000) {
        await waitForLyricsThrottle(1000 - elapsedSinceLastRequest)
      }

      if (lyricsJobRunIdRef.current !== runId) {
        return
      }

      if (stopLyricsJobRef.current) {
        updateLyricsJob({
          status: 'done',
          message: t('settings.lyricsBatchStopped'),
        })
        return
      }

      updateLyricsJob({
        currentIndex: index + 1,
        currentSong: [song.title, song.artist].filter(Boolean).join(' - '),
        message: t('settings.lyricsBatchRequesting'),
      })
      await waitForLyricsThrottle(0)

      if (lyricsJobRunIdRef.current !== runId || stopLyricsJobRef.current) {
        return
      }

      try {
        lastRequestStartedAt = Date.now()
        const result = await window.smplayer!.saveInternetLyricsToFile(song.id)
        if (stopLyricsJobRef.current || lyricsJobRunIdRef.current !== runId) {
          return
        }
        if (result.status === 'saved') {
          saved += 1
        } else if (result.status === 'skipped') {
          skipped += 1
        } else if (result.status === 'missing') {
          missing += 1
        } else {
          failed += 1
        }
      } catch {
        if (stopLyricsJobRef.current || lyricsJobRunIdRef.current !== runId) {
          return
        }
        failed += 1
      }

      updateLyricsJob({
        saved,
        skipped,
        missing,
        failed,
      })
    }

    updateLyricsJob({
      status: 'done',
      currentSong: '',
      message: t('settings.lyricsBatchDone'),
    })
  }

  const exportData = async () => {
    setDataTransferState('exporting')
    setActionMessage(t('settings.exportingData'))

    try {
      const result = await window.smplayer?.exportData()
      if (!result || result.canceled) {
        setActionMessage('')
        return
      }
      setActionMessage(t('settings.dataExported'))
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('settings.dataExportFailed'))
    } finally {
      setDataTransferState('idle')
    }
  }

  const importData = async () => {
    const confirmed = window.confirm(
      t('settings.importDataConfirm'),
    )
    if (!confirmed) {
      return
    }

    setDataTransferState('importing')
    setActionMessage(t('settings.importingData'))

    try {
      const result = await window.smplayer?.importData()
      if (!result || result.canceled) {
        setActionMessage('')
        setDataTransferState('idle')
        return
      }
      setDataTransferState('reloading')
      setActionMessage(t('settings.dataImported'))
      window.setTimeout(() => {
        window.location.reload()
      }, 300)
    } catch (error) {
      setDataTransferState('idle')
      setActionMessage(error instanceof Error ? error.message : t('settings.dataImportFailed'))
    }
  }

  return (
    <section className="page-panel settings-page">
      {error ? <div className="error-banner">{error}</div> : null}
      {actionMessage ? <div className="settings-action-message">{actionMessage}</div> : null}
      {dataTransferState !== 'idle' ? (
        <div className="settings-progress-overlay" role="status" aria-live="polite">
          <div className="settings-progress-dialog">
            <span className="settings-progress-ring" aria-hidden="true" />
            <strong>
              {dataTransferState === 'importing'
                ? t('settings.importingData')
                : dataTransferState === 'exporting'
                  ? t('settings.exportingData')
                  : t('settings.dataImported')}
            </strong>
          </div>
        </div>
      ) : null}

      <div className="settings-board">
        <div className="settings-column">
          <SettingsCard title={t('library.root')}>
            <div className="settings-folder-row">
              <input
                className="settings-path-input"
                readOnly
                placeholder={t('settings.musicFolderPlaceholder')}
                value={snapshot.settings.rootPath}
              />
              <button className="settings-icon-button" type="button" onClick={onPickLibraryRoot}>
                <Icon name="folder" />
              </button>
            </div>
            {loading ? <p className="settings-inline-hint">{t('library.refreshing')}</p> : null}
            <div className="settings-button-row">
              <SettingsActionButton onClick={onPickLibraryRoot}>
                {t('settings.reauthorize')}
              </SettingsActionButton>
              <SettingsActionButton onClick={onPickLibraryRoot}>
                {t('settings.authorizeOtherFolder')}
              </SettingsActionButton>
              <SettingsActionButton
                disabled={scanning || !snapshot.settings.rootPath}
                onClick={onScanLibrary}
              >
                {scanning ? t('library.scanning') : t('settings.rescan')}
              </SettingsActionButton>
            </div>
          </SettingsCard>

          <SettingsCard title={t('library.title')}>
            <div className="lyrics-action-row">
              <SettingsActionButton
                disabled={lyricsJobActive || snapshot.songs.length === 0}
                onClick={() => {
                  void startLyricsJob()
                }}
              >
                {lyricsJobActive ? t('settings.lyricsBatchRunning') : t('settings.addLyrics')}
              </SettingsActionButton>
              <span
                className="settings-hint-icon"
                title={t('settings.batchAddLyricsCopy')}
                aria-label={t('settings.batchAddLyricsCopy')}
              >
                <Icon name="info" />
              </span>
              {lyricsJobActive ? (
                <SettingsActionButton onClick={stopLyricsJob}>
                  {t('settings.stopLyricsBatch')}
                </SettingsActionButton>
              ) : null}
            </div>

            {lyricsJob.status !== 'idle' ? (
              <div className="lyrics-progress-panel">
                <div className="lyrics-progress-header">
                  <strong>{lyricsJob.message}</strong>
                  <span>
                    {lyricsJob.currentIndex}/{lyricsJob.total}
                  </span>
                </div>
                <div className="lyrics-progress-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(lyricsProgressRatio * 100)}%` }} />
                </div>
                <div className="lyrics-progress-current">
                  {lyricsJob.currentSong || t('settings.lyricsBatchNoCurrent')}
                </div>
                <div className="lyrics-progress-stats">
                  <span>{t('settings.lyricsBatchSaved')} {lyricsJob.saved}</span>
                  <span>{t('settings.lyricsBatchSkipped')} {lyricsJob.skipped}</span>
                  <span>{t('settings.lyricsBatchMissing')} {lyricsJob.missing}</span>
                  <span>{t('settings.lyricsBatchFailed')} {lyricsJob.failed}</span>
                </div>
              </div>
            ) : null}
            <ToggleSettingRow
              label={
                snapshot.settings.useFilenameNotMusicName
                  ? t('settings.loadUsingFilename')
                  : t('settings.loadUsingMusicName')
              }
              checked={snapshot.settings.useFilenameNotMusicName}
              onChange={(checked) => {
                onUpdateSettings({ useFilenameNotMusicName: checked })
              }}
            />
          </SettingsCard>

          <SettingsCard title={t('settings.notification')}>
            <SelectSettingRow
              label={t('settings.notificationSend')}
              value={snapshot.settings.notificationSend}
              options={notificationSendOptions}
              onChange={(value) => {
                onUpdateSettings({ notificationSend: value, showNotifications: value !== 'never' })
              }}
            />
            <SelectSettingRow
              label={t('settings.notificationMode')}
              value={snapshot.settings.notificationDisplay}
              options={notificationDisplayOptions}
              onChange={(value) => {
                onUpdateSettings({ notificationDisplay: value })
              }}
            />
            <ToggleSettingRow
              label={t('settings.lyricsInNotifications')}
              hint={t('settings.lyricsInNotificationsHint')}
              checked={snapshot.settings.showLyricsInNotification}
              onChange={(checked) => {
                onUpdateSettings({ showLyricsInNotification: checked })
              }}
            />
            <SelectSettingRow
              label={t('settings.notificationLyricsSource')}
              value={snapshot.settings.notificationLyricsSource}
              options={notificationLyricsSourceOptions}
              onChange={(value) => {
                onUpdateSettings({ notificationLyricsSource: value })
              }}
            />
          </SettingsCard>

          <SettingsCard title={t('settings.display')}>
            <ToggleSettingRow
              label={t('settings.showCounts')}
              checked={snapshot.settings.showCount}
              onChange={(checked) => {
                onUpdateSettings({ showCount: checked })
              }}
            />
            <ToggleSettingRow
              label={t('settings.hideMultiSelectCommandBar')}
              checked={snapshot.settings.hideMultiSelectCommandBarAfterOperation}
              onChange={(checked) => {
                onUpdateSettings({ hideMultiSelectCommandBarAfterOperation: checked })
              }}
            />
          </SettingsCard>
        </div>

        <div className="settings-column">
          <SettingsCard title={t('common.recent')}>
            <ToggleSettingRow
              label={t('settings.autoLyrics')}
              checked={snapshot.settings.autoLyrics}
              onChange={(checked) => {
                onUpdateSettings({ autoLyrics: checked })
              }}
            />
          </SettingsCard>

          <SettingsCard title={t('settings.play')}>
            <ToggleSettingRow
              label={t('settings.autoPlay')}
              checked={snapshot.settings.autoPlay}
              onChange={(checked) => {
                onUpdateSettings({ autoPlay: checked })
              }}
            />
            <div className="settings-button-row">
              <SettingsActionButton
                onClick={() => {
                  setShowPreferenceSettings(true)
                }}
              >
                {t('settings.preferenceSettings')}
              </SettingsActionButton>
            </div>
          </SettingsCard>

          <SettingsCard title={t('settings.save')}>
            <ToggleSettingRow
              label={t('settings.saveProgress')}
              checked={snapshot.settings.saveMusicProgress}
              onChange={(checked) => {
                onUpdateSettings({ saveMusicProgress: checked })
              }}
            />
            <ToggleSettingRow
              label={t('settings.saveFetchedLyrics')}
              hint={t(
                'settings.saveLyricsImmediatelyHint',
              )}
              checked={snapshot.settings.saveLyricsImmediately}
              onChange={(checked) => {
                onUpdateSettings({ saveLyricsImmediately: checked })
              }}
            />
            <div className="settings-button-row">
              <SettingsActionButton
                onClick={() => {
                  onUpdateSettings({})
                }}
              >
                {t('settings.saveChanges')}
              </SettingsActionButton>
            </div>
          </SettingsCard>

          <SettingsCard title={t('settings.language')}>
            <SelectSettingRow
              label={t('settings.interfaceLanguage')}
              value={snapshot.settings.preferredLanguage}
              options={preferredLanguageOptions}
              onChange={(value) => {
                onUpdateSettings({ preferredLanguage: value })
              }}
            />
          </SettingsCard>

          <SettingsCard title={t('settings.others')}>
            <div className="settings-action-list">
              <SettingsActionButton
                onClick={() => {
                  setShowReleaseNotes(true)
                }}
              >
                {t('settings.releaseNotes')}
              </SettingsActionButton>
              <SettingsActionButton
                disabled={dataTransferState !== 'idle'}
                title={t('settings.importDataHint')}
                onClick={() => {
                  void importData()
                }}
              >
                {t('settings.importData')}
              </SettingsActionButton>
              <SettingsActionButton
                disabled={dataTransferState !== 'idle'}
                title={t('settings.exportDataHint')}
                onClick={() => {
                  void exportData()
                }}
              >
                {t('settings.exportData')}
              </SettingsActionButton>
              <div className="settings-feedback-menu" ref={feedbackMenuRef}>
                <SettingsActionButton
                  onClick={() => {
                    setShowFeedbackOptions((current) => !current)
                  }}
                >
                  {t('settings.feedback')}
                </SettingsActionButton>
                {showFeedbackOptions ? (
                  <div className="settings-feedback-options">
                    <button
                      type="button"
                      onClick={() => {
                        void window.smplayer?.sendFeedbackEmail()
                        setShowFeedbackOptions(false)
                      }}
                    >
                      {t('settings.viaEmail')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void window.smplayer?.openFeedbackInBrowser()
                        setShowFeedbackOptions(false)
                      }}
                    >
                      {t('settings.viaWebBrowser')}
                    </button>
                  </div>
                ) : null}
              </div>
              <SettingsActionButton onClick={showSystemLog}>{t('settings.systemLog')}</SettingsActionButton>
            </div>
          </SettingsCard>
        </div>
      </div>

      {showReleaseNotes ? (
        <div className="settings-modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
            <header>
              <h2 id="release-notes-title">{t('settings.releaseNotes')}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowReleaseNotes(false)
                }}
                aria-label={t('common.close')}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="release-notes-list">
              <p>{t('settings.releaseNotesIntro')}</p>
              <ul>
                <li>{t('settings.releaseNotesLibrary')}</li>
                <li>{t('settings.releaseNotesArtists')}</li>
                <li>{t('settings.releaseNotesUi')}</li>
              </ul>
            </div>
          </section>
        </div>
      ) : null}

      {showPreferenceSettings ? (
        <PreferenceSettingsPage
          t={t}
          onClose={() => {
            setShowPreferenceSettings(false)
          }}
        />
      ) : null}
    </section>
  )
}
