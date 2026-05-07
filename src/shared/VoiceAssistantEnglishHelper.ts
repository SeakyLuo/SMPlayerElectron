import {
  ByArtistRequest,
  MatchType,
  VoiceAssistantHelper,
  type CommandResult,
  type IVoiceAssistantCommandHandler,
  type VolumeRequest,
} from './VoiceAssistantHelper'

export class VoiceAssistantEnglishHelper implements IVoiceAssistantCommandHandler {
  handle(text: string): CommandResult {
    if (/^(?!play).*quick play/i.test(text) || /^(?!play).*(give|get).*(me)? some music/i.test(text)) {
      return { type: MatchType.QuickPlay }
    }

    if (/^play$/i.test(text)) {
      return { type: MatchType.Play }
    }

    if (/play/i.test(text)) {
      return this.handlePlayMusic(text)
    }

    if (/resume|continue/i.test(text)) {
      return { type: MatchType.Play }
    }

    if (/volume|sound|turn up|turn down/i.test(text)) {
      return { type: MatchType.ChangeVolume, param: this.handleVolume(text) }
    }

    if (/previous/i.test(text)) {
      return { type: MatchType.Previous }
    }

    if (/next/i.test(text)) {
      return { type: MatchType.Next }
    }

    if (/unmute/i.test(text)) {
      return { type: MatchType.UnMute }
    }

    if (/mute/i.test(text)) {
      return { type: MatchType.Mute }
    }

    if (/pause/i.test(text)) {
      return { type: MatchType.Pause }
    }

    if (/help/i.test(text)) {
      return { type: MatchType.Help }
    }

    if (/search/i.test(text)) {
      return { type: MatchType.Search, param: VoiceAssistantHelper.getValue(text, /(?<=search).+/) }
    }

    if (/nothing|never mind/i.test(text)) {
      return { type: MatchType.Nothing }
    }

    return { type: MatchType.MatchNone }
  }

  private handlePlayMusic(text: string): CommandResult {
    const playMusic = VoiceAssistantHelper.matchValue(text, /(?<=play .*music).*/i)
    if (playMusic != null) {
      const playMusicByArtist = VoiceAssistantHelper.matchValue(text, /(?<=play .*music).+ by .+/i)
      if (playMusicByArtist != null) {
        return { type: MatchType.PlayByArtistAndMusic, param: new ByArtistRequest(playMusicByArtist, ' by ') }
      }

      const playMusicIn = this.handlePlayMusicIn(text, 'play .*music')
      if (playMusicIn) {
        return playMusicIn
      }

      return { type: MatchType.PlayMusic, param: playMusic }
    }

    const playArtist = VoiceAssistantHelper.matchValue(text, /(?<=play .*(artist|musician|singer)).*/i)
    if (playArtist != null) {
      return { type: MatchType.PlayArtist, param: playArtist }
    }

    const playAlbum = VoiceAssistantHelper.matchValue(text, /(?<=play .*album).*/i)
    if (playAlbum != null) {
      const playAlbumByArtist = VoiceAssistantHelper.matchValue(text, /(?<=play .*album) .+ by .+/i)
      if (playAlbumByArtist != null) {
        return { type: MatchType.PlayByArtistAndAlbum, param: new ByArtistRequest(playAlbumByArtist, ' by ') }
      }

      return { type: MatchType.PlayAlbum, param: playAlbum }
    }

    const playPlaylist = VoiceAssistantHelper.matchValue(text, /(?<=play .*playlist).*/i)
    if (playPlaylist != null) {
      return { type: MatchType.PlayPlaylist, param: playPlaylist }
    }

    const playFolder = VoiceAssistantHelper.matchValue(text, /(?<=play .*folder).*/i)
    if (playFolder != null) {
      return { type: MatchType.PlayFolder, param: playFolder }
    }

    const playByArtist = VoiceAssistantHelper.matchValue(text, /(?<=play) .+ by .+/i)
    if (playByArtist != null) {
      return { type: MatchType.PlayByArtist, param: new ByArtistRequest(playByArtist, ' by ') }
    }

    const playIn = this.handlePlayMusicIn(text, 'play .+')
    if (playIn) {
      return playIn
    }

    const playByPossessiveArtist = VoiceAssistantHelper.matchValue(text, /(?<=play) .+'s .+/i)
    if (playByPossessiveArtist != null) {
      return { type: MatchType.PlayByArtist, param: new ByArtistRequest(playByPossessiveArtist, "'s ") }
    }

    const play = VoiceAssistantHelper.matchValue(text, /(?<=play).*/i)
    return play != null ? { type: MatchType.SearchAndPlay, param: play } : { type: MatchType.MatchNone }
  }

  private handlePlayMusicIn(text: string, patternPrefix: string) {
    const value = VoiceAssistantHelper.getValue(text, new RegExp(`(?<=${patternPrefix}).+ (in|from|of) .+`, 'i'))
    if (!value) {
      return null
    }

    const splitter = value.includes(' in ') ? ' in ' : value.includes(' from ') ? ' from ' : ' of '
    const request = new ByArtistRequest(value, splitter)
    const target = request.item.toLocaleLowerCase()

    if (target.includes('album')) {
      return { type: MatchType.PlayMusicInAlbum, param: request }
    }

    if (target.includes('playlist')) {
      return { type: MatchType.PlayMusicInPlaylist, param: request }
    }

    if (target.includes('folder')) {
      return { type: MatchType.PlayMusicInFolder, param: request }
    }

    return { type: MatchType.PlayMusicIn, param: request }
  }

  private handleVolume(text: string): VolumeRequest {
    const fraction = VoiceAssistantHelper.getValue(text, /\d+\/\d+/)
    const num = VoiceAssistantHelper.getValue(text, /\d+/)
    const half = /half/i.test(text)
    const quarter = /quarter/i.test(text)

    if (!num && !half && !quarter) {
      return {
        to: false,
        turnUp: !/lower|down/i.test(text),
        percentage: false,
        value: 10,
      }
    }

    return {
      to: text.includes('to'),
      turnUp: !/lower|down/i.test(text),
      percentage: Boolean(fraction) || half || quarter || text.includes('%'),
      value: fraction ? VoiceAssistantHelper.fractionToDouble(fraction) : half ? 50 : quarter ? 25 : Number(num),
    }
  }
}
