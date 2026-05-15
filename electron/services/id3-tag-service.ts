import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'

export class Id3TagService {
  async writeSongTagProperties(
    songPath: string,
    properties: {
      title: string
      subtitle: string
      artist: string
      album: string
      albumArtist: string
      publisher: string
      trackNumber: number
      year: number
      genre: string
      composers: string
    },
  ) {
    if (extname(songPath).toLocaleLowerCase() !== '.mp3') {
      return
    }

    const fileBuffer = await readFile(songPath)
    const existingTag = this.readId3Tag(fileBuffer)
    const audioBuffer = this.extractCleanAudioBody(fileBuffer, existingTag.endOffset)
    const tagVersion = existingTag.version === 4 ? 4 : 3
    const replacedFrameIds = new Set([
      'TIT2',
      'TIT3',
      'TPE1',
      'TALB',
      'TPE2',
      'TRCK',
      'TDRC',
      'TYER',
      'TCON',
      'TCOM',
      'TPUB',
    ])
    const textFrames = [
      this.createTextId3Frame(tagVersion, 'TIT2', properties.title),
      this.createTextId3Frame(tagVersion, 'TIT3', properties.subtitle),
      this.createTextId3Frame(tagVersion, 'TPE1', properties.artist),
      this.createTextId3Frame(tagVersion, 'TALB', properties.album),
      this.createTextId3Frame(tagVersion, 'TPE2', properties.albumArtist),
      this.createTextId3Frame(tagVersion, 'TRCK', properties.trackNumber ? String(properties.trackNumber) : ''),
      this.createTextId3Frame(tagVersion, tagVersion === 4 ? 'TDRC' : 'TYER', properties.year ? String(properties.year) : ''),
      this.createTextId3Frame(tagVersion, 'TCON', properties.genre),
      this.createTextId3Frame(tagVersion, 'TCOM', properties.composers),
      this.createTextId3Frame(tagVersion, 'TPUB', properties.publisher),
    ].filter((frame) => frame.length > 10)
    const preservedFrames = existingTag.frames.filter((frame) => !replacedFrameIds.has(frame.id))
    await this.writeTag(songPath, tagVersion, preservedFrames, textFrames, audioBuffer)
  }

  async writeEmbeddedLyrics(songPath: string, rawLyrics: string) {
    if (extname(songPath).toLocaleLowerCase() !== '.mp3') {
      throw new Error('Embedded lyrics writing is currently supported for MP3 files.')
    }

    const fileBuffer = await readFile(songPath)
    const existingTag = this.readId3Tag(fileBuffer)
    const audioBuffer = this.extractCleanAudioBody(fileBuffer, existingTag.endOffset)
    const tagVersion = existingTag.version === 4 ? 4 : 3
    const preservedFrames = existingTag.frames.filter(
      (frame) => frame.id !== 'USLT' && frame.id !== 'SYLT',
    )
    const lyricsFrames = rawLyrics.trim()
      ? [
          this.createId3Frame(tagVersion, 'USLT', this.createUnsynchronizedLyricsPayload(tagVersion, rawLyrics)),
        ]
      : []
    await this.writeTag(songPath, tagVersion, preservedFrames, lyricsFrames, audioBuffer)
  }

  async writeSongArtwork(
    songPath: string,
    picture: { data: Buffer; format: string } | null,
  ) {
    if (extname(songPath).toLocaleLowerCase() !== '.mp3') {
      return
    }

    const fileBuffer = await readFile(songPath)
    const existingTag = this.readId3Tag(fileBuffer)
    const audioBuffer = this.extractCleanAudioBody(fileBuffer, existingTag.endOffset)
    const tagVersion = existingTag.version === 4 ? 4 : 3
    const preservedFrames = existingTag.frames.filter((frame) => frame.id !== 'APIC')
    const artworkFrames = picture
      ? [
          this.createId3Frame(tagVersion, 'APIC', Buffer.concat([
            Buffer.from([3]),
            Buffer.from(picture.format, 'ascii'),
            Buffer.from([0, 3, 0]),
            picture.data,
          ])),
        ]
      : []
    await this.writeTag(songPath, tagVersion, preservedFrames, artworkFrames, audioBuffer)
  }

  private async writeTag(
    songPath: string,
    tagVersion: number,
    preservedFrames: Array<{ id: string; raw: Buffer }>,
    newFrames: Buffer[],
    audioBuffer: Buffer,
  ) {
    const tagBody = Buffer.concat([...preservedFrames.map((frame) => frame.raw), ...newFrames])
    const padding = Buffer.alloc(2048)
    const header = Buffer.alloc(10)

    header.write('ID3', 0, 'ascii')
    header[3] = tagVersion
    header[4] = 0
    header[5] = 0
    this.writeSynchsafeSize(header, 6, tagBody.length + padding.length)

    await writeFile(songPath, Buffer.concat([header, tagBody, padding, audioBuffer]))
  }

