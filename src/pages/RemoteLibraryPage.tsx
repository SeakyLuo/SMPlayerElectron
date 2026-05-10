import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { createRemoteLibraryDataSource } from '../data/libraryDataSource'
import type { Translator } from '../shared/i18n'
import { LibraryDataSourceAlbumsPage } from './LibraryDataSourceAlbumsPage'
import { LibraryDataSourceArtistsPage } from './LibraryDataSourceArtistsPage'
import { LibraryDataSourceMusicPage } from './LibraryDataSourceMusicPage'
import { LibraryDataSourcePlaylistsPage } from './LibraryDataSourcePlaylistsPage'

export function RemoteLibraryPage({ t }: { t: Translator }) {
  const params = useParams()
  const location = useLocation()
  const hostId = Number(params.hostId)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const dataSource = useMemo(() => createRemoteLibraryDataSource(hostId), [hostId])
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const playTrack = async (trackId: number) => {
    const song = (await dataSource.getSongs()).find((item) => item.id === trackId)!
    const audio = audioRef.current!
    const streamUrl = dataSource.getStreamUrl(song)
    setCurrentTrackId(trackId)

    if (audio.src !== streamUrl) {
      audio.src = streamUrl
      audio.load()
    }

    await audio.play()
    setIsPlaying(true)
  }

  const togglePlayPause = async () => {
    const audio = audioRef.current!
    if (audio.paused) {
      await audio.play()
      setIsPlaying(true)
      return
    }

    audio.pause()
    setIsPlaying(false)
  }

  const playNext = async () => {
    if (currentTrackId == null) {
      return
    }

    const songs = await dataSource.getSongs()
    const index = songs.findIndex((song) => song.id === currentTrackId)
    const nextSong = songs[index + 1] ?? songs[0]
    await playTrack(nextSong!.id)
  }

  const remoteRoute = getRemoteLibraryRoute(location.pathname, hostId)
  const routeBase = `/remote/${hostId}`
  const commonPlaybackProps = {
    selectedTrackId: currentTrackId,
    isPlaying,
    onPlayTrack: (trackId: number) => {
      void playTrack(trackId)
    },
    onMoveToMusicOrPlay: (trackId: number) => {
      void playTrack(trackId)
    },
    onTogglePlayPause: () => {
      void togglePlayPause()
    },
    onPlayNext: () => {
      void playNext()
    },
  }
  const noop = () => {}

  return (
    <>
      {remoteRoute.section === 'artists' ? (
        <LibraryDataSourceArtistsPage
          dataSource={dataSource}
          t={t}
          searchQuery=""
          error={null}
          targetArtistName={remoteRoute.targetName}
          routeBase={routeBase}
          onAddSongsToNowPlaying={noop}
          onCreatePlaylistWithSongs={noop}
          onToggleFavorite={noop}
          onAddSongToPlaylist={noop}
          onAddSongsToPlaylist={noop}
          onRevealSong={noop}
          onDeleteSongFromDisk={noop}
          {...commonPlaybackProps}
        />
      ) : remoteRoute.section === 'albums' ? (
        <LibraryDataSourceAlbumsPage
          dataSource={dataSource}
          t={t}
          error={null}
          targetAlbumName={remoteRoute.targetName}
          routeBase={routeBase}
          selectedTrackId={currentTrackId}
          isPlaying={isPlaying}
          onAddSongsToPlaylist={noop}
          onAddSongsToNowPlaying={noop}
          onCreatePlaylistWithSongs={noop}
          onMoveToMusicOrPlay={(trackId) => {
            void playTrack(trackId)
          }}
          onPlayNext={() => {
            void playNext()
          }}
          onTogglePlayPause={() => {
            void togglePlayPause()
          }}
          onPlayTrack={(trackId) => {
            void playTrack(trackId)
          }}
        />
      ) : remoteRoute.section === 'playlists' ? (
        <LibraryDataSourcePlaylistsPage
          dataSource={dataSource}
          t={t}
          searchQuery=""
          error={null}
          routeBase={routeBase}
          routePlaylistId={remoteRoute.playlistId}
          onSelectPlaylist={noop}
          onDeletePlaylist={noop}
          onRenamePlaylist={noop}
          onCreatePlaylistWithSongs={noop}
          onAddSongsToNowPlaying={noop}
          onReorderPlaylists={noop}
          onSetPlaylistPreferred={noopPlaylistPreference}
          onAddSongToPlaylist={noop}
          onAddSongsToPlaylist={noop}
          onRemoveSongsFromPlaylist={noop}
          onReorderPlaylistSongs={noop}
          {...commonPlaybackProps}
        />
      ) : (
        <LibraryDataSourceMusicPage
          dataSource={dataSource}
          t={t}
          loading={false}
          scanning={false}
          error={null}
          searchQuery=""
          onPickLibraryRoot={noop}
          onScanLibrary={noop}
          onAddNextAndPlay={(trackId) => {
            void playTrack(trackId)
          }}
          onToggleFavorite={noop}
          onAddSongToPlaylist={noop}
          onAddSongsToPlaylist={noop}
          onAddSongsToNowPlaying={noop}
          onCreatePlaylistWithSongs={noop}
          onRevealSong={noop}
          onDeleteSongFromDisk={noop}
          readOnly
          resolveArtwork={false}
          routeBase={routeBase}
          {...commonPlaybackProps}
        />
      )}
      <audio
        ref={audioRef}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </>
  )
}

function getRemoteLibraryRoute(pathname: string, hostId: number) {
  const relativePath = pathname.slice(`/remote/${hostId}`.length).replace(/^\/+/, '')
  const [section = 'songs', ...rest] = relativePath.split('/').filter(Boolean)

  return {
    section,
    playlistId: section === 'playlists' && rest[0] ? Number(rest[0]) : null,
    targetName: rest.length > 0 ? decodeURIComponent(rest.join('/')) : undefined,
  }
}

function noopPlaylistPreference() {
}
