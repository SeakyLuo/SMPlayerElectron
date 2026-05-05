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
- System tray support with:
  - close-to-tray behavior
  - tray click restore/hide
  - explicit quit from tray menu
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

- More complete settings migration from the old app:
  - language preferences
- Audit old settings / tables against the Electron version to close schema gaps

### Media Features

- Better duration / metadata fallback handling
- Optional gapless or more advanced playback behavior if needed

### Desktop Integration

- Better media key integration beyond browser `MediaSession`
- App packaging polish for Windows / macOS / Linux
- Better acrylic / blurred window treatment closer to the original UWP look

### UI / UX Gaps

- Better queue management UI
- Better playlist management UI
- More faithful restoration of the original Groove-like visuals and transitions

### Migration / Compatibility

- Review old UWP-only features one by one and decide Electron equivalents
- Document which original features are intentionally dropped or replaced

## Known Issues

- Build currently shows a non-blocking Vite warning about `node:sqlite` being externalized for browser compatibility. This does not break the Electron build.
- `vite-plugin-electron` also emits a non-blocking deprecation warning about `inlineDynamicImports`.
- Manual end-to-end QA is still needed after each major migration pass.

## Recommended Next Steps

1. Continue migrating remaining settings and schema preferences.
2. Review global media key integration beyond `MediaSession`.
3. Tighten packaging and release defaults for desktop builds.
4. Improve duration fallback behavior for hard-to-parse media files.
