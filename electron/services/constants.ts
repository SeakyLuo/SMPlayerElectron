export const SMPLAYER_DB_NAME = 'SMPlayerSettings.db'

export const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aiff',
  '.alac',
  '.ape',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav',
  '.wma',
])

export const PLAYLIST_NAMES = {
  myFavorites: 'My Favorites',
  nowPlaying: 'Now Playing',
} as const

export const ACTIVE_STATE = {
  inactive: 0,
  active: 1,
} as const
