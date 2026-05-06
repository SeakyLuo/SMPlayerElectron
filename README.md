# SMPlayer Electron

Cross-platform Electron rebuild of the original UWP `SMPlayer` project.

## Stack

- Electron
- React
- TypeScript
- Vite
- SQLite via `node:sqlite`

## Current Status

The project is no longer a template shell. It already has a working Electron app structure, a real local music library pipeline, and a basic playback experience.

Implemented so far:

- Electron main/preload/renderer structure
- SQLite-backed local library database
- Music folder selection and recursive library scan
- Rescans that clean deleted-file fallout from playlists, queue/history state, and stale cover cache files
- Audio metadata import with filename fallback
- Embedded artwork extraction with persistent local cover cache
- Local and embedded lyrics loading with synced `.lrc` support
- Internet lyrics lookup with manual source switching and auto-fallback support
- Songs page backed by real library data
- Playback engine with:
  - play / pause
  - previous / next
  - seek
  - volume / mute
  - repeat / repeat-one / shuffle
  - playback progress persistence
  - keyboard playback shortcuts
  - MediaSession seek forward / backward handlers
- Recent playback history
- Favorite songs backed by playlist data
- Search filtering with persisted query and recent search history
- Fuller now-playing page with:
  - current-track hero
  - persisted queue management
  - artwork
  - local or embedded lyrics
  - synced lyric highlighting for `.lrc`
- Real local browser with:
  - routeable folder breadcrumbs
  - child-folder drilldown
  - subtree playback
  - reveal-in-Explorer actions
- Native now-playing notifications from the Electron main process
- Global media key handling through Electron plus browser `MediaSession`
- System tray support with:
  - close-to-tray behavior
  - tray click restore/hide
  - explicit quit from tray menu
- Packaging configuration with platform-specific scripts and installer defaults
- Window chrome polish with hidden title bar and native Mica / vibrancy where supported
- Real playlists page with:
  - create playlist
  - delete playlist
  - rename playlist
  - reorder playlist tabs / priority
  - add song to playlist
  - bulk add songs to playlist
  - remove song from playlist
  - bulk remove songs from playlist
  - reorder playlist songs
- Real settings page with:
  - library root selection
  - rescan
  - `UseFilenameNotMusicName`
  - `AutoPlay`
  - `SaveMusicProgress`
  - `ShowCount`
  - last-page restoration
  - last-playlist restoration
  - accent color / theme tint
  - native notification toggle
  - `AutoLyrics`
  - language profile
  - notification lyric source
  - save fetched lyrics immediately
  - songs-page sort criterion
- Multi-artist metadata stored through a `MusicArtist` relation table
- Migration audit document at `docs/MIGRATION_AUDIT.md`

## Commands

```bash
npm install
npm run build
npm run lint
npm run start
```

For development:

```bash
npm run dev
```

## Important Files

- `electron/main.ts`
- `electron/preload.ts`
- `electron/services/data-store.ts`
- `src/App.tsx`
- `src/hooks/usePlaybackController.ts`
- `src/pages/LibraryPage.tsx`
- `src/pages/ArtistDetailPage.tsx`
- `src/pages/AlbumDetailPage.tsx`
- `src/pages/PlaylistsPage.tsx`
- `src/pages/SettingsPage.tsx`

## Remaining Work

These are the main migration gaps still left:

### Core Function Gaps

- Sort/view criteria migration for albums, artists, folders, searches, and playlists
- Mini-player mode decision and implementation
- Remote play/control decision and implementation
- Preference collection surfaces for `PreferenceSetting` / `PreferenceItem`

### Desktop Integration

- Packaging QA on clean Windows / macOS / Linux machines
- Native icon replacement with final `.ico` / `.icns` assets

### UI / UX Gaps

- Better queue management UI
- Better playlist management UI
- More faithful restoration of the original Groove-like visuals and transitions

### Migration / Compatibility

- Review pending UWP-only features from `docs/MIGRATION_AUDIT.md` and decide Electron equivalents
- Document which original features are intentionally dropped or replaced

## Known Issues

- Build currently shows a non-blocking Vite warning about `node:sqlite` being externalized for browser compatibility. This does not break the Electron build.
- `vite-plugin-electron` also emits a non-blocking deprecation warning about `inlineDynamicImports`.
- Manual end-to-end QA is still needed after each major migration pass.

## Recommended Next Steps

1. Implement remaining sort/view criteria migration.
2. Decide mini-player and remote-play scope.
3. Build preference collection surfaces or drop those legacy tables.
4. Add release notes gating or remove `LastReleaseNotesVersion`.
