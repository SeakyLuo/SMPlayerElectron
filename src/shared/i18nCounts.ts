import type { Locale, Translator } from './i18n'

type CountUnit = 'album' | 'artist' | 'folder' | 'item' | 'song' | 'track'
type UnitForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const unitLabels: Record<Locale, Record<CountUnit, UnitForms>> = {
  'en-US': {
    album: { one: 'album', other: 'albums' },
    artist: { one: 'artist', other: 'artists' },
    folder: { one: 'folder', other: 'folders' },
    item: { one: 'item', other: 'items' },
    song: { one: 'song', other: 'songs' },
    track: { one: 'track', other: 'tracks' },
  },
  'zh-CN': {
    album: { other: '张专辑' },
    artist: { other: '位歌手' },
    folder: { other: '个文件夹' },
    item: { other: '个项目' },
    song: { other: '首歌曲' },
    track: { other: '首曲目' },
  },
  'zh-Hant': {
    album: { other: '張專輯' },
    artist: { other: '位歌手' },
    folder: { other: '個資料夾' },
    item: { other: '個項目' },
    song: { other: '首歌曲' },
    track: { other: '首曲目' },
  },
  fr: {
    album: { one: 'album', other: 'albums' },
    artist: { one: 'artiste', other: 'artistes' },
    folder: { one: 'dossier', other: 'dossiers' },
    item: { one: 'élément', other: 'éléments' },
    song: { one: 'chanson', other: 'chansons' },
    track: { one: 'piste', other: 'pistes' },
  },
  ru: {
    album: { one: 'альбом', few: 'альбома', many: 'альбомов', other: 'альбома' },
    artist: { one: 'исполнитель', few: 'исполнителя', many: 'исполнителей', other: 'исполнителя' },
    folder: { one: 'папка', few: 'папки', many: 'папок', other: 'папки' },
    item: { one: 'элемент', few: 'элемента', many: 'элементов', other: 'элемента' },
    song: { one: 'песня', few: 'песни', many: 'песен', other: 'песни' },
    track: { one: 'трек', few: 'трека', many: 'треков', other: 'трека' },
  },
  ja: {
    album: { other: '枚のアルバム' },
    artist: { other: '組のアーティスト' },
    folder: { other: 'フォルダー' },
    item: { other: '件の項目' },
    song: { other: '曲' },
    track: { other: 'トラック' },
  },
  de: {
    album: { one: 'Album', other: 'Alben' },
    artist: { one: 'Künstler', other: 'Künstler' },
    folder: { one: 'Ordner', other: 'Ordner' },
    item: { one: 'Element', other: 'Elemente' },
    song: { one: 'Lied', other: 'Lieder' },
    track: { one: 'Titel', other: 'Titel' },
  },
  'pt-BR': {
    album: { one: 'álbum', other: 'álbuns' },
    artist: { one: 'artista', other: 'artistas' },
    folder: { one: 'pasta', other: 'pastas' },
    item: { one: 'item', other: 'itens' },
    song: { one: 'música', other: 'músicas' },
    track: { one: 'faixa', other: 'faixas' },
  },
  es: {
    album: { one: 'álbum', other: 'álbumes' },
    artist: { one: 'artista', other: 'artistas' },
    folder: { one: 'carpeta', other: 'carpetas' },
    item: { one: 'elemento', other: 'elementos' },
    song: { one: 'canción', other: 'canciones' },
    track: { one: 'pista', other: 'pistas' },
  },
  it: {
    album: { one: 'album', other: 'album' },
    artist: { one: 'artista', other: 'artisti' },
    folder: { one: 'cartella', other: 'cartelle' },
    item: { one: 'elemento', other: 'elementi' },
    song: { one: 'brano', other: 'brani' },
    track: { one: 'traccia', other: 'tracce' },
  },
  nl: {
    album: { one: 'album', other: 'albums' },
    artist: { one: 'artiest', other: 'artiesten' },
    folder: { one: 'map', other: 'mappen' },
    item: { one: 'item', other: 'items' },
    song: { one: 'nummer', other: 'nummers' },
    track: { one: 'track', other: 'tracks' },
  },
  cs: {
    album: { one: 'album', few: 'alba', other: 'alb' },
    artist: { one: 'interpret', few: 'interpreti', other: 'interpretů' },
    folder: { one: 'složka', few: 'složky', other: 'složek' },
    item: { one: 'položka', few: 'položky', other: 'položek' },
    song: { one: 'skladba', few: 'skladby', other: 'skladeb' },
    track: { one: 'skladba', few: 'skladby', other: 'skladeb' },
  },
  uk: {
    album: { one: 'альбом', few: 'альбоми', many: 'альбомів', other: 'альбома' },
    artist: { one: 'виконавець', few: 'виконавці', many: 'виконавців', other: 'виконавця' },
    folder: { one: 'папка', few: 'папки', many: 'папок', other: 'папки' },
    item: { one: 'елемент', few: 'елементи', many: 'елементів', other: 'елемента' },
    song: { one: 'пісня', few: 'пісні', many: 'пісень', other: 'пісні' },
    track: { one: 'трек', few: 'треки', many: 'треків', other: 'треку' },
  },
  sv: {
    album: { one: 'album', other: 'album' },
    artist: { one: 'artist', other: 'artister' },
    folder: { one: 'mapp', other: 'mappar' },
    item: { one: 'objekt', other: 'objekt' },
    song: { one: 'låt', other: 'låtar' },
    track: { one: 'spår', other: 'spår' },
  },
  id: {
    album: { other: 'album' },
    artist: { other: 'artis' },
    folder: { other: 'folder' },
    item: { other: 'item' },
    song: { other: 'lagu' },
    track: { other: 'trek' },
  },
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

function resolveTranslatorLocale(t: Translator): Locale {
  if (t.locale) {
    return t.locale
  }

  const album = t('common.album')
  const songs = t('common.songs')
  const artist = t('common.artist')

  if (album === '专辑' && songs === '歌曲') return 'zh-CN'
  if (album === '專輯' && songs === '歌曲') return 'zh-Hant'
  if (album === 'Album' && songs === 'Songs') return 'en-US'
  if (album === 'album' && songs === 'Chansons') return 'fr'
  if (album === 'альбом' && songs === 'Песни' && artist === 'Исполнитель') return 'ru'
  if (album === 'アルバム') return 'ja'
  if (album === 'Album' && songs === 'Lieder') return 'de'
  if (album === 'álbum' && songs === 'Músicas') return 'pt-BR'
  if (album === 'álbum' && songs === 'Canciones') return 'es'
  if (album === 'album' && songs === 'Brani') return 'it'
  if (album === 'album' && songs === 'Nummers') return 'nl'
  if (album === 'album' && songs === 'Skladby') return 'cs'
  if (album === 'альбом' && songs === 'Пісні') return 'uk'
  if (album === 'album' && songs === 'Låtar') return 'sv'
  if (album === 'album' && songs === 'Lagu') return 'id'

  return 'en-US'
}

function getPluralCategory(locale: Locale, value: number) {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules.select(value)
}

function formatLocalizedCount(locale: Locale, value: number, unit: CountUnit) {
  const forms = unitLabels[locale][unit]
  const category = getPluralCategory(locale, value)
  return `${value} ${forms[category] ?? forms.other}`
}

export function formatUnitCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

export function formatSongCount(t: Translator, value: number) {
  return formatLocalizedCount(resolveTranslatorLocale(t), value, 'song')
}

export function formatTrackCount(t: Translator, value: number) {
  return formatLocalizedCount(resolveTranslatorLocale(t), value, 'track')
}

export function formatAlbumCount(t: Translator, value: number) {
  return formatLocalizedCount(resolveTranslatorLocale(t), value, 'album')
}

export function formatArtistCount(t: Translator, value: number) {
  return formatLocalizedCount(resolveTranslatorLocale(t), value, 'artist')
}

export function formatItemCount(t: Translator, value: number) {
  return formatLocalizedCount(resolveTranslatorLocale(t), value, 'item')
}

export function formatPlaylistSongCount(t: Translator, value: number) {
  return formatSongCount(t, value)
}

export function formatLocalFolderSongCount(t: Translator, value: number) {
  return formatSongCount(t, value)
}

export function formatArtistSummary(t: Translator, albumCount: number, songCount: number) {
  return `${formatAlbumCount(t, albumCount)} · ${formatSongCount(t, songCount)}`
}

export function formatArtistAlbumSummary(t: Translator, songCount: number, duration: string) {
  return `${formatSongCount(t, songCount)} · ${duration}`
}

export function formatFolderCardStats(t: Translator, folderCount: number, songCount: number) {
  return `${formatLocalizedCount(resolveTranslatorLocale(t), folderCount, 'folder')} · ${formatSongCount(t, songCount)}`
}

export function formatSongsCached(t: Translator, songCount: number) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `${songs}已缓存`
    case 'zh-Hant':
      return `${songs}已快取`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'mise en cache' : 'mises en cache'}`
    case 'ru':
      return `Кэшировано: ${songs}`
    case 'ja':
      return `${songs}をキャッシュしました`
    case 'de':
      return `${songs} im Cache`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'armazenada em cache' : 'armazenadas em cache'}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'en caché' : 'en caché'}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'memorizzato nella cache' : 'memorizzati nella cache'}`
    case 'nl':
      return `${songs} in de cache opgeslagen`
    case 'cs':
      return `Uloženo do mezipaměti: ${songs}`
    case 'uk':
      return `Кешовано: ${songs}`
    case 'sv':
      return `${songs} cachade`
    case 'id':
      return `${songs} disimpan ke cache`
    default:
      return `${songs} cached`
  }
}

