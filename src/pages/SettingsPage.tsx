import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { Icon } from '../components/icons'
import { ReleaseNotesDialog } from '../components/ReleaseNotesDialog'
import { RemoveDialog } from '../components/RemoveDialog'
import type {
  AppSettingsUpdate,
  DesktopLyricsFontFamily,
  ScanLibraryProgress,
  MusicData,
  NightMode,
  NotificationSendMode,
  PreferredLanguage,
  DataTransferState,
} from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { LyricsBatchControl } from '../components/LyricsBatchControl'
import { PreferenceSettingsPage } from './PreferenceSettingsPage'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'
import { ScanProgressOverlay } from '../components/ScanProgressOverlay'

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
  searchable?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
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

interface RangeSettingRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  valueLabel: string
  onChange: (value: number) => void
}

interface ColorSettingRowProps {
  label: string
  value: string
  onChange: (value: string) => void
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

function RangeSettingRow({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: RangeSettingRowProps) {
  return (
    <div className="settings-row settings-row-with-control settings-range-row">
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <span className="settings-range-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
          onChange={(event) => {
            onChange(Number(event.currentTarget.value))
          }}
        />
        <span>{valueLabel}</span>
      </span>
    </div>
  )
}

function ColorSettingRow({ label, value, onChange }: ColorSettingRowProps) {
  return (
    <div className="settings-row settings-row-with-control settings-color-row">
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <label className="settings-color-control">
        <input
          type="color"
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value)
          }}
          aria-label={label}
        />
        <span style={{ backgroundColor: value }} aria-hidden="true" />
        <em>{value.toUpperCase()}</em>
      </label>
    </div>
  )
}

function SelectSettingRow<T extends string>({
  label,
  value,
  options,
  searchable,
  searchPlaceholder,
  emptyLabel,
  onChange,
}: SelectSettingRowProps<T>) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionsRef = useRef<HTMLSpanElement | null>(null)
  const selectedOption = options.find((option) => option.value === value)
  const filteredOptions = searchQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()))
    : options

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

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !optionsRef.current) {
      return
    }

    const workspaceContent = menuRef.current?.closest('.workspace-content') as HTMLElement | null
    const boundaryRect = workspaceContent?.getBoundingClientRect()
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const dropdownHeight = Math.max(optionsRef.current.scrollHeight, filteredOptions.length * 38 + 12, 120)
    const boundaryTop = boundaryRect?.top ?? 8
    const boundaryBottom = boundaryRect?.bottom ?? (window.innerHeight - 8)
    const spaceBelow = Math.max(0, boundaryBottom - triggerRect.bottom - 6)
    const spaceAbove = Math.max(0, triggerRect.top - boundaryTop - 6)
    const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow
    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow
    const fullHeightTolerance = 56

    setOpenUpward(shouldOpenUpward)
    setDropdownMaxHeight(
      availableSpace >= dropdownHeight - fullHeightTolerance
        ? Math.ceil(dropdownHeight)
        : Math.max(120, Math.floor(availableSpace)),
    )
  }, [filteredOptions.length, open])

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
              {searchable ? (
                <span className="settings-select-search">
                  <Icon name="search" />
                  <input
                    value={searchQuery}
                    placeholder={searchPlaceholder}
                    onChange={(event) => {
                      setSearchQuery(event.currentTarget.value)
                    }}
                  />
                </span>
              ) : null}
              {filteredOptions.map((option) => (
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
              {filteredOptions.length === 0 ? (
                <span className="settings-select-empty">{emptyLabel}</span>
              ) : null}
            </span>
          </>
        ) : null}
      </span>
    </div>
  )
}

