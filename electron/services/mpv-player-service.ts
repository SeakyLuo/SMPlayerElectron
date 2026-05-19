import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection, type Socket } from 'node:net'

import { app, type BrowserWindow } from 'electron'

import type { MpvPlaybackEvent, MpvPlaybackLoadRequest, MpvPlaybackState } from '../../src/shared/mpvPlayback.ts'
import type { SongService } from './song-service.ts'

interface MpvIpcMessage {
  event?: string
  request_id?: number
  error?: string
  data?: unknown
  name?: string
  reason?: string
}

interface PendingMpvCommand {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface MpvPlayerServiceOptions {
  getSongService: () => SongService
  getWindow: () => BrowserWindow | null
}

const MPV_PIPE_RETRY_COUNT = 50
const MPV_PIPE_RETRY_DELAY_MS = 100
const MPV_TIME_UPDATE_INTERVAL_MS = 250

export class MpvPlayerService {
  private readonly getSongService: () => SongService
  private readonly getWindow: () => BrowserWindow | null
  private process: ChildProcessWithoutNullStreams | null = null
  private socket: Socket | null = null
  private startRequest: Promise<void> | null = null
  private readBuffer = ''
  private nextRequestId = 1
  private pendingCommands = new Map<number, PendingMpvCommand>()
  private lastTimeUpdateSentAt = 0
  private autoplayAfterLoad = false
  private playingEventSent = false
  private state: MpvPlaybackState = {
    songId: null,
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
  }

  constructor(options: MpvPlayerServiceOptions) {
    this.getSongService = options.getSongService
    this.getWindow = options.getWindow
  }

  async loadSong(request: MpvPlaybackLoadRequest) {
    await this.ensureStarted()
    const filePath = this.getSongService().getSongPath(request.songId)
    this.autoplayAfterLoad = request.autoplay
    this.playingEventSent = false
    this.state = {
      songId: request.songId,
      currentTime: 0,
      duration: 0,
      paused: true,
      ended: false,
    }

    await this.command(['set_property', 'pause', true])
    await this.command(['set_property', 'volume', Math.min(100, Math.max(0, request.volume))])
    await this.command(['set_property', 'mute', request.muted])
    await this.command(['loadfile', filePath, 'replace'])
  }

  async play() {
    await this.ensureStarted()
    await this.command(['set_property', 'pause', false])
  }

  async pause() {
    await this.ensureStarted()
    await this.command(['set_property', 'pause', true])
  }

  async seek(seconds: number) {
    await this.ensureStarted()
    this.playingEventSent = false
    this.state.currentTime = seconds
    this.sendEvent({ type: 'seeking', songId: this.state.songId, currentTime: seconds })
    await this.command(['seek', seconds, 'absolute', 'exact'])
    this.state.currentTime = seconds
    this.sendEvent({ type: 'seeked', songId: this.state.songId, currentTime: seconds })
  }

  async setVolume(volume: number) {
    await this.ensureStarted()
    await this.command(['set_property', 'volume', Math.min(100, Math.max(0, volume))])
  }

  async setMuted(muted: boolean) {
    await this.ensureStarted()
    await this.command(['set_property', 'mute', muted])
  }

  async stop() {
    await this.ensureStarted()
    await this.command(['stop'])
    this.state = {
      songId: null,
      currentTime: 0,
      duration: 0,
      paused: true,
      ended: false,
    }
    this.autoplayAfterLoad = false
    this.playingEventSent = false
  }

  getState() {
    return this.state
  }

  close() {
    this.rejectPendingCommands(new Error('mpv closed.'))
    this.socket?.destroy()
    this.socket = null
    this.process?.kill()
    this.process = null
    this.startRequest = null
  }

  private async ensureStarted() {
    if (this.socket && !this.socket.destroyed) {
      return
    }

    this.startRequest ??= this.start()
    try {
      await this.startRequest
    } catch (error) {
      this.startRequest = null
      throw error
    }
  }

  private async start() {
    const mpvPath = this.getMpvPath()
    const pipePath = this.getPipePath()
    this.process = spawn(mpvPath, [
      '--idle=yes',
      '--no-terminal',
      '--force-window=no',
      '--no-video',
      '--audio-display=no',
      '--keep-open=no',
      '--gapless-audio=yes',
      `--input-ipc-server=${pipePath}`,
    ], {
      windowsHide: true,
    })

    this.process.stdout.on('data', () => undefined)
    this.process.stderr.on('data', () => undefined)
    this.process.once('error', (error) => {
      this.rejectPendingCommands(error)
      this.sendEvent({ type: 'error', songId: this.state.songId, message: error.message })
    })
    this.process.once('exit', () => {
      this.socket?.destroy()
      this.socket = null
      this.process = null
      this.startRequest = null
      this.rejectPendingCommands(new Error('mpv exited.'))
    })

    this.socket = await this.connectPipe(pipePath)
    this.socket.on('data', (chunk) => {
      this.handleData(chunk.toString('utf8'))
    })
    this.socket.on('error', (error) => {
      this.rejectPendingCommands(error)
      this.sendEvent({ type: 'error', songId: this.state.songId, message: error.message })
    })
    this.socket.once('close', () => {
      this.socket = null
      this.rejectPendingCommands(new Error('mpv IPC closed.'))
    })

    await Promise.all([
      this.command(['observe_property', 1, 'time-pos']),
      this.command(['observe_property', 2, 'duration']),
      this.command(['observe_property', 3, 'pause']),
      this.command(['observe_property', 4, 'idle-active']),
    ])
  }

