import { basename } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import type {
  PreferenceEntityType,
  PreferenceItemSnapshot,
  PreferenceItemUpdate,
  PreferenceLevel,
  PreferenceSettingsSnapshot,
  PreferenceSettingsUpdate,
} from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'
import { ensurePreferenceCompatibility } from './preference-compatibility.ts'

interface PreferenceSettingRow {
  Id: number
  Songs: number
  Artists: number
  Albums: number
  Playlists: number
  Folders: number
  RecentAddedId: number
  MyFavoritesId: number
  MostPlayedId: number
  LeastPlayedId: number
}

interface PreferenceItemRow {
  id: number
  type: number
  itemId: string
  itemName: string
  isEnabled: number
  level: number
  songName: string | null
  songTooltip: string | null
  artistValid: number
  albumValid: number
  playlistName: string | null
  folderName: string | null
  folderTooltip: string | null
}

export class PreferenceService {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  getPreferenceSettings(): PreferenceSettingsSnapshot {
    const setting = this.getPreferenceSetting()
    const items = this.db.prepare(`
      SELECT
        PreferenceItem.Id AS id,
        PreferenceItem.Type AS type,
        PreferenceItem.ItemId AS itemId,
        PreferenceItem.ItemName AS itemName,
        PreferenceItem.IsEnabled AS isEnabled,
        PreferenceItem.Level AS level,
        Music.Name AS songName,
        Music.Path AS songTooltip,
        EXISTS(
          SELECT 1
          FROM MusicArtist
          WHERE MusicArtist.Name = PreferenceItem.ItemId
            AND MusicArtist.State = ?
        ) AS artistValid,
        EXISTS(
          SELECT 1
          FROM Music
          WHERE Music.Album = PreferenceItem.ItemId
            AND Music.State = ?
        ) AS albumValid,
        Playlist.Name AS playlistName,
        Folder.Path AS folderName,
        Folder.Path AS folderTooltip
      FROM PreferenceItem
      LEFT JOIN Music
        ON PreferenceItem.Type = 0
       AND Music.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Music.State = ?
      LEFT JOIN Playlist
        ON PreferenceItem.Type = 3
       AND Playlist.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Playlist.State = ?
      LEFT JOIN Folder
        ON PreferenceItem.Type = 4
       AND Folder.Id = CAST(PreferenceItem.ItemId AS INTEGER)
       AND Folder.State = ?
      WHERE PreferenceItem.State = ?
      ORDER BY PreferenceItem.Id DESC
    `).all(
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
      ACTIVE_STATE.active,
    ) as unknown as PreferenceItemRow[]
    const mappedItems = items.map((item) => this.toPreferenceItemSnapshot(item))

    return {
      enabled: {
        songs: Boolean(setting.Songs),
        artists: Boolean(setting.Artists),
        albums: Boolean(setting.Albums),
        playlists: Boolean(setting.Playlists),
        folders: Boolean(setting.Folders),
      },
      songs: mappedItems.filter((item) => item.type === 'song'),
      artists: mappedItems.filter((item) => item.type === 'artist'),
      albums: mappedItems.filter((item) => item.type === 'album'),
      playlists: mappedItems.filter((item) => item.type === 'playlist'),
      folders: mappedItems.filter((item) => item.type === 'folder'),
      others: mappedItems.filter((item) =>
        item.type === 'recent-added' ||
        item.type === 'my-favorites' ||
        item.type === 'most-played' ||
        item.type === 'least-played',
      ),
    }
  }

  updatePreferenceSettings(update: PreferenceSettingsUpdate) {
    const setting = this.getPreferenceSetting()
    this.db.prepare(`
      UPDATE PreferenceSetting
      SET Songs = ?, Artists = ?, Albums = ?, Playlists = ?, Folders = ?
      WHERE Id = ?
    `).run(
      Number(update.songs ?? Boolean(setting.Songs)),
      Number(update.artists ?? Boolean(setting.Artists)),
      Number(update.albums ?? Boolean(setting.Albums)),
      Number(update.playlists ?? Boolean(setting.Playlists)),
      Number(update.folders ?? Boolean(setting.Folders)),
      setting.Id,
    )
  }

