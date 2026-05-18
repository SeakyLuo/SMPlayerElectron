import type { CommandResult, IVoiceAssistantCommandHandler, VolumeRequest } from './VoiceAssistantHelper'

const localizedMatchType = {
  Play: 'Play',
  PlayMusic: 'PlayMusic',
  PlayArtist: 'PlayArtist',
  PlayAlbum: 'PlayAlbum',
  PlayPlaylist: 'PlayPlaylist',
  PlayFolder: 'PlayFolder',
  SearchAndPlay: 'SearchAndPlay',
  QuickPlay: 'QuickPlay',
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

interface LocalizedVoiceLexicon {
  quickPlay: string[]
  play: string[]
  resume: string[]
  pause: string[]
  previous: string[]
  next: string[]
  mute: string[]
  unmute: string[]
  help: string[]
  cancel: string[]
  search: string[]
  volume: string[]
  volumeUp: string[]
  volumeDown: string[]
  volumeTo: string[]
  percent: string[]
  music: string[]
  artist: string[]
  album: string[]
  playlist: string[]
  folder: string[]
}

const lexicons: Record<string, LocalizedVoiceLexicon> = {
  fr: {
    quickPlay: ['lecture rapide', 'musique au hasard'],
    play: ['joue', 'jouer', 'lance', 'lancer', 'mets', 'mettre'],
    resume: ['reprendre', 'continue', 'continuer'],
    pause: ['pause', 'mets en pause'],
    previous: ['precedent', 'precedente', 'titre precedent', 'morceau precedent'],
    next: ['suivant', 'suivante', 'titre suivant', 'morceau suivant'],
    mute: ['muet', 'coupe le son', 'couper le son'],
    unmute: ['remets le son', 'reactive le son', 'retablis le son'],
    help: ['aide'],
    cancel: ['rien', 'annule', 'laisse tomber'],
    search: ['chercher', 'cherche', 'rechercher', 'recherche'],
    volume: ['volume', 'son'],
    volumeUp: ['augmente', 'monte', 'plus fort'],
    volumeDown: ['baisse', 'diminue', 'moins fort'],
    volumeTo: ['a', 'jusqu a'],
    percent: ['pour cent', 'pourcent'],
    music: ['musique', 'morceau', 'chanson', 'titre'],
    artist: ['artiste', 'chanteur', 'chanteuse'],
    album: ['album'],
    playlist: ['playlist', 'liste'],
    folder: ['dossier'],
  },
  ru: {
    quickPlay: ['быстрое воспроизведение', 'случайная музыка'],
    play: ['включи', 'воспроизведи', 'проиграй', 'играй'],
    resume: ['продолжи', 'возобнови'],
    pause: ['пауза', 'поставь на паузу'],
    previous: ['предыдущий', 'предыдущая', 'предыдущий трек'],
    next: ['следующий', 'следующая', 'следующий трек'],
    mute: ['без звука', 'выключи звук'],
    unmute: ['включи звук', 'верни звук'],
    help: ['помощь', 'справка'],
    cancel: ['ничего', 'отмена'],
    search: ['поиск', 'найди', 'искать'],
    volume: ['громкость', 'звук'],
    volumeUp: ['громче', 'увеличь', 'прибавь'],
    volumeDown: ['тише', 'уменьши', 'убавь'],
    volumeTo: ['до', 'на'],
    percent: ['процент', 'процентов'],
    music: ['музыку', 'песню', 'трек'],
    artist: ['исполнителя', 'артиста', 'певца'],
    album: ['альбом'],
    playlist: ['плейлист', 'список'],
    folder: ['папку'],
  },
  ja: {
    quickPlay: ['クイック再生', 'ランダム再生'],
    play: ['再生', 'かけて', '流して'],
    resume: ['再開', '続けて'],
    pause: ['一時停止', '停止'],
    previous: ['前の曲', '前へ'],
    next: ['次の曲', '次へ'],
    mute: ['ミュート'],
    unmute: ['ミュート解除'],
    help: ['ヘルプ', '助けて'],
    cancel: ['キャンセル', 'やめて'],
    search: ['検索', '探して'],
    volume: ['音量', 'ボリューム'],
    volumeUp: ['上げて', '大きく'],
    volumeDown: ['下げて', '小さく'],
    volumeTo: ['まで', 'に'],
    percent: ['パーセント'],
    music: ['曲', '音楽'],
    artist: ['アーティスト', '歌手'],
    album: ['アルバム'],
    playlist: ['プレイリスト'],
    folder: ['フォルダー', 'フォルダ'],
  },
  de: {
    quickPlay: ['schnellwiedergabe', 'zufallsmusik'],
    play: ['spiele', 'spiel', 'abspielen'],
    resume: ['fortsetzen', 'weiter'],
    pause: ['pause', 'pausieren'],
    previous: ['vorheriger', 'vorheriges lied', 'zuruck'],
    next: ['nachster', 'nachstes lied', 'weiter'],
    mute: ['stumm', 'ton aus'],
    unmute: ['ton an', 'stumm aus'],
    help: ['hilfe'],
    cancel: ['nichts', 'abbrechen'],
    search: ['suche', 'suchen'],
    volume: ['lautstarke', 'ton'],
    volumeUp: ['lauter', 'erhohe'],
    volumeDown: ['leiser', 'senke'],
    volumeTo: ['auf', 'bis'],
    percent: ['prozent'],
    music: ['musik', 'lied', 'titel'],
    artist: ['kunstler', 'sanger'],
    album: ['album'],
    playlist: ['playlist', 'wiedergabeliste'],
    folder: ['ordner'],
  },
  'pt-BR': {
    quickPlay: ['reproducao rapida', 'tocar aleatorio'],
    play: ['tocar', 'toque', 'reproduzir', 'reproduza'],
    resume: ['continuar', 'continue'],
    pause: ['pausar', 'pause'],
    previous: ['anterior', 'musica anterior'],
    next: ['proxima', 'proximo', 'musica seguinte'],
    mute: ['silenciar', 'sem som'],
    unmute: ['ativar som', 'tirar do mudo'],
    help: ['ajuda'],
    cancel: ['nada', 'cancelar'],
    search: ['buscar', 'pesquisar', 'procure'],
    volume: ['volume', 'som'],
    volumeUp: ['aumentar', 'aumente', 'mais alto'],
    volumeDown: ['diminuir', 'diminua', 'mais baixo'],
    volumeTo: ['para', 'ate'],
    percent: ['por cento'],
    music: ['musica', 'cancao', 'faixa'],
    artist: ['artista', 'cantor', 'cantora'],
    album: ['album'],
    playlist: ['playlist', 'lista'],
    folder: ['pasta'],
  },
  es: {
    quickPlay: ['reproduccion rapida', 'musica aleatoria'],
    play: ['reproduce', 'reproducir', 'pon', 'poner', 'toca'],
    resume: ['continua', 'continuar', 'reanuda'],
    pause: ['pausa', 'pausar'],
    previous: ['anterior', 'cancion anterior'],
    next: ['siguiente', 'proxima', 'cancion siguiente'],
    mute: ['silencio', 'silenciar', 'quita el sonido'],
    unmute: ['activar sonido', 'restaurar sonido'],
    help: ['ayuda'],
    cancel: ['nada', 'cancelar'],
    search: ['buscar', 'busca'],
    volume: ['volumen', 'sonido'],
    volumeUp: ['sube', 'subir', 'aumenta'],
    volumeDown: ['baja', 'bajar', 'disminuye'],
    volumeTo: ['a', 'hasta'],
    percent: ['por ciento'],
    music: ['musica', 'cancion', 'tema', 'pista'],
    artist: ['artista', 'cantante'],
    album: ['album'],
    playlist: ['playlist', 'lista'],
    folder: ['carpeta'],
  },
  it: {
    quickPlay: ['riproduzione rapida', 'musica casuale'],
    play: ['riproduci', 'metti', 'suona'],
    resume: ['continua', 'riprendi'],
    pause: ['pausa', 'metti in pausa'],
    previous: ['precedente', 'brano precedente'],
    next: ['successivo', 'prossimo', 'brano successivo'],
    mute: ['muto', 'disattiva audio'],
    unmute: ['attiva audio', 'riattiva audio'],
    help: ['aiuto'],
    cancel: ['niente', 'annulla'],
    search: ['cerca', 'ricerca'],
    volume: ['volume', 'audio'],
    volumeUp: ['aumenta', 'alza'],
    volumeDown: ['abbassa', 'diminuisci'],
    volumeTo: ['a', 'fino a'],
    percent: ['per cento'],
    music: ['musica', 'canzone', 'brano'],
    artist: ['artista', 'cantante'],
    album: ['album'],
    playlist: ['playlist', 'lista'],
    folder: ['cartella'],
  },
  nl: {
    quickPlay: ['snel afspelen', 'willekeurige muziek'],
    play: ['speel', 'afspelen'],
    resume: ['hervatten', 'doorgaan'],
    pause: ['pauze', 'pauzeren'],
    previous: ['vorige', 'vorig nummer'],
    next: ['volgende', 'volgend nummer'],
    mute: ['dempen', 'geluid uit'],
    unmute: ['geluid aan', 'dempen uit'],
    help: ['help'],
    cancel: ['niets', 'annuleren'],
    search: ['zoek', 'zoeken'],
    volume: ['volume', 'geluid'],
    volumeUp: ['harder', 'verhoog'],
    volumeDown: ['zachter', 'verlaag'],
    volumeTo: ['naar', 'tot'],
    percent: ['procent'],
    music: ['muziek', 'nummer', 'lied'],
    artist: ['artiest', 'zanger'],
    album: ['album'],
    playlist: ['playlist', 'afspeellijst'],
    folder: ['map'],
  },
  cs: {
    quickPlay: ['rychle prehrat', 'nahodna hudba'],
    play: ['prehraj', 'pust', 'spust'],
    resume: ['pokracuj', 'obnov'],
    pause: ['pauza', 'pozastav'],
    previous: ['predchozi', 'predchozi skladba'],
    next: ['dalsi', 'dalsi skladba'],
    mute: ['ztlumit', 'vypnout zvuk'],
    unmute: ['zapnout zvuk'],
    help: ['pomoc', 'napoveda'],
    cancel: ['nic', 'zrusit'],
    search: ['hledat', 'najdi'],
    volume: ['hlasitost', 'zvuk'],
    volumeUp: ['zesil', 'zvys'],
    volumeDown: ['ztis', 'sniz'],
    volumeTo: ['na', 'do'],
    percent: ['procent'],
    music: ['hudbu', 'skladbu', 'pisnicku'],
    artist: ['interpreta', 'umelce', 'zpevaka'],
    album: ['album'],
    playlist: ['playlist', 'seznam'],
    folder: ['slozku'],
  },
  uk: {
    quickPlay: ['швидке відтворення', 'випадкова музика'],
    play: ['увімкни', 'відтвори', 'грай'],
    resume: ['продовжити', 'віднови'],
    pause: ['пауза', 'постав на паузу'],
    previous: ['попередній', 'попередня пісня'],
    next: ['наступний', 'наступна пісня'],
    mute: ['без звуку', 'вимкни звук'],
    unmute: ['увімкни звук', 'поверни звук'],
    help: ['допомога'],
    cancel: ['нічого', 'скасувати'],
    search: ['пошук', 'знайди', 'шукати'],
    volume: ['гучність', 'звук'],
    volumeUp: ['голосніше', 'збільш'],
    volumeDown: ['тихіше', 'зменш'],
    volumeTo: ['до', 'на'],
    percent: ['відсотків', 'відсоток'],
    music: ['музику', 'пісню', 'трек'],
    artist: ['виконавця', 'артиста', 'співака'],
    album: ['альбом'],
    playlist: ['плейлист', 'список'],
    folder: ['папку'],
  },
  sv: {
    quickPlay: ['snabbuppspelning', 'slumpad musik'],
    play: ['spela', 'starta'],
    resume: ['fortsatt', 'ateruppta'],
    pause: ['pausa', 'paus'],
    previous: ['foregaende', 'forra laten'],
    next: ['nasta', 'nasta lat'],
    mute: ['tysta', 'ljud av'],
    unmute: ['ljud pa', 'sluta tysta'],
    help: ['hjalp'],
    cancel: ['inget', 'avbryt'],
    search: ['sok', 'soka'],
    volume: ['volym', 'ljud'],
    volumeUp: ['hoj', 'hogre'],
    volumeDown: ['sank', 'lagre'],
    volumeTo: ['till'],
    percent: ['procent'],
    music: ['musik', 'lat', 'spar'],
    artist: ['artist', 'sangare'],
    album: ['album'],
    playlist: ['spellista', 'playlist'],
    folder: ['mapp'],
  },
  id: {
    quickPlay: ['putar cepat', 'musik acak'],
    play: ['putar', 'mainkan'],
    resume: ['lanjutkan'],
    pause: ['jeda', 'pause'],
    previous: ['sebelumnya', 'lagu sebelumnya'],
    next: ['berikutnya', 'lagu berikutnya'],
    mute: ['bisukan', 'matikan suara'],
    unmute: ['nyalakan suara', 'batal bisu'],
    help: ['bantuan'],
    cancel: ['tidak jadi', 'batal'],
    search: ['cari', 'pencarian'],
    volume: ['volume', 'suara'],
    volumeUp: ['naikkan', 'lebih keras'],
    volumeDown: ['turunkan', 'lebih pelan'],
    volumeTo: ['ke', 'sampai'],
    percent: ['persen'],
    music: ['musik', 'lagu', 'trek'],
    artist: ['artis', 'penyanyi'],
    album: ['album'],
    playlist: ['playlist', 'daftar putar'],
    folder: ['folder'],
  },
}

export class VoiceAssistantLocalizedHelper implements IVoiceAssistantCommandHandler {
  private readonly normalizedLexicon: LocalizedVoiceLexicon

  constructor(locale: string) {
    this.normalizedLexicon = normalizeLexicon(lexicons[locale])
  }

  handle(text: string): CommandResult {
    const normalizedText = normalizeText(text)

    if (containsAny(normalizedText, this.normalizedLexicon.cancel)) {
      return { type: localizedMatchType.Nothing }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.quickPlay)) {
      return { type: localizedMatchType.QuickPlay }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.unmute)) {
      return { type: localizedMatchType.UnMute }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.mute)) {
      return { type: localizedMatchType.Mute }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.previous)) {
      return { type: localizedMatchType.Previous }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.next)) {
      return { type: localizedMatchType.Next }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.pause)) {
      return { type: localizedMatchType.Pause }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.help)) {
      return { type: localizedMatchType.Help }
    }

    if (containsAny(normalizedText, this.normalizedLexicon.volume)) {
      return { type: localizedMatchType.ChangeVolume, param: this.handleVolume(normalizedText) }
    }

    const searchQuery = getRemainderAfterAny(normalizedText, this.normalizedLexicon.search)
    if (searchQuery != null) {
      return searchQuery ? { type: localizedMatchType.Search, param: searchQuery } : { type: localizedMatchType.MatchNone }
    }

    const playRemainder = getRemainderAfterAny(normalizedText, [
      ...this.normalizedLexicon.play,
      ...this.normalizedLexicon.resume,
    ])
    if (playRemainder != null) {
      return this.handlePlay(playRemainder)
    }

    return { type: localizedMatchType.MatchNone }
  }

  private handlePlay(value: string): CommandResult {
    if (!value) {
      return { type: localizedMatchType.Play }
    }

    const artist = getRemainderAfterAny(value, this.normalizedLexicon.artist)
    if (artist != null) {
      return artist ? { type: localizedMatchType.PlayArtist, param: artist } : { type: localizedMatchType.PlayArtist }
    }

    const album = getRemainderAfterAny(value, this.normalizedLexicon.album)
    if (album != null) {
      return album ? { type: localizedMatchType.PlayAlbum, param: album } : { type: localizedMatchType.PlayAlbum }
    }

    const playlist = getRemainderAfterAny(value, this.normalizedLexicon.playlist)
    if (playlist != null) {
      return playlist ? { type: localizedMatchType.PlayPlaylist, param: playlist } : { type: localizedMatchType.PlayPlaylist }
    }

    const folder = getRemainderAfterAny(value, this.normalizedLexicon.folder)
    if (folder != null) {
      return folder ? { type: localizedMatchType.PlayFolder, param: folder } : { type: localizedMatchType.PlayFolder }
    }

    const music = getRemainderAfterAny(value, this.normalizedLexicon.music)
    if (music != null) {
      return music ? { type: localizedMatchType.PlayMusic, param: music } : { type: localizedMatchType.PlayMusic }
    }

    return { type: localizedMatchType.SearchAndPlay, param: value }
  }

  private handleVolume(text: string): VolumeRequest {
    const fraction = getValue(text, /\d+\/\d+/)
    const num = getValue(text, /\d+/)
    const half = containsAny(text, ['half', 'demi', 'halb', 'medio', 'metade', 'metà', 'полов', '半分', 'setengah'])

    if (!num && !fraction && !half) {
      return {
        to: false,
        turnUp: !containsAny(text, this.normalizedLexicon.volumeDown),
        percentage: false,
        value: 10,
      }
    }

    return {
      to: containsAny(text, this.normalizedLexicon.volumeTo),
      turnUp: !containsAny(text, this.normalizedLexicon.volumeDown),
      percentage: Boolean(fraction) || half || text.includes('%') || containsAny(text, this.normalizedLexicon.percent),
      value: fraction ? fractionToDouble(fraction) : half ? 50 : Number(num),
    }
  }
}

export function isLocalizedVoiceAssistantLocale(locale: string) {
  return locale in lexicons
}

function normalizeLexicon(lexicon: LocalizedVoiceLexicon): LocalizedVoiceLexicon {
  return Object.fromEntries(
    Object.entries(lexicon).map(([key, values]) => [key, values.map(normalizeText)]),
  ) as LocalizedVoiceLexicon
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[，。！？、,.!?;:()[\]{}"“”'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value))
}

function getValue(text: string, pattern: RegExp) {
  return pattern.exec(text)?.[0].trim() ?? ''
}

function fractionToDouble(fraction: string) {
  const [left, right] = fraction.split('/').map(Number)
  return left / right
}

function getRemainderAfterAny(text: string, values: string[]) {
  for (const value of values) {
    if (text === value) {
      return ''
    }

    if (text.startsWith(`${value} `)) {
      return text.slice(value.length).trim()
    }

    const infix = ` ${value} `
    const index = text.indexOf(infix)
    if (index >= 0) {
      return text.slice(index + infix.length).trim()
    }
  }

  return null
}
