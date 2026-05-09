import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from '../components/icons'
import { getReleaseNotes } from '../shared/releaseNotes'
import type {
  AppSettingsUpdate,
  LibrarySnapshot,
  LyricsRequestMode,
  NightMode,
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

interface TimeSettingRowProps {
  label: string
  startLabel: string
  endLabel: string
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
}

const TIME_HOURS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, '0'))
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, '0'))

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

function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLSpanElement | null>(null)
  const selectedHourRef = useRef<HTMLButtonElement | null>(null)
  const selectedMinuteRef = useRef<HTMLButtonElement | null>(null)
  const [selectedHour, selectedMinute] = value.split(':')

  useEffect(() => {
    if (!open) {
      return
    }

    const closePicker = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && pickerRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    document.addEventListener('pointerdown', closePicker, true)
    return () => {
      document.removeEventListener('pointerdown', closePicker, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    window.requestAnimationFrame(() => {
      selectedHourRef.current?.scrollIntoView({ block: 'center' })
      selectedMinuteRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [open, selectedHour, selectedMinute])

  return (
    <span className={`settings-time-picker${open ? ' is-open' : ''}`} ref={pickerRef}>
      <button
        type="button"
        className="settings-time-trigger"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <span>{value}</span>
        <Icon name="recent" />
      </button>
      {open ? (
        <>
          <span className="dropdown-dismiss-layer" onPointerDown={() => setOpen(false)} />
          <span className="settings-time-panel">
            <span className="settings-time-column" role="listbox" aria-label="Hour">
              {TIME_HOURS.map((hour) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={hour === selectedHour}
                  className={hour === selectedHour ? 'is-selected' : ''}
                  key={hour}
                  ref={hour === selectedHour ? selectedHourRef : null}
                  onClick={() => {
                    onChange(`${hour}:${selectedMinute}`)
                  }}
                >
                  {hour}
                </button>
              ))}
            </span>
            <span className="settings-time-column" role="listbox" aria-label="Minute">
              {TIME_MINUTES.map((minute) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={minute === selectedMinute}
                  className={minute === selectedMinute ? 'is-selected' : ''}
                  key={minute}
                  ref={minute === selectedMinute ? selectedMinuteRef : null}
                  onClick={() => {
                    onChange(`${selectedHour}:${minute}`)
                    setOpen(false)
                  }}
                >
                  {minute}
                </button>
              ))}
            </span>
          </span>
        </>
      ) : null}
    </span>
  )
}

function TimeSettingRow({
  label,
  startLabel,
  endLabel,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: TimeSettingRowProps) {
  return (
    <div className="settings-row settings-row-with-control">
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <span className="settings-time-range">
        <label>
          <span>{startLabel}</span>
          <TimePicker value={startValue} onChange={onStartChange} />
        </label>
        <label>
          <span>{endLabel}</span>
          <TimePicker value={endValue} onChange={onEndChange} />
        </label>
      </span>
    </div>
  )
}

function SelectSettingRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectSettingRowProps<T>) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) {
      return
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    document.addEventListener('pointerdown', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true)
    }
  }, [open])

  return (
    <div className="settings-row settings-row-with-control" ref={menuRef}>
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <span className="settings-select-menu">
        <button
          type="button"
          className={open ? 'settings-select-trigger is-open' : 'settings-select-trigger'}
          onClick={() => {
            setOpen((current) => !current)
          }}
        >
          <span>{selectedOption?.label}</span>
          <Icon name="chevronDown" />
        </button>
        {open ? (
          <>
            <span className="dropdown-dismiss-layer" onPointerDown={() => setOpen(false)} />
            <span className="settings-select-options">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === value ? 'is-selected' : ''}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Icon name={option.value === value ? 'check' : 'blank'} />
                  <span>{option.label}</span>
                </button>
              ))}
            </span>
          </>
        ) : null}
      </span>
    </div>
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
  error,
  onPickLibraryRoot,
  onUpdateSettings,
}: SettingsPageProps) {
  const showNotificationSettings = false
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
  const preferredLanguageOptions: Array<{
    value: PreferredLanguage
    label: string
  }> = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en-US', label: t('settings.languageEnglish') },
    { value: 'zh-CN', label: t('settings.languageChinese') },
  ]
  const nightModeOptions: Array<{
    value: NightMode
    label: string
  }> = [
    { value: 'auto', label: t('settings.nightModeAuto') },
    { value: 'on', label: t('settings.nightModeOn') },
    { value: 'never', label: t('settings.nightModeNever') },
  ]
  const lyricsSourceOptions: Array<{
    value: LyricsRequestMode
    label: string
  }> = [
    { value: 'auto', label: t('song.lyrics.auto') },
    { value: 'internet', label: t('settings.sourceInternet') },
    { value: 'local', label: t('settings.sourceLocal') },
    { value: 'embedded', label: t('settings.sourceEmbedded') },
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
  const releaseNoteLanguage =
    snapshot.settings.preferredLanguage === 'zh-CN' ||
    (snapshot.settings.preferredLanguage === 'system' && navigator.language.toLowerCase().startsWith('zh'))
      ? 'zh'
      : 'en'
  const releaseNotes = getReleaseNotes(releaseNoteLanguage)

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

    const closeFeedbackOptions = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && feedbackMenuRef.current?.contains(target)) {
        return
      }

      setShowFeedbackOptions(false)
    }

    document.addEventListener('pointerdown', closeFeedbackOptions, true)

    return () => {
      document.removeEventListener('pointerdown', closeFeedbackOptions, true)
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
                disabled
                placeholder={t('settings.musicFolderPlaceholder')}
                value={snapshot.settings.rootPath}
              />
              <button className="settings-icon-button" type="button" onClick={onPickLibraryRoot}>
                <Icon name="folder" />
              </button>
            </div>
            {loading ? <p className="settings-inline-hint">{t('library.refreshing')}</p> : null}
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

          <SettingsCard title={t('settings.lyrics')}>
            <SelectSettingRow
              label={t('settings.playerLyricsSource')}
              value={snapshot.settings.playerLyricsSource}
              options={lyricsSourceOptions}
              onChange={(value) => {
                onUpdateSettings({ playerLyricsSource: value })
              }}
            />
            <ToggleSettingRow
              label={t('settings.autoLyrics')}
              checked={snapshot.settings.autoLyrics}
              onChange={(checked) => {
                onUpdateSettings({ autoLyrics: checked })
              }}
            />
            <ToggleSettingRow
              label={t('settings.preserveLyricsTimestamps')}
              hint={t('settings.preserveLyricsTimestampsHint')}
              checked={snapshot.settings.preserveInternetLyricsTimestamps}
              onChange={(checked) => {
                onUpdateSettings({ preserveInternetLyricsTimestamps: checked })
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
          </SettingsCard>

          {showNotificationSettings ? (
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
            </SettingsCard>
          ) : null}

        </div>

        <div className="settings-column">
          <SettingsCard title={t('settings.display')}>
            <SelectSettingRow
              label={t('settings.interfaceLanguage')}
              value={snapshot.settings.preferredLanguage}
              options={preferredLanguageOptions}
              onChange={(value) => {
                onUpdateSettings({ preferredLanguage: value })
              }}
            />
            <SelectSettingRow
              label={t('settings.nightMode')}
              value={snapshot.settings.nightMode}
              options={nightModeOptions}
              onChange={(value) => {
                onUpdateSettings({ nightMode: value })
              }}
            />
            {snapshot.settings.nightMode === 'auto' ? (
              <TimeSettingRow
                label={t('settings.nightModeTimeRange')}
                startLabel={t('settings.nightModeStartTime')}
                endLabel={t('settings.nightModeEndTime')}
                startValue={snapshot.settings.nightModeStartTime}
                endValue={snapshot.settings.nightModeEndTime}
                onStartChange={(value) => {
                  onUpdateSettings({ nightModeStartTime: value })
                }}
                onEndChange={(value) => {
                  onUpdateSettings({ nightModeEndTime: value })
                }}
              />
            ) : null}
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

          <SettingsCard title={t('settings.play')}>
            <ToggleSettingRow
              label={t('settings.autoPlay')}
              checked={snapshot.settings.autoPlay}
              onChange={(checked) => {
                onUpdateSettings({ autoPlay: checked })
              }}
            />
            <ToggleSettingRow
              label={t('settings.saveProgress')}
              checked={snapshot.settings.saveMusicProgress}
              onChange={(checked) => {
                onUpdateSettings({ saveMusicProgress: checked })
              }}
            />
            <div className="settings-button-row">
              <SettingsActionButton
                onClick={() => {
                  setShowPreferenceSettings(true)
                }}
              >
                <Icon name="star" />
                {t('settings.preferenceSettings')}
              </SettingsActionButton>
            </div>
          </SettingsCard>

          <SettingsCard title={t('settings.others')}>
            <ToggleSettingRow
              label={t('settings.quitOnClose')}
              checked={snapshot.settings.quitOnClose}
              onChange={(checked) => {
                onUpdateSettings({ quitOnClose: checked })
              }}
            />
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
                  <>
                    <div className="dropdown-dismiss-layer" onPointerDown={() => setShowFeedbackOptions(false)} />
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
                  </>
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
              {releaseNotes.map((entry) => (
                <section className="release-note-version" key={entry.version}>
                  <h3>
                    {entry.version === 'History Updates' ? t('settings.releaseNotesIntro') : `${t('settings.releaseNotesVersion')} ${entry.version}`}
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