  addPreferenceItem(type: PreferenceEntityType, itemId: string, name: string, level: PreferenceLevel = 'normal') {
    this.getPreferenceSetting()
    const entityValue = this.toPreferenceEntityValue(type)
    const levelValue = this.toPreferenceLevelValue(level)
    const result = this.db.prepare(`
      UPDATE PreferenceItem
      SET ItemName = ?, IsEnabled = 1, Level = ?
      WHERE Type = ?
        AND ItemId = ?
        AND State = ?
    `).run(
      name,
      levelValue,
      entityValue,
      itemId,
      ACTIVE_STATE.active,
    )

    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO PreferenceItem (Type, ItemId, ItemName, IsEnabled, Level, State)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(
        entityValue,
        itemId,
        name,
        levelValue,
        ACTIVE_STATE.active,
      )
    }
  }

  updatePreferenceItem(itemId: number, update: PreferenceItemUpdate) {
    const item = this.db.prepare(`
      SELECT IsEnabled AS isEnabled, Level AS level
      FROM PreferenceItem
      WHERE Id = ? AND State = ?
    `).get(itemId, ACTIVE_STATE.active) as unknown as Pick<PreferenceItemRow, 'isEnabled' | 'level'>
    this.db.prepare(`
      UPDATE PreferenceItem
      SET IsEnabled = ?, Level = ?
      WHERE Id = ?
    `).run(
      Number(update.isEnabled ?? Boolean(item.isEnabled)),
      this.toPreferenceLevelValue(update.level ?? this.mapPreferenceLevel(item.level)),
      itemId,
    )
  }

  removePreferenceItem(itemId: number) {
    this.db.prepare('UPDATE PreferenceItem SET State = ? WHERE Id = ?').run(ACTIVE_STATE.inactive, itemId)
  }

  clearInvalidPreferenceItems(type: PreferenceEntityType) {
    const entityType = this.toPreferenceEntityValue(type)
    switch (type) {
      case 'song':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Music
              WHERE Music.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Music.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'artist':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM MusicArtist
              WHERE MusicArtist.Name = PreferenceItem.ItemId
                AND MusicArtist.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'album':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Music
              WHERE Music.Album = PreferenceItem.ItemId
                AND Music.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'playlist':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Playlist
              WHERE Playlist.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Playlist.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'folder':
        this.db.prepare(`
          UPDATE PreferenceItem
          SET State = ?
          WHERE Type = ?
            AND State = ?
            AND NOT EXISTS (
              SELECT 1
              FROM Folder
              WHERE Folder.Id = CAST(PreferenceItem.ItemId AS INTEGER)
                AND Folder.State = ?
            )
        `).run(ACTIVE_STATE.inactive, entityType, ACTIVE_STATE.active, ACTIVE_STATE.active)
        return
      case 'recent-added':
      case 'my-favorites':
      case 'most-played':
      case 'least-played':
        return
    }
  }

  private getPreferenceSetting() {
    let setting = this.db.prepare(`
      SELECT Id, Songs, Artists, Albums, Playlists, Folders, RecentAddedId, MyFavoritesId, MostPlayedId, LeastPlayedId
      FROM PreferenceSetting
      ORDER BY Id DESC
      LIMIT 1
    `).get() as unknown as PreferenceSettingRow | undefined

    if (!setting) {
      this.db.prepare(`
        INSERT INTO PreferenceSetting (Songs, Artists, Albums, Playlists, Folders)
        VALUES (0, 0, 0, 0, 0)
      `).run()
      setting = this.db.prepare(`
        SELECT Id, Songs, Artists, Albums, Playlists, Folders, RecentAddedId, MyFavoritesId, MostPlayedId, LeastPlayedId
        FROM PreferenceSetting
        ORDER BY Id DESC
        LIMIT 1
      `).get() as unknown as PreferenceSettingRow
    }

    ensurePreferenceCompatibility(this.db, setting.Id, ACTIVE_STATE.active)
    return setting
  }

  private toPreferenceItemSnapshot(item: PreferenceItemRow): PreferenceItemSnapshot {
    const type = this.mapPreferenceEntityType(item.type)
    const resolved = this.resolvePreferenceItem(item, type)

    return {
      id: item.id,
      type,
      itemId: item.itemId,
      name: resolved.name,
      tooltip: resolved.tooltip,
      isEnabled: Boolean(item.isEnabled),
      level: this.mapPreferenceLevel(item.level),
      isValid: resolved.isValid,
      canRemove: item.type < 5,
    }
  }

  private resolvePreferenceItem(item: PreferenceItemRow, type: PreferenceEntityType) {
    switch (type) {
      case 'song':
        return item.songName
          ? { name: item.songName, tooltip: item.songTooltip!, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'artist':
        return { name: item.itemId, tooltip: item.itemId, isValid: Boolean(item.artistValid) }
      case 'album':
        return { name: item.itemName || item.itemId, tooltip: item.itemId, isValid: Boolean(item.albumValid) }
      case 'playlist':
        return item.playlistName
          ? { name: item.playlistName, tooltip: item.playlistName, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'folder':
        return item.folderName
          ? { name: basename(item.folderName), tooltip: item.folderTooltip!, isValid: true }
          : { name: item.itemName || item.itemId, tooltip: item.itemName || item.itemId, isValid: false }
      case 'recent-added':
        return { name: 'Recent Added', tooltip: 'Recent Added', isValid: true }
      case 'my-favorites':
        return { name: 'My Favorites', tooltip: 'My Favorites', isValid: true }
      case 'most-played':
        return { name: 'Most Played', tooltip: 'Most Played', isValid: true }
      case 'least-played':
        return { name: 'Least Played', tooltip: 'Least Played', isValid: true }
    }
  }

  private mapPreferenceEntityType(type: number): PreferenceEntityType {
    return [
      'song',
      'artist',
      'album',
      'playlist',
      'folder',
      'recent-added',
      'my-favorites',
      'most-played',
      'least-played',
    ][type] as PreferenceEntityType
  }

  private toPreferenceEntityValue(type: PreferenceEntityType) {
    return {
      'song': 0,
      'artist': 1,
      'album': 2,
      'playlist': 3,
      'folder': 4,
      'recent-added': 5,
      'my-favorites': 6,
      'most-played': 7,
      'least-played': 8,
    }[type]
  }

  private mapPreferenceLevel(level: number): PreferenceLevel {
    switch (level) {
      case 0:
        return 'do-not-appear'
      case -1:
        return 'dislike'
      case 2:
        return 'high'
      case 3:
        return 'higher'
      case 4:
        return 'very-high'
      default:
        return 'normal'
    }
  }

  private toPreferenceLevelValue(level: PreferenceLevel) {
    return {
      'do-not-appear': 0,
      'dislike': -1,
      'normal': 1,
      'high': 2,
      'higher': 3,
      'very-high': 4,
    }[level]
  }
}