function SettingsCard({
  title,
  id,
  headerAction,
  children,
}: {
  title: string
  id?: string
  headerAction?: ReactNode
  children?: ReactNode
}) {
  return (
    <section id={id} className="settings-card">
      <header className="settings-card-header">
        <h3>{title}</h3>
        {headerAction}
      </header>
      {children ? <div className="settings-card-body">{children}</div> : null}
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
  const location = useLocation()
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
    { value: 'en-US', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'fr', label: 'Français' },
    { value: 'ru', label: 'Русский' },
    { value: 'ja', label: '日本語' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt-BR', label: 'Português (Brasil)' },
    { value: 'es', label: 'Español' },
    { value: 'it', label: 'Italiano' },
    { value: 'zh-Hant', label: '繁體中文' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'cs', label: 'Čeština' },
    { value: 'uk', label: 'Українська' },
    { value: 'sv', label: 'Svenska' },
    { value: 'id', label: 'Bahasa Indonesia' },
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
  const [dataTransferState, setDataTransferState] = useState<DataTransferState>('idle')
  const [dataImportProgress, setDataImportProgress] = useState<ScanLibraryProgress | null>(null)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showPreferenceSettings, setShowPreferenceSettings] = useState(false)
  const [showFeedbackOptions, setShowFeedbackOptions] = useState(false)
  const [showImportDataDialog, setShowImportDataDialog] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const feedbackMenuRef = useRef<HTMLDivElement | null>(null)
  const showNotification = useUndoableNotificationStore((state) => state.showMessage)
  const desktopLyricsFontNames = snapshot.settings.desktopLyricsFontFamily === 'system' ||
    systemFonts.includes(snapshot.settings.desktopLyricsFontFamily)
    ? systemFonts
    : [snapshot.settings.desktopLyricsFontFamily, ...systemFonts]
  const desktopLyricsFontOptions: Array<{
    value: DesktopLyricsFontFamily
    label: string
  }> = [
    { value: 'system', label: t('settings.desktopLyricsFontSystem') },
    ...desktopLyricsFontNames.map((fontName) => ({
      value: fontName,
      label: fontName,
    })),
  ]

  useLayoutEffect(() => {
    if (location.hash !== '#desktop-lyrics') {
      return
    }

    document.getElementById('desktop-lyrics')?.scrollIntoView({ block: 'center' })
  }, [location.hash])

  useEffect(() => {
    void window.smplayer?.getAppInfo().then((appInfo) => {
      setAppVersion(appInfo.version)
    })
  }, [])

  useEffect(() => {
    void window.smplayer?.getSystemFonts().then(setSystemFonts)
  }, [])

  useEffect(() => {
    return window.smplayer?.onDataTransferState((state) => {
      setDataTransferState(state)
    })
  }, [])

  useEffect(() => {
    return window.smplayer?.onScanLocalFolderProgress((progress) => {
      if (progress.operationId === 'data-import') {
        setDataImportProgress(progress)
      }
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
    setDataTransferState('openingExport')

    try {
      const result = await window.smplayer?.exportData()
      if (!result || result.canceled) {
        return
      }
      showNotification(t('settings.dataExported'))
    } catch {
      showNotification(t('settings.dataExportFailed'))
    } finally {
      setDataTransferState('idle')
    }
  }

  const importData = async () => {
    setShowImportDataDialog(false)
    setDataImportProgress(null)
    setDataTransferState('openingImport')

    try {
      const result = await window.smplayer?.importData()
      if (!result || result.canceled) {
        setDataTransferState('idle')
        return
      }
      setDataImportProgress(null)
      setDataTransferState('reloading')
      showNotification(t('settings.dataImported'))
      window.setTimeout(() => {
        window.location.reload()
      }, 300)
    } catch {
      setDataImportProgress(null)
      setDataTransferState('idle')
      showNotification(t('settings.dataImportFailed'))
    }
  }

  return (
    <section className="page-panel settings-page">
      {error ? <div className="error-banner">{error}</div> : null}
      {dataTransferState !== 'idle' && !dataImportProgress ? (
        <div className="settings-progress-overlay" role="status" aria-live="polite">
          <div className="app-window-drag-strip" aria-hidden="true" />
          <div className="settings-progress-dialog">
            <span className="settings-progress-ring" aria-hidden="true" />
            <strong>
              {dataTransferState === 'openingImport'
                ? t('settings.openingImportData')
                : dataTransferState === 'openingExport'
                  ? t('settings.openingExportData')
                  : dataTransferState === 'importing'
                    ? t('settings.importingData')
                    : dataTransferState === 'exporting'
                      ? t('settings.exportingData')
                      : t('settings.dataImported')}
            </strong>
          </div>
        </div>
      ) : null}
      {dataImportProgress ? <ScanProgressOverlay progress={dataImportProgress} t={t} /> : null}

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

          <SettingsCard
            id="desktop-lyrics"
            title={t('settings.desktopLyrics')}
            headerAction={(
              <label className="settings-header-switch" aria-label={t('settings.desktopLyrics')}>
                <input
                  className="settings-switch"
                  type="checkbox"
                  checked={snapshot.settings.desktopLyricsEnabled}
                  onChange={(event) => {
                    onUpdateSettings({ desktopLyricsEnabled: event.currentTarget.checked })
                  }}
                />
              </label>
            )}
          >
            {snapshot.settings.desktopLyricsEnabled ? (
              <>
                <ColorSettingRow
                  label={t('settings.desktopLyricsColor')}
                  value={snapshot.settings.desktopLyricsColor}
                  onChange={(value) => {
                    onUpdateSettings({ desktopLyricsColor: value })
                  }}
                />
                <ToggleSettingRow
                  label={t('settings.desktopLyricsStroke')}
                  checked={Boolean(snapshot.settings.desktopLyricsStrokeColor)}
                  onChange={(checked) => {
                    onUpdateSettings({ desktopLyricsStrokeColor: checked ? '#111111' : '' })
                  }}
                />
                {snapshot.settings.desktopLyricsStrokeColor ? (
                  <ColorSettingRow
                    label={t('settings.desktopLyricsStrokeColor')}
                    value={snapshot.settings.desktopLyricsStrokeColor}
                    onChange={(value) => {
                      onUpdateSettings({ desktopLyricsStrokeColor: value })
                    }}
                  />
                ) : null}
                <SelectSettingRow
                  label={t('settings.desktopLyricsFontFamily')}
                  value={snapshot.settings.desktopLyricsFontFamily}
                  options={desktopLyricsFontOptions}
                  searchable
                  searchPlaceholder={t('settings.desktopLyricsFontSearch')}
                  emptyLabel={t('settings.desktopLyricsFontNoResults')}
                  onChange={(value) => {
                    onUpdateSettings({ desktopLyricsFontFamily: value })
                  }}
                />
                <RangeSettingRow
                  label={t('settings.desktopLyricsFontSize')}
                  min={20}
                  max={48}
                  step={1}
                  value={snapshot.settings.desktopLyricsFontSize}
                  valueLabel={`${snapshot.settings.desktopLyricsFontSize}px`}
                  onChange={(value) => {
                    onUpdateSettings({ desktopLyricsFontSize: value })
                  }}
                />
                <RangeSettingRow
                  label={t('settings.desktopLyricsOpacity')}
                  min={45}
                  max={100}
                  step={1}
                  value={snapshot.settings.desktopLyricsOpacity}
                  valueLabel={`${snapshot.settings.desktopLyricsOpacity}%`}
                  onChange={(value) => {
                    onUpdateSettings({ desktopLyricsOpacity: value })
                  }}
                />
                <div className="settings-button-row">
                  <SettingsActionButton
                    onClick={() => {
                      onUpdateSettings({
                        desktopLyricsColor: '#4aa8ff',
                        desktopLyricsStrokeColor: '#111111',
                        desktopLyricsFontSize: 28,
                        desktopLyricsFontFamily: 'system',
                        desktopLyricsOpacity: 88,
                      })
                    }}
                  >
                    <Icon name="undo" />
                    {t('settings.desktopLyricsRestoreDefaults')}
                  </SettingsActionButton>
                </div>
              </>
            ) : null}
          </SettingsCard>

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
