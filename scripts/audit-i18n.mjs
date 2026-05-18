import { writeFileSync, readFileSync } from 'node:fs'

const localeFiles = [
  'src/shared/locales/en-US.ts',
  'src/shared/locales/zh-CN.ts',
  'src/shared/locales/fr.ts',
  'src/shared/locales/ru.ts',
  'src/shared/locales/ja.ts',
  'src/shared/locales/de.ts',
  'src/shared/locales/pt-BR.ts',
  'src/shared/locales/es.ts',
  'src/shared/locales/it.ts',
  'src/shared/locales/zh-Hant.ts',
  'src/shared/locales/nl.ts',
  'src/shared/locales/cs.ts',
  'src/shared/locales/uk.ts',
  'src/shared/locales/sv.ts',
  'src/shared/locales/id.ts',
]

const dictionaries = new Map(localeFiles.map((file) => [localeName(file), readDictionary(file)]))
const source = dictionaries.get('zh-CN')
const english = dictionaries.get('en-US')
const sourceKeys = Object.keys(source)
const findings = []

for (const [locale, dictionary] of dictionaries) {
  for (const key of sourceKeys) {
    const value = dictionary[key]
    if (value === undefined) {
      continue
    }

    checkPlaceholderSurface(locale, key, value)
    checkChoicePipeSurface(locale, key, value)
    checkKnownBadMeanings(locale, key, value)
    checkContextualTerms(locale, key, value)
    checkHighFrequencyLabels(locale, key, value)
    checkMachineTranslationSmells(locale, key, value)
  }
}

findings.sort((left, right) => {
  const priority = { P0: 0, P1: 1, P2: 2 }
  return priority[left.level] - priority[right.level]
    || left.key.localeCompare(right.key)
    || left.locale.localeCompare(right.locale)
})

writeReport(findings)

const counts = countByLevel(findings)
console.log(`i18n audit report written to i18n-audit.md`)
console.log(`P0: ${counts.P0 || 0}, P1: ${counts.P1 || 0}, P2: ${counts.P2 || 0}`)

function checkPlaceholderSurface(locale, key, value) {
  if (locale === 'zh-CN' || locale === 'zh-Hant') {
    return
  }

  if (/\{[a-zA-Z][a-zA-Z0-9]*\}-[\p{L}]/u.test(value)) {
    add('P1', locale, key, value, 'Placeholder is glued to a word with a hyphen; often a machine-translation artifact.')
  }

  if (/\p{L}+\s+\{count\}$|^\p{L}+\s+\{songs\}/u.test(value)) {
    if (/Count|Summary|Multiple|songsCached|folderSongsShort|songCount|albumCount|artistCount|trackCount/.test(key)) {
      add('P1', locale, key, value, 'Count phrase appears reversed or noun-first; check for unnatural quantity wording.')
    }
  }
}

function checkChoicePipeSurface(locale, key, value) {
  if (locale === 'en-US' || !key.startsWith('voiceAssistant.command.')) {
    return
  }

  const englishValue = english[key]
  if (!englishValue || !englishValue.includes('|')) {
    return
  }

  const englishPipeCount = countOccurrences(englishValue, '|')
  const localePipeCount = countOccurrences(value, '|')
  if (englishPipeCount !== localePipeCount) {
    add('P1', locale, key, value, `Voice-command choice count differs from en-US (${localePipeCount} vs ${englishPipeCount}).`)
  }
}

function checkKnownBadMeanings(locale, key, value) {
  const lower = value.toLocaleLowerCase()
  const keyLower = key.toLocaleLowerCase()

  if (isPlayContext(keyLower) && hasAny(lower, [
    'game', 'juego', 'jeu', 'gioco', 'игр', 'гра', 'ゲーム',
  ])) {
    add('P0', locale, key, value, 'Play context appears translated as game/play-as-game.')
  }

  if (isAutoContext(keyLower) && hasAny(lower, [
    'automobile', 'car ', 'vehicle', 'auto móvil', 'coche', 'voiture', 'auto\'s', '汽车', 'автомоб',
  ])) {
    add('P0', locale, key, value, 'Auto context appears translated as automobile instead of automatic.')
  }

  if (isArtistContext(keyLower) && hasAny(lower, [
    'painter', 'peintre', 'pintor', '画家', 'maler', 'худож', 'художник',
  ])) {
    add('P0', locale, key, value, 'Artist context appears translated as visual artist/painter.')
  }

  if (isVolumeContext(keyLower) && hasAny(lower, [
    'объем', 'обсяг', 'том ', 'svazek', 'volumen físico', 'volume fisico',
  ])) {
    add('P0', locale, key, value, 'Volume context may mean physical volume/capacity instead of loudness.')
  }

  if (keyLower.includes('voiceassistant.executed') && hasAny(lower, [
    'popraven', 'avrättad', 'geëxecuteerd', 'dieksekusi',
  ])) {
    add('P1', locale, key, value, 'Voice-assistant done state appears translated as executed/killed instead of completed.')
  }

  if (keyLower === 'voiceassistant.command.playcontrol1' && playControlHasNavigationWhereContinueShouldBe(value)) {
    add('P1', locale, key, value, 'Voice-assistant continue/resume commands appear translated as previous/next track.')
  }

  if (keyLower === 'local.playfolder' && hasAny(lower, [
    'carpeta de reproducción', 'pasta de reprodução', 'папка воспроизведения', '再生フォルダー', 'mainkan folder',
  ])) {
    add('P1', locale, key, value, 'Play-folder action appears noun-like or game-like instead of playing a folder.')
  }

  if (keyLower === 'song.savelyricslater' && hasAny(lower, [
    'updated', 'actualizará', 'mise à jour', 'aggiorn', '更新', 'обнов', 'оновл', 'uppdater', 'bijgewerkt', 'diperbarui',
  ])) {
    add('P1', locale, key, value, 'Delayed lyrics save message appears translated as update instead of save.')
  }

  if (isRepeatContext(keyLower) && hasAny(lower, [
    'smyčka', 'laço', 'петл', 'петля', 'slinga', 'lus', 'loop único',
  ])) {
    add('P0', locale, key, value, 'Repeat context appears translated as loop object/noose instead of repeat playback.')
  }

  if (isLyricsSidecarContext(keyLower) && hasAny(lower, [
    'sidecar', '边车', '邊車', 'beiwagen', 'sespan', 'боков', 'коляск',
  ])) {
    add('P0', locale, key, value, 'Sidecar lyrics context appears translated literally as vehicle sidecar.')
  }

  if (isClearContext(keyLower) && hasAny(lower, [
    'obvious', 'clear history', 'duidelijke geschiedenis', 'storia chiara', 'sejarah yang jelas', 'tydlig historia', 'klare geschichte', 'jasný', 'chiaro', 'jelas', 'duidelijk',
  ])) {
    add('P0', locale, key, value, 'Clear action appears translated as obvious/clear-as-adjective.')
  }

  if (isDisableContext(keyLower) && hasAny(lower, [
    'discapacitado', '障害者', 'handicap', 'disabled person',
  ])) {
    add('P0', locale, key, value, 'Disabled state appears translated as disabled person.')
  }
}

