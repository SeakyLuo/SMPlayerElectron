import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, release } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { app, ipcMain, type WebContents } from 'electron'

const APP_CENTER_APP_SECRET = '8e3ac143-15c7-472c-b089-74707d7605c7'
const APP_CENTER_INGESTION_URL = 'https://in.appcenter.ms/logs?Api-Version=1.0.0'
const APP_CENTER_SDK_VERSION = '1.0.0'
const APP_NAMESPACE = 'com.seaky.simplemelodyplayer'
const INSTALL_ID_FILE = 'app-center-install-id'
const MAX_REPORTED_ISSUE_KEYS = 200
const appLaunchTimestamp = new Date().toISOString()

interface RendererErrorPayload {
  type: string
  message: string
  stackTrace: string
  source: string
  line: number
  column: number
}

interface AppCenterException {
  type: string
  message?: string
  stackTrace?: string
}

interface AppCenterReportOptions {
  fatal: boolean
  processName: string
  exception: AppCenterException
}

const reportedIssueKeys = new Set<string>()

export function registerAppCenterCrashReporting() {
  process.on('uncaughtException', (error) => {
    void reportAppCenterError({
      fatal: true,
      processName: app.getName(),
      exception: exceptionFromUnknown(error, 'uncaughtException'),
    }).finally(() => {
      app.exit(1)
    })
  })

  process.on('unhandledRejection', (reason) => {
    void reportAppCenterError({
      fatal: false,
      processName: app.getName(),
      exception: exceptionFromUnknown(reason, 'unhandledRejection'),
    })
  })

  ipcMain.on('app-center:renderer-issue', (_event, payload: RendererErrorPayload) => {
    reportRendererIssue(payload)
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    void reportAppCenterError({
      fatal: details.reason === 'crashed' || details.reason === 'oom',
      processName: getRendererProcessName(webContents),
      exception: {
        type: 'RenderProcessGone',
        message: details.reason,
        stackTrace: `exitCode=${details.exitCode}`,
      },
    })
  })

  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') {
      return
    }

    void reportAppCenterError({
      fatal: details.reason === 'crashed' || details.reason === 'oom' || details.reason === 'launch-failed',
      processName: `${app.getName()} ${details.type}`,
      exception: {
        type: 'ChildProcessGone',
        message: [details.reason, details.name ?? '', details.serviceName ?? ''].filter(Boolean).join('\n'),
        stackTrace: `exitCode=${details.exitCode}`,
      },
    })
  })

  app.on('web-contents-created', (_event, webContents) => {
    registerWebContentsDiagnostics(webContents)
  })
}

async function reportAppCenterError(options: AppCenterReportOptions) {
  const abortController = new AbortController()
  const abortTimeout = setTimeout(() => {
    abortController.abort()
  }, 5000)

  try {
    const installId = getInstallId()
    const timestamp = new Date().toISOString()
    await fetch(APP_CENTER_INGESTION_URL, {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'App-Secret': APP_CENTER_APP_SECRET,
        'Install-ID': installId,
      },
      body: JSON.stringify({
        logs: [
          {
            type: 'managedError',
            id: randomUUID(),
            timestamp,
            appLaunchTimestamp,
            fatal: options.fatal,
            processId: process.pid,
            processName: options.processName,
            architecture: arch(),
            sid: randomUUID(),
            device: {
              appVersion: app.getVersion(),
              appBuild: app.getVersion(),
              appNamespace: APP_NAMESPACE,
              sdkName: 'appcenter.custom',
              sdkVersion: APP_CENTER_SDK_VERSION,
              osName: process.platform === 'win32' ? 'WINDOWS' : process.platform,
              osVersion: release(),
              locale: app.getLocale(),
              timeZoneOffset: -new Date().getTimezoneOffset(),
            },
            exception: options.exception,
          },
        ],
      }),
    }).catch(() => {})
  } catch {
    // Crash reporting must never create another crash path.
  } finally {
    clearTimeout(abortTimeout)
  }
}

function getInstallId() {
  const installIdPath = join(app.getPath('userData'), INSTALL_ID_FILE)
  if (existsSync(installIdPath)) {
    return readFileSync(installIdPath, 'utf8').trim()
  }

  const installId = randomUUID()
  writeFileSync(installIdPath, installId, 'utf8')
  return installId
}

function exceptionFromUnknown(value: unknown, fallbackType: string): AppCenterException {
  if (value instanceof Error) {
    return {
      type: value.name || fallbackType,
      message: value.message,
      stackTrace: value.stack,
    }
  }

  return {
    type: fallbackType,
    message: String(value),
  }
}

function buildRendererMessage(payload: RendererErrorPayload) {
  return [
    payload.message,
    payload.source ? `source=${payload.source}` : '',
    payload.line > 0 ? `line=${payload.line}` : '',
    payload.column > 0 ? `column=${payload.column}` : '',
  ].filter(Boolean).join('\n')
}

function reportRendererIssue(payload: RendererErrorPayload) {
  const issueKey = [
    payload.type,
    payload.message,
    payload.source,
    payload.line,
    payload.column,
  ].join('|')

  if (reportedIssueKeys.has(issueKey)) {
    return
  }
  if (reportedIssueKeys.size >= MAX_REPORTED_ISSUE_KEYS) {
    return
  }
  reportedIssueKeys.add(issueKey)

  void reportAppCenterError({
    fatal: false,
    processName: `${app.getName()} renderer`,
    exception: {
      type: payload.type,
      message: buildRendererMessage(payload),
      stackTrace: payload.stackTrace,
    },
  })
}

function registerWebContentsDiagnostics(webContents: WebContents) {
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (errorCode === -3) {
      return
    }

    void reportAppCenterError({
      fatal: isMainFrame,
      processName: getRendererProcessName(webContents),
      exception: {
        type: 'RendererLoadFailure',
        message: [
          errorDescription,
          `url=${validatedURL}`,
          `isMainFrame=${isMainFrame}`,
        ].join('\n'),
        stackTrace: `errorCode=${errorCode}`,
      },
    })
  })

  webContents.on('unresponsive', () => {
    void reportAppCenterError({
      fatal: false,
      processName: getRendererProcessName(webContents),
      exception: {
        type: 'RendererUnresponsive',
        message: webContents.getURL(),
      },
    })
  })
}

function getRendererProcessName(webContents: WebContents) {
  const title = webContents.getTitle()
  return title ? `${app.getName()} ${title}` : `${app.getName()} renderer`
}
