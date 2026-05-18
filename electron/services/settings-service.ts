import type { DatabaseSync } from 'node:sqlite'

import type {
  AlbumSortCriterion,
  AppSettingsUpdate,
  LocalViewMode,
  LyricsRequestMode,
  MusicLibrarySortCriterion,
  NightMode,
  PlaylistSortCriterion,
  PlaybackMode,
  PlaybackSettingsUpdate,
  PreferredLanguage,
  SearchSortCriterion,
  SettingsSnapshot,
} from '../../src/shared/contracts.ts'

export interface SettingsRow {
  Id: number
  RootPath: string
  MyFavorites: number
  NowPlaying: number
  ThemeColor: string
  NightMode: number
  NightModeStartTime: string
  NightModeEndTime: string
  NotificationSend: number
  NotificationDisplay: number
  AutoLyrics: number
  ShowLyricsInNotification: number
  VoiceAssistantPreferredLanguage: number
  NotificationLyricsSource: number
  PlayerLyricsSource: number
  SaveLyricsImmediately: number
  PreserveInternetLyricsTimestamps: number
  DesktopLyricsEnabled: number
  DesktopLyricsLocked: number
  DesktopLyricsColor: string
  DesktopLyricsStrokeColor: string
  DesktopLyricsFontSize: number
  DesktopLyricsFontFamily: string
  DesktopLyricsOpacity: number
  DesktopLyricsBounds: string
  MainWindowBounds: string
  MainWindowMaximized: number
  UseFilenameNotMusicName: number
  SmartMultiArtistRecognition: number
  MusicLibraryCriterion: number
  AlbumsCriterion: number
  SearchArtistsCriterion: number
  SearchAlbumsCriterion: number
  SearchSongsCriterion: number
  SearchPlaylistsCriterion: number
  SearchFoldersCriterion: number
  LastMusicIndex: number
  Volume: number
  IsMuted: number
  Mode: number
  MusicProgress: number
  AutoPlay: number
  SaveMusicProgress: number
  ShowCount: number
  HideMultiSelectCommandBarAfterOperation: number
  LocalViewMode: number
  QuitOnClose: number
  LastPage: string
  LastPlaylist: number
  LastReleaseNotesVersion: string
}

export class SettingsService {
  private readonly db: DatabaseSync
  private readonly getSettingsStatement
  private readonly insertSettingsStatement
  private readonly updateRootPathStatement
  private readonly updateAppSettingsStatement
  private readonly updateViewStateStatement
  private readonly updatePlaybackSettingsStatement
  private readonly updateMainWindowStateStatement

