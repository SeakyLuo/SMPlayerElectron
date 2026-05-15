import type { LyricsSnapshot } from './contracts'

const lyricsTimestampRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const lyricsMetadataRegex = /^\[(ti|ar|al|by|offset):.*\]$/i
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
  if (!lyrics || lyrics.lines.length === 0) {
    return ''
  }

  const timedLines = lyrics.lines.filter((line) => line.timestampMs != null)
  if (timedLines.length > 0) {
    const progressMs = Math.max(0, Math.floor(progressSeconds * 1000))
    let currentText = ''

    for (const line of timedLines) {
      if (line.timestampMs! > progressMs) {
        break
      }
      currentText = line.text
    }

    return toSingleDisplayLyricLine(currentText)
  }

  const lyricIndex = Math.min(
    lyrics.lines.length - 1,
    Math.floor(lyrics.lines.length * Math.min(Math.max(progressRatio, 0), 1)),
  )
  return toSingleDisplayLyricLine(lyrics.lines[lyricIndex]?.text ?? '')
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
