import type { DatabaseSync } from 'node:sqlite'

import { normalizeArtists } from '../../src/shared/artists.ts'
import type { ArtistSplitResultItem } from '../../src/shared/contracts.ts'
import { ACTIVE_STATE } from './constants.ts'

export class SongArtistSync {
  private readonly markSongArtistsInactiveStatement
  private readonly upsertSongArtistStatement

  constructor(db: DatabaseSync) {
    this.markSongArtistsInactiveStatement = db.prepare(`
      UPDATE MusicArtist
      SET State = ?
      WHERE MusicId = ?
    `)
    this.upsertSongArtistStatement = db.prepare(`
      INSERT INTO MusicArtist (MusicId, Name, Priority, State)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET
        Priority = excluded.Priority,
        State = excluded.State
    `)
  }

  sync(songId: number, artists: string[]) {
    this.markSongArtistsInactiveStatement.run(ACTIVE_STATE.inactive, songId)
    normalizeArtists(artists).forEach((artist, priority) => {
      this.upsertSongArtistStatement.run(songId, artist, priority, ACTIVE_STATE.active)
    })
  }

  syncMany(splits: ArtistSplitResultItem[]) {
    for (const split of splits) {
      this.sync(split.songId, split.artists)
    }
  }
}
