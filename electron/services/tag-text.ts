const LATIN1_MOJIBAKE_PATTERN = /[\u00A1-\u00FF]/gu
const LATIN1_MOJIBAKE_RUN_PATTERN = /[\u00A1-\u00FF]{2,}/u
const CJK_PATTERN = /[\u3400-\u9FFF]/gu
const ARTIST_MERGE_SPLIT_PATTERN = /\s*(?:\/|\uFF0F|;|\uFF1B|,|\uFF0C|\u3001|\|)\s*/u
const gb18030Decoder = new TextDecoder('gb18030')

export function normalizeTagText(value: string | null | undefined) {
  const text = value?.trim() ?? ''
  if (!text) {
    return ''
  }

  return shouldRepairLatin1Mojibake(text) ? repairLatin1Mojibake(text) : text
}

export function normalizeArtistTagValues(
  artistValues: Array<string | null | undefined>,
  artistValue: string | null | undefined,
) {
  const artist = normalizeArtistDisplayText(normalizeTagText(artistValue))
  const artists = artistValues.map((value) => normalizeArtistDisplayText(normalizeTagText(value))).filter(Boolean)

  if (artist && isSlashArtistSplit(artist, artists)) {
    return [artist]
  }

  if (artist && isParentheticalAliasCoveredByArtists(artist, artists)) {
    return artists
  }

  // music-metadata typically reports both a multi-value `artists` array and a
  // pre-joined `artist` string. When `artist` is just `artists` glued together
  // with common separators (",", "、", ";", "|", etc.), keeping it would
  // pollute MusicArtist with a composite row like "周杰伦,温岚" alongside the
  // proper "周杰伦" / "温岚" rows.
  if (artist && isArtistMergedFromArtists(artist, artists)) {
    return artists
  }

  // Mirror image of the previous case: some files contain inconsistent tag
  // frames (e.g. ID3v2 TPE1 = "周杰伦, 温岚" but APEv2 Artist = "温岚"). music-
  // metadata then reports `artists = ["周杰伦, 温岚"]` together with `artist =
  // "温岚"`. Without exploding the composite item, the downstream pipeline
  // would persist a dirty MusicArtist row. Only trigger when `artist` itself
  // does not split (single atom), is not already a member of `artists`, and is
  // exactly one of the segments of some composite `artists[i]`. This keeps
  // band names like "Earth, Wind & Fire" intact because in that case `artist`
  // typically equals `artists[0]` (full member match) and the rule no-ops.
  const expandedFromComposite = explodeCompositeArtistsContainingArtist(artist, artists)
  if (expandedFromComposite) {
    return expandedFromComposite
  }

  return [...artists, artist]
}

function explodeCompositeArtistsContainingArtist(artist: string, artists: string[]) {
  if (!artist || artists.length === 0) {
    return null
  }

  const artistParts = artist
    .split(ARTIST_MERGE_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(Boolean)
  if (artistParts.length !== 1) {
    return null
  }

  const artistKey = artist.toLocaleLowerCase()
  if (artists.some((value) => value.toLocaleLowerCase() === artistKey)) {
    return null
  }

  let mutated = false
  const result: string[] = []
  const seen = new Set<string>()
  const pushUnique = (value: string) => {
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    result.push(value)
  }

  for (const value of artists) {
    const parts = value
      .split(ARTIST_MERGE_SPLIT_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 1 && parts.some((part) => part.toLocaleLowerCase() === artistKey)) {
      mutated = true
      for (const part of parts) {
        pushUnique(part)
      }
    } else {
      pushUnique(value)
    }
  }

  if (!mutated) {
    return null
  }

  pushUnique(artist)
  return result
}

function normalizeArtistDisplayText(value: string) {
  const parts = value
    .split(/\s*(?:,|，)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 2) {
    return value
  }

  for (const part of parts) {
    if (!part.includes('/')) {
      continue
    }

    const slashParts = part
      .split('/')
      .map((item) => item.trim().toLocaleLowerCase())
      .filter(Boolean)
    const slashPartSet = new Set(slashParts)
    const otherParts = parts.filter((item) => item !== part)

    if (slashParts.length > 1 && otherParts.length > 0 && otherParts.every((item) => slashPartSet.has(item.toLocaleLowerCase()))) {
      return part
    }
  }

  return value
}

function shouldRepairLatin1Mojibake(value: string) {
  if (!LATIN1_MOJIBAKE_RUN_PATTERN.test(value)) {
    return false
  }

  const latin1SignalCount = value.match(LATIN1_MOJIBAKE_PATTERN)?.length ?? 0
  const repaired = repairLatin1Mojibake(value)
  const cjkCount = repaired.match(CJK_PATTERN)?.length ?? 0
  return cjkCount >= 2 && cjkCount >= Math.floor(latin1SignalCount / 2)
}

function repairLatin1Mojibake(value: string) {
  return gb18030Decoder.decode(Buffer.from(value, 'latin1')).trim()
}

function isSlashArtistSplit(artist: string, artists: string[]) {
  if (!artist.includes('/') || artists.length === 0) {
    return false
  }

  const slashParts = artist
    .split('/')
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean)
  const artistSet = new Set(artists.map((value) => value.toLocaleLowerCase()))

  return slashParts.length > 1 && artists.every((value) =>
    value === artist || slashParts.includes(value.toLocaleLowerCase()),
  ) && slashParts.every((part) => artistSet.has(part) || artistSet.has(artist.toLocaleLowerCase()))
}

function isParentheticalAliasCoveredByArtists(artist: string, artists: string[]) {
  if (artists.length === 0) {
    return false
  }

  const baseName = artist.replace(/\s*\([^)]*\)\s*$/u, '').trim()
  if (!baseName || baseName === artist) {
    return false
  }

  return artists.some((value) => value.toLocaleLowerCase() === baseName.toLocaleLowerCase())
}

function isArtistMergedFromArtists(artist: string, artists: string[]) {
  if (artists.length === 0) {
    return false
  }

  const parts = artist
    .split(ARTIST_MERGE_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return false
  }

  const artistKeys = new Set(artists.map((value) => value.toLocaleLowerCase()))
  return parts.every((part) => artistKeys.has(part.toLocaleLowerCase()))
}