  constructor(db: DatabaseSync) {
    this.db = db
    this.getSettingsStatement = this.db.prepare(`
      SELECT
        Id,
        RootPath,
        MyFavorites,
        NowPlaying,
        ThemeColor,
        NightMode,
        NightModeStartTime,
        NightModeEndTime,
        NotificationSend,
        NotificationDisplay,
        AutoLyrics,
        ShowLyricsInNotification,
        VoiceAssistantPreferredLanguage,
        NotificationLyricsSource,
        PlayerLyricsSource,
        SaveLyricsImmediately,
        PreserveInternetLyricsTimestamps,
        DesktopLyricsEnabled,
        DesktopLyricsLocked,
        DesktopLyricsColor,
        DesktopLyricsStrokeColor,
        DesktopLyricsFontSize,
        DesktopLyricsFontFamily,
        DesktopLyricsOpacity,
        DesktopLyricsBounds,
        MainWindowBounds,
        MainWindowMaximized,
        UseFilenameNotMusicName,
        SmartMultiArtistRecognition,
        MusicLibraryCriterion,
        AlbumsCriterion,
        SearchArtistsCriterion,
        SearchAlbumsCriterion,
        SearchSongsCriterion,
        SearchPlaylistsCriterion,
        SearchFoldersCriterion,
        LastMusicIndex,
        Volume,
        IsMuted,
        Mode,
        MusicProgress,
        AutoPlay,
        SaveMusicProgress,
        ShowCount,
        HideMultiSelectCommandBarAfterOperation,
        LocalViewMode,
        QuitOnClose,
        LastPage,
        LastPlaylist,
        LastReleaseNotesVersion
      FROM Settings
      ORDER BY Id DESC
      LIMIT 1
    `)
    this.insertSettingsStatement = this.db.prepare(`
      INSERT INTO Settings (RootPath, MyFavorites, NowPlaying)
      VALUES (?, ?, ?)
    `)
    this.updateRootPathStatement = this.db.prepare(`
      UPDATE Settings
      SET RootPath = ?
      WHERE Id = ?
    `)
    this.updateAppSettingsStatement = this.db.prepare(`
      UPDATE Settings
      SET
        UseFilenameNotMusicName = ?,
        SmartMultiArtistRecognition = ?,
        ShowCount = ?,
        ThemeColor = ?,
        NightMode = ?,
        NightModeStartTime = ?,
        NightModeEndTime = ?,
        NotificationDisplay = ?,
        NotificationSend = ?,
        AutoLyrics = ?,
        ShowLyricsInNotification = ?,
        VoiceAssistantPreferredLanguage = ?,
        NotificationLyricsSource = ?,
        PlayerLyricsSource = ?,
        SaveLyricsImmediately = ?,
        PreserveInternetLyricsTimestamps = ?,
        DesktopLyricsEnabled = ?,
        DesktopLyricsLocked = ?,
        DesktopLyricsColor = ?,
        DesktopLyricsStrokeColor = ?,
        DesktopLyricsFontSize = ?,
        DesktopLyricsFontFamily = ?,
        DesktopLyricsOpacity = ?,
        DesktopLyricsBounds = ?,
        MusicLibraryCriterion = ?,
        AlbumsCriterion = ?,
        SearchArtistsCriterion = ?,
        SearchAlbumsCriterion = ?,
        SearchSongsCriterion = ?,
        SearchPlaylistsCriterion = ?,
        SearchFoldersCriterion = ?,
        AutoPlay = ?,
        SaveMusicProgress = ?,
        HideMultiSelectCommandBarAfterOperation = ?,
        QuitOnClose = ?,
        MusicProgress = ?,
        LocalViewMode = ?,
        LastReleaseNotesVersion = ?
      WHERE Id = ?
    `)
    this.updateViewStateStatement = this.db.prepare(`
      UPDATE Settings
      SET
        LastPage = ?,
        LastPlaylist = ?
      WHERE Id = ?
    `)
    this.updatePlaybackSettingsStatement = this.db.prepare(`
      UPDATE Settings
      SET
        LastMusicIndex = ?,
        Volume = ?,
        IsMuted = ?,
        Mode = ?,
        MusicProgress = ?
      WHERE Id = ?
    `)
    this.updateMainWindowStateStatement = this.db.prepare(`
      UPDATE Settings
      SET
        MainWindowBounds = ?,
        MainWindowMaximized = ?
      WHERE Id = ?
    `)
  }

  initializeSettingsRows(createBuiltInPlaylist: () => number) {
    const settings = this.getSettingsStatement.get() as SettingsRow | undefined

    if (!settings) {
      this.insertSettingsStatement.run('', createBuiltInPlaylist(), 0)
    }
  }

  getSettings(): SettingsRow {
    const settings = this.getSettingsStatement.get() as SettingsRow | undefined

    if (!settings) {
      throw new Error('Settings row has not been initialized.')
    }

    return settings
  }

  getSettingsSnapshot(): SettingsSnapshot {
    return toSettingsSnapshot(this.getSettings())
  }

  setRootPath(rootPath: string) {
    const settings = this.getSettings()
    this.updateRootPathStatement.run(rootPath, settings.Id)
  }

