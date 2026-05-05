import type {
  AppInfo,
  AppSettingsUpdate,
  LibrarySnapshot,
  LyricsRequestMode,
  PreferredLanguage,
} from '../shared/contracts'

interface SettingsPageProps {
  appInfo: AppInfo
  snapshot: LibrarySnapshot
  loading: boolean
  scanning: boolean
  error: string | null
  onPickLibraryRoot: () => void
  onScanLibrary: () => void
  onUpdateSettings: (update: AppSettingsUpdate) => void
}

interface ToggleSettingRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

interface SelectSettingRowProps<T extends string> {
  label: string
  description: string
  value: T
  options: Array<{
    value: T
    label: string
  }>
  onChange: (value: T) => void
}

function ToggleSettingRow({
  label,
  description,
  checked,
  onChange,
}: ToggleSettingRowProps) {
  return (
    <label className="settings-toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked)
        }}
      />
    </label>
  )
}

function SelectSettingRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: SelectSettingRowProps<T>) {
  return (
    <label className="settings-input-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
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

export function SettingsPage({
  appInfo,
  snapshot,
  loading,
  scanning,
  error,
  onPickLibraryRoot,
  onScanLibrary,
  onUpdateSettings,
}: SettingsPageProps) {
  const notificationLyricsSourceOptions: Array<{
    value: LyricsRequestMode
    label: string
  }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'local', label: 'Local only' },
    { value: 'internet', label: 'Internet only' },
  ]
  const preferredLanguageOptions: Array<{
    value: PreferredLanguage
    label: string
  }> = [
    { value: 'system', label: 'System default' },
    { value: 'zh-CN', label: 'Chinese' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: 'Japanese' },
  ]
  const lastPlaylistName =
    snapshot.playlists.find((playlist) => playlist.id === snapshot.settings.lastPlaylistId)?.name ??
    'No playlist selected'

  return (
    <section className="page-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live app settings</p>
          <h2>Settings</h2>
          <p className="page-copy">
            This page now edits real SQLite-backed settings. Storage preferences affect the
            scanner, and playback preferences feed directly into restore behavior.
          </p>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="settings-grid">
        <section className="settings-panel">
          <div className="subpanel-header">
            <span className="summary-label">Storage</span>
            <strong>{snapshot.settings.rootPath ? 'Configured' : 'Not set'}</strong>
          </div>

          <div className="root-banner">
            <span className="summary-label">Library Root</span>
            <strong>{snapshot.settings.rootPath || 'No music folder selected yet'}</strong>
            {loading ? <span className="banner-hint">Refreshing library...</span> : null}
          </div>

          <div className="settings-actions">
            <button className="action-button secondary" type="button" onClick={onPickLibraryRoot}>
              Choose Folder
            </button>
            <button
              className="action-button"
              type="button"
              onClick={onScanLibrary}
              disabled={scanning || !snapshot.settings.rootPath}
            >
              {scanning ? 'Scanning...' : 'Rescan Library'}
            </button>
          </div>

          <ToggleSettingRow
            label="Prefer filename over embedded title tags"
            description="Useful for badly tagged libraries. Rescan after changing this to rebuild song titles."
            checked={snapshot.settings.useFilenameNotMusicName}
            onChange={(checked) => {
              onUpdateSettings({ useFilenameNotMusicName: checked })
            }}
          />
        </section>

        <section className="settings-panel">
          <div className="subpanel-header">
            <span className="summary-label">Playback</span>
            <strong>{snapshot.settings.mode}</strong>
          </div>

          <ToggleSettingRow
            label="Auto-play last selected track on launch"
            description="When enabled, the player resumes the last selected song immediately after startup."
            checked={snapshot.settings.autoPlay}
            onChange={(checked) => {
              onUpdateSettings({ autoPlay: checked })
            }}
          />
          <ToggleSettingRow
            label="Save playback progress"
            description="When disabled, playback resumes from the start even if a track was paused midway."
            checked={snapshot.settings.saveMusicProgress}
            onChange={(checked) => {
              onUpdateSettings({ saveMusicProgress: checked })
            }}
          />
          <ToggleSettingRow
            label="Show native track notifications"
            description="Controls Electron desktop notifications when the active track changes."
            checked={snapshot.settings.showNotifications}
            onChange={(checked) => {
              onUpdateSettings({ showNotifications: checked })
            }}
          />
          <ToggleSettingRow
            label="Auto-search internet lyrics"
            description="When local lyrics are missing, automatically fall back to online synced lyrics before embedded tags."
            checked={snapshot.settings.autoLyrics}
            onChange={(checked) => {
              onUpdateSettings({ autoLyrics: checked })
            }}
          />

          <div className="settings-metrics">
            <div className="summary-card">
              <span className="summary-label">Volume</span>
              <span className="summary-value">{Math.round(snapshot.settings.volume)}</span>
              <p>Current master volume persisted from the playback bar.</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Mode</span>
              <span className="summary-value settings-mode-value">{snapshot.settings.mode}</span>
              <p>Repeat and shuffle mode are kept in sync with the playback controller.</p>
            </div>
          </div>
        </section>

        <section className="settings-panel">
          <div className="subpanel-header">
            <span className="summary-label">Lyrics and language</span>
            <strong>{snapshot.settings.preferredLanguage}</strong>
          </div>

          <ToggleSettingRow
            label="Save fetched internet lyrics beside songs"
            description="Writes fetched lyrics to a sidecar `.lrc` or `.txt` file immediately so the next load can stay local."
            checked={snapshot.settings.saveLyricsImmediately}
            onChange={(checked) => {
              onUpdateSettings({ saveLyricsImmediately: checked })
            }}
          />
          <ToggleSettingRow
            label="Show lyric preview in notifications"
            description="Uses the first available lyric line as the native notification body instead of only artist and album."
            checked={snapshot.settings.showLyricsInNotification}
            onChange={(checked) => {
              onUpdateSettings({ showLyricsInNotification: checked })
            }}
          />
          <SelectSettingRow
            label="Notification lyrics source"
            description="Controls whether notification previews use local, internet, or automatic lyric lookup."
            value={snapshot.settings.notificationLyricsSource}
            options={notificationLyricsSourceOptions}
            onChange={(value) => {
              onUpdateSettings({ notificationLyricsSource: value })
            }}
          />
          <SelectSettingRow
            label="Preferred language profile"
            description="Feeds legacy language preference into online lyric requests and future shell integrations."
            value={snapshot.settings.preferredLanguage}
            options={preferredLanguageOptions}
            onChange={(value) => {
              onUpdateSettings({ preferredLanguage: value })
            }}
          />
        </section>

        <section className="settings-panel">
          <div className="subpanel-header">
            <span className="summary-label">View</span>
            <strong>{snapshot.settings.themeColor}</strong>
          </div>

          <ToggleSettingRow
            label="Show collection counts"
            description="Adds live totals to collection-page titles so the app mirrors the original library count affordances."
            checked={snapshot.settings.showCount}
            onChange={(checked) => {
              onUpdateSettings({ showCount: checked })
            }}
          />

          <label className="settings-input-row">
            <div>
              <strong>Accent color</strong>
              <p>Updates the active navigation, buttons, and focus color to better match the old app's theme setting.</p>
            </div>
            <div className="settings-color-field">
              <input
                type="color"
                value={snapshot.settings.themeColor}
                onChange={(event) => {
                  onUpdateSettings({ themeColor: event.currentTarget.value })
                }}
              />
              <span>{snapshot.settings.themeColor.toUpperCase()}</span>
            </div>
          </label>

          <div className="settings-metrics">
            <div className="summary-card">
              <span className="summary-label">Last Page</span>
              <span className="summary-value settings-path-value">
                {snapshot.settings.lastPage || '/songs'}
              </span>
              <p>Startup now restores the last visited route instead of always opening songs.</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Last Playlist</span>
              <span className="summary-value">{lastPlaylistName}</span>
              <p>The playlists page restores the most recently selected playlist when possible.</p>
            </div>
          </div>
        </section>
      </div>

      <section className="settings-panel">
        <div className="subpanel-header">
          <span className="summary-label">Runtime</span>
          <strong>{appInfo.platform}</strong>
        </div>
        <div className="settings-runtime-grid">
          <div className="summary-card">
            <span className="summary-label">Platform</span>
            <span className="summary-value">{appInfo.platform}</span>
            <p>The current target platform reported by Electron.</p>
          </div>
          <div className="summary-card">
            <span className="summary-label">Version</span>
            <span className="summary-value">{appInfo.version}</span>
            <p>App version coming from the Electron main process.</p>
          </div>
          <div className="summary-card">
            <span className="summary-label">User Data</span>
            <span className="summary-value settings-path-value">
              {appInfo.userDataPath.split(/[\\/]/).at(-1) ?? appInfo.userDataPath}
            </span>
            <p>{appInfo.userDataPath}</p>
          </div>
        </div>
      </section>
    </section>
  )
}
