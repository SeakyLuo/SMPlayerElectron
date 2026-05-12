import type { DatabaseSync } from 'node:sqlite'

import type { HiddenStorageItem } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'

export class HiddenItemService {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  upsert(type: HiddenStorageItem['type'], itemPath: string) {
    const result = this.db.prepare(`
      UPDATE HiddenStorageItem
      SET State = ?
      WHERE Type = ?
        AND Path = ?
    `).run(ACTIVE_STATE.active, type, itemPath)

    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO HiddenStorageItem (Type, Path, State)
        VALUES (?, ?, ?)
      `).run(type, itemPath, ACTIVE_STATE.active)
    }
  }

  getItems(): HiddenStorageItem[] {
    this.syncStorageStateFromHiddenItems()
    this.syncHiddenItemsFromStorageState()

    const hiddenStorageItems = this.db.prepare(`
      SELECT
        Id AS id,
        Type AS type,
        Path AS path
      FROM HiddenStorageItem
      WHERE State = ?
    `).all(ACTIVE_STATE.active) as unknown as HiddenStorageItem[]

    const hiddenFolders = this.db.prepare(`
      SELECT
        Id AS id,
        'folder' AS type,
        Path AS path
      FROM Folder
      WHERE State = ?
    `).all(ACTIVE_STATE.hidden) as unknown as HiddenStorageItem[]

    const hiddenFiles = this.db.prepare(`
      SELECT
        Id AS id,
        'file' AS type,
        Path AS path
      FROM File
      WHERE State = ?
    `).all(ACTIVE_STATE.hidden) as unknown as HiddenStorageItem[]

    const itemsByKey = new Map<string, HiddenStorageItem>()
    for (const item of [...hiddenStorageItems, ...hiddenFolders, ...hiddenFiles]) {
      itemsByKey.set(`${item.type}:${item.path}`, item)
    }

    return [...itemsByKey.values()].sort((left, right) => {
      const typeComparison = left.type.localeCompare(right.type)
      return typeComparison === 0 ? left.path.localeCompare(right.path) : typeComparison
    })
  }

  hideFolder(folderPath: string) {
    this.db.exec('BEGIN')
    try {
      this.upsert('folder', folderPath)
      this.db.prepare(`
        UPDATE Folder
        SET State = ?
        WHERE Path = ?
      `).run(ACTIVE_STATE.hidden, folderPath)
      this.db.prepare(`
        UPDATE Folder
        SET State = ?
        WHERE Path LIKE ?
           OR Path LIKE ?
      `).run(ACTIVE_STATE.parentHidden, `${folderPath}\\%`, `${folderPath}/%`)
      this.db.prepare(`
        UPDATE Music
        SET State = ?
        WHERE Path LIKE ?
           OR Path LIKE ?
      `).run(ACTIVE_STATE.parentHidden, `${folderPath}\\%`, `${folderPath}/%`)
      this.db.prepare(`
        UPDATE File
        SET State = ?
        WHERE Path LIKE ?
           OR Path LIKE ?
      `).run(ACTIVE_STATE.parentHidden, `${folderPath}\\%`, `${folderPath}/%`)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  resume(item: HiddenStorageItem) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare(`
        UPDATE HiddenStorageItem
        SET State = ?
        WHERE Type = ?
          AND Path = ?
      `).run(ACTIVE_STATE.inactive, item.type, item.path)

      if (item.type === 'folder') {
        this.db.prepare(`
          UPDATE HiddenStorageItem
          SET State = ?
          WHERE Path = ?
             OR Path LIKE ?
             OR Path LIKE ?
        `).run(ACTIVE_STATE.inactive, item.path, `${item.path}\\%`, `${item.path}/%`)
        this.db.prepare(`
          UPDATE Folder
          SET State = ?
          WHERE Path = ?
             OR Path LIKE ?
             OR Path LIKE ?
        `).run(ACTIVE_STATE.active, item.path, `${item.path}\\%`, `${item.path}/%`)
        this.db.prepare(`
          UPDATE Music
          SET State = ?
          WHERE Path LIKE ?
             OR Path LIKE ?
        `).run(ACTIVE_STATE.active, `${item.path}\\%`, `${item.path}/%`)
        this.db.prepare(`
          UPDATE File
          SET State = ?
          WHERE Path LIKE ?
             OR Path LIKE ?
        `).run(ACTIVE_STATE.active, `${item.path}\\%`, `${item.path}/%`)
      } else {
        this.db.prepare(`
          UPDATE Music
          SET State = ?
          WHERE Path = ?
        `).run(ACTIVE_STATE.active, item.path)
        this.db.prepare(`
          UPDATE File
          SET State = ?
          WHERE Path = ?
        `).run(ACTIVE_STATE.active, item.path)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private syncHiddenItemsFromStorageState() {
    this.db.prepare(`
      INSERT INTO HiddenStorageItem (Type, Path, State)
      SELECT 'folder', Path, ?
      FROM Folder
      WHERE State = ?
      ON CONFLICT(Type, Path) DO UPDATE SET State = excluded.State
    `).run(ACTIVE_STATE.active, ACTIVE_STATE.hidden)
    this.db.prepare(`
      INSERT INTO HiddenStorageItem (Type, Path, State)
      SELECT 'file', Path, ?
      FROM File
      WHERE State = ?
      ON CONFLICT(Type, Path) DO UPDATE SET State = excluded.State
    `).run(ACTIVE_STATE.active, ACTIVE_STATE.hidden)
  }

  private syncStorageStateFromHiddenItems() {
    this.db.prepare(`
      UPDATE Folder
      SET State = ?
      WHERE EXISTS (
        SELECT 1
        FROM HiddenStorageItem
        WHERE HiddenStorageItem.Type = 'folder'
          AND HiddenStorageItem.Path = Folder.Path
          AND HiddenStorageItem.State = ?
      )
    `).run(ACTIVE_STATE.hidden, ACTIVE_STATE.active)
    this.db.prepare(`
      UPDATE Folder
      SET State = ?
      WHERE State != ?
        AND EXISTS (
          SELECT 1
          FROM HiddenStorageItem
          WHERE HiddenStorageItem.Type = 'folder'
            AND HiddenStorageItem.State = ?
            AND (
              Folder.Path LIKE HiddenStorageItem.Path || '\\%'
              OR Folder.Path LIKE HiddenStorageItem.Path || '/%'
            )
        )
    `).run(ACTIVE_STATE.parentHidden, ACTIVE_STATE.hidden, ACTIVE_STATE.active)
    this.db.prepare(`
      UPDATE Music
      SET State = ?
      WHERE EXISTS (
        SELECT 1
        FROM HiddenStorageItem
        WHERE HiddenStorageItem.Type = 'file'
          AND HiddenStorageItem.Path = Music.Path
          AND HiddenStorageItem.State = ?
      )
    `).run(ACTIVE_STATE.hidden, ACTIVE_STATE.active)
    this.db.prepare(`
      UPDATE File
      SET State = ?
      WHERE EXISTS (
        SELECT 1
        FROM HiddenStorageItem
        WHERE HiddenStorageItem.Type = 'file'
          AND HiddenStorageItem.Path = File.Path
          AND HiddenStorageItem.State = ?
      )
    `).run(ACTIVE_STATE.hidden, ACTIVE_STATE.active)
    this.db.prepare(`
      UPDATE Music
      SET State = ?
      WHERE State != ?
        AND EXISTS (
          SELECT 1
          FROM HiddenStorageItem
          WHERE HiddenStorageItem.Type = 'folder'
            AND HiddenStorageItem.State = ?
            AND (
              Music.Path LIKE HiddenStorageItem.Path || '\\%'
              OR Music.Path LIKE HiddenStorageItem.Path || '/%'
            )
        )
    `).run(ACTIVE_STATE.parentHidden, ACTIVE_STATE.hidden, ACTIVE_STATE.active)
    this.db.prepare(`
      UPDATE File
      SET State = ?
      WHERE State != ?
        AND EXISTS (
          SELECT 1
          FROM HiddenStorageItem
          WHERE HiddenStorageItem.Type = 'folder'
            AND HiddenStorageItem.State = ?
            AND (
              File.Path LIKE HiddenStorageItem.Path || '\\%'
              OR File.Path LIKE HiddenStorageItem.Path || '/%'
            )
        )
    `).run(ACTIVE_STATE.parentHidden, ACTIVE_STATE.hidden, ACTIVE_STATE.active)
  }
}
