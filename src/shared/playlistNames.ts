import type { LibraryPlaylist } from './contracts'
import type { Translator } from './i18n'

export function getNextPlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  const existingNames = new Set(playlists.map((playlist) => playlist.name))
  if (!existingNames.has(name)) {
    return name
  }

  for (let index = 1; ; index += 1) {
    const nextName = t('playlists.nameTemplate', { name, index })
    if (!existingNames.has(nextName)) {
      return nextName
    }
  }
}