export function formatDeletedLocalItems(t: Translator, itemCount: number) {
  const locale = resolveTranslatorLocale(t)
  const items = formatLocalizedCount(locale, itemCount, 'item')

  switch (locale) {
    case 'zh-CN':
      return `已从磁盘删除${items}`
    case 'zh-Hant':
      return `已從磁碟刪除${items}`
    case 'fr':
      return `${items} ${itemCount === 1 ? 'supprimé' : 'supprimés'} du disque`
    case 'ru':
      return `Удалено с диска: ${items}`
    case 'ja':
      return `${items}をディスクから削除しました`
    case 'de':
      return `${items} vom Datenträger gelöscht`
    case 'pt-BR':
      return `${items} ${itemCount === 1 ? 'excluído' : 'excluídos'} do disco`
    case 'es':
      return `${items} ${itemCount === 1 ? 'eliminado' : 'eliminados'} del disco`
    case 'it':
      return `${items} ${itemCount === 1 ? 'eliminato' : 'eliminati'} dal disco`
    case 'nl':
      return `${items} van schijf verwijderd`
    case 'cs':
      return `Odstraněno z disku: ${items}`
    case 'uk':
      return `Видалено з диска: ${items}`
    case 'sv':
      return `${items} borttagna från disk`
    case 'id':
      return `${items} dihapus dari disk`
    default:
      return `Deleted ${items} from disk`
  }
}

