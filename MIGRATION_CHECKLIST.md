# SMPlayer Electron Migration Checklist

This file tracks the Electron rewrite against the original UWP app and is intended to be updated as features land.

## Core Playback And Library

- [x] Electron main / preload / renderer app shell
- [x] SQLite-backed local library snapshot
- [x] Library root selection and recursive scan
- [x] Playback engine: play / pause / previous / next / seek
- [x] Playback settings persistence: volume / mute / repeat / shuffle / progress
- [x] Real `Now Playing` queue backed by SQLite
- [x] Recent playback history
- [x] Favorites backed by playlist data
- [x] Search persistence and recent searches
- [x] Better rescan handling for deleted files and metadata edge cases
- [x] Multi-artist metadata parsing and artist drilldowns
- [x] More complete migration audit of legacy settings and schema fields

## Playlists

- [x] Create playlist
- [x] Delete playlist
- [x] Rename playlist
- [x] Reorder playlist songs
- [x] Bulk add songs to playlist
- [x] Bulk remove songs from playlist
- [x] Reorder playlist tabs / playlist priority

## Collection And Detail Pages

- [x] Songs page backed by real data
- [x] Basic artists collection summary page
- [x] Basic albums collection summary page
- [x] Rich local folder browser backed by scanned paths
- [x] Basic now playing page
- [x] Dedicated artist detail page
- [x] Dedicated album detail page
- [x] Fuller now-playing screen with artwork and lyrics

## Settings

- [x] Library root selection
- [x] Rescan action
- [x] `UseFilenameNotMusicName`
- [x] `AutoPlay`
- [x] `SaveMusicProgress`
- [x] `ShowCount`
- [x] `LastPage`
- [x] `LastPlaylist`
- [x] Theme / accent migration
- [x] Notification-related settings
- [x] `AutoLyrics`
- [x] Language-related settings
- [x] Renderer i18n wiring for the primary UI surfaces

## Media Features

- [x] Album artwork extraction and display
- [x] Local / embedded lyrics integration
- [x] Internet lyrics search / lyrics source switching
- [x] Better duration fallback handling
- [x] Advanced playback behavior review

## Desktop Integration

- [x] Tray support
- [x] Native notifications
- [x] Better global media key integration
- [x] Packaging polish
- [x] Window visual polish closer to the UWP app

## Current Execution Order

1. Sort/view criteria migration
2. Mini-player and remote-play decisions
3. Preference collection surfaces
4. Release notes gating decision
