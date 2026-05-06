# SMPlayer UWP To Electron Migration Audit

This audit tracks legacy UWP settings and schema concepts against the Electron implementation. It is the source of truth for deciding whether a legacy field is migrated, replaced, or intentionally dropped.

Status legend:

- `Migrated`: implemented in Electron and wired to UI or runtime behavior.
- `Partially migrated`: stored or represented, but not fully surfaced or behavior-complete.
- `Pending`: still needs implementation or a product decision.
- `Electron replacement`: handled through a different Electron-native mechanism.
- `Dropped`: legacy-only behavior that should not be carried forward.

## Settings Table

| Legacy field | Status | Electron implementation |
| --- | --- | --- |
| `RootPath` | Migrated | Library folder selection and scan root. |
| `LastMusicIndex` | Migrated | Playback restore index in `usePlaybackController`. |
| `Mode` | Migrated | `once`, `repeat`, `repeat-one`, `shuffle`. |
| `Volume` | Migrated | Player volume and persistence. |
| `IsNavigationCollapsed` | Pending | Sidebar exists, but collapsed navigation behavior is not implemented. |
| `ThemeColor` | Migrated | Accent color setting and CSS variable application. |
| `NotificationSend` | Migrated | Kept in sync with notification toggle for legacy parity. |
| `NotificationDisplay` | Migrated | Native Electron notification toggle. |
| `LastPage` | Migrated | Route restoration on launch. |
| `LastPlaylist` | Migrated | Playlist page restores selected playlist. |
| `LocalViewMode` | Pending | Folder browser exists; alternate list/grid modes are not implemented. |
| `MyFavorites` | Migrated | Built-in favorites playlist id. |
| `NowPlaying` | Migrated | Built-in persisted queue playlist id. |
| `MiniModeWithDropdown` | Pending | Mini-player mode has not been rebuilt. |
| `IsMuted` | Migrated | Player mute persistence. |
| `AutoPlay` | Migrated | Startup playback restore behavior. |
| `AutoLyrics` | Migrated | Online lyric fallback behavior. |
| `SaveMusicProgress` | Migrated | Resume progress setting. |
| `MusicProgress` | Migrated | Persisted playback position. |
| `MusicLibraryCriterion` | Migrated | Songs page sort setting persists through `Settings.MusicLibraryCriterion`. |
| `AlbumsCriterion` | Pending | Album sort criteria need UI mapping. |
| `HideMultiSelectCommandBarAfterOperation` | Pending | Multi-select command bars are implemented differently; behavior decision still needed. |
| `ShowCount` | Migrated | Collection route count display. |
| `ShowLyricsInNotification` | Migrated | Notification body can use lyric preview. |
| `VoiceAssistantPreferredLanguage` | Migrated | Preferred language profile used by renderer i18n and lyric request headers. |
| `SearchArtistsCriterion` | Pending | Search exists; per-surface sort criteria are not implemented. |
| `SearchAlbumsCriterion` | Pending | Search exists; per-surface sort criteria are not implemented. |
| `SearchSongsCriterion` | Pending | Search exists; per-surface sort criteria are not implemented. |
| `SearchPlaylistsCriterion` | Pending | Search exists; per-surface sort criteria are not implemented. |
| `SearchFoldersCriterion` | Pending | Search exists; per-surface sort criteria are not implemented. |
| `LastReleaseNotesVersion` | Pending | Release notes gating is not implemented. |
| `RemotePlayPassword` | Pending | Remote play/control is not implemented. |
| `UseFilenameNotMusicName` | Migrated | Scanner title fallback preference. |
| `NotificationLyricsSource` | Migrated | Notification lyric lookup mode. |
| `SaveLyricsImmediately` | Migrated | Fetched lyrics can be persisted beside songs. |

## Library Tables

| Legacy concept | Status | Electron implementation |
| --- | --- | --- |
| `Music` | Migrated | SQLite-backed scanned songs with metadata, artwork path, duration, play count, and state. |
| Multiple track artists | Migrated | `MusicArtist` relation table. `Music.Artist` remains only the display string. |
| `Folder` | Migrated | Recursive folder tree and local browser routes. |
| `File` | Migrated | Song-to-folder file index. |
| `Playlist` | Migrated | Built-in and custom playlists with priority. |
| `PlaylistItem` | Migrated | Playlist membership, bulk add/remove, and ordering. |
| `RecentRecord` | Migrated | Recent playback history and play count updates. |
| `PreferenceSetting` | Partially migrated | Table exists, but preference collection surfaces are not implemented. |
| `PreferenceItem` | Partially migrated | Table exists, but preference item management is not implemented. |
| Search state/history | Migrated | Persisted current query and recent searches. |

## Desktop And Platform Features

| Legacy concept | Status | Electron implementation |
| --- | --- | --- |
| Tray behavior | Electron replacement | Electron tray with hide/show/quit. |
| Native notifications | Electron replacement | Electron `Notification` API. |
| Media keys | Migrated | Electron `globalShortcut` plus browser `MediaSession`. |
| UWP acrylic / visual treatment | Pending | Current CSS is functional; closer UWP-style polish remains. |
| Packaging | Pending | `electron-builder` config exists, but release defaults and assets need polish. |

## Remaining Decisions

1. Implement or drop mini-player mode.
2. Implement remaining sort criteria for albums, artists, folders, search, and playlists.
3. Decide whether `PreferenceSetting` / `PreferenceItem` become real collection pages or are dropped.
4. Decide whether remote play/control should be rebuilt for Electron.
5. Add release notes gating or remove `LastReleaseNotesVersion` from the target model.