  updateSettings(update: AppSettingsUpdate) {
    const settings = this.getSettings()
    const nextSaveMusicProgress =
      update.saveMusicProgress ?? Boolean(settings.SaveMusicProgress)
    const nextNotificationSend =
      update.notificationSend ??
      (update.showNotifications === undefined
        ? mapNotificationSend(settings.NotificationSend)
        : update.showNotifications
          ? 'music-changed'
          : 'never')

    this.updateAppSettingsStatement.run(
      Number(update.useFilenameNotMusicName ?? Boolean(settings.UseFilenameNotMusicName)),
      Number(update.smartMultiArtistRecognition ?? Boolean(settings.SmartMultiArtistRecognition)),
      Number(update.showCount ?? Boolean(settings.ShowCount)),
      update.themeColor ?? settings.ThemeColor ?? '#5b87b6',
      toNightModeValue(update.nightMode ?? mapNightMode(settings.NightMode)),
      update.nightModeStartTime ?? settings.NightModeStartTime,
      update.nightModeEndTime ?? settings.NightModeEndTime,
      toNotificationDisplayValue(
        update.notificationDisplay ?? mapNotificationDisplay(settings.NotificationDisplay),
      ),
      toNotificationSendValue(nextNotificationSend),
      Number(update.autoLyrics ?? Boolean(settings.AutoLyrics)),
      Number(update.showLyricsInNotification ?? Boolean(settings.ShowLyricsInNotification)),
      toPreferredLanguageValue(
        update.preferredLanguage ?? mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage),
      ),
      toLyricsRequestModeValue(
        update.notificationLyricsSource ?? mapLyricsRequestMode(settings.NotificationLyricsSource),
      ),
      toLyricsRequestModeValue(
        update.playerLyricsSource ?? mapLyricsRequestMode(settings.PlayerLyricsSource),
      ),
      Number(update.saveLyricsImmediately ?? Boolean(settings.SaveLyricsImmediately)),
      Number(
        update.preserveInternetLyricsTimestamps ??
          Boolean(settings.PreserveInternetLyricsTimestamps),
      ),
      Number(update.desktopLyricsEnabled ?? Boolean(settings.DesktopLyricsEnabled)),
      Number(update.desktopLyricsLocked ?? Boolean(settings.DesktopLyricsLocked)),
      update.desktopLyricsColor ?? settings.DesktopLyricsColor,
      update.desktopLyricsStrokeColor ?? settings.DesktopLyricsStrokeColor,
      update.desktopLyricsFontSize ?? settings.DesktopLyricsFontSize,
      update.desktopLyricsFontFamily ?? settings.DesktopLyricsFontFamily,
      update.desktopLyricsOpacity ?? settings.DesktopLyricsOpacity,
      update.desktopLyricsBounds ?? settings.DesktopLyricsBounds,
      toMusicLibrarySortValue(
        update.musicLibrarySort ?? mapMusicLibrarySort(settings.MusicLibraryCriterion),
      ),
      toAlbumSortValue(update.albumsSort ?? mapAlbumSort(settings.AlbumsCriterion)),
      toSearchSortValue(update.searchArtistsCriterion ?? mapSearchSort(settings.SearchArtistsCriterion)),
      toSearchSortValue(update.searchAlbumsCriterion ?? mapSearchSort(settings.SearchAlbumsCriterion)),
      toSearchSortValue(update.searchSongsCriterion ?? mapSearchSort(settings.SearchSongsCriterion)),
      toSearchSortValue(update.searchPlaylistsCriterion ?? mapSearchSort(settings.SearchPlaylistsCriterion)),
      toSearchSortValue(update.searchFoldersCriterion ?? mapSearchSort(settings.SearchFoldersCriterion)),
      Number(update.autoPlay ?? Boolean(settings.AutoPlay)),
      Number(nextSaveMusicProgress),
      Number(
        update.hideMultiSelectCommandBarAfterOperation ??
          Boolean(settings.HideMultiSelectCommandBarAfterOperation),
      ),
      Number(update.quitOnClose ?? Boolean(settings.QuitOnClose)),
      nextSaveMusicProgress ? settings.MusicProgress : 0,
      toLocalViewModeValue(update.localViewMode ?? mapLocalViewMode(settings.LocalViewMode)),
      update.lastReleaseNotesVersion ?? settings.LastReleaseNotesVersion,
      settings.Id,
    )
  }

  saveViewState(update: { lastPage?: string; lastPlaylistId?: number }) {
    const settings = this.getSettings()

    this.updateViewStateStatement.run(
      update.lastPage ?? settings.LastPage,
      update.lastPlaylistId ?? settings.LastPlaylist,
      settings.Id,
    )
  }

  savePlaybackSettings(update: PlaybackSettingsUpdate) {
    const settings = this.getSettings()

    this.updatePlaybackSettingsStatement.run(
      update.lastMusicIndex ?? settings.LastMusicIndex,
      update.volume ?? settings.Volume,
      Number(update.isMuted ?? Boolean(settings.IsMuted)),
      toModeValue(update.mode ?? mapMode(settings.Mode)),
      update.musicProgress ?? settings.MusicProgress,
      settings.Id,
    )
  }

  saveMainWindowState(update: { bounds: string; maximized: boolean }) {
    const settings = this.getSettings()
    this.updateMainWindowStateStatement.run(
      update.bounds,
      Number(update.maximized),
      settings.Id,
    )
  }
}