function checkContextualTerms(locale, key, value) {
  const lower = value.toLocaleLowerCase()
  const keyLower = key.toLocaleLowerCase()

  if (isDiskDeletionContext(keyLower) && !hasAny(lower, [
    'disk', 'disco', 'disque', 'datenträger', 'schijf', 'disco', 'diska', 'диск', 'диска', '磁盘', '磁碟', 'ディスク',
  ])) {
    add('P0', locale, key, value, 'Delete-from-disk action does not clearly mention disk.')
  }

  if (isHideContext(keyLower) && hasAny(lower, [
    'close', 'cerrar', 'fermer', 'chiudere', 'fechar', 'schließen', 'закрыть', 'закрити', '閉じる', 'tutup', 'nära', 'dichtbij',
  ])) {
    add('P0', locale, key, value, 'Hide/collapse action appears translated as close/near.')
  }

  if (isFolderTreeContext(keyLower) && hasAny(lower, [
    'branch', 'branche', 'ramo', 'rama', 'ветк', 'гілк', 'ブランチ', '分支',
    'descendant', 'descend', 'nachkom', 'potom', 'turunan', 'нащад',
  ])) {
    add('P1', locale, key, value, 'Folder-tree wording exposes branch/descendant terminology.')
  }

  if (isFolderTreeContext(keyLower) && hasAny(lower, [
    'catalog', 'catalogue', 'katalog', 'catálogo', 'каталог', 'カタログ',
    'subdirectory', 'unterverzeichnis', 'podadres', 'sous-répertoire', 'subdiret', 'サブディレクトリ', 'подкаталог', 'підкаталог',
  ])) {
    add('P1', locale, key, value, 'Folder-tree wording uses directory/catalog where user-facing folder/subfolder is expected.')
  }

  if ([
    'local.backToRoot',
    'local.libraryRoot',
    'local.noRoot',
    'settings.musicFolderPlaceholder',
  ].includes(key) && hasAny(lower, [
    'ディレクトリ', 'каталог', 'katalog', 'directory',
  ])) {
    add('P2', locale, key, value, 'Music library root uses directory/catalog wording instead of user-facing folder wording.')
  }

  if (isLocalSoftwareContext(keyLower) && hasAny(lower, [
    'местный', 'місцевий', 'местная', 'місцева', '現地',
  ])) {
    add('P1', locale, key, value, 'Software-local context appears translated as local/geographic.')
  }
}

function checkMachineTranslationSmells(locale, key, value) {
  const lower = value.toLocaleLowerCase()

  if (hasAny(lower, [
    'spettacolo', 'ショー', 'etalage', 'etalase', 'skyltfönster',
  ])) {
    add('P1', locale, key, value, 'Show/display appears translated as show/performance/showcase.')
  }

  if (hasAny(lower, [
    'primero', 'dulu', 'zuerst', 'd\'abord', 'первый', 'спочатку', 'まず',
  ]) && /folderSongsCompact|updateFolderProgressSongUnit/.test(key)) {
    add('P0', locale, key, value, 'Song count/unit appears translated as first/before.')
  }

  if (hasAny(lower, [
    'a través de {albums}', 'através de {albums}', 'à travers {albums}', 'attraverso {albums}', 'melintasi {albums}', 'over {albums}', 'через {albums}', '{albums}間',
  ])) {
    add('P1', locale, key, value, 'Album/card summary appears to literalize across/through.')
  }

  if (hasAny(lower, [
    'actualizar carpeta', 'dossier de mise à jour', 'cartella di aggiornamento', 'pasta de atualização', 'update-ordner', 'アップデートフォルダー', 'папку оновлення',
  ]) && key.includes('updateFolder')) {
    add('P1', locale, key, value, 'Refresh-folder action appears noun-like or literal.')
  }
}