export function formatDeleteSelectedLocalItemsConfirm(t: Translator, itemCount: number) {
  const locale = resolveTranslatorLocale(t)
  const items = formatLocalizedCount(locale, itemCount, 'item')

  switch (locale) {
    case 'zh-CN':
      return `要从磁盘删除选中的${items}吗？`
    case 'zh-Hant':
      return `要從磁碟刪除選取的${items}嗎？`
    case 'fr':
      return `Supprimer ${items} ${itemCount === 1 ? 'sélectionné' : 'sélectionnés'} du disque ?`
    case 'ru':
      return `Удалить с диска выбранные элементы: ${items}?`
    case 'ja':
      return `選択した${items}をディスクから削除しますか？`
    case 'de':
      return `${items} vom Datenträger löschen?`
    case 'pt-BR':
      return `Excluir ${items} ${itemCount === 1 ? 'selecionado' : 'selecionados'} do disco?`
    case 'es':
      return `¿Eliminar ${items} ${itemCount === 1 ? 'seleccionado' : 'seleccionados'} del disco?`
    case 'it':
      return `Eliminare ${items} ${itemCount === 1 ? 'selezionato' : 'selezionati'} dal disco?`
    case 'nl':
      return `${items} van schijf verwijderen?`
    case 'cs':
      return `Odstranit z disku vybrané položky: ${items}?`
    case 'uk':
      return `Видалити з диска вибрані елементи: ${items}?`
    case 'sv':
      return `Ta bort ${items} från disk?`
    case 'id':
      return `Hapus ${items} yang dipilih dari disk?`
    default:
      return `Delete ${items} from disk?`
  }
}

