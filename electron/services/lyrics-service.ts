import { access, readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { parseFile } from 'music-metadata'

import type {
  LyricsLine,
  LyricsRequestMode,
  LyricsSnapshot,
  LyricsSource,
} from '../../src/shared/contracts.ts'
import { stripLyricsTimestamps } from '../../src/shared/lyrics.ts'
import { AUDIO_EXTENSIONS, ACTIVE_STATE } from './constants.ts'
import type { Id3TagService } from './id3-tag-service.ts'
import {
  mapPreferredLanguage,
  type SettingsRow,
  type SettingsService,
} from './settings-service.ts'
import type { SongService } from './song-service.ts'

const LYRICS_REQUEST_TIMEOUT_MS = 10_000

export interface LyricsSongLookup {
  title: string
  artist: string
  album: string
  path: string
}

export class LyricsService {
  private readonly db: DatabaseSync
  private readonly id3TagService: Id3TagService
  private readonly settingsService: SettingsService
  private readonly songService: SongService

  constructor(
    db: DatabaseSync,
    id3TagService: Id3TagService,
    settingsService: SettingsService,
    songService: SongService,
  ) {
    this.db = db
    this.id3TagService = id3TagService
    this.settingsService = settingsService
    this.songService = songService
  }

  async getLyrics(songId: number, mode: LyricsRequestMode = 'auto'): Promise<LyricsSnapshot> {
    const song = this.getSongLookup(songId)

    const sidecarLyrics = await this.getSidecarLyrics(song.path)

    if (mode === 'embedded') {
      const embeddedLyrics = await this.getEmbeddedLyrics(song.path)
      return this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')
    }

    if (mode === 'auto') {
      const embeddedLyrics = await this.getEmbeddedLyrics(song.path)
      const localSnapshot = sidecarLyrics
        ?? this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')

      if (localSnapshot.isSynced) {
        return localSnapshot
      }

      const internetSnapshot = await this.getSyncedInternetLyrics(song)
      if (internetSnapshot) {
        return internetSnapshot
      }

      return localSnapshot
    }

    if (mode !== 'internet' && sidecarLyrics) {
      return sidecarLyrics
    }

    if (mode === 'internet') {
      const settings = this.settingsService.getSettings()
      const internetLyrics = this.prepareInternetLyrics(await this.searchInternetLyrics(song), settings)
      return this.createLyricsSnapshot(internetLyrics, internetLyrics ? 'internet' : 'none')
    }

    const embeddedLyrics = await this.getEmbeddedLyrics(song.path)
    if (embeddedLyrics) {
      return this.createLyricsSnapshot(embeddedLyrics, 'music-file')
    }

    return this.createLyricsSnapshot('', 'none')
  }

  private async getSyncedInternetLyrics(song: LyricsSongLookup) {
    const rawLyrics = await this.searchInternetLyrics(song)
    if (!rawLyrics.trim()) {
      return null
    }

    const snapshot = this.createLyricsSnapshot(rawLyrics, 'internet')
    return snapshot.isSynced && snapshot.lines.length > 0 ? snapshot : null
  }

  async saveInternetLyricsToFile(songId: number) {
    const song = this.getSongLookup(songId)

    return this.saveInternetLyricsForSong(song)
  }

  async saveInternetLyricsForSong(song: LyricsSongLookup) {
    const existingLyrics = await this.getExistingLyrics(song.path)
    if (existingLyrics.rawText.trim()) {
      return { status: 'skipped' as const }
    }

    const settings = this.settingsService.getSettings()
    const internetLyrics = this.prepareInternetLyrics(await this.searchInternetLyrics(song), settings)
    if (!internetLyrics.trim()) {
      return { status: 'missing' as const }
    }

    await this.writeLyricsToSongPath(song.path, internetLyrics)

    return { status: 'saved' as const }
  }

  async readLyricsFromFile(filePath: string) {
    if (AUDIO_EXTENSIONS.has(extname(filePath).toLocaleLowerCase())) {
      return this.getEmbeddedLyrics(filePath)
    }

    return readFile(filePath, 'utf8')
  }

  async saveSongLyrics(songId: number, rawLyrics: string) {
    const song = this.getSongLookup(songId)

    await this.writeLyricsToSongPath(song.path, rawLyrics)
  }

  getLyricsSearchUrl(songId: number) {
    const song = this.getSongLookup(songId)

    const settings = this.settingsService.getSettings()
    const preferredLanguage = mapPreferredLanguage(settings.VoiceAssistantPreferredLanguage)
    const isChineseLanguage = preferredLanguage === 'zh-CN' || preferredLanguage === 'zh-Hant'
    const keyword = isChineseLanguage ? '\u6b4c\u8bcd' : 'lyrics'
    const host = isChineseLanguage ? 'https://cn.bing.com/search' : 'https://www.bing.com/search'
    const searchQuery = [keyword, song.title, song.artist].filter(Boolean).join(' ')
    return `${host}?q=${encodeURIComponent(searchQuery)}`
  }

  private getSongLookup(songId: number): LyricsSongLookup {
    const path = this.songService.getSongPath(songId)
    const song = this.db.prepare(`
      SELECT
        Music.Name AS title,
        Music.Artist AS artist,
        Music.Album AS album
      FROM Music
      WHERE Music.Id = ?
        AND Music.State = ?
      LIMIT 1
    `).get(songId, ACTIVE_STATE.active) as Omit<LyricsSongLookup, 'path'> | undefined

    if (!song) {
      throw new Error('Song not found.')
    }

    return {
      ...song,
      path,
    }
  }

  private async getExistingLyrics(songPath: string) {
    const sidecarLyrics = await this.getSidecarLyrics(songPath)
    if (sidecarLyrics) {
      return sidecarLyrics
    }

    const embeddedLyrics = await this.getEmbeddedLyrics(songPath)
    return this.createLyricsSnapshot(embeddedLyrics, embeddedLyrics ? 'music-file' : 'none')
  }


  private async writeLyricsToSongPath(songPath: string, rawLyrics: string) {
    const extension = extname(songPath)
    const basePath = songPath.slice(0, songPath.length - extension.length)
    const sidecarLrcPath = `${basePath}.lrc`
    const sidecarTextPath = `${basePath}.txt`
    const sidecarLrcExists = await this.fileExists(sidecarLrcPath)
    const sidecarTextExists = await this.fileExists(sidecarTextPath)

    if (extension.toLocaleLowerCase() === '.mp3') {
      await this.id3TagService.writeEmbeddedLyrics(songPath, rawLyrics)
      if (sidecarLrcExists) {
        await writeFile(sidecarLrcPath, rawLyrics, 'utf8')
      }
      if (sidecarTextExists) {
        await writeFile(sidecarTextPath, rawLyrics, 'utf8')
      }
      return
    }

    if (sidecarLrcExists) {
      await writeFile(sidecarLrcPath, rawLyrics, 'utf8')
      if (rawLyrics.trim()) {
        return
      }
    }

    if (sidecarTextExists) {
      await writeFile(sidecarTextPath, rawLyrics, 'utf8')
      if (rawLyrics.trim()) {
        return
      }
    }

    await writeFile(sidecarLrcPath, rawLyrics, 'utf8')
  }

  private async readTextIfExists(filePath: string) {
    try {
      return await readFile(filePath, 'utf8')
    } catch {
      return ''
    }
  }

  private async fileExists(filePath: string) {
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }

  private createLyricsSnapshot(rawText: string, source: LyricsSource): LyricsSnapshot {
    const normalizedText = rawText.replace(/^\uFEFF/, '').trim()
    const lines = this.parseLyricsLines(normalizedText)

    return {
      source,
      isSynced: lines.some((line) => line.timestampMs != null),
      rawText: normalizedText,
      lines,
    }
  }

  private parseLyricsLines(rawText: string): LyricsLine[] {
    if (!rawText) {
      return []
    }

    const metadataRegex = /^\[(ti|ar|al|by|offset):/i
    const offsetRegex = /^\[offset:([+-]?\d+)\]$/i
    const timestampRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
    let offsetMs = 0
    let lineId = 0
    const parsedLines: LyricsLine[] = []

    for (const rawLine of rawText.split(/\r\n|[\n\r\u2028\u2029]/)) {
      const line = rawLine.trim()
      if (!line) {
        continue
      }

      const offsetMatch = line.match(offsetRegex)
      if (offsetMatch) {
        offsetMs = Number(offsetMatch[1] ?? 0)
        continue
      }

      if (metadataRegex.test(line)) {
        continue
      }

      const matches = [...line.matchAll(timestampRegex)]
      if (matches.length === 0) {
        parsedLines.push({
          id: lineId++,
          timestampMs: null,
          text: line,
        })
        continue
      }

      const text = line.replace(timestampRegex, '').trim()
      if (!text) {
        continue
      }

      for (const match of matches) {
        const minutes = Number(match[1] ?? 0)
        const seconds = Number(match[2] ?? 0)
        const fraction = (match[3] ?? '').padEnd(3, '0').slice(0, 3)
        const timestampMs = Math.max(
          0,
          minutes * 60_000 + seconds * 1000 + Number(fraction) + offsetMs,
        )

        parsedLines.push({
          id: lineId++,
          timestampMs,
          text,
        })
      }
    }

    return parsedLines.sort((left, right) => {
      if (left.timestampMs == null && right.timestampMs == null) {
        return left.id - right.id
      }

      if (left.timestampMs == null) {
        return -1
      }

      if (right.timestampMs == null) {
        return 1
      }

      return left.timestampMs - right.timestampMs || left.id - right.id
    })
  }

  private toLyricsTimestamp(timestampMs: number) {
    const minutes = Math.floor(timestampMs / 60_000)
    const seconds = Math.floor((timestampMs % 60_000) / 1000)
    const centiseconds = Math.floor((timestampMs % 1000) / 10)

    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }

  private async getSidecarLyrics(songPath: string): Promise<LyricsSnapshot | null> {
    const basePath = songPath.slice(0, songPath.length - extname(songPath).length)
    const sidecarLrc = await this.readTextIfExists(`${basePath}.lrc`)
    if (sidecarLrc.trim()) {
      return this.createLyricsSnapshot(sidecarLrc, 'lrc-file')
    }

    const sidecarText = await this.readTextIfExists(`${basePath}.txt`)
    if (sidecarText.trim()) {
      return this.createLyricsSnapshot(sidecarText, 'text-file')
    }

    return null
  }

  private async getEmbeddedLyrics(songPath: string) {
    try {
      const metadata = await parseFile(songPath, {
        duration: false,
        skipCovers: true,
      })
      const embeddedLyricsTag = metadata.common.lyrics?.find(
        (lyrics) =>
          typeof lyrics.text === 'string'
            ? lyrics.text.trim()
            : lyrics.syncText.some((line) => line.text.trim()),
      )

      return (
        typeof embeddedLyricsTag?.text === 'string'
          ? embeddedLyricsTag.text
          : embeddedLyricsTag?.syncText
              .map((line) => {
                if (typeof line.timestamp === 'number') {
                  return `[${this.toLyricsTimestamp(line.timestamp)}]${line.text}`
                }

                return line.text
              })
              .join('\n') ?? ''
      ).trim()
    } catch {
      return ''
    }
  }

  private async searchInternetLyrics(song: LyricsSongLookup) {
    const songMid = await this.getSongMid(song)
    if (!songMid) {
      return ''
    }

    try {
      const response = await this.fetchJson(
        `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(songMid)}&format=json&nobase64=1`,
      ) as { lyric?: string }
      const lyrics = this.decodeHtmlEntities(response.lyric ?? '').trim()

      if (!lyrics || lyrics.includes('濮濄倖鐡曢弴韫礋濞屸剝婀佹繅顐ョ槤閻ㄥ嫮鍑介棅鍏呯')) {
        return ''
      }

      if (this.isNoLyricsPlaceholder(lyrics)) {
        return ''
      }

      return lyrics
    } catch {
      return ''
    }
  }

  private prepareInternetLyrics(rawLyrics: string, settings: SettingsRow) {
    if (this.isNoLyricsPlaceholder(rawLyrics)) {
      return ''
    }

    return settings.PreserveInternetLyricsTimestamps
      ? rawLyrics
      : stripLyricsTimestamps(rawLyrics)
  }

  private isNoLyricsPlaceholder(rawLyrics: string) {
    const normalized = rawLyrics
      .replace(/\[(ti|ar|al|by|offset):[^\]]*\]/gi, ' ')
      .replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .toLocaleLowerCase()

    if (!normalized) {
      return false
    }

    return normalized.includes('此歌曲为没有填词的纯音乐请您欣赏')
  }

  private async getSongMid(song: LyricsSongLookup) {
    const attempts = this.buildLyricsSearchAttempts(song)

    for (const attempt of attempts) {
      const songMid = await this.searchSongMidByKeyword(attempt.keyword, attempt.title, attempt.artist)
      if (songMid) {
        return songMid
      }
    }

    return ''
  }

  private buildLyricsSearchAttempts(song: LyricsSongLookup) {
    const simplifiedTitle = this.removeBraces(song.title)
    const simplifiedArtist = this.removeBraces(song.artist)
    const attempts = [
      { keyword: `${song.title} ${song.artist}`.trim(), title: song.title, artist: song.artist },
      { keyword: song.title, title: song.title, artist: song.artist },
      { keyword: `${simplifiedTitle} ${song.artist}`.trim(), title: simplifiedTitle, artist: song.artist },
      { keyword: `${song.title} ${simplifiedArtist}`.trim(), title: song.title, artist: simplifiedArtist },
      { keyword: `${simplifiedTitle} ${simplifiedArtist}`.trim(), title: simplifiedTitle, artist: simplifiedArtist },
      { keyword: simplifiedTitle, title: simplifiedTitle, artist: simplifiedArtist },
    ]

    return attempts.filter(
      (attempt, index, allAttempts) =>
        attempt.keyword &&
        allAttempts.findIndex(
          (candidate) =>
            candidate.keyword === attempt.keyword &&
            candidate.title === attempt.title &&
            candidate.artist === attempt.artist,
        ) === index,
    )
  }

  private async searchSongMidByKeyword(keyword: string, title: string, artist: string) {
    try {
      const response = await this.fetchJson(
        `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&key=${encodeURIComponent(keyword)}`,
      ) as {
        data?: {
          song?: {
            itemlist?: Array<{
              mid?: string
              name?: string
              singer?: string
            }>
          }
        }
      }
      const items = response.data?.song?.itemlist ?? []
      let bestMatch: { mid?: string; name?: string; singer?: string } | null = null
      let bestScore = -1

      for (const item of items) {
        const score =
          this.evaluateLyricsMatch(title, item.name ?? '') * 2 +
          this.evaluateLyricsMatch(artist, item.singer ?? '')

        if (score > bestScore) {
          bestScore = score
          bestMatch = item
        }
      }

      return bestScore > 0 ? bestMatch?.mid ?? '' : ''
    } catch {
      return ''
    }
  }

  private async fetchJson(url: string) {
    const acceptLanguage = this.getPreferredLanguageHeader()
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, LYRICS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'accept-language': acceptLanguage,
          referer: 'https://y.qq.com/portal/player.html',
          'user-agent': 'Mozilla/5.0',
        },
      })

      if (!response.ok) {
        throw new Error(`Lyrics request failed: ${response.status}`)
      }

      return response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  private getPreferredLanguageHeader() {
    const preferredLanguage = mapPreferredLanguage(
      this.settingsService.getSettings().VoiceAssistantPreferredLanguage,
    )

    if (preferredLanguage !== 'system') {
      return preferredLanguage
    }

    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'
  }

  private evaluateLyricsMatch(target: string, candidate: string) {
    const normalizedTarget = this.normalizeLyricsLookupText(target)
    const normalizedCandidate = this.normalizeLyricsLookupText(candidate)

    if (!normalizedTarget) {
      return normalizedCandidate ? 20 : 0
    }

    if (normalizedTarget === normalizedCandidate) {
      return 100
    }

    if (normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate)) {
      return 70
    }

    const targetTokens = normalizedTarget.split(/\s+/).filter(Boolean)
    const candidateTokens = normalizedCandidate.split(/\s+/).filter(Boolean)
    let score = 0

    for (const token of targetTokens) {
      if (candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken))) {
        score += 20
      }
    }

    return score
  }

  private normalizeLyricsLookupText(value: string) {
    return this.removeBraces(value)
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private removeBraces(value: string) {
    return value
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*]/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
      .replace(/\\n/g, '\n')
  }
}
