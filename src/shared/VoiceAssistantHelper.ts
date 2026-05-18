import type { PreferredLanguage } from './contracts'
import { resolveLocale } from './i18n'
import { VoiceAssistantChineseHelper } from './VoiceAssistantChineseHelper'
import { VoiceAssistantEnglishHelper } from './VoiceAssistantEnglishHelper'
import { isLocalizedVoiceAssistantLocale, VoiceAssistantLocalizedHelper } from './VoiceAssistantLocalizedHelper'

export const MatchType = {
  Play: 'Play',
  PlayMusic: 'PlayMusic',
  PlayArtist: 'PlayArtist',
  PlayAlbum: 'PlayAlbum',
  PlayPlaylist: 'PlayPlaylist',
  PlayFolder: 'PlayFolder',
  SearchAndPlay: 'SearchAndPlay',
  QuickPlay: 'QuickPlay',
  PlayByArtistOrMusic: 'PlayByArtistOrMusic',
  PlayByArtist: 'PlayByArtist',
  PlayByArtistAndMusic: 'PlayByArtistAndMusic',
  PlayByArtistAndAlbum: 'PlayByArtistAndAlbum',
  PlayMusicIn: 'PlayMusicIn',
  PlayMusicInAlbum: 'PlayMusicInAlbum',
  PlayMusicInFolder: 'PlayMusicInFolder',
  PlayMusicInPlaylist: 'PlayMusicInPlaylist',
  Pause: 'Pause',
  Previous: 'Previous',
  Next: 'Next',
  ChangeVolume: 'ChangeVolume',
  Search: 'Search',
  Mute: 'Mute',
  UnMute: 'UnMute',
  Help: 'Help',
  MatchNone: 'MatchNone',
  Nothing: 'Nothing',
} as const

export type MatchType = typeof MatchType[keyof typeof MatchType]

export interface CommandResult {
  type: MatchType
  param?: string | ByArtistRequest | VolumeRequest
}

export interface VolumeRequest {
  to: boolean
  turnUp: boolean
  percentage: boolean
  value: number
}

export class ByArtistRequest {
  artist: string
  item: string
  original: string

  constructor(original: string, splitter: string) {
    const index = original.indexOf(splitter)
    this.artist = original.slice(0, index).trim()
    this.item = original.slice(index + splitter.length).trim()
    this.original = original.trim()
  }
}

export interface IVoiceAssistantCommandHandler {
  handle(text: string): CommandResult
}

export class VoiceAssistantHelper {
  static readonly option = 'i'

  static handle(text: string, language: PreferredLanguage): CommandResult {
    const locale = resolveLocale(language)
    if (locale.startsWith('zh')) {
      return new VoiceAssistantChineseHelper().handle(text.trim())
    }

    if (isLocalizedVoiceAssistantLocale(locale)) {
      const localizedCommand = new VoiceAssistantLocalizedHelper(locale).handle(text.trim())
      return localizedCommand.type === MatchType.MatchNone
        ? new VoiceAssistantEnglishHelper().handle(text.trim())
        : localizedCommand
    }

    return new VoiceAssistantEnglishHelper().handle(text.trim())
  }

  static isChinese(language: PreferredLanguage) {
    return resolveLocale(language).startsWith('zh')
  }

  static fractionToDouble(fraction: string) {
    const [left, right] = fraction.split('/').map(Number)
    return left / right
  }

  static getValue(text: string, pattern: RegExp) {
    return pattern.exec(text)?.[0].trim() ?? ''
  }

  static matchValue(text: string, pattern: RegExp) {
    return pattern.exec(text)?.[0].trim() ?? null
  }
}
