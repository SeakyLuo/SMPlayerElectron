import type { ExternalAppCommand, GlobalMediaCommand, TrayCommand } from '../../src/shared/contracts'

const protocol = 'smplayer:'
const globalMediaCommands = new Set<GlobalMediaCommand>(['play-pause', 'next', 'previous', 'stop'])
const trayCommands = new Set<TrayCommand>(['quick-play', 'show-window', 'toggle-desktop-lyrics'])

export function extractExternalCommandUrls(argv: string[]) {
  return argv.filter((value) => value.startsWith('smplayer://') || value.startsWith('smplayer:'))
}

export function parseExternalCommandUrl(rawUrl: string): ExternalAppCommand | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== protocol) {
    return null
  }

  if (url.hostname === 'voice-command') {
    const text = decodeCommandPath(url) || url.searchParams.get('text')?.trim() || ''
    return text ? { type: 'voice-command', text } : null
  }

  if (url.hostname === 'command') {
    return parseNamedCommand(decodeCommandPath(url) || url.searchParams.get('name') || '')
  }

  return parseNamedCommand(url.hostname || decodeCommandPath(url))
}

function decodeCommandPath(url: URL) {
  try {
    return decodeURIComponent(url.pathname.replace(/^\/+/, '')).trim()
  } catch {
    return ''
  }
}

function parseNamedCommand(command: string): ExternalAppCommand | null {
  const normalizedCommand = command.trim()
  if (globalMediaCommands.has(normalizedCommand as GlobalMediaCommand)) {
    return { type: 'global-media-command', command: normalizedCommand as GlobalMediaCommand }
  }

  if (trayCommands.has(normalizedCommand as TrayCommand)) {
    return { type: 'tray-command', command: normalizedCommand as TrayCommand }
  }

  return null
}
