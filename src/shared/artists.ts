import type { LibrarySong } from './contracts'

const UNKNOWN_ARTIST = 'Unknown artist'
const DEFAULT_SEPARATOR = ', '

export function normalizeArtists(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const artists: string[] = []

  for (const value of values) {
    for (const artist of splitArtistValue(value)) {
      const key = artist.toLocaleLowerCase()

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      artists.push(artist)
    }
  }

  return artists
}

export function getSongArtists(song: Pick<LibrarySong, 'artist' | 'artists'>, unknownArtist = UNKNOWN_ARTIST) {
  const artists = song.artists.length > 0 ? song.artists : normalizeArtists([song.artist])
  return artists.length > 0 ? artists : [unknownArtist]
}

// Joins artist names. Pass a localized separator (e.g. t('common.artistSeparator'))
// when the result will be shown in the UI. Without a separator the function falls
// back to ', ' which is the canonical form used for non-localized contexts such
// as the Music.Artist SQL column or ID3 tag writes.
export function joinArtists(artists: readonly string[], separator: string = DEFAULT_SEPARATOR) {
  if (artists.length === 0) {
    return ''
  }
  return artists.join(separator)
}

export function getDisplayArtists(
  song: Pick<LibrarySong, 'artist' | 'artists'>,
  unknownArtist = UNKNOWN_ARTIST,
  separator: string = DEFAULT_SEPARATOR,
) {
  const artists = getSongArtists(song, unknownArtist)
  return artists.length > 0 ? joinArtists(artists, separator) : unknownArtist
}

function splitArtistValue(value: string | null | undefined) {
  return (value ?? '')
    .split(/\s*(?:;|\uFF1B|\u3001|\|)\s*/u)
    .map((artist) => artist.trim())
    .filter(Boolean)
}