function checkHighFrequencyLabels(locale, key, value) {
  const lower = value.toLocaleLowerCase()

  if (key === 'common.undo' && hasAny(lower, [
    'cancel', 'abbrechen', 'cancelar', 'annuleer', 'batalkan', 'avbryt', 'отмена', 'скасувати', 'キャンセル',
  ])) {
    add('P1', locale, key, value, 'Undo is translated like Cancel instead of reverting an action.')
  }

  if (locale === 'id' && isClearContext(key) && hasAny(lower, [
    'hapus',
  ]) && !key.toLowerCase().startsWith('recent.clear') && !key.toLowerCase().includes('history') && !key.toLowerCase().includes('searches')) {
    add('P2', locale, key, value, 'Clear/reset UI uses delete wording in Indonesian.')
  }

  if (key === 'common.dateAdded' && hasAny(lower, [
    'add date', 'adicionar data', 'datum toevoegen', 'přidat datum',
  ])) {
    add('P1', locale, key, value, 'Date Added appears translated as the action add date.')
  }

  if ((key === 'common.hrAgo' || key === 'common.minAgo') && hasAny(lower, [
    '{count} vor', 'hace horas {count}', '{count} hace', '{count} il y a',
  ])) {
    add('P1', locale, key, value, 'Relative-time wording has machine-translation word order.')
  }

  if (key.endsWith('.multiSelect') && hasAny(lower, [
    'multiple choice', 'opción múltiple', 'choix multiple', 'pilihan ganda', 'scelta multipla', '多肢選択', 'meerkeuze', 'múltipla escolha',
  ])) {
    add('P2', locale, key, value, 'Multi Select appears translated as quiz-style multiple choice.')
  }

  if (key === 'albums.addSelectedTo' && [
    'přidat do', 'hinzufügen', 'agregar a', 'ajouter à', 'tambahkan ke', 'aggiungere a',
    '追加する', 'toevoegen aan', 'adicionar a', 'добавить в', 'lägga till', 'додати до',
  ].includes(value)) {
    add('P2', locale, key, value, 'Add Selected To action lost the selected-items context or uses an infinitive form.')
  }

  if (key === 'song.saveImmediately' && [
    'uložit nyní', 'enregistrer maintenant', 'bewaar nu', 'сохранить сейчас', 'зберегти зараз',
  ].includes(value)) {
    add('P2', locale, key, value, 'Save Immediately action uses lowercase or awkward action form.')
  }

  if (key === 'settings.importDataHint' && hasAny(lower, [
    'importujte', 'importieren sie', 'importe la', 'importez', 'импортируйте', 'імпортуйте',
  ])) {
    add('P2', locale, key, value, 'Import data hint is translated as a polite instruction instead of neutral helper copy.')
  }

  if (key === 'settings.importData' && lower === 'importujte data') {
    add('P2', locale, key, value, 'Import Data action is translated as an instruction instead of a compact label.')
  }

  if (locale === 'ja' && key === 'song.importLyrics' && value.endsWith('する')) {
    add('P2', locale, key, value, 'Import lyrics action uses a full sentence form instead of a compact button label.')
  }

  if (key === 'search.resultOf' && (value.includes('”{query}“') || value.includes('」{query}「'))) {
    add('P1', locale, key, value, 'Search-result quotes are reversed.')
  }

  if ((key === 'common.playlists' || key === 'search.playlistsWithCount') && hasAny(lower, [
    'lista de reproducción', 'lista de reprodução', 'список воспроизведения', 'список відтворення', 'spellista ({count})',
  ])) {
    add('P2', locale, key, value, 'Playlist plural label appears singular.')
  }

  if (key === 'preferences.undoPrefer' && hasAny(lower, [
    'batalkan pilihan', 'скасувати перевагу',
  ])) {
    add('P2', locale, key, value, 'Undo Prefer is translated like cancel selection/preference instead of reverting the preference.')
  }

  if (locale !== 'en-US' && key === 'library.refreshing' && hasAny(lower, [
    'refreshing music library', 'erfrischende', 'refrescante', 'rafraîchissante', 'menyegarkan', 'verfrissende',
  ])) {
    add('P1', locale, key, value, 'Refreshing status appears translated as refreshing/pleasant rather than updating.')
  }

  if (locale !== 'en-US' && key === 'detail.artistRuntimeCopy' && hasAny(lower, [
    'playable duration', 'jouabilité', 'jogável', 'spelbar',
  ])) {
    add('P1', locale, key, value, 'Playable duration appears translated as game/playable rather than playback duration.')
  }

  if (locale !== 'en-US' && key === 'detail.tracks' && hasAny(lower, [
    'repertoire', 'repertorio', 'répertoire', 'repertoar', 'репертуар',
  ])) {
    add('P1', locale, key, value, 'Tracks appears translated as repertoire instead of tracks/songs.')
  }

  if (locale !== 'en-US' && key === 'cards.artistSubtitle' && hasAny(lower, [
    'über {albums}', 'through {albums}', 'across {albums}',
  ])) {
    add('P2', locale, key, value, 'Artist card subtitle literalizes across albums.')
  }

  if (key === 'cards.artistSubtitle' && value.includes('跨 {albums}')) {
    add('P2', locale, key, value, 'Artist card subtitle literalizes across albums.')
  }

  if (key === 'local.childFolders' && [
    'subcarpeta', 'sottocartella', 'submap', 'subpasta', 'undermapp',
  ].includes(lower)) {
    add('P2', locale, key, value, 'Child Folders label appears singular.')
  }

  if (key === 'local.childFoldersCopy' && hasAny(lower, [
    'a direct subfolder', 'ein direkter unterordner', 'una subcarpeta', 'un sous-dossier', 'una sottocartella', 'een directe submap', 'uma subpasta',
  ])) {
    add('P2', locale, key, value, 'Child-folders copy appears singular.')
  }

  if (key === 'local.newFolderName' && hasAny(lower, [
    'create new folder', 'crear nueva carpeta', 'creer un nouveau dossier', 'buat folder baru', 'crea nuova cartella', 'maak een nieuwe map', 'criar nova pasta', 'skapa ny mapp',
  ])) {
    add('P2', locale, key, value, 'New Folder default name appears translated as a create-folder command.')
  }

  if (key === 'playlists.newName' && hasAny(lower, [
    'create new playlist', 'erstellen', 'crear nueva', 'créer une nouvelle', 'buat daftar', 'crea una nuova', '作成', 'maak een nieuwe', 'criar nova', 'создать новый', 'skapa ny', 'створити новий',
  ])) {
    add('P2', locale, key, value, 'New playlist default name appears translated as a create-playlist command.')
  }

  if (key === 'remoteShare.remoteLibrarySummary' && hasAny(lower, [
    'canciones {count}', 'песни {count}',
  ])) {
    add('P1', locale, key, value, 'Remote library count phrase has machine-translation word order.')
  }

  if (key === 'local.gridFolderPlayInfo' && locale === 'en-US' && !lower.includes('shuffle')) {
    add('P1', locale, key, value, 'Folder play info should follow zh-CN random-play wording.')
  }

  if (key === 'song.trackNumber' && (hasAny(lower, [
    'audio track', 'pista de audio', 'piste audio', 'trek audio', 'traccia audio', 'audiospoor', 'faixa de audio', 'audiotrack', 'audiospur',
  ]) || value === '音轨' || value === '音軌')) {
    add('P1', locale, key, value, 'Track Number appears translated as audio track instead of track number.')
  }

  if (key === 'song.genre' && [
    'styl', 'Stil', 'estilo', 'style', 'gaya', 'stile', 'スタイル', 'stijl', 'стиль', '風格', '风格',
  ].includes(value)) {
    add('P2', locale, key, value, 'Genre metadata label is translated as generic style instead of music genre.')
  }

  if (key === 'song.subtitle' && [
    'legenda', 'субтитры', 'undertext',
  ].includes(value)) {
    add('P2', locale, key, value, 'Subtitle metadata label appears translated as video captions/subtitles.')
  }

  if (key === 'song.composers' && [
    'skladatel', 'Komponist', 'compositor', 'compositeur', 'compositore', 'componist', 'композитор', 'kompositör',
  ].includes(value)) {
    add('P2', locale, key, value, 'Composers metadata label is singular in a plural field.')
  }

  if (key === 'song.albumArtReset' && hasAny(lower, [
    'reset album art', 'restablecer la caratula', 'reinitialisation', 'reset sampul', 'reimpostazione', 'redefinicao', 'сброс обложки', 'скидання обкладинки',
  ])) {
    add('P2', locale, key, value, 'Album art reset notification appears as a noun/action rather than completed state.')
  }

  if (key === 'song.albumArtReset' && value === 'Albumomslaget återställs') {
    add('P2', locale, key, value, 'Album art reset notification reads as ongoing/future rather than completed.')
  }

  if (locale === 'zh-Hant' && key === 'song.resetProperties' && value.includes('訊息')) {
    add('P2', locale, key, value, 'Traditional Chinese song information wording is inconsistent with nearby labels.')
  }

  if (key === 'song.lyricsDialogLyricsOrMusicFilter' && hasAny(lower, [
    'とか',
  ])) {
    add('P2', locale, key, value, 'Lyrics or music filter is too casual/indefinite.')
  }

  if (key === 'voiceAssistant.volume' && value.includes('Volume{volume}')) {
    add('P2', locale, key, value, 'Volume status is missing a space before the placeholder.')
  }

  if (key === 'nowPlaying.internet' && hasAny(lower, [
    'network', 'netzwerk', 'red', 'réseau', 'jaringan', 'rete', 'ネットワーク', 'netwerk', 'rede', 'сеть', 'nätverk',
  ])) {
    add('P2', locale, key, value, 'Internet lyrics source is translated as network instead of Internet.')
  }

  if (key === 'lyrics.sourceInternet' && hasAny(lower, [
    'network', 'netzwerk', 'red', 'réseau', 'jaringan', 'rete', 'ネットワーク', 'netwerk', 'rede', 'сеть', 'nätverk',
  ])) {
    add('P2', locale, key, value, 'Internet lyrics source is translated as network instead of Internet.')
  }

  if (key.startsWith('settings.preserveLyricsTimestamps') && hasAny(lower, [
    'network lyric', 'netzwerktext', 'letras de red', 'paroles du réseau', 'lirik jaringan', 'testi della rete', 'ネットワーク歌詞', 'netwerktekst', 'letras da rede', 'текстов песен в сети', 'nätverkstexter', 'мережевих текст',
  ])) {
    add('P2', locale, key, value, 'Online lyric timestamp wording uses network/local-network wording.')
  }

  if ((key === 'albums.sortReverse' || key === 'albums.sort.reverse') && hasAny(lower, [
    'reverse gear', 'zpětný chod', 'revertir', 'reverter', 'обратный ход', 'реверс', '逆に',
  ])) {
    add('P1', locale, key, value, 'Reverse sort appears translated as reverse gear/revert action instead of reverse order.')
  }

  if ((key === 'albums.sortReverse' || key === 'albums.sort.reverse') && [
    'umgekehrt', 'inverser', 'terbalik', 'inverso', 'omgekeerd', 'omvänd',
  ].includes(value)) {
    add('P2', locale, key, value, 'Reverse sort option is an adjective or verb instead of an order label.')
  }

  if ((key === 'albums.sortName' || key === 'albums.sort.name') && [
    'Jméno', 'Имя', "Ім'я",
  ].includes(value)) {
    add('P2', locale, key, value, 'Album name sort label uses personal-name wording instead of title/name wording.')
  }

  if (key === 'albums.searchResults' && hasAny(lower, [
    'results {count}', 'resultados de {count}', 'resultados {count}', 'résultats {count}', 'hasil {count}', 'результати {count}',
  ])) {
    add('P1', locale, key, value, 'Album search result count has machine-translation word order.')
  }

  if (locale === 'ja' && hasAny(value, [
    '{count} の曲', '{count}の曲', '{count} の結果', '{count} アイテム', '曲({count})', '全曲({count})',
  ])) {
    add('P2', locale, key, value, 'Japanese count phrase has machine-translation spacing or item wording.')
  }

  if (key === 'tray.quit' && lower === 'ausstieg') {
    add('P2', locale, key, value, 'Tray Quit is translated as an exit noun instead of a quit action.')
  }

  if (key === 'nowPlaying.loadingLyrics' && hasAny(lower, [
    'завантаження пісень',
  ])) {
    add('P1', locale, key, value, 'Loading lyrics appears translated as loading songs.')
  }

  if (key === 'local.searchDirectory' && value === 'Search Directory') {
    add('P2', locale, key, value, 'Search Directory should follow the user-facing folder wording.')
  }

  if (key.startsWith('settings.desktopLyricsStroke') && hasAny(lower, [
    'textstrich', 'trazo de texto', 'trait de texte', 'goresan teks', 'tratto di testo', 'テキストストローク', 'tekststreek', 'traço de texto', 'текстовый штрих',
  ])) {
    add('P2', locale, key, value, 'Desktop lyric outline is translated as literal stroke/line wording.')
  }

  if (key === 'settings.desktopLyricsFontSearch' && hasAny(lower, [
    'fuente de búsqueda', 'fonte de pesquisa', 'sökteckensnitt', 'пошуковий шрифт',
  ])) {
    add('P2', locale, key, value, 'Search fonts appears translated as search-font noun wording.')
  }

  if (key === 'settings.nightModeEndTime' && hasAny(lower, [
    'arrive', 'ankommen', 'llegar', 'arriver', 'tiba', 'arrivo', '到着', 'aankomst', 'chegar', 'прибытие', 'anländer', 'прибуття',
  ])) {
    add('P1', locale, key, value, 'Night mode end time translates To as arrive.')
  }

  if (key === 'settings.nightModeOn' && hasAny(lower, [
    'turn on', 'einschalten', 'encender', 'allumer', 'nyalakan', 'accendere', 'オンにする', 'inschakelen', 'ligar', 'включить', 'slå på',
  ])) {
    add('P2', locale, key, value, 'Night mode On option is translated as a turn-on command.')
  }

  if (key === 'settings.nightModeStartTime' && hasAny(lower, [
    'из',
  ])) {
    add('P1', locale, key, value, 'Night mode start time uses from-out-of wording.')
  }

  if (key.startsWith('settings.notificationMode') && hasAny(lower, [
    'ordinary', 'gewöhnlich', 'ordinario', 'ordinaire', 'comum', 'быстро', 'snabbt', 'швидко',
  ])) {
    add('P2', locale, key, value, 'Notification mode option wording is a noun/adverb rather than a mode label.')
  }

  if (key === 'settings.notificationSendMusicChanged' && hasAny(lower, [
    'music changes', 'musik verändert sich', 'cambios de musica', 'changements de musique', 'perubahan musik', 'la musica cambia', '音楽の変化', 'muziek verandert', 'mudanças musicais', 'музыка меняется', 'musiken förändras',
  ])) {
    add('P2', locale, key, value, 'Music Changed notification trigger is translated as a generic state/change label.')
  }

  if (key === 'nowPlaying.filtered' && hasAny(lower, [
    'filtreras', 'фільтрують',
  ])) {
    add('P2', locale, key, value, 'Filtered status is translated as a verb form.')
  }

  if (key === 'nowPlaying.filtered' && [
    'filtrován', 'フィルタリングされた', 'фильтрованный',
  ].includes(value)) {
    add('P2', locale, key, value, 'Filtered status label uses an awkward adjective or sentence form.')
  }

  if (key === 'settings.languageSystem' && hasAny(lower, [
    'follow', 'folgen sie', 'sigue', 'suivez', 'ikuti', 'segui', '従ってください', 'volg', 'siga', 'следуйте', 'följ',
  ])) {
    add('P2', locale, key, value, 'Follow system language option is translated as an instruction instead of an option label.')
  }

  if (locale === 'de' && [
    'local.playAllButtonTooltip',
    'remoteShare.start',
    'player.enterMiniMode',
    'voiceAssistant.getHelp',
    'settings.feedback',
    'settings.hideMultiSelectCommandBar',
    'settings.loadUsingFilename',
    'settings.loadUsingMusicName',
    'settings.lyricsBatchWriteStrategy',
    'settings.lyricsBatchOverwriteAndBackup',
    'song.searchLibraryArtwork',
    'sidebar.removeRecentSearch',
  ].includes(key) && value.includes('Sie')) {
    add('P2', locale, key, value, 'German UI label is translated as a polite sentence instead of a compact action label.')
  }

  if ((key === 'remoteShare.authorizedDevices' || key === 'remoteShare.connectedDevices') && hasAny(lower, [
    'device authorized', 'authorized device', 'autorisiertes gerät', 'dispositivo autorizado', 'appareil autorisé', 'dispositivo connesso',
    'geautoriseerd apparaat', 'dispositivo conectado', 'авторизованное устройство', 'auktoriserad enhet', 'авторизований пристрій',
    'gerät angeschlossen', 'appareil connecté', 'устройство подключено', 'enhet ansluten', 'пристрій підключено',
  ])) {
    add('P2', locale, key, value, 'Device-list heading is singular or reads like one device status.')
  }

  if (key === 'remoteShare.connected' && hasAny(lower, [
    'can access', 'peut accéder', 'puede acceder', 'pode acessar', 'kann auf', 'может получить доступ', 'можна отримати доступ',
    'accedere ai brani {count}', 'lagu {count}', 'songs {count}', 'песням {count}', 'пісень {count}',
  ])) {
    add('P2', locale, key, value, 'Remote connected message has machine-translation wording or count order.')
  }

  if (key === 'remoteShare.noRemoteSongPlaying' && hasAny(lower, [
    'yet', 'noch keine', 'aún no', 'encore été', 'belum ada', 'ancora riprodotto', 'まだ再生', 'nog geen', 'ainda', 'еще не', 'ще не', 'har spelats ännu',
  ])) {
    add('P2', locale, key, value, 'No remote song playing is translated as playback history instead of current playback state.')
  }

  if (key.startsWith('voiceAssistant.hint') && hasAny(value, [
    '"{', '}""', '„{', '}““', '«{', '}»»',
  ])) {
    add('P2', locale, key, value, 'Voice hint has nested quote artifacts around the placeholder.')
  }

  if ((key === 'settings.desktopLyrics' || key === 'player.desktopLyrics') && hasAny(lower, [
    'paroles de bureau', 'letras de escritorio', 'letras de desktop', 'настільна лірика',
  ])) {
    add('P2', locale, key, value, 'Desktop lyrics heading is translated as literal desktop/poetry wording.')
  }

  if (key === 'nowPlaying.currentSlot' && hasAny(lower, [
    'location', 'standort', 'ubicación', 'emplacement', 'lokasi', 'locatie', 'localização', 'местоположение', 'plats', 'місцезнаходження',
  ])) {
    add('P2', locale, key, value, 'Current position in queue is translated as a physical location.')
  }

  if (key === 'nowPlaying.noActiveTrack' && hasAny(lower, [
    'active track', 'aktiver track', 'pista activa', 'piste active', 'trek aktif', 'traccia attiva', 'アクティブなトラック', 'actief nummer', 'faixa ativa', 'активного трека', 'aktivt spår', 'активної доріжки',
  ])) {
    add('P2', locale, key, value, 'No active track should read as no song currently playing.')
  }

  if (key === 'settings.notificationSendNever' && hasAny(lower, [
    'never send', 'niemals senden', 'nunca enviar', 'ne jamais envoyer', 'tidak pernah mengirim', 'non inviare mai', '決して送信しないでください', 'nooit verzenden', 'nunca envie', 'никогда не отправлять', 'skicka aldrig', 'ніколи не надсилайте',
  ])) {
    add('P2', locale, key, value, 'Never notification option is translated as a send command instead of a compact option label.')
  }

  if (key === 'lyrics.sourceUnavailable' && lower === 'не доступний') {
    add('P2', locale, key, value, 'Unavailable source label has incorrect adjectival form.')
  }

  if (key === 'song.albumArtRecommendationPrefix' && hasAny(lower, [
    'identification', 'identificación', 'identification intelligente', 'identifikasi cerdas', 'identificazione intelligente', '識別', 'intelligente identificatie', 'интеллектуальной идентификации', 'інтелектуальної ідентифікації',
  ])) {
    add('P2', locale, key, value, 'Album-art recommendation prefix describes identification instead of the recommended cover.')
  }

  if ((key === 'albums.searchPlaceholder' || key === 'albums.searchAlbumPlaceholder') && hasAny(lower, [
    'album durchsuchen', 'cerca nell', 'поиск в альбоме',
  ])) {
    add('P2', locale, key, value, 'Album search placeholder reads as searching inside one album instead of searching albums.')
  }

  if ((key === 'albums.searchResults' || key === 'search.resultSummary') && hasAny(lower, [
    'risultati {count}', 'résultats {count}', 'resultados {count}', '{count} результаты',
  ])) {
    add('P2', locale, key, value, 'Search result count has machine-translation word order or plural form.')
  }

  if (key === 'nowPlaying.queueSearchResults' && hasAny(lower, [
    'výsledky {count}', 'resultados de {count}', 'résultats {count}', 'hasil {count}', 'risultati {count}', 'resultados {count}', 'результаты {count}', 'результати {count}',
  ])) {
    add('P2', locale, key, value, 'Queue search result count has machine-translation word order.')
  }

  if (key === 'nowPlaying.queueCopy' && value.includes('Now Playing')) {
    add('P2', locale, key, value, 'Built-in now-playing list copy keeps the English feature name in a translated sentence.')
  }

  if (key === 'headeredPlaylist.songsPrefix' && hasAny(lower, [
    'lied:', 'chanson:', 'canzone:', 'canção:', 'песня:', 'låt:',
  ])) {
    add('P2', locale, key, value, 'Songs prefix is singular where the UI expects a plural/count label.')
  }

  if (key === 'notification.playlistRemoved' && hasAny(lower, [
    'playlist „{name}“ odstraněn',
  ])) {
    add('P2', locale, key, value, 'Playlist removed notification mixes English with incorrect agreement.')
  }

  if ((key.startsWith('nowPlaying.exit') || key === 'player.exitMiniMode' || key === 'settings.quitOnClose') && hasAny(lower, [
    'ukončete', 'verlassen sie', 'beenden sie', 'quittez l',
  ])) {
    add('P2', locale, key, value, 'Exit/quit label is translated as a polite instruction instead of a concise UI action.')
  }

  if (key === 'nowPlaying.clearNowPlaying' && hasAny(lower, [
    'jetzt löschen', 'borrar reproduciendo ahora', 'effacer en cours de lecture', 'bersihkan sedang diputar', 'wis nu afspelen',
  ])) {
    add('P2', locale, key, value, 'Clear Now Playing label is literal or grammatically awkward.')
  }

  if (key === 'headeredPlaylist.clearConfirm' && lower.includes('playlist')) {
    add('P2', locale, key, value, 'Playlist confirmation uses an untranslated English playlist term.')
  }

  if (['de', 'fr', 'pt-BR'].includes(locale) && lower.includes('playlist')) {
    add('P2', locale, key, value, 'Playlist label uses the English loanword while this locale otherwise uses a translated term.')
  }

  if (locale === 'ru' && lower.includes('список воспроизведения')) {
    add('P2', locale, key, value, 'Russian playlist terminology mixes formal list wording with the locale-wide плейлист wording.')
  }

  if (locale === 'de' && (key === 'playlists.save' || key === 'settings.save') && lower === 'sparen') {
    add('P1', locale, key, value, 'Save action is translated as saving money instead of storing changes.')
  }

  if (key === 'common.reset' && (lower === 'zurückgesetzt' || lower === 'сброс')) {
    add('P2', locale, key, value, 'Reset action is translated as a past participle or noun instead of an action label.')
  }

  if ((key === 'playlists.create' || key === 'playlists.save' || key === 'settings.save') && hasAny(lower, [
    'membuat', 'menyimpan', 'создавать',
  ])) {
    add('P2', locale, key, value, 'Create/save action is translated as a gerund or imperfective form instead of a concise action label.')
  }

  if ((key === 'playlists.up' || key === 'playlists.down') && hasAny(lower, [
    'ga naar beneden', 'omhoog gaan', 'двигаться', 'рухатися',
  ])) {
    add('P2', locale, key, value, 'Move up/down action reads like moving oneself rather than moving the playlist item.')
  }

  if (key === 'context.select' && hasAny(lower, [
    'vyberte si', 'wählen sie', 'choisissez', '選択してください', 'выберите', 'виберіть',
  ])) {
    add('P2', locale, key, value, 'Select context action is translated as a polite instruction instead of a concise action label.')
  }

  if ((key === 'context.seeAlbumArt' || key === 'song.musicNoAlbumArt' || key === 'song.chooseAlbumArtwork') && lower.includes('albumhoezen')) {
    add('P2', locale, key, value, 'Album art is pluralized as album covers in a singular artwork context.')
  }

  if (isAlbumArtContext(key) && hasAny(lower, [
    'albumillustraties', 'albumhoezen', 'albumbilder', 'pochettes de l', 'обкладинок альбомів',
  ])) {
    add('P2', locale, key, value, 'Album art is pluralized or inconsistent in a singular artwork context.')
  }

  if (key === 'song.changeArtwork' && hasAny(lower, [
    'changement', 'perubahan', '変化する', 'verandering',
  ])) {
    add('P2', locale, key, value, 'Change artwork action is translated as a noun/change-of-state instead of an action label.')
  }

  if (key === 'settings.nightModeNever' && value === '決して') {
    add('P2', locale, key, value, 'Night mode Never option is translated as an adverbial never, not an option label.')
  }

  if (key === 'song.useSelectedArtwork' && hasAny(lower, [
    '使用してください', 'skydd', 'используйте', 'використовуйте',
  ])) {
    add('P2', locale, key, value, 'Use selected artwork button is imperative or uses the wrong cover term.')
  }

  if ((key === 'song.chooseAlbumArtwork' || key === 'song.chooseArtworkFromLibrary') && hasAny(lower, [
    'vyberte', 'wählen sie', 'choisissez', 'выберите', 'виберіть',
  ])) {
    add('P2', locale, key, value, 'Choose artwork action is translated as a polite instruction instead of a concise action label.')
  }

  if ([
    'app.selectTrack',
    'library.chooseFolder',
    'local.chooseMusicLibraryFolderDialogButton',
    'local.selectAllArtistSplits',
    'albums.selectAll',
  ].includes(key) && hasAny(lower, [
    'vyberte', 'выберите', 'виберіть',
  ])) {
    add('P2', locale, key, value, 'Select/choose action label is translated as an instruction form.')
  }

  if (locale === 'cs' && [
    'artists.locateArtist',
    'song.saveProperties',
    'song.searchLibraryArtwork',
    'song.useSelectedArtwork',
  ].includes(key) && hasAny(value, [
    'Vyhledejte', 'Uložte', 'použít',
  ])) {
    add('P2', locale, key, value, 'Czech action label uses an instruction or lowercase sentence form.')
  }

  if (locale === 'uk' && [
    'remoteShare.start',
    'song.saveProperties',
    'song.searchLibraryArtwork',
  ].includes(key) && hasAny(value, [
    'Увімкніть', 'Збережіть', 'Знайдіть',
  ])) {
    add('P2', locale, key, value, 'Ukrainian action label uses an instruction form instead of a compact label.')
  }

  if (locale === 'ru' && [
    'settings.loadUsingFilename',
    'settings.loadUsingMusicName',
  ].includes(key) && value.includes('Используйте')) {
    add('P2', locale, key, value, 'Russian setting label uses an instruction form instead of a compact option label.')
  }

  if (key === 'song.chooseAlbumArtwork' && lower.includes('albumhoezen')) {
    add('P2', locale, key, value, 'Choose Album Artwork is pluralized as album covers.')
  }

  if (key === 'search.foldersWithCount' && hasAny(lower, [
    'cartella ({count})', 'pasta ({count})',
  ])) {
    add('P2', locale, key, value, 'Folder search count heading is singular where a count list is expected.')
  }

  if (key === 'local.childFolders' && lower === 'sous-dossier') {
    add('P2', locale, key, value, 'Child Folders heading is singular.')
  }

  if (key === 'local.currentPath' && hasAny(lower, [
    'nuvarande väg',
  ])) {
    add('P2', locale, key, value, 'Current Path is translated as a road rather than a filesystem path.')
  }

  if (key === 'local.applyArtistSplits' && hasAny(lower, [
    'розділити всіх',
  ])) {
    add('P2', locale, key, value, 'Split All is translated as splitting everyone instead of splitting all entries.')
  }
  if (key === 'notification.songsAddedTo' && hasAny(lower, [
    'přidány písně {count}', 'canciones de {count}', 'chansons {count}', 'lagu {count}', 'brani {count}', 'músicas {count}', 'песни {count}', 'пісні {count}',
  ])) {
    add('P2', locale, key, value, 'Songs-added notification has machine-translation count order.')
  }

  if (key === 'common.nowPlaying' && hasAny(lower, [
    'audio', 'zvuk', 'audi', '音频', 'オーディオ', 'звук', 'ljud',
  ])) {
    add('P2', locale, key, value, 'Now Playing global label is translated as currently playing audio instead of the feature name.')
  }

  if (locale === 'id' && (key === 'common.nowPlaying' || key === 'nowPlaying.title') && value === 'Sedang Dimainkan') {
    add('P2', locale, key, value, 'Indonesian Now Playing label is inconsistent with the rest of the locale.')
  }

  if (locale === 'nl' && [
    'remoteShare.savePassword',
    'song.useSelectedArtwork',
  ].includes(key) && /^[a-z]/.test(value)) {
    add('P2', locale, key, value, 'Dutch action label starts lowercase while nearby actions are title-style.')
  }

  if (locale === 'it' && [
    'app.selectTrack',
    'collection.noFavorites',
    'notification.playNext',
    'local.refreshAddedTab',
    'nowPlaying.noActiveTrackCopy',
    'settings.lyricsBatchNoCurrent',
    'song.searchLibraryArtwork',
  ].includes(key) && value.includes('canzon')) {
    add('P2', locale, key, value, 'Italian song label is inconsistent with the locale-wide brano wording.')
  }

  if (locale === 'it' && hasAny(lower, [
    'canzone', 'canzoni',
  ])) {
    add('P2', locale, key, value, 'Italian song terminology is inconsistent with the locale-wide brano wording.')
  }

  if (locale === 'de' && value.includes('Songs')) {
    add('P2', locale, key, value, 'German song terminology mixes English Songs with the locale-wide Lieder wording.')
  }

  if (locale === 'cs' && hasAny(lower, [
    'všechny písně', 'vsechny pisne',
  ])) {
    add('P2', locale, key, value, 'Czech song terminology mixes písně with the locale-wide skladby wording.')
  }

  if ((key === 'playlists.up' || key === 'playlists.down') && hasAny(lower, [
    'bajar', 'subir', 'descendre', 'monter', 'spostarsi verso il basso', 'salire', 'bergerak ke',
  ])) {
    add('P2', locale, key, value, 'Move up/down playlist action uses an intransitive movement verb.')
  }

  if ((key === 'playlists.create' || key === 'playlists.save' || key === 'settings.save' || key === 'context.addToPlaylist') && hasAny(lower, [
    'creare', 'salvare', 'aggiungere a', '作成する', '保存する', '追加する',
  ])) {
    add('P2', locale, key, value, 'Action label uses an infinitive sentence form instead of a compact button label.')
  }

  if (key === 'context.playNext' && hasAny(lower, [
    'gioca', 'jogue', 'hrát dál', 'als nächstes spielen', 'speel hierna',
  ])) {
    add('P1', locale, key, value, 'Play Next context action is translated as game/play-as-game or an awkward continuation phrase.')
  }

  if ((key === 'nowPlaying.clearNowPlaying' || key === 'nowPlaying.queueCopy') && lower.includes('зараз грає')) {
    add('P2', locale, key, value, 'Now Playing label keeps an older play-as-game-prone Ukrainian wording.')
  }

  if ((key === 'random.mostPlayed' || key === 'preferences.builtin.most-played') && lower.includes('програвані')) {
    add('P2', locale, key, value, 'Most Played label uses a Ukrainian word form that can read like losing rather than playback.')
  }

  if (key === 'settings.quitOnClose' && lower.includes('закрийте програму')) {
    add('P2', locale, key, value, 'Quit-on-close setting is translated as an instruction instead of an option label.')
  }

  if ([
    'common.play',
    'context.play',
    'player.play',
    'player.playPause',
    'voiceAssistant.command.play',
  ].includes(key) && hasAny(lower, [
    'přehrát zvuk', 'audio abspielen', 'reproducir audio', 'lire du son', 'putar audio', "riproduci l'audio", 'オーディオを再生', 'reproduzir áudio', 'audio afspelen', 'spela upp ljud', 'воспроизвести аудио', 'відтворити аудіо', 'pausar audio', "pause l'audio", 'menjeda audio', 'pausar o áudio', 'pausa ljud', 'приостановить звук', 'призупинити аудіо',
  ])) {
    add('P2', locale, key, value, 'Play context action unnecessarily says audio instead of a compact play action.')
  }

  if ([
    'common.add',
    'common.reset',
    'context.pause',
    'settings.saveChanges',
    'settings.saveFetchedLyrics',
    'settings.saveProgress',
    'song.changeArtwork',
    'song.chooseAlbumArtwork',
    'song.chooseArtworkFromLibrary',
    'song.saveImmediately',
    'song.useSelectedArtwork',
  ].includes(key) && hasAny(lower, [
    'resettare', 'mengatur ulang', 'el接ge', 'escolha', 'guarde las', 'salve as', 'uložte', 'speichern sie', 'сохраняйте', 'cambiare', 'salva adesso',
  ])) {
    add('P2', locale, key, value, 'Common action label uses an instruction or infinitive form.')
  }

  if (key === 'settings.authorizeOtherFolder' && hasAny(lower, [
    'autorisieren sie', 'autorizujte', 'autorizzare', '許可する', 'авторизуйте',
  ])) {
    add('P2', locale, key, value, 'Authorize-folder setting is translated as an instruction instead of an action label.')
  }

  if (locale === 'zh-Hant' && lower.includes('播放列表')) {
    add('P2', locale, key, value, 'Traditional Chinese playlist wording is inconsistent with the rest of the locale.')
  }

  if (locale === 'zh-Hant' && hasAny(value, [
    '導入', '數據', '設置', '本地', '運行', '添加', '創建', '加載',
  ])) {
    add('P2', locale, key, value, 'Traditional Chinese string contains Simplified-Chinese-style UI wording.')
  }

  if (locale === 'cs' && lower.includes('seznam stop')) {
    add('P2', locale, key, value, 'Czech playlist wording is inconsistent with the rest of the locale.')
  }

  if (locale === 'id' && key === 'song.clearPlayCount' && lower === 'reset') {
    add('P2', locale, key, value, 'Clear play count action keeps the English Reset label.')
  }

  if (key === 'playlists.nameSpecial' && value.includes('++++++')) {
    add('P1', locale, key, value, 'Playlist name validation copy changed the forbidden +++++ literal.')
  }

  if (key === 'remoteShare.passwordInvalid' && value.includes('文字の文字')) {
    add('P2', locale, key, value, 'Password validation copy repeats character wording awkwardly.')
  }

  if (key === 'settings.importDataConfirm' && hasAny(lower, [
    'weitermachen?', 'melanjutkan?', '続く？', 'продолжать?',
  ])) {
    add('P2', locale, key, value, 'Import confirmation uses an awkward continue question.')
  }

  if (key === 'releaseNotes.architectureFeedback' && hasAny(lower, [
    'architecture', 'architektur', 'arquitectura', 'architecture', 'arsitektur', 'architettura', 'アーキテクチャ', 'arquitetura', 'архитектур', 'архітектур', '架构', '架構',
  ])) {
    add('P2', locale, key, value, 'Release-note feedback copy exposes implementation architecture wording.')
  }

  if (key === 'voiceAssistant.noticeSmartness' && hasAny(value, [
    '不会那么聪明', '不會那麼聰明',
  ])) {
    add('P2', locale, key, value, 'Voice assistant limitation copy sounds dismissive.')
  }

  if ([
    'settings.autoLyrics',
    'settings.autoPlay',
    'settings.batchAddLyrics',
    'settings.reauthorize',
    'settings.saveFetchedLyrics',
    'settings.saveProgress',
  ].includes(key) && hasAny(lower, [
    'fügen sie', 'adicione', 'reproduza', 'voeg automatisch', 'speel automatisch', 'sla songteksten', 'enregistrez', 'riautorizzare', 'してください', '保存する', 'переавторизуйте', 'збережіть',
  ])) {
    add('P2', locale, key, value, 'Setting label is translated as an instruction instead of an option/action label.')
  }

  if (key === 'notification.songsRemovedFrom' && lower.includes('lagu {count}')) {
    add('P2', locale, key, value, 'Songs-removed notification has machine-translation count order.')
  }

  if (key.startsWith('local.updateFolderProgressProcessed') || key === 'local.updateFolderProgressChecked') {
    if (hasAny(lower, [
      'carpetas {count}', 'dossiers {count}', 'cartelle {count}', 'pastas {count}',
      'elementos {count}', 'éléments {count}', 'elementi {count}', 'itens {count}',
      'canciones {count}', 'chansons {count}', 'brani {count}', 'músicas {count}',
      'položky {count}',
    ])) {
      add('P2', locale, key, value, 'Progress count label has machine-translation word order.')
    }
  }

  if (key === 'local.updateFolderProgressAdded' && hasAny(lower, [
    'nové', 'neu', 'nuevo', 'nouveau', 'baru', 'nuovo', '新しい', 'nieuw', 'novo', 'новый', 'nytt', 'новий',
  ])) {
    add('P2', locale, key, value, 'Added progress status is translated as New instead of Added.')
  }

  if (key === 'local.updateFolderProgressMissing' && hasAny(lower, [
    'desaparecido', 'hilang', '行方不明',
  ])) {
    add('P2', locale, key, value, 'Missing progress status uses lost/missing-person wording.')
  }

  if (key === 'local.updateFolderProgressActionUpdating' && hasAny(lower, [
    'индекс синхронизации', '同期する',
  ])) {
    add('P2', locale, key, value, 'Library update progress text has an awkward noun phrase or infinitive action.')
  }

  if ((locale === 'pt-BR' || locale === 'fr') && hasAny(lower, [
    'digitaliz', 'numéris', 'numérisez',
  ])) {
    add('P2', locale, key, value, 'Library scan wording reads like digitizing/scanner usage instead of indexing the music library.')
  }

  if (key === 'local.updateResultOfFolder' && hasAny(lower, [
    'aktualizovat výsledky', 'actualizar resultados', 'mettre à jour les résultats', 'perbarui hasil', 'aggiorna risultati', 'resultaten bijwerken', 'atualizar resultados', 'обновить результаты', 'uppdatera resultat', 'оновити результати',
  ])) {
    add('P2', locale, key, value, 'Update result heading is translated as an update action.')
  }

  if (key === 'albums.selectedCount' && lower.includes('item {count} selecionado')) {
    add('P2', locale, key, value, 'Selected count has machine-translation word order.')
  }
}

