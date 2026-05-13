const LATIN1_MOJIBAKE_PATTERN = /[\u00A1-\u00FF]/gu
const LATIN1_MOJIBAKE_RUN_PATTERN = /[\u00A1-\u00FF]{2,}/u
const CJK_PATTERN = /[\u3400-\u9FFF]/gu
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

  return [...artists, artist]
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
