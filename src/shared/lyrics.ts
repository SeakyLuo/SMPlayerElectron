import type { LyricsSnapshot } from './contracts'

interface CurrentLyricsLineInfo {
  text: string
  startMs: number | null
  endMs: number | null
}

const lyricsTimestampRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const lyricsMetadataRegex = /^\[(ti|ar|al|au|by|offset|re|ve|length):.*\]$/i
const lyricsLineBreakRegex = /\r\n|[\n\r\u2028\u2029]/g
const escapedLineBreakRegex = /\\r\\n|\\n|\\r/g

function toSingleDisplayLyricLine(text: string) {
  if (!text) {
    return ''
  }

  const normalizedText = text
    .replace(escapedLineBreakRegex, '\n')
    .replace(lyricsLineBreakRegex, '\n')

  for (const segment of normalizedText.split('\n')) {
    const candidate = segment.trim()
    if (candidate) {
      return candidate
    }
  }

  return ''
}

export function getCurrentLyricsLine(
  lyrics: LyricsSnapshot | null,
  progressSeconds: number,
  progressRatio: number,
) {
  return getCurrentLyricsLineInfo(lyrics, progressSeconds, progressRatio).text
}

export function getCurrentLyricsLineInfo(
  lyrics: LyricsSnapshot | null,
  progressSeconds: number,
  progressRatio: number,
  durationSeconds = 0,
): CurrentLyricsLineInfo {
  if (!lyrics || lyrics.lines.length === 0) {
    return { text: '', startMs: null, endMs: null }
  }

  const timedLines = lyrics.lines.filter((line) => line.timestampMs != null)
  if (timedLines.length > 0) {
    const progressMs = Math.max(0, Math.floor(progressSeconds * 1000))
    let currentLineIndex = -1

    for (let index = 0; index < timedLines.length; index += 1) {
      const line = timedLines[index]!
      if (line.timestampMs! > progressMs) {
        break
      }
      currentLineIndex = index
    }

    if (currentLineIndex < 0) {
      return { text: '', startMs: null, endMs: null }
    }

    const currentLine = timedLines[currentLineIndex]!
    const nextLine = timedLines[currentLineIndex + 1]
    return {
      text: toSingleDisplayLyricLine(currentLine.text),
      startMs: currentLine.timestampMs!,
      endMs: nextLine?.timestampMs ?? (durationSeconds > 0 ? Math.floor(durationSeconds * 1000) : null),
    }
  }

  const lyricIndex = Math.min(
    lyrics.lines.length - 1,
    Math.floor(lyrics.lines.length * Math.min(Math.max(progressRatio, 0), 1)),
  )
  const lyricDurationMs = durationSeconds > 0 ? Math.floor(durationSeconds * 1000) : 0
  return {
    text: toSingleDisplayLyricLine(lyrics.lines[lyricIndex]?.text ?? ''),
    startMs: lyricDurationMs > 0 ? Math.floor(lyricDurationMs * (lyricIndex / lyrics.lines.length)) : null,
    endMs: lyricDurationMs > 0 ? Math.floor(lyricDurationMs * ((lyricIndex + 1) / lyrics.lines.length)) : null,
  }
}

export function hasLyricsTimestamps(rawText: string) {
  lyricsTimestampRegex.lastIndex = 0
  return lyricsTimestampRegex.test(rawText)
}

export function stripLyricsTimestamps(rawText: string) {
  return rawText
    .split(lyricsLineBreakRegex)
    .map((line) => {
      const trimmedLine = line.trim()
      if (lyricsMetadataRegex.test(trimmedLine)) {
        return ''
      }

      return line.replace(lyricsTimestampRegex, '').trimStart()
    })
    .join('\n')
    .trim()
}

export function mergePlainLyricsWithTimedRaw(rawText: string, plainText: string) {
  const plainLines = plainText.split(lyricsLineBreakRegex)
  let plainLineIndex = 0
  const mergedLines = rawText.split(lyricsLineBreakRegex).map((line) => {
    const timestampTags = line.match(lyricsTimestampRegex)
    if (!timestampTags) {
      if (lyricsMetadataRegex.test(line.trim())) {
        return line
      }

      if (!line.trim()) {
        return line
      }

      const plainLine = plainLines[plainLineIndex] ?? line
      plainLineIndex += 1
      return plainLine
    }

    const fallbackText = line.replace(lyricsTimestampRegex, '').trimStart()
    const plainLine = plainLines[plainLineIndex] ?? fallbackText
    plainLineIndex += 1
    return `${timestampTags.join('')}${plainLine}`
  })

  while (plainLineIndex < plainLines.length) {
    mergedLines.push(plainLines[plainLineIndex])
    plainLineIndex += 1
  }

  return mergedLines.join('\n').trim()
}
