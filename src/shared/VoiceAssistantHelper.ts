import type { PreferredLanguage } from './contracts'
import { VoiceAssistantChineseHelper } from './VoiceAssistantChineseHelper'
import { VoiceAssistantEnglishHelper } from './VoiceAssistantEnglishHelper'

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
    const handler = VoiceAssistantHelper.isChinese(language)
      ? new VoiceAssistantChineseHelper()
      : new VoiceAssistantEnglishHelper()

    return handler.handle(text.trim())
  }

  static isChinese(language: PreferredLanguage) {
    return language === 'zh-CN' || (language === 'system' && navigator.language.toLocaleLowerCase().startsWith('zh'))
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
