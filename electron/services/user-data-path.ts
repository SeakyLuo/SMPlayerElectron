import { existsSync } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { app } from 'electron'

import { ACTIVE_STATE, SMPLAYER_DB_NAME } from './constants'

const legacyUwpPackageIdentityName = '23778SeakyTheLoner.SMPlayer'

export async function resolveUserDataPath() {
  const defaultUserDataPath = app.getPath('userData')
  const uwpLocalStatePath = await findUwpPackageLocalStatePath()

  // Keep the legacy UWP LocalState as the canonical Windows data directory so
  // Store users can move to this Electron build without a one-time copy step.
  if (uwpLocalStatePath) {
    await mkdir(uwpLocalStatePath, { recursive: true })
    return uwpLocalStatePath
  }

  if (isWindowsStorePackage()) {
    throw new Error(`Windows Store package data path was not found for ${legacyUwpPackageIdentityName}`)
  }

  await mkdir(defaultUserDataPath, { recursive: true })
  return defaultUserDataPath
}

function isWindowsStorePackage() {
  return Boolean((process as NodeJS.Process & { windowsStore?: boolean }).windowsStore)
}

async function findUwpPackageLocalStatePath() {
  if (process.platform !== 'win32') {
    return null
  }

  const localAppDataPath = process.env.LOCALAPPDATA
  if (!localAppDataPath) {
    return null
  }

  const packagesPath = join(localAppDataPath, 'Packages')
  let packageEntries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    packageEntries = await readdir(packagesPath, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return null
  }

  const localStatePaths = packageEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${legacyUwpPackageIdentityName}_`))
    .map((entry) => join(packagesPath, entry.name, 'LocalState'))

  const existingDatabasePaths: Array<{
    localStatePath: string
    updatedAt: number
    existingSampleCount: number
  }> = []
  for (const localStatePath of localStatePaths) {
    const databasePath = join(localStatePath, SMPLAYER_DB_NAME)
    if (existsSync(databasePath)) {
      const databaseStats = await stat(databasePath)
      existingDatabasePaths.push({
        localStatePath,
        updatedAt: databaseStats.mtimeMs,
        ...readLibraryDatabaseScore(databasePath),
      })
    }
  }

  if (existingDatabasePaths.length > 0) {
    return existingDatabasePaths
      .reduce((best, candidate) => {
        if (candidate.existingSampleCount !== best.existingSampleCount) {
          return candidate.existingSampleCount > best.existingSampleCount ? candidate : best
        }

        return candidate.updatedAt > best.updatedAt ? candidate : best
      })
      .localStatePath
  }

  for (const localStatePath of localStatePaths) {
    return localStatePath
  }

  return null
}

function readLibraryDatabaseScore(databasePath: string) {
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(databasePath, { readOnly: true })
    if (!sqliteTableExists(db, 'Music')) {
      return { existingSampleCount: 0 }
    }

    const sampleRows = db.prepare(`
      SELECT Path AS path
      FROM Music
      WHERE State = ?
      ORDER BY Id
      LIMIT 96
    `).all(ACTIVE_STATE.active) as Array<{ path: string }>

    return {
      existingSampleCount: sampleRows.filter((row) => existsSync(row.path)).length,
    }
  } catch {
    return { existingSampleCount: 0 }
  } finally {
    db?.close()
  }
}

function sqliteTableExists(db: DatabaseSync, tableName: string) {
  return Boolean(db.prepare(`
    SELECT 1 AS found
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
    LIMIT 1
  `).get(tableName))
}
