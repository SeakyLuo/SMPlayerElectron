import type { LibraryCounts, LibrarySong } from './shared/contracts'
import type { Translator } from './shared/i18n'

export const RESTORABLE_ROUTES = new Set([
  '/songs',
  '/artists',
  '/albums',
  '/now-playing',
  '/recent',
  '/local',
  '/playlists',
  '/favorites',
])

export const SCROLLBAR_HOST_SELECTOR = [
  '.sidebar',
  '.workspace-content',
  '.table-shell',
  '.albums-grid',
  '.artists-list',
  '.artists-detail',
  '.headered-playlist-control',
  '.library-context-menu',
  '.library-context-submenu-panel',
  '.local-scroll-shell',
  '.now-playing-list-shell',
  '.release-notes-list',
  '.remote-share-body',
  '.lyrics-scroll-shell',
  '.preference-page',
  '.playlists-page',
  '.recent-grid-shell',
  '.recent-search-list',
  '.recent-page',
  '.settings-page',
  '.settings-time-column',
  '.voice-assistant-help-body',
].join(',')
export const SCROLLBAR_HOVER_CLASS = 'is-scrollbar-hovered'
export const RESTORABLE_SCROLL_SELECTORS = [
  '.workspace-content',
  '.table-shell',
  '.albums-grid',
  '.artists-list',
  '.artists-detail',
  '.headered-playlist-control',
  '.local-scroll-shell',
  '.now-playing-list-shell',
  '.lyrics-scroll-shell',
  '.preference-page',
  '.playlists-page',
  '.recent-grid-shell',
  '.recent-search-list',
  '.recent-page',
  '.settings-page',
]

// Matches the original UWP MinimalNavigationViewWindowWidth resource.
export const NAVIGATION_MINIMAL_BREAKPOINT = 720
export const NAVIGATION_OVERLAY_BREAKPOINT = 1200

export function resolveRestoredPage(lastPage: string) {
  const normalizedPath = lastPage.trim()

  if (RESTORABLE_ROUTES.has(normalizedPath)) {
    return normalizedPath
  }

  return '/songs'
}

