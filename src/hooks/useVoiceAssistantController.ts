import { getDisplayArtists, getSongArtists } from '../shared/artists'
import type { LibrarySong, MusicData } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { ByArtistRequest, MatchType, VoiceAssistantHelper, type VolumeRequest } from '../shared/VoiceAssistantHelper'
import { findBest, findSongsInFolder, getFolderName } from '../appModel'
import type { PlaybackCommands } from './usePlaybackCommands'
import type { PlaybackController } from './usePlaybackController'

interface VoiceAssistantControllerOptions {
  snapshot: MusicData
  songsById: Map<number, LibrarySong>
  playback: PlaybackController
  playbackCommands: PlaybackCommands
  t: Translator
  playQuick: () => Promise<void>
  commitSearchQuery: (query: string) => Promise<void>
}

export function useVoiceAssistantController({
  snapshot,
  songsById,
  playback,
  playbackCommands,
  t,
  playQuick,
  commitSearchQuery,
}: VoiceAssistantControllerOptions) {
  async function playVoiceSongIds(songIds: number[]) {
    await playbackCommands.setMusicAndPlay(songIds)
  }

  async function playVoiceSong(song: LibrarySong) {
    await playbackCommands.playOrAddNext(song.id)
  }

  function findVoiceArtist(query: string) {
    const artistGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      for (const artist of getSongArtists(song, t('common.artistUnknown'))) {
        artistGroups.set(artist, [...(artistGroups.get(artist) ?? []), song])
      }
    }

    return findBest([...artistGroups.entries()], query, ([artist]) => [artist])
  }

  function findRandomArtist() {
    const artistGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      for (const artist of getSongArtists(song, t('common.artistUnknown'))) {
        artistGroups.set(artist, [...(artistGroups.get(artist) ?? []), song])
      }
    }

    const artist = [...artistGroups.entries()][Math.floor(Math.random() * artistGroups.size)]
    return artist ? { item: artist, score: 100 } : null
  }

  function findVoiceAlbum(query: string) {
    const albumGroups = new Map<string, LibrarySong[]>()
    for (const song of snapshot.songs) {
      const album = song.album || t('common.albumUnknown')
      albumGroups.set(album, [...(albumGroups.get(album) ?? []), song])
    }

    return findBest([...albumGroups.entries()], query, ([album]) => [album])
  }

  function findVoicePlaylist(query: string) {
    return findBest(snapshot.playlists, query, (playlist) => [playlist.name])
  }

  function findVoiceFolder(query: string) {
    return findBest(snapshot.folders, query, (folder) => [getFolderName(folder.path), folder.path])
  }

  function findRandomAlbum() {
    const albums = [...new Map(snapshot.songs.map((song) => [
      song.album || t('common.albumUnknown'),
      snapshot.songs.filter((item) => (item.album || t('common.albumUnknown')) === (song.album || t('common.albumUnknown'))),
    ])).entries()]

    const album = albums[Math.floor(Math.random() * albums.length)]
    return album ? { item: album, score: 100 } : null
  }

  function findRandomPlaylist() {
    const playlist = snapshot.playlists[Math.floor(Math.random() * snapshot.playlists.length)]
    return playlist ? { item: playlist, score: 100 } : null
  }

  function findRandomFolder() {
    const folder = snapshot.folders[Math.floor(Math.random() * snapshot.folders.length)]
    return folder ? { item: folder, score: 100 } : null
  }

  function findVoiceSong(query: string, songs = snapshot.songs) {
    return findBest(songs, query, (song) => [
      song.title,
      song.album,
      song.artist,
      getDisplayArtists(song, t('common.artistUnknown')),
      ...song.artists,
    ])
  }

  async function playVoiceSearch(query: string) {
    const song = findVoiceSong(query)
    const artist = findVoiceArtist(query)
    const album = findVoiceAlbum(query)
    const playlist = findVoicePlaylist(query)
    const folder = findVoiceFolder(query)
    const best = [
      song ? { type: 'song' as const, score: song.score, item: song.item } : null,
      artist ? { type: 'artist' as const, score: artist.score, item: artist.item } : null,
      album ? { type: 'album' as const, score: album.score, item: album.item } : null,
      playlist ? { type: 'playlist' as const, score: playlist.score, item: playlist.item } : null,
      folder ? { type: 'folder' as const, score: folder.score, item: folder.item } : null,
    ].filter((item): item is NonNullable<typeof item> => item != null)
      .sort((left, right) => right.score - left.score)[0]

    if (!best) {
      return t('voiceAssistant.noResults', { query })
    }

    if (best.type === 'song') {
      await playVoiceSong(best.item)
    } else if (best.type === 'artist' || best.type === 'album') {
      await playVoiceSongIds(best.item[1].map((song) => song.id))
    } else if (best.type === 'playlist') {
      await playVoiceSongIds(best.item.songIds)
    } else {
      await playVoiceSongIds(findSongsInFolder(snapshot.songs, best.item.path).map((song) => song.id))
    }

    return t('voiceAssistant.executed')
  }

  async function handleVoiceByArtist(request: ByArtistRequest, command: MatchType) {
    if (command === MatchType.PlayByArtistOrMusic) {
      const artist = findVoiceArtist(request.artist)
      if (artist) {
        await playVoiceSongIds(artist.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayByArtist || command === MatchType.PlayByArtistAndMusic) {
      const artist = findVoiceArtist(request.artist)
      const songs = artist ? artist.item[1] : snapshot.songs
      const song = findVoiceSong(request.item, songs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayByArtistAndAlbum) {
      const artist = findVoiceArtist(request.artist)
      const songs = artist ? artist.item[1] : snapshot.songs
      const album = findBest(
        [...new Map(songs.map((song) => [song.album || t('common.albumUnknown'), songs.filter((item) => (item.album || t('common.albumUnknown')) === (song.album || t('common.albumUnknown')))])).entries()],
        request.item,
        ([albumName]) => [albumName],
      )
      if (album) {
        await playVoiceSongIds(album.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }

      return playVoiceSearch(request.original)
    }

    if (command === MatchType.PlayMusicInAlbum) {
      const album = findVoiceAlbum(request.artist)
      const song = album ? findVoiceSong(request.item, album.item[1]) : null
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    if (command === MatchType.PlayMusicInPlaylist) {
      const playlist = findVoicePlaylist(request.artist)
      const playlistSongs = playlist
        ? playlist.item.songIds
            .map((songId) => songsById.get(songId) ?? null)
            .filter((song): song is LibrarySong => song != null)
        : []
      const song = findVoiceSong(request.item, playlistSongs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    if (command === MatchType.PlayMusicInFolder || command === MatchType.PlayMusicIn) {
      const folder = findVoiceFolder(request.artist)
      const folderSongs = folder ? findSongsInFolder(snapshot.songs, folder.item.path) : snapshot.songs
      const song = findVoiceSong(request.item, folderSongs)
      if (song) {
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
    }

    return playVoiceSearch(request.original)
  }

  async function executeVoiceCommand(text: string) {
    const command = VoiceAssistantHelper.handle(text, snapshot.settings.preferredLanguage)

    switch (command.type) {
      case MatchType.Play:
        await playback.togglePlayPause()
        return t('voiceAssistant.executed')
      case MatchType.PlayMusic: {
        const param = command.param as string | undefined
        if (!param) {
          await playQuick()
          return t('voiceAssistant.executed')
        }
        const song = findVoiceSong(param)
        if (!song) {
          return t('voiceAssistant.noResults', { query: param })
        }
        await playVoiceSong(song.item)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayArtist: {
        const param = command.param as string | undefined
        const artist = param ? findVoiceArtist(param) : findRandomArtist()
        const songIds = artist
          ? artist.item[1].map((song) => song.id)
          : []
        if (songIds.length === 0) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.artists') })
        }
        await playVoiceSongIds(songIds)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayAlbum: {
        const param = command.param as string | undefined
        const album = param ? findVoiceAlbum(param) : findRandomAlbum()
        if (!album) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.album') })
        }
        await playVoiceSongIds(album.item[1].map((song) => song.id))
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayPlaylist: {
        const param = command.param as string | undefined
        const playlist = param ? findVoicePlaylist(param) : findRandomPlaylist()
        if (!playlist) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.playlists') })
        }
        await playVoiceSongIds(playlist.item.songIds)
        return t('voiceAssistant.executed')
      }
      case MatchType.PlayFolder: {
        const param = command.param as string | undefined
        const folder = param ? findVoiceFolder(param) : findRandomFolder()
        if (!folder) {
          return t('voiceAssistant.noResults', { query: param ?? t('common.local') })
        }
        await playVoiceSongIds(findSongsInFolder(snapshot.songs, folder.item.path).map((song) => song.id))
        return t('voiceAssistant.executed')
      }
      case MatchType.SearchAndPlay:
        return playVoiceSearch(command.param as string)
      case MatchType.QuickPlay:
        await playQuick()
        return t('voiceAssistant.executed')
      case MatchType.PlayByArtistOrMusic:
      case MatchType.PlayByArtist:
      case MatchType.PlayByArtistAndMusic:
      case MatchType.PlayByArtistAndAlbum:
      case MatchType.PlayMusicIn:
      case MatchType.PlayMusicInAlbum:
      case MatchType.PlayMusicInFolder:
      case MatchType.PlayMusicInPlaylist:
        return handleVoiceByArtist(command.param as ByArtistRequest, command.type)
      case MatchType.Pause:
        if (playback.isPlaying) {
          await playback.togglePlayPause()
        }
        return t('voiceAssistant.executed')
      case MatchType.Previous:
        await playback.playPrevious()
        return t('voiceAssistant.executed')
      case MatchType.Next:
        await playback.playNext()
        return t('voiceAssistant.executed')
      case MatchType.ChangeVolume: {
        const request = command.param as VolumeRequest
        handleVoiceVolume(request)
        return t('voiceAssistant.volume', { volume: getVoiceVolumeValue(request) })
      }
      case MatchType.Search: {
        const param = command.param as string | undefined
        if (!param) {
          return t('voiceAssistant.notUnderstood')
        }
        await commitSearchQuery(param)
        return t('voiceAssistant.executed')
      }
      case MatchType.Mute:
        playback.setMuted(true)
        return t('voiceAssistant.executed')
      case MatchType.UnMute:
        playback.setMuted(false)
        return t('voiceAssistant.executed')
      case MatchType.Help:
        return getVoiceHelpText()
      case MatchType.Nothing:
        return t('voiceAssistant.canceled')
      default:
        return t('voiceAssistant.notUnderstood')
    }
  }

  function getVoiceVolumeValue(request: VolumeRequest) {
    if (request.to) {
      return Math.min(Math.max(Math.round(request.value), 0), 100)
    }

    const delta = request.value * (request.percentage ? playback.volume / 100 : 1)
    const nextVolume = playback.volume + (request.turnUp ? delta : -delta)
    return Math.min(Math.max(Math.round(nextVolume), 0), 100)
  }

  function handleVoiceVolume(request: VolumeRequest) {
    playback.setVolumeLevel(getVoiceVolumeValue(request))
  }

  function getVoiceHint() {
    const songs = snapshot.songs
    const hintType = Math.floor(Math.random() * 3)
    const song = songs[Math.floor(Math.random() * songs.length)]

    if (hintType === 0) {
      const artist = song?.artist && song.artist.length <= 30
        ? song.artist
        : songs[Math.floor(Math.random() * songs.length)]?.artist
      if (artist && artist.length <= 30) {
        return t('voiceAssistant.hintArtist', { artist })
      }
    } else if (hintType === 1) {
      const album = song?.album && song.album.length <= 30
        ? song.album
        : songs[Math.floor(Math.random() * songs.length)]?.album
      if (album && album.length <= 30) {
        return t('voiceAssistant.hintAlbum', { album })
      }
    }

    return t('voiceAssistant.hintQuickPlay')
  }

  function getVoiceHelpText() {
    return t('voiceAssistant.help')
  }

  async function handleVoiceCommand(text: string) {
    const message = await executeVoiceCommand(text)
    return {
      message,
      shouldContinue: message === t('voiceAssistant.notUnderstood'),
    }
  }

  return {
    handleVoiceCommand,
    getVoiceHint,
    getVoiceHelpText,
  }
}
