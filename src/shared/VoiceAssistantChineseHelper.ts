import {
  ByArtistRequest,
  MatchType,
  VoiceAssistantHelper,
  type CommandResult,
  type IVoiceAssistantCommandHandler,
  type VolumeRequest,
} from './VoiceAssistantHelper'

export class VoiceAssistantChineseHelper implements IVoiceAssistantCommandHandler {
  handle(text: string): CommandResult {
    if (text.includes('快速播放')) {
      return { type: MatchType.QuickPlay }
    }

    if (text.includes('恢复') || text.includes('继续') || text === '播放') {
      return { type: MatchType.Play }
    }

    if (this.isPlayMusic(text)) {
      return this.handlePlayMusic(text)
    }

    if (text.includes('音量') || text.includes('声音')) {
      return { type: MatchType.ChangeVolume, param: this.handleVolume(text) }
    }

    if (text.includes('前一首') || text.includes('上一首')) {
      return { type: MatchType.Previous }
    }

    if (text.includes('后一首') || text.includes('下一首')) {
      return { type: MatchType.Next }
    }

    if (text.includes('取消静音')) {
      return { type: MatchType.UnMute }
    }

    if (text.includes('静音')) {
      return { type: MatchType.Mute }
    }

    if (text.startsWith('暂停')) {
      return { type: MatchType.Pause }
    }

    if (text.includes('帮助')) {
      return { type: MatchType.Help }
    }

    if (text.includes('搜索')) {
      return { type: MatchType.Search, param: VoiceAssistantHelper.getValue(text, /(?<=搜索).*/) }
    }

    if (text.startsWith('没事') || text.startsWith('算了')) {
      return { type: MatchType.Nothing }
    }

    return { type: MatchType.MatchNone }
  }

  private isPlayMusic(text: string) {
    return text.includes('播放') || /(来|放)(一)?(首|个|点|下)(歌)?/.test(text)
  }

  private handlePlayMusic(text: string): CommandResult {
    const playMusic = VoiceAssistantHelper.matchValue(text, /(?<=(播放(歌曲|音乐)|(来|放)(一)?(首|下)(歌)?)).*/)
    if (playMusic != null) {
      return { type: MatchType.PlayMusic, param: playMusic }
    }

    const playArtist = VoiceAssistantHelper.matchValue(text, /(?<=播放歌手).*/)
    if (playArtist != null) {
      const playItemByArtist = this.handlePlayItemByArtist(text, '播放歌手')
      return playItemByArtist ?? { type: MatchType.PlayArtist, param: playArtist }
    }

    const playAlbum = VoiceAssistantHelper.matchValue(text, /(?<=播放专辑).*/)
    if (playAlbum != null) {
      const playAlbumMusic = this.handlePlayMusicIn(text, /(?<=播放专辑).+中的/, MatchType.PlayMusicInAlbum)
      if (playAlbumMusic) {
        return playAlbumMusic
      }

      return { type: MatchType.PlayAlbum, param: playAlbum }
    }

    const playPlaylist = VoiceAssistantHelper.matchValue(text, /(?<=播放(列表|歌单)).*/)
    if (playPlaylist != null) {
      const playPlaylistMusic = this.handlePlayMusicIn(text, /(?<=播放(列表|歌单)).+中的/, MatchType.PlayMusicInPlaylist)
      if (playPlaylistMusic) {
        return playPlaylistMusic
      }

      return { type: MatchType.PlayPlaylist, param: playPlaylist }
    }

    const playFolder = VoiceAssistantHelper.matchValue(text, /(?<=文件夹).*/)
    if (playFolder != null) {
      const playFolderMusic = this.handlePlayMusicIn(text, /(?<=播放文件夹).+中的/, MatchType.PlayMusicInFolder)
      if (playFolderMusic) {
        return playFolderMusic
      }

      return { type: MatchType.PlayFolder, param: playFolder }
    }

    const patternPrefix = /(?<=(播放|(来|放)(一)(个|下|点))).+/
    const playItemByArtist = this.handlePlayItemByArtist(text, patternPrefix)
    if (playItemByArtist) {
      return playItemByArtist
    }

    const playArtistSongs = VoiceAssistantHelper.matchValue(text, /(?<=(播放|(来|放)(一)(个|下|点))).+的歌.*/)
    if (playArtistSongs != null) {
      const request = new ByArtistRequest(playArtistSongs, '的歌')
      request.item = ''
      return { type: MatchType.PlayByArtistOrMusic, param: request }
    }

    const playMusicIn = this.handlePlayMusicIn(text, patternPrefix)
    if (playMusicIn) {
      return playMusicIn
    }

    const playByArtist = VoiceAssistantHelper.matchValue(text, /(?<=(播放|(来|放)(一)(个|下|点))).+的.+/)
    if (playByArtist != null) {
      return { type: MatchType.PlayByArtist, param: new ByArtistRequest(playByArtist, '的') }
    }

    const play = VoiceAssistantHelper.matchValue(text, patternPrefix)
    return play != null ? { type: MatchType.SearchAndPlay, param: play } : { type: MatchType.MatchNone }
  }

  private handlePlayItemByArtist(text: string, patternPrefix: string | RegExp) {
    return this.handlePlayItemByArtistWithTag(text, patternPrefix, '的专辑', MatchType.PlayByArtistAndAlbum)
      ?? this.handlePlayItemByArtistWithTag(text, patternPrefix, '的歌曲', MatchType.PlayByArtistAndMusic)
      ?? this.handlePlayItemByArtistWithTag(text, patternPrefix, '的歌', MatchType.PlayByArtistAndMusic)
  }

  private handlePlayMusicIn(text: string, patternPrefix: string | RegExp, matchType: MatchType = MatchType.PlayMusicIn) {
    const prefix = patternPrefix instanceof RegExp ? patternPrefix.source : `(?<=${patternPrefix}).+`
    const value = VoiceAssistantHelper.matchValue(text, new RegExp(prefix.includes('中的') ? `${prefix}.+` : `${prefix}中的.+`))
    if (value != null) {
      const request = new ByArtistRequest(value, '中的')
      request.item = request.item.replace(/^(歌曲|歌)/, '')
      return { type: matchType, param: request }
    }

    return this.handlePlayItemByArtistWithTag(text, patternPrefix, '歌曲', matchType)
      ?? this.handlePlayItemByArtistWithTag(text, patternPrefix, '歌', matchType)
      ?? this.handlePlayItemByArtistWithTag(text, patternPrefix, '', matchType)
  }

  private handlePlayItemByArtistWithTag(text: string, patternPrefix: string | RegExp, tag: string, type: MatchType) {
    const prefix = patternPrefix instanceof RegExp ? patternPrefix.source : `(?<=${patternPrefix}).+`
    const value = VoiceAssistantHelper.matchValue(text, new RegExp(`${prefix}${tag}.+`))

    return value != null ? { type, param: new ByArtistRequest(value, tag) } : null
  }

  private handleVolume(text: string): VolumeRequest {
    const fraction = VoiceAssistantHelper.getValue(text, /\d+\/\d+/)
    const num = VoiceAssistantHelper.getValue(text, /\d+/)
    const half = text.includes('一半')

    if (!num && !half) {
      return {
        to: false,
        turnUp: !text.includes('低'),
        percentage: false,
        value: 10,
      }
    }

    return {
      to: text.includes('至') || text.includes('到') || text.includes('成'),
      turnUp: !text.includes('低'),
      percentage: Boolean(fraction) || half || text.includes('%'),
      value: fraction ? VoiceAssistantHelper.fractionToDouble(fraction) : half ? 50 : Number(num),
    }
  }
}