export function toSettingsSnapshot(settings: SettingsRow): SettingsSnapshot {
  return {
    rootPath: settings.RootPath,
    useFilenameNotMusicName: Boolean(settings.UseFilenameNotMusicName),
    smartMultiArtistRecognition: Boolean(settings.SmartMultiArtistRecognition),
    showCount: Boolean(settings.ShowCount),
    themeColor: settings.ThemeColor || '#0078D7',
    nightMode: mapNightMode(settings.NightMode),
    nightModeStartTime: settings.NightModeStartTime,
    nightModeEndTime: settings.NightModeEndTime,
    notificationSend: mapNotificationSend(settings.NotificationSend),
    notificationDisplay: mapNotificationDisplay(settings.NotificationDisplay),
    showNotifications: mapNotificationSend(settings.NotificationSend) !== 'never',
    autoLyrics: Boolean(settings.AutoLyrics),
    showLyricsInNotification: Boolean(settings.ShowLyricsInNotification),
    notificationLyricsSource: mapLyricsRequestMode(settings.NotificationLyricsSource),
    playerLyricsSource: mapLyricsRequestMode(settings.PlayerLyricsSource),
    saveLyricsImmediately: true,
    preserveInternetLyricsTimestamps: Boolean(settings.PreserveInternetLyricsTimestamps),
    desktopLyricsEnabled: Boolean(settings.DesktopLyricsEnabled),
    desktopLyricsLocked: Boolean(settings.DesktopLyricsLocked),
    desktopLyricsColor: settings.DesktopLyricsColor || '#4aa8ff',
    desktopLyricsStrokeColor: settings.DesktopLyricsStrokeColor || '',
    desktopLyricsFontSize: settings.DesktopLyricsFontSize,
    desktopLyricsFontFamily: settings.DesktopLyricsFontFamily,
    desktopLyricsOpacity: settings.DesktopLyricsOpacity,
    desktopLyricsBounds: settings.DesktopLyricsBounds,
    mainWindowBounds: settings.MainWindowBounds,
    mainWindowMaximized: Boolean(settings.MainWindowMaximized),
    preferredLanguage: mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage),
    musicLibrarySort: mapMusicLibrarySort(settings.MusicLibraryCriterion),
    albumsSort: mapAlbumSort(settings.AlbumsCriterion),
    searchArtistsCriterion: mapSearchSort(settings.SearchArtistsCriterion),
    searchAlbumsCriterion: mapSearchSort(settings.SearchAlbumsCriterion),
    searchSongsCriterion: mapSearchSort(settings.SearchSongsCriterion),
    searchPlaylistsCriterion: mapSearchSort(settings.SearchPlaylistsCriterion),
    searchFoldersCriterion: mapSearchSort(settings.SearchFoldersCriterion),
    lastMusicIndex: settings.LastMusicIndex,
    volume: settings.Volume,
    isMuted: Boolean(settings.IsMuted),
    mode: mapMode(settings.Mode),
    musicProgress: settings.MusicProgress,
    autoPlay: Boolean(settings.AutoPlay),
    saveMusicProgress: Boolean(settings.SaveMusicProgress),
    hideMultiSelectCommandBarAfterOperation: Boolean(settings.HideMultiSelectCommandBarAfterOperation),
    localViewMode: mapLocalViewMode(settings.LocalViewMode),
    quitOnClose: Boolean(settings.QuitOnClose),
    lastPage: settings.LastPage || '/songs',
    lastPlaylistId: settings.LastPlaylist,
    lastReleaseNotesVersion: settings.LastReleaseNotesVersion,
  }
}

export function mapMode(modeValue: number): PlaybackMode {
  switch (modeValue) {
    case 1:
      return 'repeat'
    case 2:
      return 'repeat-one'
    case 3:
      return 'shuffle'
    default:
      return 'once'
  }
}

export function mapLocalViewMode(modeValue: number): LocalViewMode {
  return modeValue === 1 ? 'list' : 'grid'
}

function toLocalViewModeValue(mode: LocalViewMode) {
  return mode === 'list' ? 1 : 0
}

export function mapLyricsRequestMode(modeValue: number): LyricsRequestMode {
  switch (modeValue) {
    case 1:
      return 'local'
    case 2:
      return 'embedded'
    case 3:
      return 'auto'
    default:
      return 'internet'
  }
}

function toLyricsRequestModeValue(mode: LyricsRequestMode) {
  switch (mode) {
    case 'local':
      return 1
    case 'embedded':
      return 2
    case 'auto':
      return 3
    default:
      return 0
  }
}

