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
    const audioBuffer = fileBuffer.subarray(existingTag.endOffset)
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
    const audioBuffer = fileBuffer.subarray(existingTag.endOffset)
    const tagVersion = existingTag.version === 4 ? 4 : 3
    const preservedFrames = existingTag.frames.filter(
      (frame) => frame.id !== 'USLT' && frame.id !== 'SYLT',
    )
    const lyricsFrames = rawLyrics.trim()
      ? [
          this.createId3Frame(tagVersion, 'USLT', Buffer.concat([
            Buffer.from([3]),
            Buffer.from('eng', 'ascii'),
            Buffer.from([0]),
            Buffer.from(rawLyrics, 'utf8'),
          ])),
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
    const audioBuffer = fileBuffer.subarray(existingTag.endOffset)
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

    return this.createId3Frame(version, id, Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')]))
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