function writeReport(items) {
  const lines = [
    '# i18n Audit',
    '',
    'Generated by `npm run audit:i18n`.',
    '',
    'This report flags mechanically detectable P0/P1/P2 risks. It is not a native-speaker quality guarantee.',
    '',
  ]

  for (const level of ['P0', 'P1', 'P2']) {
    const group = items.filter((item) => item.level === level)
    lines.push(`## ${level} (${group.length})`, '')
    if (group.length === 0) {
      lines.push('No findings.', '')
      continue
    }

    lines.push('| Locale | Key | Current value | Reason | zh-CN | en-US |', '| --- | --- | --- | --- | --- | --- |')
    for (const item of group) {
      lines.push(`| ${escapeCell(item.locale)} | \`${escapeCell(item.key)}\` | ${escapeCell(item.value)} | ${escapeCell(item.reason)} | ${escapeCell(source[item.key])} | ${escapeCell(english[item.key])} |`)
    }
    lines.push('')
  }

  writeFileSync('i18n-audit.md', `${lines.join('\n')}\n`, 'utf8')
}

function add(level, locale, key, value, reason) {
  if (shouldIgnoreFinding(level, locale, key, value, reason)) {
    return
  }

  if (locale === 'zh-CN' && reason.includes('zh-CN')) {
    return
  }

  const id = `${level}|${locale}|${key}|${reason}`
  if (findings.some((item) => item.id === id)) {
    return
  }

  findings.push({ id, level, locale, key, value, reason })
}