export function formatMovedLocalItems(t: Translator, itemCount: number) {
  const locale = resolveTranslatorLocale(t)
  const items = formatLocalizedCount(locale, itemCount, 'item')

  switch (locale) {
    case 'zh-CN':
      return `已移动${items}`
    case 'zh-Hant':
      return `已移動${items}`
    case 'fr':
      return `${items} ${itemCount === 1 ? 'déplacé' : 'déplacés'}`
    case 'ru':
      return `Перемещено: ${items}`
    case 'ja':
      return `${items}を移動しました`
    case 'de':
      return `${items} verschoben`
    case 'pt-BR':
      return `${items} ${itemCount === 1 ? 'movido' : 'movidos'}`
    case 'es':
      return `${items} ${itemCount === 1 ? 'movido' : 'movidos'}`
    case 'it':
      return `${items} ${itemCount === 1 ? 'spostato' : 'spostati'}`
    case 'nl':
      return `${items} verplaatst`
    case 'cs':
      return `Přesunuto: ${items}`
    case 'uk':
      return `Переміщено: ${items}`
    case 'sv':
      return `${items} flyttade`
    case 'id':
      return `${items} dipindahkan`
    default:
      return `Moved ${items}`
  }
}

export function formatRemoteConnected(t: Translator, name: string, songCount: number) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已连接到 ${name}。${songs}可用。`
    case 'zh-Hant':
      return `已連線到 ${name}。${songs}可用。`
    case 'fr':
      return `Connecté à ${name}. ${songs} ${songCount === 1 ? 'est disponible' : 'sont disponibles'}.`
    case 'ru':
      return `Подключено к ${name}. Доступно: ${songs}.`
    case 'ja':
      return `${name}に接続しました。${songs}を利用できます。`
    case 'de':
      return `Mit ${name} verbunden. ${songs} ${songCount === 1 ? 'ist' : 'sind'} verfügbar.`
    case 'pt-BR':
      return `Conectado a ${name}. ${songs} ${songCount === 1 ? 'disponível' : 'disponíveis'}.`
    case 'es':
      return `Conectado a ${name}. ${songs} ${songCount === 1 ? 'disponible' : 'disponibles'}.`
    case 'it':
      return `Connesso a ${name}. ${songs} ${songCount === 1 ? 'disponibile' : 'disponibili'}.`
    case 'nl':
      return `Verbonden met ${name}. ${songs} beschikbaar.`
    case 'cs':
      return `Připojeno k ${name}. K dispozici: ${songs}.`
    case 'uk':
      return `Підключено до ${name}. Доступно: ${songs}.`
    case 'sv':
      return `Ansluten till ${name}. ${songs} tillgängliga.`
    case 'id':
      return `Terhubung ke ${name}. ${songs} tersedia.`
    default:
      return `Connected to ${name}. ${songs} ${songCount === 1 ? 'is' : 'are'} available.`
  }
}

export function formatSongsAddedTo(t: Translator, songCount: number, target: string) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已添加${songs}到 ${target}`
    case 'zh-Hant':
      return `已新增${songs}到 ${target}`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'ajoutée' : 'ajoutées'} à ${target}`
    case 'ru':
      return `Добавлено в ${target}: ${songs}`
    case 'ja':
      return `${target}に${songs}を追加`
    case 'de':
      return `${songs} zu ${target} hinzugefügt`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'adicionada' : 'adicionadas'} a ${target}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'agregada' : 'agregadas'} a ${target}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'aggiunto' : 'aggiunti'} a ${target}`
    case 'nl':
      return `${songs} toegevoegd aan ${target}`
    case 'cs':
      return `Přidáno do ${target}: ${songs}`
    case 'uk':
      return `Додано до ${target}: ${songs}`
    case 'sv':
      return `${songs} tillagda i ${target}`
    case 'id':
      return `${songs} ditambahkan ke ${target}`
    default:
      return `Added ${songs} to ${target}`
  }
}

