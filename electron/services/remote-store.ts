import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type {
  AuthorizedDevice,
  AuthorizedDeviceAuth,
  RemoteHost,
  RemoteShareSettings,
  RemoteShareSettingsUpdate,
} from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'

interface RemoteSettingRow {
  DeviceId: string
  DeviceName: string
  ShareEnabled: number
  Port: number
  Password: string
}

interface AuthorizedDeviceRow {
  Id: number
  DeviceId: string
  DeviceName: string
  Platform: string
  Browser: string
  Ip: string
  Auth: number
  CreateTime: string
  UpdateTime: string
  LastSeenTime: string
}

interface RemoteHostRow {
  Id: number
  HostId: string
  Name: string
  BaseUrl: string
  Platform: string
  CreateTime: string
  UpdateTime: string
  LastConnectedTime: string
}

interface RemoteHostConnectionRow extends RemoteHostRow {
  Token: string
}

export class RemoteStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  getRemoteShareSettings(): RemoteShareSettings {
    const settings = this.db.prepare(`
      SELECT
        DeviceId,
        DeviceName,
        ShareEnabled,
        Port,
        Password
      FROM RemoteSetting
      WHERE Id = 1
    `).get() as RemoteSettingRow | undefined

    if (settings) {
      return this.toRemoteShareSettings(settings)
    }

    const deviceId = randomUUID()
    const deviceName = process.env.COMPUTERNAME || process.env.HOSTNAME || 'Simple Melody Player'
    const password = randomUUID().replaceAll('-', '').slice(0, 20)
    this.db.prepare(`
      INSERT INTO RemoteSetting (Id, DeviceId, DeviceName, ShareEnabled, Port, Password)
      VALUES (1, ?, ?, 0, 8023, ?)
    `).run(deviceId, deviceName, password)