function shouldIgnoreFinding(level, locale, key, value, reason) {
  if (reason.startsWith('Playlist confirmation') && locale === 'en-US') {
    return true
  }

  if (reason.startsWith('Device-list heading') && locale === 'en-US') {
    return true
  }

  if (reason.startsWith('Clear action') && locale === 'en-US' && /^Clear\b/.test(value)) {
    return true
  }

  if (reason.startsWith('Folder-tree wording') && (key.includes('Root') || key.includes('musicFolderPlaceholder'))) {
    return true
  }

  if (reason.startsWith('Placeholder is glued') && key === 'voiceAssistant.hintArtist') {
    return true
  }

  if (reason.startsWith('Play context') && locale === 'uk' && [
    'nowPlaying.clearNowPlaying',
    'nowPlaying.title',
    'nowPlaying.titleWithCount',
    'preferences.builtin.most-played',
    'random.mostPlayed',
    'settings.autoPlay',
    'settings.playerLyricsSource',
  ].includes(key)) {
    return true
  }

  if (reason.startsWith('Refresh-folder action') && locale === 'es' && key === 'local.updateFolder') {
    return true
  }

  return false
}

function readDictionary(file) {
  const source = readFileSync(file, 'utf8')
  const entries = {}
  for (const match of source.matchAll(/^\s+'([^']+)':\s+'((?:\\.|[^'])*)',/gm)) {
    entries[match[1]] = unescapeTsString(match[2])
  }
  return entries
}

function unescapeTsString(value) {
  return Function(`return '${value}'`)()
}

function localeName(file) {
  return file.match(/([^/\\]+)\.ts$/)[1]
}

function countByLevel(items) {
  return items.reduce((counts, item) => {
    counts[item.level] = (counts[item.level] || 0) + 1
    return counts
  }, {})
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
}

function hasAny(value, terms) {
  return terms.some((term) => value.includes(term))
}

function playControlHasNavigationWhereContinueShouldBe(value) {
  const parts = value.toLocaleLowerCase().split('|').map((part) => part.trim())
  if (parts.length !== 6) {
    return false
  }

  if (parts[2] === parts[4] && parts[3] === parts[5]) {
    return true
  }

  return hasAny(parts[2], navigationTerms()) || hasAny(parts[3], navigationTerms())
}

function navigationTerms() {
  return [
    'previous', 'next', 'anterior', 'siguiente', 'próxima', 'vorheriges', 'nächstes',
    'předchozí', 'další', 'föregående', 'nästa', 'предыдущ', 'следующ',
    'поперед', 'наступ', '前', '後', '上', '下',
  ]
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>')
}

function isPlayContext(key) {
  return key.includes('play') || key.includes('player') || key.includes('queue') || key.includes('nowplaying') || key.includes('random')
}

function isAutoContext(key) {
  return key.includes('auto') || key.includes('automatic')
}

function isArtistContext(key) {
  return key.includes('artist')
}

function isAlbumArtContext(key) {
  return key.includes('albumart') || key.includes('artwork')
}

function isVolumeContext(key) {
  return key.includes('volume')
}

function isRepeatContext(key) {
  return key.includes('repeat') || key.includes('loop')
}

function isLyricsSidecarContext(key) {
  return key.includes('sourcelrc') || key.includes('sourcetext') || key.includes('lyricscopy') || key.includes('loadinglyricscopy')
}

function isClearContext(key) {
  return key.includes('clear') || key.includes('reset') || key.includes('history')
}

function isDisableContext(key) {
  return key.includes('disabled') || key.includes('disable')
}

function isHideContext(key) {
  return key.includes('hide') || key.includes('viewless')
}

function isFolderTreeContext(key) {
  return key.startsWith('local.') || key.includes('folder') || key.includes('directory')
}

function isDiskDeletionContext(key) {
  return key.includes('deletefromdisk')
    || key.includes('deletesongconfirm')
    || key.includes('deletedfromdisk')
    || key.includes('deletedlocalitems')
    || key.includes('deletefolderconfirm')
    || key.includes('deleteselectedconfirm')
}

function isLocalSoftwareContext(key) {
  return key.includes('local') || key.includes('lyricsbatchcurrentlyrics') || key.includes('musiclibrary') || key.includes('source')
}
