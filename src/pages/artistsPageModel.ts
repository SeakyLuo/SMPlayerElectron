import { getSongArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

export interface ArtistGroup {
  name: string
  songs: LibrarySong[]
  albumCount: number
  artworkUrl: string
  artworkSongId: number | null
}

export interface AlbumGroup {
  name: string
  songs: LibrarySong[]
  artworkUrl: string
  duration: number
}

export const ARTIST_ROW_HEIGHT = 48
export const ARTIST_OVERSCAN_ROWS = 10
const ARTIST_ALBUM_CARD_HEADER_HEIGHT = 112
const ARTIST_ALBUM_SONG_ROW_HEIGHT = 48
const ARTIST_ALBUM_CARD_GAP = 22
const ARTIST_ALBUM_OVERSCAN_ROWS = 2
export const ARTIST_QUICK_JUMP_KEYS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const artistTextCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

const ARTIST_PINYIN_BOUNDARIES = [
  ['A', '阿'],
  ['B', '芭'],
  ['C', '擦'],
  ['D', '搭'],
  ['E', '蛾'],
  ['F', '发'],
  ['G', '噶'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '期'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '压'],
  ['Z', '匝'],
] as const

export function shuffleSongIds(songIds: number[]) {
  const shuffledSongIds = songIds.slice()

  for (let index = shuffledSongIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffledSongIds[index]
    shuffledSongIds[index] = shuffledSongIds[randomIndex]
    shuffledSongIds[randomIndex] = current
  }

  return shuffledSongIds
}

export function getSongsAddedMessage(songs: LibrarySong[], target: string, t: Translator) {
  return songs.length === 1
    ? t('notification.songAddedTo', { title: songs[0]!.title, target })
    : t('notification.songsAddedTo', { count: songs.length, target })
}

export function getSongsByIds(songs: LibrarySong[], songIds: number[]) {
  const songIdSet = new Set(songIds)
  return songs.filter((song) => songIdSet.has(song.id))
}

export function searchArtists(artists: ArtistGroup[], query: string) {
  const keyword = query.trim()
  if (!keyword) {
    return artists
  }

  return artists
    .map((artist) => ({ artist, score: evaluateString(artist.name, keyword) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.artist)
}

export function buildArtistQuickJumpMap(artists: ArtistGroup[]) {
  const indexes = new Map<string, number>()

  artists.forEach((artist, index) => {
    const bucket = getArtistQuickJumpBucket(artist.name)
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

export function getArtistQuickJumpBucket(artistName: string) {
  const firstChar = artistName.trim().charAt(0)
  const normalizedFirstChar = firstChar
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase()

  if (/^[A-Z]$/.test(normalizedFirstChar)) {
    return normalizedFirstChar
  }

  if (!/[\u3400-\u9fff]/.test(firstChar)) {
    return '#'
  }

  for (let index = ARTIST_PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [key, boundary] = ARTIST_PINYIN_BOUNDARIES[index]!
    if (artistTextCollator.compare(firstChar, boundary) >= 0) {
      return key
    }
  }

  return '#'
}

function compareArtistText(left: string, right: string) {
  const leftBucketIndex = ARTIST_QUICK_JUMP_KEYS.indexOf(getArtistQuickJumpBucket(left))
  const rightBucketIndex = ARTIST_QUICK_JUMP_KEYS.indexOf(getArtistQuickJumpBucket(right))

  if (leftBucketIndex !== rightBucketIndex) {
    return leftBucketIndex - rightBucketIndex
  }

  return artistTextCollator.compare(left, right)
}

function evaluateString(value: string, keyword: string, offset = 0) {
  if (!value) {
    return 0
  }

  if (value === keyword) {
    return 100 + offset
  }

  const normalizedValue = value.toLocaleLowerCase()
  const normalizedKeyword = keyword.toLocaleLowerCase()

  if (normalizedValue === normalizedKeyword) {
    return 95 + offset
  }

  if (value.startsWith(keyword)) {
    return 90 + offset
  }

  if (normalizedValue.startsWith(normalizedKeyword)) {
    return 85 + offset
  }

  if (value.includes(keyword)) {
    return 80 + offset
  }

  if (normalizedValue.includes(normalizedKeyword)) {
    return 75 + offset
  }

  if (normalizedKeyword.includes(normalizedValue)) {
    return 70 + offset
  }

  const editDistance = getEditDistance(value, keyword)
  const ratio = Math.floor((editDistance * 100) / Math.max(value.length, keyword.length))
  return ratio <= 60 ? 70 - ratio + offset : 0
}

function getEditDistance(target: string, given: string) {
  const rows = target.length
  const columns = given.length
  if (rows * columns === 0) {
    return rows + columns
  }

  const dp = Array.from({ length: rows + 1 }, (_, rowIndex) =>
    Array.from({ length: columns + 1 }, (_, columnIndex) => rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0),
  )

  for (let rowIndex = 1; rowIndex <= rows; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= columns; columnIndex += 1) {
      const left = dp[rowIndex - 1][columnIndex] + 1
      const down = dp[rowIndex][columnIndex - 1] + 1
      const leftDown = dp[rowIndex - 1][columnIndex - 1] + (target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1)
      dp[rowIndex][columnIndex] = Math.min(left, down, leftDown)
    }
  }

  return dp[rows][columns]
}

export function buildArtistGroups(songs: LibrarySong[], t: Translator) {
  const groups = new Map<string, ArtistGroup>()

  for (const song of songs) {
    for (const artistName of getSongArtists(song, t('common.artistUnknown'))) {
      const group =
        groups.get(artistName) ?? {
          name: artistName,
          songs: [],
          albumCount: 0,
          artworkUrl: '',
          artworkSongId: null,
        }

      group.songs.push(song)
      groups.set(artistName, group)
    }
  }

  return [...groups.values()]
    .map((artist) => {
      const artworkSong = artist.songs
        .filter((song) => song.artworkUrl)
        .sort((left, right) => Date.parse(right.dateAdded) - Date.parse(left.dateAdded))[0]
      const latestSong = artist.songs
        .slice()
        .sort((left, right) => Date.parse(right.dateAdded) - Date.parse(left.dateAdded))[0]!

      return {
        ...artist,
        albumCount: new Set(artist.songs.map((song) => song.album || t('common.albumUnknown'))).size,
        artworkUrl: artworkSong?.artworkUrl ?? '',
        artworkSongId: artworkSong?.id ?? latestSong.id,
        songs: artist.songs.slice().sort((left, right) =>
          compareArtistText(left.album || '', right.album || '') || compareArtistText(left.title, right.title),
        ),
      }
    })
    .sort((left, right) => compareArtistText(left.name, right.name))
}

export function buildAlbumGroups(songs: LibrarySong[], t: Translator): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>()

  for (const song of songs) {
    const albumName = song.album || t('common.albumUnknown')
    const group =
      groups.get(albumName) ?? {
        name: albumName,
        songs: [],
        artworkUrl: '',
        duration: 0,
      }

    group.songs.push(song)
    group.duration += song.duration
    if (!group.artworkUrl && song.artworkUrl) {
      group.artworkUrl = song.artworkUrl
    }
    groups.set(albumName, group)
  }

  return [...groups.values()].sort((left, right) => compareArtistText(left.name, right.name))
}

export function getEstimatedArtistAlbumHeight(album: AlbumGroup, compact: boolean) {
  const headerHeight = compact ? 88 : ARTIST_ALBUM_CARD_HEADER_HEIGHT
  const songRowHeight = compact ? 42 : ARTIST_ALBUM_SONG_ROW_HEIGHT
  const cardGap = compact ? 12 : ARTIST_ALBUM_CARD_GAP
  return headerHeight + album.songs.length * songRowHeight + cardGap
}

export function getArtistAlbumVirtualWindow(heights: number[], scrollTop: number, viewportHeight: number) {
  const overscanHeight = ARTIST_ALBUM_OVERSCAN_ROWS * (ARTIST_ALBUM_CARD_HEADER_HEIGHT + ARTIST_ALBUM_SONG_ROW_HEIGHT)
  const windowTop = Math.max(0, scrollTop - overscanHeight)
  const windowBottom = scrollTop + viewportHeight + overscanHeight
  let startIndex = 0
  let endIndex = heights.length
  let offset = 0
  let topSpacerHeight = 0

  for (let index = 0; index < heights.length; index += 1) {
    const nextOffset = offset + heights[index]!
    if (nextOffset > windowTop) {
      startIndex = index
      topSpacerHeight = offset
      break
    }
    offset = nextOffset
  }

  offset = topSpacerHeight
  for (let index = startIndex; index < heights.length; index += 1) {
    offset += heights[index]!
    if (offset >= windowBottom) {
      endIndex = index + 1
      break
    }
  }

  const totalHeight = heights.reduce((sum, height) => sum + height, 0)
  const renderedHeight = heights.slice(startIndex, endIndex).reduce((sum, height) => sum + height, 0)
  const bottomSpacerHeight = Math.max(0, totalHeight - topSpacerHeight - renderedHeight)

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  }
}

export function getArtistRoute(routeBase: string, artistName: string) {
  const encodedArtist = encodeURIComponent(artistName)
  return routeBase ? `${routeBase}/artists/${encodedArtist}` : `/artists?artist=${encodedArtist}`
}

export function getAlbumRoute(routeBase: string, albumName: string) {
  const encodedAlbum = encodeURIComponent(albumName)
  return routeBase ? `${routeBase}/albums/${encodedAlbum}` : `/albums?album=${encodedAlbum}`
}