export function compareAppVersions(left: string, right: string) {
  const leftParts = left.split('.').map((part) => Number(part))
  const rightParts = right.split('.').map((part) => Number(part))
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

export function getRouteSection(pathname: string) {
  if (pathname.startsWith('/artists/')) {
    return '/artists'
  }

  if (pathname.startsWith('/albums/')) {
    return '/albums'
  }

  if (pathname.startsWith('/local/')) {
    return '/local'
  }

  if (pathname.startsWith('/playlists/')) {
    return '/playlists'
  }

  if (RESTORABLE_ROUTES.has(pathname)) {
    return pathname
  }

  return null
}

export function isAlbumDetailRoute(pathname: string) {
  return pathname.startsWith('/albums/')
}

export function isPlaylistDetailRoute(pathname: string) {
  return pathname.startsWith('/playlists/') || pathname.startsWith('/favorites')
}

export function getScrollElementKey(root: HTMLElement, element: HTMLElement) {
  if (element === root) {
    return 'workspace-content:0'
  }

  const selector = RESTORABLE_SCROLL_SELECTORS.find((item) => element.matches(item))
  if (!selector) {
    return null
  }

  const elements = Array.from(root.querySelectorAll(selector))
  const index = elements.indexOf(element)

  return `${selector}:${index}`
}

export function applyThemeColor(themeColor: string) {
  const rgb = hexToRgb(themeColor)
  if (!rgb) {
    return
  }

  const root = document.documentElement
  root.style.setProperty('--accent', themeColor)
  root.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
  root.style.setProperty('--accent-strong', `rgb(${Math.max(0, rgb.r - 18)} ${Math.max(0, rgb.g - 14)} ${Math.max(0, rgb.b - 10)})`)
  root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`)
  root.style.setProperty('--accent-surface', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`)
  root.style.setProperty('--accent-shadow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.26)`)
  root.style.setProperty('--focus', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.82)`)
}

export function getClockMinute() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function settingsTimeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function isClockMinuteInRange(current: number, start: number, end: number) {
  if (start < end) {
    return current >= start && current < end
  }

  return current >= start || current < end
}

export function getNextClockMinuteDelay(targetMinutes: number[]) {
  const now = new Date()
  const nowTime = now.getTime()
  const nextTimes = targetMinutes.map((targetMinute) => {
    const target = new Date(now)
    target.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0)
    if (target.getTime() <= nowTime) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  })

  return Math.min(...nextTimes) - nowTime
}

export function findBest<T>(items: T[], query: string, getCandidates: (item: T) => string[]) {
  let best: { item: T; score: number } | null = null

  for (const item of items) {
    const score = Math.max(...getCandidates(item).map((candidate) => getSearchScore(query, candidate)))
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score }
    }
  }

  return best
}

export function getFolderName(path: string) {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) ?? path
}

export function findSongsInFolder(songs: LibrarySong[], folderPath: string) {
  return songs.filter((song) => getSongFolder(song.path) === folderPath)
}

export function getPageTitle(
  pathname: string,
  counts: LibraryCounts,
  t: Translator,
  showCount: boolean,
  searchQuery: string,
  searchFolderName: string,
  nowPlayingCount: number,
  playlistCount: number,
) {
  if (pathname.startsWith('/artists/')) {
    return t('detail.artistEyebrow')
  }

  if (pathname.startsWith('/albums/')) {
    return ''
  }

  if (pathname.startsWith('/artists')) {
    return showCount
      ? t('library.allArtistsWithCount', { count: counts.artists })
      : t('library.allArtists')
  }

  if (pathname.startsWith('/albums')) {
    return showCount
      ? t('library.allAlbumsWithCount', { count: counts.albums })
      : t('library.allAlbums')
  }

  if (pathname.startsWith('/now-playing')) {
    return showCount
      ? t('nowPlaying.titleWithCount', { count: nowPlayingCount })
      : t('common.nowPlaying')
  }

  if (pathname.startsWith('/hidden-folders')) {
    return t('local.hiddenFolders')
  }

  if (pathname.startsWith('/recent')) {
    return ''
  }

  if (pathname.startsWith('/local')) {
    return t('common.local')
  }

  if (pathname.startsWith('/remote')) {
    return t('remoteShare.remoteLibrary')
  }

  if (pathname.startsWith('/playlists')) {
    if (pathname.startsWith('/playlists/')) {
      return ''
    }

    return showCount
      ? t('search.playlistsWithCount', { count: playlistCount })
      : t('common.playlists')
  }

  if (pathname.startsWith('/favorites')) {
    return ''
  }

  if (pathname.startsWith('/search')) {
    const query = searchQuery.trim()
    if (query && searchFolderName) {
      return t('search.directoryResultOf', { query, folder: searchFolderName })
    }
    return query ? t('search.resultOf', { query }) : t('search.resultTitle')
  }

  if (pathname.startsWith('/settings')) {
    return t('common.settings')
  }

  return showCount
    ? t('library.allSongsWithCount', { count: counts.songs })
    : t('library.allSongs')
}

export function getSearchFolderPath(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return ''
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${folderRelativePath.split('/').join(separator)}`
}

export function getSearchFolderName(rootPath: string, folderRelativePath: string) {
  if (!folderRelativePath) {
    return ''
  }

  return folderRelativePath.split('/').filter(Boolean).at(-1) ?? rootPath.split(/[\\/]+/).filter(Boolean).at(-1) ?? ''
}

function hexToRgb(color: string) {
  const normalized = color.replace('#', '').trim()
  const hex = normalized.length === 3
    ? normalized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : normalized

  if (!/^[\da-f]{6}$/i.test(hex)) {
    return null
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function getSearchScore(query: string, candidate: string) {
  const trimmedQuery = query.trim()
  const trimmedCandidate = candidate.trim()

  if (!trimmedQuery || !trimmedCandidate) {
    return 0
  }

  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const normalizedCandidate = trimmedCandidate.toLocaleLowerCase()

  if (trimmedCandidate === trimmedQuery) {
    return 100
  }

  if (normalizedCandidate === normalizedQuery) {
    return 95
  }

  if (trimmedCandidate.startsWith(trimmedQuery)) {
    return 90
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 85
  }

  if (trimmedCandidate.includes(trimmedQuery)) {
    return 80
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return 75
  }

  if (normalizedQuery.includes(normalizedCandidate)) {
    return 70
  }

  const editDistance = getEditDistance(normalizedCandidate, normalizedQuery)
  const ratio = Math.floor((editDistance * 100) / Math.max(normalizedCandidate.length, normalizedQuery.length))
  return ratio <= 60 ? 70 - ratio : 0
}

function getEditDistance(target: string, given: string) {
  const dp = Array.from({ length: target.length + 1 }, (_, rowIndex) =>
    Array.from({ length: given.length + 1 }, (__, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  )

  for (let rowIndex = 1; rowIndex <= target.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= given.length; columnIndex += 1) {
      const replaceCost = target[rowIndex - 1] === given[columnIndex - 1] ? 0 : 1
      dp[rowIndex][columnIndex] = Math.min(
        dp[rowIndex - 1][columnIndex] + 1,
        dp[rowIndex][columnIndex - 1] + 1,
        dp[rowIndex - 1][columnIndex - 1] + replaceCost,
      )
    }
  }

  return dp[target.length][given.length]
}

function getSongFolder(path: string) {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(0, index) : ''
}
