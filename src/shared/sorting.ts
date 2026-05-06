import type { LibrarySong, MusicLibrarySortCriterion } from './contracts'
import { getDisplayArtists } from './artists'
import type { Translator } from './i18n'

export const musicLibrarySortOptions: Array<{
  value: MusicLibrarySortCriterion
  label: string
}> = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'duration', label: 'Duration' },
  { value: 'play-count', label: 'Play count' },
  { value: 'date-added', label: 'Date added' },
]

export function getMusicLibrarySortOptions(t: Translator) {
  return musicLibrarySortOptions.map((option) => ({
    ...option,
    label: t(`sort.${option.value}`),
  }))
}

export function sortLibrarySongs(
  songs: LibrarySong[],
  criterion: MusicLibrarySortCriterion,
) {
  return songs.slice().sort((left, right) => {
    switch (criterion) {
      case 'artist':
        return compareText(getDisplayArtists(left), getDisplayArtists(right)) || compareText(left.title, right.title)
      case 'album':
        return compareText(left.album, right.album) || compareText(left.title, right.title)
      case 'duration':
        return left.duration - right.duration || compareText(left.title, right.title)
      case 'play-count':
        return right.playCount - left.playCount || compareText(left.title, right.title)
      case 'date-added':
        return compareDate(right.dateAdded, left.dateAdded) || compareText(left.title, right.title)
      default:
        return compareText(left.title, right.title) || compareText(getDisplayArtists(left), getDisplayArtists(right))
    }
  })
}

function compareText(left: string, right: string) {
  return (left || '').localeCompare(right || '', undefined, { sensitivity: 'base' })
}

function compareDate(left: string, right: string) {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0
  }

  if (Number.isNaN(leftTime)) {
    return 1
  }

  if (Number.isNaN(rightTime)) {
    return -1
  }

  return leftTime - rightTime
}
