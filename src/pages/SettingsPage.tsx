import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from '../components/icons'
import { ReleaseNotesDialog } from '../components/ReleaseNotesDialog'
import { RemoveDialog } from '../components/RemoveDialog'
import type {
  AppSettingsUpdate,
  MusicData,
  NightMode,
  NotificationSendMode,
  PreferredLanguage,
} from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { LyricsBatchControl } from '../components/LyricsBatchControl'
import { PreferenceSettingsPage } from './PreferenceSettingsPage'

interface SettingsPageProps {
  t: Translator
  snapshot: MusicData
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onRequestSmartArtistFix: () => void
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
  const [openUpward, setOpenUpward] = useState(false)
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionsRef = useRef<HTMLSpanElement | null>(null)
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !optionsRef.current) {
      return
    }

    const workspaceContent = menuRef.current?.closest('.workspace-content') as HTMLElement | null
    const boundaryRect = workspaceContent?.getBoundingClientRect()
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const optionsRect = optionsRef.current.getBoundingClientRect()
    const dropdownHeight = optionsRect.height || Math.max(options.length * 38 + 12, 120)
    const boundaryTop = boundaryRect?.top ?? 8
    const boundaryBottom = boundaryRect?.bottom ?? (window.innerHeight - 8)
    const spaceBelow = Math.max(0, boundaryBottom - triggerRect.bottom - 6)
    const spaceAbove = Math.max(0, triggerRect.top - boundaryTop - 6)
    const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow
    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow

    setOpenUpward(shouldOpenUpward)
    setDropdownMaxHeight(Math.max(120, Math.floor(availableSpace)))
  }, [open, options.length])

  return (
    <div className="settings-row settings-row-with-control" ref={menuRef}>
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <span className="settings-select-menu">
        <button
          ref={triggerRef}
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
            <span
              ref={optionsRef}
              className={openUpward ? 'settings-select-options is-open-upward' : 'settings-select-options'}
              style={dropdownMaxHeight ? { maxHeight: `${dropdownMaxHeight}px` } : undefined}
            >
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
  scanning,
  error,
  onPickLibraryRoot,
  onRequestSmartArtistFix,
  onUpdateSettings,
}: SettingsPageProps) {
  const showNotificationSettings = true
  const notificationSendOptions: Array<{
    value: NotificationSendMode
    label: string
  }> = [
    { value: 'music-changed', label: t('settings.notificationSendMusicChanged') },
    { value: 'never', label: t('settings.notificationSendNever') },
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
  const showSystemLog = () => {
    void window.smplayer?.revealSystemLogs()
  }
  const [actionMessage, setActionMessage] = useState('')
  const [dataTransferState, setDataTransferState] = useState<'idle' | 'importing' | 'exporting' | 'reloading'>('idle')
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showPreferenceSettings, setShowPreferenceSettings] = useState(false)
  const [showFeedbackOptions, setShowFeedbackOptions] = useState(false)
  const [showImportDataDialog, setShowImportDataDialog] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const feedbackMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.smplayer?.getAppInfo().then((appInfo) => {
      setAppVersion(appInfo.version)
    })
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
    setShowImportDataDialog(false)
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
          <div className="app-window-drag-strip" aria-hidden="true" />
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
            <ToggleSettingRow
              label={t('settings.smartMultiArtistRecognition')}
              hint={t('settings.smartMultiArtistRecognitionHint')}
              checked={snapshot.settings.smartMultiArtistRecognition}
              onChange={(checked) => {
                onUpdateSettings({ smartMultiArtistRecognition: checked })
              }}
            />
            {snapshot.settings.smartMultiArtistRecognition ? (
              <div className="settings-button-row">
                <button
                  type="button"
                  className="settings-link-button"
                  disabled={loading || scanning}
                  onClick={onRequestSmartArtistFix}
                >
                  <Icon name="users" />
                  {t('settings.smartMultiArtistFix')}
                </button>
              </div>
            ) : null}
          </SettingsCard>

          <LyricsBatchControl t={t} snapshot={snapshot} onUpdateSettings={onUpdateSettings} />

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
                  setShowImportDataDialog(true)
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
        {appVersion ? (
          <div className="settings-app-info">
            {t('app.shell')} {appVersion}
          </div>
        ) : null}
      </div>

      {showReleaseNotes ? (
        <ReleaseNotesDialog
          t={t}
          preferredLanguage={snapshot.settings.preferredLanguage}
          onClose={() => {
            setShowReleaseNotes(false)
          }}
        />
      ) : null}

      {showImportDataDialog ? (
        <RemoveDialog
          t={t}
          title={t('settings.importData')}
          message={t('settings.importDataConfirm')}
          onCancel={() => {
            setShowImportDataDialog(false)
          }}
          onConfirm={() => {
            void importData()
          }}
        />
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
