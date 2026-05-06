import type { LibrarySong } from './contracts'

const UNKNOWN_ARTIST = 'Unknown artist'

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

export function getSongArtists(song: Pick<LibrarySong, 'artist' | 'artists'>) {
  const artists = song.artists.length > 0 ? song.artists : normalizeArtists([song.artist])
  return artists.length > 0 ? artists : [UNKNOWN_ARTIST]
}

export function getDisplayArtists(song: Pick<LibrarySong, 'artist' | 'artists'>) {
  const artists = getSongArtists(song)
  return artists.length > 0 ? artists.join(', ') : UNKNOWN_ARTIST
}

function splitArtistValue(value: string | null | undefined) {
  return (value ?? '')
    .split(/\s*(?:;|；|、|\|)\s*/u)
    .map((artist) => artist.trim())
    .filter(Boolean)
}