export function mapPreferredLanguage(languageValue: number): PreferredLanguage {
  switch (languageValue) {
    case 1:
      return 'en-US'
    case 2:
      return 'zh-CN'
    case 3:
      return 'fr'
    case 4:
      return 'ru'
    case 5:
      return 'ja'
    case 6:
      return 'de'
    case 7:
      return 'pt-BR'
    case 8:
      return 'es'
    case 9:
      return 'it'
    case 10:
      return 'zh-Hant'
    case 11:
      return 'nl'
    case 12:
      return 'cs'
    case 13:
      return 'uk'
    case 14:
      return 'sv'
    case 15:
      return 'id'
    default:
      return 'system'
  }
}

function toPreferredLanguageValue(language: PreferredLanguage) {
  switch (language) {
    case 'zh-CN':
      return 2
    case 'en-US':
      return 1
    case 'fr':
      return 3
    case 'ru':
      return 4
    case 'ja':
      return 5
    case 'de':
      return 6
    case 'pt-BR':
      return 7
    case 'es':
      return 8
    case 'it':
      return 9
    case 'zh-Hant':
      return 10
    case 'nl':
      return 11
    case 'cs':
      return 12
    case 'uk':
      return 13
    case 'sv':
      return 14
    case 'id':
      return 15
    default:
      return 0
  }
}

export function mapNightMode(modeValue: number): NightMode {
  switch (modeValue) {
    case 0:
      return 'auto'
    case 1:
      return 'on'
    default:
      return 'never'
  }
}

function toNightModeValue(mode: NightMode) {
  switch (mode) {
    case 'auto':
      return 0
    case 'on':
      return 1
    default:
      return 2
  }
}

export function mapMusicLibrarySort(criterionValue: number): MusicLibrarySortCriterion {
  switch (criterionValue) {
    case 1:
      return 'artist'
    case 2:
      return 'album'
    case 3:
      return 'duration'
    case 4:
      return 'play-count'
    case 5:
      return 'date-added'
    default:
      return 'title'
  }
}

export function mapPlaylistSort(criterionValue: number): PlaylistSortCriterion {
  return mapMusicLibrarySort(criterionValue)
}

export function mapAlbumSort(criterionValue: number): AlbumSortCriterion {
  switch (criterionValue) {
    case 1:
      return 'artist'
    case 6:
      return 'name'
    default:
      return 'default'
  }
}

export function mapSearchSort(criterionValue: number): SearchSortCriterion {
  switch (criterionValue) {
    case 0:
      return 'title'
    case 1:
      return 'artist'
    case 2:
      return 'album'
    case 3:
      return 'duration'
    case 4:
      return 'play-count'
    case 5:
      return 'date-added'
    case 6:
      return 'name'
    default:
      return 'default'
  }
}

function toMusicLibrarySortValue(criterion: MusicLibrarySortCriterion) {
  switch (criterion) {
    case 'artist':
      return 1
    case 'album':
      return 2
    case 'duration':
      return 3
    case 'play-count':
      return 4
    case 'date-added':
      return 5
    default:
      return 0
  }
}

export function toPlaylistSortValue(criterion: PlaylistSortCriterion) {
  return toMusicLibrarySortValue(criterion)
}

function toAlbumSortValue(criterion: AlbumSortCriterion) {
  switch (criterion) {
    case 'artist':
      return 1
    case 'name':
      return 6
    default:
      return -1
  }
}

function toSearchSortValue(criterion: SearchSortCriterion) {
  switch (criterion) {
    case 'title':
      return 0
    case 'artist':
      return 1
    case 'album':
      return 2
    case 'duration':
      return 3
    case 'play-count':
      return 4
    case 'date-added':
      return 5
    case 'name':
      return 6
    default:
      return -1
  }
}

function toModeValue(mode: PlaybackMode) {
  switch (mode) {
    case 'repeat':
      return 1
    case 'repeat-one':
      return 2
    case 'shuffle':
      return 3
    default:
      return 0
  }
}

export function mapNotificationSend(modeValue: number) {
  return modeValue === 1 ? 'never' : 'music-changed'
}

function toNotificationSendValue(mode: 'music-changed' | 'never') {
  return mode === 'never' ? 1 : 0
}

export function mapNotificationDisplay(modeValue: number) {
  switch (modeValue) {
    case 0:
      return 'reminder'
    case 2:
      return 'quick'
    default:
      return 'normal'
  }
}

function toNotificationDisplayValue(mode: 'reminder' | 'normal' | 'quick') {
  switch (mode) {
    case 'reminder':
      return 0
    case 'quick':
      return 2
    default:
      return 1
  }
}