    return {
      deviceId,
      deviceName,
      shareEnabled: false,
      port: 8023,
      password,
    }
  }

  updateRemoteShareSettings(update: RemoteShareSettingsUpdate): RemoteShareSettings {
    const settings = this.getRemoteShareSettings()
    this.db.prepare(`
      UPDATE RemoteSetting
      SET
        DeviceName = ?,
        ShareEnabled = ?,
        Port = ?,
        Password = ?
      WHERE Id = 1
    `).run(
      update.deviceName ?? settings.deviceName,
      Number(update.shareEnabled ?? settings.shareEnabled),
      update.port ?? settings.port,
      update.password ?? settings.password,
    )

    if (update.password !== undefined) {
      this.db.prepare(`
        UPDATE AuthorizedDevice
        SET State = ?, UpdateTime = ?
        WHERE State = ?
      `).run(ACTIVE_STATE.inactive, this.getCurrentIsoTime(), ACTIVE_STATE.active)
    }

    return this.getRemoteShareSettings()
  }

  getAuthorizedDevices(): AuthorizedDevice[] {
    return (this.db.prepare(`
      SELECT
        Id,
        DeviceId,
        DeviceName,
        Platform,
        Browser,
        Ip,
        Auth,
        CreateTime,
        UpdateTime,
        LastSeenTime
      FROM AuthorizedDevice
      WHERE State = ?
      ORDER BY datetime(LastSeenTime) DESC, Id DESC
    `).all(ACTIVE_STATE.active) as unknown as AuthorizedDeviceRow[]).map((row) => this.toAuthorizedDevice(row))
  }

  updateAuthorizedDevice(deviceId: number, update: { deviceName?: string; auth?: AuthorizedDeviceAuth }) {
    const current = this.db.prepare(`
      SELECT
        DeviceName,
        Auth
      FROM AuthorizedDevice
      WHERE Id = ?
        AND State = ?
    `).get(deviceId, ACTIVE_STATE.active) as { DeviceName: string; Auth: number }

    this.db.prepare(`
      UPDATE AuthorizedDevice
      SET
        DeviceName = ?,
        Auth = ?,
        UpdateTime = ?
      WHERE Id = ?
    `).run(
      update.deviceName ?? current.DeviceName,
      update.auth === undefined ? current.Auth : this.toAuthorizedDeviceAuthValue(update.auth),
      this.getCurrentIsoTime(),
      deviceId,
    )
  }

  deleteAuthorizedDevice(deviceId: number) {
    this.db.prepare(`
      UPDATE AuthorizedDevice
      SET
        State = ?,
        UpdateTime = ?
      WHERE Id = ?
    `).run(ACTIVE_STATE.inactive, this.getCurrentIsoTime(), deviceId)
  }

  getRemoteHosts(): RemoteHost[] {
    return (this.db.prepare(`
      SELECT
        Id,
        HostId,
        Name,
        BaseUrl,
        Platform,
        CreateTime,
        UpdateTime,
        LastConnectedTime
      FROM RemoteHost
      WHERE State = ?
      ORDER BY datetime(LastConnectedTime) DESC, Id DESC
    `).all(ACTIVE_STATE.active) as unknown as RemoteHostRow[]).map((row) => this.toRemoteHost(row))
  }

  saveRemoteHost(host: {
    hostId: string
    name: string
    baseUrl: string
    platform: string
    token: string
  }): RemoteHost {
    const now = this.getCurrentIsoTime()
    const existing = this.db.prepare(`
      SELECT Id
      FROM RemoteHost
      WHERE HostId = ?
      LIMIT 1
    `).get(host.hostId) as { Id: number } | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE RemoteHost
        SET
          Name = ?,
          BaseUrl = ?,
          Platform = ?,
          Token = ?,
          State = ?,
          UpdateTime = ?,
          LastConnectedTime = ?
        WHERE Id = ?
      `).run(
        host.name,
        host.baseUrl,
        host.platform,
        host.token,
        ACTIVE_STATE.active,
        now,
        now,
        existing.Id,
      )
    } else {
      this.db.prepare(`
        INSERT INTO RemoteHost (
          HostId,
          Name,
          BaseUrl,
          Platform,
          Token,
          State,
          CreateTime,
          UpdateTime,
          LastConnectedTime
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        host.hostId,
        host.name,
        host.baseUrl,
        host.platform,
        host.token,
        ACTIVE_STATE.active,
        now,
        now,
        now,
      )
    }

    return this.getRemoteHostByHostId(host.hostId)
  }

  deleteRemoteHost(hostId: number) {
    this.db.prepare(`
      UPDATE RemoteHost
      SET
        State = ?,
        UpdateTime = ?
      WHERE Id = ?
    `).run(ACTIVE_STATE.inactive, this.getCurrentIsoTime(), hostId)
  }

  getRemoteHostConnection(hostId: number) {
    const row = this.db.prepare(`
      SELECT
        Id,
        HostId,
        Name,
        BaseUrl,
        Platform,
        Token,
        CreateTime,
        UpdateTime,
        LastConnectedTime
      FROM RemoteHost
      WHERE Id = ?
        AND State = ?
      LIMIT 1
    `).get(hostId, ACTIVE_STATE.active) as unknown as RemoteHostConnectionRow

    return {
      host: this.toRemoteHost(row),
      token: row.Token,
    }
  }

  isRemoteDeviceBlocked(deviceId: string, ip: string) {
    const row = this.db.prepare(`
      SELECT Auth
      FROM AuthorizedDevice
      WHERE State = ?
        AND Auth = 0
        AND (DeviceId = ? OR Ip = ?)
      LIMIT 1
    `).get(ACTIVE_STATE.active, deviceId, ip) as { Auth: number } | undefined

    return row !== undefined
  }

  authorizeRemoteDevice(device: {
    deviceId: string
    deviceName: string
    platform: string
    browser: string
    ip: string
    tokenHash: string
  }) {
    const now = this.getCurrentIsoTime()
    const existing = device.deviceId
      ? this.db.prepare(`
          SELECT Id, Auth
          FROM AuthorizedDevice
          WHERE DeviceId = ?
            AND State = ?
          LIMIT 1
        `).get(device.deviceId, ACTIVE_STATE.active) as { Id: number; Auth: number } | undefined
      : undefined

    if (existing) {
      this.db.prepare(`
        UPDATE AuthorizedDevice
        SET
          DeviceName = ?,
          Platform = ?,
          Browser = ?,
          Ip = ?,
          TokenHash = ?,
          UpdateTime = ?,
          LastSeenTime = ?
        WHERE Id = ?
      `).run(
        device.deviceName,
        device.platform,
        device.browser,
        device.ip,
        device.tokenHash,
        now,
        now,
        existing.Id,
      )
      return existing.Auth === 1
    }

    this.db.prepare(`
      INSERT INTO AuthorizedDevice (
        DeviceId,
        DeviceName,
        Platform,
        Browser,
        Ip,
        TokenHash,
        Auth,
        State,
        CreateTime,
        UpdateTime,
        LastSeenTime
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      device.deviceId,
      device.deviceName,
      device.platform,
      device.browser,
      device.ip,
      device.tokenHash,
      ACTIVE_STATE.active,
      now,
      now,
      now,
    )

    return true
  }

  touchAuthorizedDeviceByTokenHash(tokenHash: string) {
    const row = this.db.prepare(`
      SELECT Id
      FROM AuthorizedDevice
      WHERE TokenHash = ?
        AND State = ?
        AND Auth = 1
      LIMIT 1
    `).get(tokenHash, ACTIVE_STATE.active) as { Id: number } | undefined

    if (!row) {
      return false
    }

    this.db.prepare(`
      UPDATE AuthorizedDevice
      SET LastSeenTime = ?
      WHERE Id = ?
    `).run(this.getCurrentIsoTime(), row.Id)

    return true
  }

  private getRemoteHostByHostId(hostId: string): RemoteHost {
    const row = this.db.prepare(`
      SELECT
        Id,
        HostId,
        Name,
        BaseUrl,
        Platform,
        CreateTime,
        UpdateTime,
        LastConnectedTime
      FROM RemoteHost
      WHERE HostId = ?
        AND State = ?
      LIMIT 1
    `).get(hostId, ACTIVE_STATE.active) as unknown as RemoteHostRow

    return this.toRemoteHost(row)
  }

  private toRemoteShareSettings(row: RemoteSettingRow): RemoteShareSettings {
    return {
      deviceId: row.DeviceId,
      deviceName: row.DeviceName,
      shareEnabled: Boolean(row.ShareEnabled),
      port: row.Port,
      password: row.Password,
    }
  }

  private toAuthorizedDevice(row: AuthorizedDeviceRow): AuthorizedDevice {
    return {
      id: row.Id,
      deviceId: row.DeviceId,
      deviceName: row.DeviceName,
      platform: row.Platform,
      browser: row.Browser,
      ip: row.Ip,
      auth: row.Auth === 1 ? 'allowed' : 'blocked',
      createdAt: this.normalizeStoredDate(row.CreateTime),
      updatedAt: this.normalizeStoredDate(row.UpdateTime),
      lastSeenAt: this.normalizeStoredDate(row.LastSeenTime),
    }
  }

  private toRemoteHost(row: RemoteHostRow): RemoteHost {
    return {
      id: row.Id,
      hostId: row.HostId,
      name: row.Name,
      baseUrl: row.BaseUrl,
      platform: row.Platform,
      createdAt: this.normalizeStoredDate(row.CreateTime),
      updatedAt: this.normalizeStoredDate(row.UpdateTime),
      lastConnectedAt: this.normalizeStoredDate(row.LastConnectedTime),
    }
  }

  private toAuthorizedDeviceAuthValue(auth: AuthorizedDeviceAuth) {
    return auth === 'allowed' ? 1 : 0
  }

  private getCurrentIsoTime() {
    return new Date().toISOString()
  }

  private normalizeStoredDate(value: unknown) {
    if (typeof value === 'string') {
      const normalized = value.trim()

      if (!normalized) {
        return ''
      }

      if (/^\d{15,}$/.test(normalized)) {
        return this.dotNetTicksToIso(normalized)
      }

      return normalized
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ''
      }

      if (value > 10_000_000_000_000) {
        return this.dotNetTicksToIso(Math.trunc(value).toString())
      }

      return new Date(value).toISOString()
    }

    if (typeof value === 'bigint') {
      return this.dotNetTicksToIso(value.toString())
    }

    return ''
  }

  private dotNetTicksToIso(rawTicks: string) {
    try {
      const ticks = BigInt(rawTicks)
      const unixEpochTicks = 621_355_968_000_000_000n
      const milliseconds = (ticks - unixEpochTicks) / 10_000n

      if (
        milliseconds < BigInt(Number.MIN_SAFE_INTEGER) ||
        milliseconds > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return rawTicks
      }

      const date = new Date(Number(milliseconds))

      if (Number.isNaN(date.getTime())) {
        return rawTicks
      }

      return date.toISOString()
    } catch {
      return rawTicks
    }
  }
}