  private getMpvPath() {
    const packagedPath = join(process.resourcesPath, 'mpv', 'mpv.exe')
    const developmentPath = join(process.cwd(), 'vendor', 'mpv', 'mpv.exe')
    const configuredPath = process.env.SMPLAYER_MPV_PATH

    if (configuredPath) {
      return configuredPath
    }

    if (app.isPackaged && existsSync(packagedPath)) {
      return packagedPath
    }

    if (existsSync(developmentPath)) {
      return developmentPath
    }

    return 'mpv.exe'
  }

  private getPipePath() {
    const name = `smplayer-mpv-${process.pid}-${Date.now()}`
    return process.platform === 'win32'
      ? `\\\\.\\pipe\\${name}`
      : join(tmpdir(), name)
  }

  private async connectPipe(pipePath: string) {
    for (let attempt = 0; attempt < MPV_PIPE_RETRY_COUNT; attempt += 1) {
      try {
        return await new Promise<Socket>((resolve, reject) => {
          const socket = createConnection(pipePath, () => {
            socket.off('error', reject)
            resolve(socket)
          })
          socket.once('error', reject)
        })
      } catch {
        await new Promise((resolve) => setTimeout(resolve, MPV_PIPE_RETRY_DELAY_MS))
      }
    }

    throw new Error('Unable to connect to mpv IPC.')
  }

  private command(command: unknown[]) {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error('mpv IPC is not connected.'))
    }

    const requestId = this.nextRequestId
    this.nextRequestId += 1

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(requestId, { resolve, reject })
      this.socket!.write(`${JSON.stringify({ command, request_id: requestId })}\n`, 'utf8')
    })
  }

  private handleData(chunk: string) {
    this.readBuffer += chunk
    for (;;) {
      const lineEndIndex = this.readBuffer.indexOf('\n')
      if (lineEndIndex < 0) {
        return
      }

      const line = this.readBuffer.slice(0, lineEndIndex).trim()
      this.readBuffer = this.readBuffer.slice(lineEndIndex + 1)
      if (!line) {
        continue
      }

      try {
        this.handleMessage(JSON.parse(line) as MpvIpcMessage)
      } catch {
        // Ignore malformed mpv IPC lines.
      }
    }
  }

  private handleMessage(message: MpvIpcMessage) {
    if (message.request_id !== undefined) {
      const pendingCommand = this.pendingCommands.get(message.request_id)
      if (pendingCommand) {
        this.pendingCommands.delete(message.request_id)
        if (message.error && message.error !== 'success') {
          pendingCommand.reject(new Error(message.error))
        } else {
          pendingCommand.resolve(message.data)
        }
      }
    }

    if (message.event === 'property-change') {
      this.handlePropertyChange(message)
      return
    }

    if (message.event === 'file-loaded') {
      void this.handleFileLoaded()
      return
    }

    if (message.event === 'playback-restart') {
      this.state.ended = false
      if (!this.state.paused) {
        this.sendPlayingEvent()
      }
      return
    }

    if (message.event === 'end-file') {
      this.handleEndFile(message)
    }
  }

  private handlePropertyChange(message: MpvIpcMessage) {
    if (message.name === 'time-pos' && typeof message.data === 'number') {
      this.state.currentTime = message.data
      if (!this.state.paused) {
        this.sendPlayingEvent()
      }
      const now = Date.now()
      if (now - this.lastTimeUpdateSentAt >= MPV_TIME_UPDATE_INTERVAL_MS) {
        this.lastTimeUpdateSentAt = now
        this.sendEvent({ type: 'timeupdate', songId: this.state.songId, currentTime: message.data })
      }
      return
    }

    if (message.name === 'duration' && typeof message.data === 'number') {
      this.state.duration = message.data
      this.sendEvent({ type: 'durationchange', songId: this.state.songId, duration: message.data })
      return
    }

    if (message.name === 'pause' && typeof message.data === 'boolean' && message.data !== this.state.paused) {
      this.state.paused = message.data
      if (message.data) {
        this.playingEventSent = false
      }
      this.sendEvent({ type: message.data ? 'pause' : 'play', songId: this.state.songId })
    }
  }

  private async handleFileLoaded() {
    const duration = await this.command(['get_property', 'duration']) as number | undefined
    this.state.duration = typeof duration === 'number' ? duration : 0
    this.state.currentTime = 0
    this.state.ended = false
    this.sendEvent({
      type: 'loadedmetadata',
      songId: this.state.songId!,
      duration: this.state.duration,
    })
    if (this.autoplayAfterLoad) {
      this.autoplayAfterLoad = false
      await this.command(['set_property', 'pause', false])
    }
  }

  private handleEndFile(message: MpvIpcMessage) {
    if (message.reason === 'eof') {
      this.state.ended = true
      this.state.paused = true
      this.playingEventSent = false
      this.sendEvent({ type: 'ended', songId: this.state.songId })
      return
    }

    if (message.reason === 'error') {
      this.sendEvent({ type: 'error', songId: this.state.songId, message: 'mpv playback failed.' })
    }
  }

  private sendEvent(event: MpvPlaybackEvent) {
    this.getWindow()?.webContents.send('playback:mpv-event', event)
  }

  private sendPlayingEvent() {
    if (this.playingEventSent) {
      return
    }

    this.playingEventSent = true
    this.sendEvent({ type: 'playing', songId: this.state.songId })
  }

  private rejectPendingCommands(error: Error) {
    for (const command of this.pendingCommands.values()) {
      command.reject(error)
    }
    this.pendingCommands.clear()
  }
}