  // Strips trailing legacy tags (ID3v1 + APEv2) that some MP3 files carry in
  // addition to the modern ID3v2 header. Keeping them around causes music-
  // metadata to report inconsistent `artist` / `artists` values when the
  // legacy tags disagree with TPE1, polluting the MusicArtist table on every
  // scan even after the user fixed the data through MusicDialog.
  private extractCleanAudioBody(fileBuffer: Buffer, id3v2EndOffset: number): Buffer {
    let endIndex = fileBuffer.length
    let stripped = true

    // A file may interleave ID3v1 and APEv2 (e.g. APEv2 → ID3v1 from the tail).
    // Loop until both are removed in any order.
    while (stripped && endIndex > id3v2EndOffset) {
      stripped = false

      // ID3v1: fixed 128 bytes at the very end, magic "TAG".
      if (
        endIndex - id3v2EndOffset >= 128 &&
        fileBuffer.subarray(endIndex - 128, endIndex - 125).toString('ascii') === 'TAG'
      ) {
        endIndex -= 128
        stripped = true
        continue
      }

      // APEv2: 32-byte footer with magic "APETAGEX" at offset 0. Footer's
      // `size` field (little-endian uint32 at offset 12) covers the body +
      // footer. If the "has header" flag (bit 31 of `flags` at offset 20) is
      // set, an additional 32-byte header sits before the body.
      if (
        endIndex - id3v2EndOffset >= 32 &&
        fileBuffer.subarray(endIndex - 32, endIndex - 24).toString('ascii') === 'APETAGEX'
      ) {
        const apeSize = fileBuffer.readUInt32LE(endIndex - 32 + 12)
        const apeFlags = fileBuffer.readUInt32LE(endIndex - 32 + 20)
        const hasHeader = (apeFlags & 0x80000000) !== 0
        const totalLength = apeSize + (hasHeader ? 32 : 0)
        if (totalLength > 0 && endIndex - totalLength >= id3v2EndOffset) {
          endIndex -= totalLength
          stripped = true
        }
      }
    }

    return fileBuffer.subarray(id3v2EndOffset, endIndex)
  }

  private readId3Tag(fileBuffer: Buffer) {
    if (fileBuffer.subarray(0, 3).toString('ascii') !== 'ID3') {
      return {
        version: 3,
        endOffset: 0,
        frames: [] as Array<{ id: string; raw: Buffer }>,
      }
    }

    const tagSize = this.readSynchsafeSize(fileBuffer, 6)
    const endOffset = 10 + tagSize
    const version = fileBuffer[3]
    const frames: Array<{ id: string; raw: Buffer }> = []
    let offset = 10

    while (offset + 10 <= endOffset) {
      const frameHeader = fileBuffer.subarray(offset, offset + 10)
      const id = frameHeader.subarray(0, 4).toString('ascii')

      if (!/^[A-Z0-9]{4}$/.test(id)) {
        break
      }

      const frameSize =
        version === 4
          ? this.readSynchsafeSize(frameHeader, 4)
          : frameHeader.readUInt32BE(4)

      if (frameSize <= 0 || offset + 10 + frameSize > endOffset) {
        break
      }

      frames.push({
        id,
        raw: fileBuffer.subarray(offset, offset + 10 + frameSize),
      })
      offset += 10 + frameSize
    }

    return {
      version,
      endOffset,
      frames,
    }
  }

  private createId3Frame(version: number, id: string, payload: Buffer) {
    const frame = Buffer.alloc(10 + payload.length)
    frame.write(id, 0, 'ascii')
    if (version === 4) {
      this.writeSynchsafeSize(frame, 4, payload.length)
    } else {
      frame.writeUInt32BE(payload.length, 4)
    }
    payload.copy(frame, 10)

    return frame
  }

  private createTextId3Frame(version: number, id: string, text: string) {
    const value = text.trim()
    if (!value) {
      return Buffer.alloc(0)
    }

    return this.createId3Frame(version, id, this.createEncodedTextPayload(version, value))
  }

  private createUnsynchronizedLyricsPayload(version: number, rawLyrics: string) {
    if (version === 4) {
      return Buffer.concat([
        Buffer.from([3]),
        Buffer.from('eng', 'ascii'),
        Buffer.from([0]),
        Buffer.from(rawLyrics, 'utf8'),
      ])
    }

    return Buffer.concat([
      Buffer.from([1]),
      Buffer.from('eng', 'ascii'),
      Buffer.from([0xff, 0xfe, 0, 0]),
      Buffer.from([0xff, 0xfe]),
      Buffer.from(rawLyrics, 'utf16le'),
    ])
  }

  private createEncodedTextPayload(version: number, value: string) {
    if (version === 4) {
      return Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')])
    }

    return Buffer.concat([
      Buffer.from([1, 0xff, 0xfe]),
      Buffer.from(value, 'utf16le'),
    ])
  }

  private readSynchsafeSize(buffer: Buffer, offset: number) {
    return (
      (buffer[offset] << 21) |
      (buffer[offset + 1] << 14) |
      (buffer[offset + 2] << 7) |
      buffer[offset + 3]
    )
  }

  private writeSynchsafeSize(buffer: Buffer, offset: number, size: number) {
    buffer[offset] = (size >> 21) & 0x7f
    buffer[offset + 1] = (size >> 14) & 0x7f
    buffer[offset + 2] = (size >> 7) & 0x7f
    buffer[offset + 3] = size & 0x7f
  }
}