export function formatSongsRemovedFrom(t: Translator, songCount: number, target: string) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已从 ${target} 移除${songs}`
    case 'zh-Hant':
      return `已從 ${target} 移除${songs}`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'supprimée' : 'supprimées'} de ${target}`
    case 'ru':
      return `Удалено из ${target}: ${songs}`
    case 'ja':
      return `${target}から${songs}を削除しました`
    case 'de':
      return `${songs} aus ${target} entfernt`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'removida' : 'removidas'} de ${target}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'eliminada' : 'eliminadas'} de ${target}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'rimosso' : 'rimossi'} da ${target}`
    case 'nl':
      return `${songs} verwijderd uit ${target}`
    case 'cs':
      return `Odebráno z ${target}: ${songs}`
    case 'uk':
      return `Видалено з ${target}: ${songs}`
    case 'sv':
      return `${songs} borttagna från ${target}`
    case 'id':
      return `${songs} dihapus dari ${target}`
    default:
      return `Removed ${songs} from ${target}`
  }
}

export function formatRefreshSongsAdded(t: Translator, songCount: number) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已添加${songs}`
    case 'zh-Hant':
      return `已新增${songs}`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'ajoutée' : 'ajoutées'}`
    case 'ru':
      return `Добавлено: ${songs}`
    case 'ja':
      return `${songs}を追加しました`
    case 'de':
      return `${songs} hinzugefügt`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'adicionada' : 'adicionadas'}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'agregada' : 'agregadas'}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'aggiunto' : 'aggiunti'}`
    case 'nl':
      return `${songs} toegevoegd`
    case 'cs':
      return `Přidáno: ${songs}`
    case 'uk':
      return `Додано: ${songs}`
    case 'sv':
      return `${songs} tillagda`
    case 'id':
      return `${songs} ditambahkan`
    default:
      return `${songs} added`
  }
}

