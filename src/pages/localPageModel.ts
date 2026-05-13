import { getSongArtists } from '../shared/artists'
import type { LibrarySong, LocalFolderSortCriterion, ScanLibraryProgress, ScanLibraryResult } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getLocalTextQuickJumpBucket } from '../shared/textCompare'
import { normalizePath } from './localFolderModel'

export type LocalSortMode = LocalFolderSortCriterion

export function getFolderListItemKey(folderPath: string) {
  return `folder:${folderPath}`
}

export function getSongListItemKey(songId: number) {
  return `song:${songId}`
}

export function joinClassNames(...classNames: Array<string | false>) {
  return classNames.filter(Boolean).join(' ')
}

export function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  return left.size === right.size && [...left].every((item) => right.has(item))
}

function getFileTitle(filePath: string) {
  const fileName = normalizePath(filePath).split('/').at(-1) ?? filePath
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
}

function getRefreshChangeMessage(
  paths: string[],
  singleKey: string,
  multipleKey: string,
  t: Translator,
) {
  if (paths.length === 0) {
    return ''
  }

  return paths.length === 1
    ? t(singleKey, { name: getFileTitle(paths[0]!) })
    : t(multipleKey, { count: paths.length })
}

export function getRefreshResultMessage(result: ScanLibraryResult, t: Translator) {
  const messages = [
    getRefreshChangeMessage(result.filesAdded, 'local.refreshAddedOne', 'local.refreshAddedMultiple', t),
    getRefreshChangeMessage(result.filesRemoved, 'local.refreshRemovedOne', 'local.refreshRemovedMultiple', t),
    getRefreshChangeMessage(result.filesMoved, 'local.refreshMovedOne', 'local.refreshMovedMultiple', t),
  ].filter(Boolean)

  return messages.length > 0 ? messages.join(t('common.comma')) : t('local.refreshNoChange')
}

export function hasRefreshResultChanges(result: ScanLibraryResult) {
  return result.filesAdded.length > 0 || result.filesRemoved.length > 0 || result.filesMoved.length > 0
}

function getUpdateResultFileTitle(filePath: string, folderPath: string) {
  const normalizedFilePath = normalizePath(filePath)
  const normalizedFolderPath = normalizePath(folderPath)
  const filePathKey = normalizedFilePath.toLocaleLowerCase()
  const folderPathKey = normalizedFolderPath.toLocaleLowerCase()
  const relativePath = filePathKey.startsWith(`${folderPathKey}/`)
    ? normalizedFilePath.slice(normalizedFolderPath.length + 1)
    : normalizedFilePath
  const extensionIndex = relativePath.lastIndexOf('.')
  return extensionIndex > 0 ? relativePath.slice(0, extensionIndex) : relativePath
}

export function getUpdateResultFileItems(filePaths: string[], folderPath: string) {
  const items = filePaths.map((filePath) => ({
    path: filePath,
    title: getUpdateResultFileTitle(filePath, folderPath),
  }))
  const titleCounts = new Map<string, number>()
  for (const item of items) {
    titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1)
  }

  return items.map((item) => ({
    ...item,
    title: titleCounts.get(item.title)! > 1 ? item.path : item.title,
  }))
}

function getPathKey(filePath: string) {
  return normalizePath(filePath).toLocaleLowerCase()
}

export function findSongByPath(songs: LibrarySong[], songPath: string) {
  const targetPathKey = getPathKey(songPath)
  return songs.find((song) => getPathKey(song.path) === targetPathKey) ?? null
}

export function getRefreshFolderErrorMessage(error: string, t: Translator) {
  const notFoundPrefix = 'Folder not found: '
  const accessDeniedPrefix = 'Cannot access folder: '
  if (error.startsWith(notFoundPrefix)) {
    return t('local.updateFolderNotFound', { path: error.slice(notFoundPrefix.length) })
  }
  if (error.startsWith(accessDeniedPrefix)) {
    return t('local.updateFolderAccessDenied', { path: error.slice(accessDeniedPrefix.length) })
  }

  return error
}

export function getRefreshProgressMessage(progress: ScanLibraryProgress | null, t: Translator) {
  if (!progress) {
    return t('local.updateFolderLoading')
  }

  if (progress.stage === 'updating') {
    return t('local.updateFolderUpdatingLibrary')
  }

  return progress.folderName
    ? t('local.updateFolderChecking', { name: progress.folderName })
    : t('local.updateFolderLoading')
}

export function buildLocalSongQuickJumpMap(
  songs: LibrarySong[],
  sortMode: LocalSortMode,
  currentSortMode: LocalSortMode,
  t: Translator,
) {
  const indexes = new Map<string, number>()
  const quickJumpSortMode = sortMode === 'reverse' ? currentSortMode : sortMode

  songs.forEach((song, index) => {
    const bucket = getLocalTextQuickJumpBucket(getLocalSongQuickJumpValue(song, quickJumpSortMode, t))
    if (!indexes.has(bucket)) {
      indexes.set(bucket, index)
    }
  })

  return indexes
}

function getLocalSongQuickJumpValue(song: LibrarySong, sortMode: LocalSortMode, t: Translator) {
  switch (sortMode) {
    case 'artist':
      return getSongArtists(song, t('common.artistUnknown'))[0] ?? ''
    case 'album':
      return song.album || t('common.albumUnknown')
    case 'reverse':
    case 'title':
      return song.title
  }
}

export function getLocalSongQuickJumpBasisName(sortMode: LocalSortMode, currentSortMode: LocalSortMode, t: Translator) {
  const quickJumpSortMode = sortMode === 'reverse' ? currentSortMode : sortMode

  switch (quickJumpSortMode) {
    case 'artist':
      return t('common.artist')
    case 'album':
      return t('common.album')
    case 'reverse':
    case 'title':
      return t('musicLibrary.titleHeader')
  }
}
