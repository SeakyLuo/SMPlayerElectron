import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { AuthorizedDevice, RemoteHost, RemoteShareStatus } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { Icon } from './icons'

function getPrimaryAddress(status: RemoteShareStatus) {
  return status.addresses[0] ?? ''
}

export function RemoteShareDialog({
  t,
  onClose,
}: {
  t: Translator
  onClose: () => void
}) {
  const [status, setStatus] = useState<RemoteShareStatus | null>(null)
  const [devices, setDevices] = useState<AuthorizedDevice[]>([])
  const [remoteHosts, setRemoteHosts] = useState<RemoteHost[]>([])
  const [password, setPassword] = useState('')
  const [remoteAddress, setRemoteAddress] = useState('')
  const [remotePassword, setRemotePassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    const nextStatus = await window.smplayer!.getRemoteShareStatus()
    const nextDevices = await window.smplayer!.getAuthorizedDevices()
    const nextRemoteHosts = await window.smplayer!.getRemoteHosts()
    setStatus(nextStatus)
    setPassword(nextStatus.password)
    setDevices(nextDevices)
    setRemoteHosts(nextRemoteHosts)
  }

  useEffect(() => {
    void load()
  }, [])

  const updateStatus = async (nextStatus: RemoteShareStatus) => {
    setStatus(nextStatus)
    setPassword(nextStatus.password)
    setDevices(await window.smplayer!.getAuthorizedDevices())
    setRemoteHosts(await window.smplayer!.getRemoteHosts())
  }

  const toggleShare = async () => {
    setMessage('')
    await updateStatus(status!.running
      ? await window.smplayer!.stopRemoteShare()
      : await window.smplayer!.startRemoteShare())
  }

  const savePassword = async () => {
    const nextPassword = password.trim()
    if (!/^[a-zA-Z0-9]{4,30}$/.test(nextPassword)) {
      setMessage(t('remoteShare.passwordInvalid'))
      return
    }

    await updateStatus(await window.smplayer!.updateRemoteShareSettings({ password: nextPassword }))
    setMessage(t('remoteShare.passwordSaved'))
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(getPrimaryAddress(status!))
    setMessage(t('common.copied'))
  }

  const connectHost = async () => {
    setMessage('')
    setConnecting(true)
    try {
      const result = await window.smplayer!.connectRemoteHost({
        baseUrl: remoteAddress,
        password: remotePassword,
      })
      setRemoteAddress('')
      setRemotePassword('')
      setRemoteHosts(await window.smplayer!.getRemoteHosts())
      setMessage(t('remoteShare.connected', { name: result.host.name, count: result.songCount }))
    } catch {
      setMessage(t('remoteShare.connectFailed'))
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="settings-modal-backdrop" role="presentation">
      <section className="settings-modal remote-share-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-share-title">
        <header>
          <div>
            <h2 id="remote-share-title">{t('remoteShare.title')}</h2>
            <p>{t('remoteShare.description')}</p>
          </div>
          <button type="button" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        {status ? (
          <div className="remote-share-body">
            <section className="remote-share-section">
              <div className="remote-share-status-row">
                <div>
                  <strong>{status.running ? t('remoteShare.running') : t('remoteShare.stopped')}</strong>
                  <span>{status.deviceName}</span>
                </div>
                <button className="input-dialog-primary" type="button" onClick={toggleShare}>
                  {status.running ? t('remoteShare.stop') : t('remoteShare.start')}
                </button>
              </div>
              {status.running ? (
                <div className="remote-share-address">
                  <span>{getPrimaryAddress(status)}</span>
                  <button type="button" onClick={copyAddress}>
                    <Icon name="copy" />
                    {t('common.copy')}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="remote-share-section">
              <label className="remote-share-field">
                <span>{t('remoteShare.password')}</span>
                <input
                  type="text"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    setMessage('')
                  }}
                />
              </label>
              <button type="button" onClick={savePassword}>
                {t('remoteShare.savePassword')}
              </button>
            </section>

            <section className="remote-share-section">
              <h4>{t('remoteShare.connectedDevices')}</h4>
              <div className="remote-share-connect-grid">
                <label className="remote-share-field">
                  <span>{t('remoteShare.remoteAddress')}</span>
                  <input
                    type="text"
                    value={remoteAddress}
                    placeholder="192.168.1.2:8023"
                    onChange={(event) => {
                      setRemoteAddress(event.currentTarget.value)
                      setMessage('')
                    }}
                  />
                </label>
                <label className="remote-share-field">
                  <span>{t('remoteShare.remotePassword')}</span>
                  <input
                    type="text"
                    value={remotePassword}
                    onChange={(event) => {
                      setRemotePassword(event.currentTarget.value)
                      setMessage('')
                    }}
                  />
                </label>
                <button type="button" disabled={connecting || !remoteAddress.trim() || !remotePassword.trim()} onClick={connectHost}>
                  {connecting ? t('remoteShare.connecting') : t('remoteShare.connect')}
                </button>
              </div>
              {remoteHosts.length === 0 ? (
                <p className="remote-share-muted">{t('remoteShare.noConnectedDevices')}</p>
              ) : (
                <div className="remote-share-device-list">
                  {remoteHosts.map((host) => (
                    <div className="remote-share-device" key={host.id}>
                      <div>
                        <strong>{host.name}</strong>
                        <span>{host.baseUrl}</span>
                      </div>
                      <Link className="remote-share-device-link" to={`/remote/${host.id}`}>
                        {t('remoteShare.openLibrary')}
                      </Link>
                      <button
                        type="button"
                        onClick={async () => {
                          await window.smplayer!.deleteRemoteHost(host.id)
                          setRemoteHosts(await window.smplayer!.getRemoteHosts())
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="remote-share-section">
              <h4>{t('remoteShare.authorizedDevices')}</h4>
              {devices.length === 0 ? (
                <p className="remote-share-muted">{t('remoteShare.noAuthorizedDevices')}</p>
              ) : (
                <div className="remote-share-device-list">
                  {devices.map((device) => (
                    <div className={device.auth === 'blocked' ? 'remote-share-device is-blocked' : 'remote-share-device'} key={device.id}>
                      <div>
                        <strong>{device.deviceName || device.ip}</strong>
                        <span>{device.deviceName ? device.ip : t('remoteShare.unnamedDevice')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await window.smplayer!.updateAuthorizedDevice(device.id, {
                            auth: device.auth === 'blocked' ? 'allowed' : 'blocked',
                          })
                          setDevices(await window.smplayer!.getAuthorizedDevices())
                        }}
                      >
                        {device.auth === 'blocked' ? t('remoteShare.allowDevice') : t('remoteShare.blockDevice')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await window.smplayer!.deleteAuthorizedDevice(device.id)
                          setDevices(await window.smplayer!.getAuthorizedDevices())
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {message ? <p className="remote-share-message">{message}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