export function formatRefreshSongsMoved(t: Translator, songCount: number) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已移动${songs}`
    case 'zh-Hant':
      return `已移動${songs}`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'déplacée' : 'déplacées'}`
    case 'ru':
      return `Перемещено: ${songs}`
    case 'ja':
      return `${songs}を移動しました`
    case 'de':
      return `${songs} verschoben`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'movida' : 'movidas'}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'movida' : 'movidas'}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'spostato' : 'spostati'}`
    case 'nl':
      return `${songs} verplaatst`
    case 'cs':
      return `Přesunuto: ${songs}`
    case 'uk':
      return `Переміщено: ${songs}`
    case 'sv':
      return `${songs} flyttade`
    case 'id':
      return `${songs} dipindahkan`
    default:
      return `${songs} moved`
  }
}

export function formatRefreshSongsRemoved(t: Translator, songCount: number) {
  const locale = resolveTranslatorLocale(t)
  const songs = formatLocalizedCount(locale, songCount, 'song')

  switch (locale) {
    case 'zh-CN':
      return `已移除${songs}`
    case 'zh-Hant':
      return `已移除${songs}`
    case 'fr':
      return `${songs} ${songCount === 1 ? 'supprimée' : 'supprimées'}`
    case 'ru':
      return `Удалено: ${songs}`
    case 'ja':
      return `${songs}を削除しました`
    case 'de':
      return `${songs} entfernt`
    case 'pt-BR':
      return `${songs} ${songCount === 1 ? 'removida' : 'removidas'}`
    case 'es':
      return `${songs} ${songCount === 1 ? 'eliminada' : 'eliminadas'}`
    case 'it':
      return `${songs} ${songCount === 1 ? 'rimosso' : 'rimossi'}`
    case 'nl':
      return `${songs} verwijderd`
    case 'cs':
      return `Odebráno: ${songs}`
    case 'uk':
      return `Видалено: ${songs}`
    case 'sv':
      return `${songs} borttagna`
    case 'id':
      return `${songs} dihapus`
    default:
      return `${songs} removed`
  }
}

export function formatSongPlayCountTitle(t: Translator, title: string, playCount: number) {
  const locale = resolveTranslatorLocale(t)

  switch (locale) {
    case 'zh-CN':
    case 'zh-Hant':
      return `《${title}》已经播放了 ${playCount} 次。`
    case 'fr':
      return `« ${title} » a été lu ${playCount} fois.`
    case 'ru':
      return `«${title}» воспроизводилась ${playCount} ${getPluralCategory('ru', playCount) === 'one' ? 'раз' : getPluralCategory('ru', playCount) === 'few' ? 'раза' : 'раз'}.`
    case 'ja':
      return `「${title}」は${playCount}回再生されました。`
    case 'de':
      return `„${title}“ wurde ${playCount} Mal gespielt.`
    case 'pt-BR':
      return `"${title}" foi reproduzido ${playCount} ${playCount === 1 ? 'vez' : 'vezes'}.`
    case 'es':
      return `"${title}" se reprodujo ${playCount} ${playCount === 1 ? 'vez' : 'veces'}.`
    case 'it':
      return `"${title}" è stato riprodotto ${playCount} ${playCount === 1 ? 'volta' : 'volte'}.`
    case 'nl':
      return `"${title}" is ${playCount} keer gespeeld.`
    case 'cs':
      return `"${title}" bylo přehráno ${playCount}×.`
    case 'uk':
      return `«${title}» відтворювалася ${playCount} ${getPluralCategory('uk', playCount) === 'one' ? 'раз' : getPluralCategory('uk', playCount) === 'few' ? 'рази' : 'разів'}.`
    case 'sv':
      return `"${title}" har spelats ${playCount} ${playCount === 1 ? 'gång' : 'gånger'}.`
    case 'id':
      return `"${title}" telah diputar ${playCount} kali.`
    default:
      return `"${title}" has been played ${playCount === 1 ? 'once' : `${playCount} times`}.`
  }
}

export function formatPlayedTimes(t: Translator, album: string, playCount: number) {
  const locale = resolveTranslatorLocale(t)

  switch (locale) {
    case 'zh-CN':
    case 'zh-Hant':
      return `${album} - 播放 ${playCount} 次`
    case 'fr':
      return `${album} - lu ${playCount} fois`
    case 'ru':
      return `${album} — воспроизведено ${playCount} ${getPluralCategory('ru', playCount) === 'one' ? 'раз' : getPluralCategory('ru', playCount) === 'few' ? 'раза' : 'раз'}`
    case 'ja':
      return `${album} - ${playCount} 回再生しました`
    case 'de':
      return `${album} - ${playCount} Mal gespielt`
    case 'pt-BR':
      return `${album} - reproduzido ${playCount} ${playCount === 1 ? 'vez' : 'vezes'}`
    case 'es':
      return `${album} - reproducido ${playCount} ${playCount === 1 ? 'vez' : 'veces'}`
    case 'it':
      return `${album} - riprodotto ${playCount} ${playCount === 1 ? 'volta' : 'volte'}`
    case 'nl':
      return `${album} - ${playCount} keer afgespeeld`
    case 'cs':
      return `${album} - přehráno ${playCount}×`
    case 'uk':
      return `${album} - відтворено ${playCount} ${getPluralCategory('uk', playCount) === 'one' ? 'раз' : getPluralCategory('uk', playCount) === 'few' ? 'рази' : 'разів'}`
    case 'sv':
      return `${album} - spelat ${playCount} ${playCount === 1 ? 'gång' : 'gånger'}`
    case 'id':
      return `${album} - diputar ${playCount} kali`
    default:
      return `${album} - played ${playCount === 1 ? 'once' : `${playCount} times`}`
  }
}
