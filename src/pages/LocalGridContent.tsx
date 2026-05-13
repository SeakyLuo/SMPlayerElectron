import type { DragEvent, RefObject } from 'react'

import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { LocalFolderCard } from '../components/LocalFolderCard'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { FolderNode } from './localFolderModel'
import { LocalContentSection, LocalSongQuickJump } from './LocalPageQuickJump'

export function LocalGridContent({
  childFolders,
  currentSongs,
  nodes,
  songsById,
  selectedFolderPaths,
  selectedSongIds,
  selectedTrackId,
  isPlaying,
  multiSelect,
  isCompactLayout,
  showLocalSectionHeaders,
  foldersExpanded,
  songsExpanded,
  showSongQuickJump,
  songQuickJumpBasisName,
  songQuickJumpMap,
  queueSongIds,
  t,
  localSongItemRefs,
  onToggleFoldersExpanded,
  onToggleSongsExpanded,
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onOpenFolder,
  onToggleFolderSelection,
  onDragFolderStart,
  onDropFolder,
  onOpenFolderMenu,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSongSelection,
  onAddSong,
  onOpenSongMenu,
  onDragSongStart,
  onJumpToSongKey,
}: {
  childFolders: FolderNode[]
  currentSongs: LibrarySong[]
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  selectedFolderPaths: Set<string>
  selectedSongIds: Set<number>
  selectedTrackId: number | null
  isPlaying: boolean
  multiSelect: boolean
  isCompactLayout: boolean
  showLocalSectionHeaders: boolean
  foldersExpanded: boolean
  songsExpanded: boolean
  showSongQuickJump: boolean
  songQuickJumpBasisName: string
  songQuickJumpMap: Map<string, number>
  queueSongIds: number[]
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  onToggleFoldersExpanded: () => void
  onToggleSongsExpanded: () => void
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onOpenFolder: (folderPath: string) => void
  onToggleFolderSelection: (folderPath: string) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSongSelection: (songId: number) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onJumpToSongKey: (key: string) => void
}) {
  return (
    <>
      {childFolders.length > 0 ? (
        showLocalSectionHeaders ? (
          <LocalContentSection
            count={childFolders.length}
            expanded={foldersExpanded}
            title={t('common.folders')}
            onToggle={onToggleFoldersExpanded}
          >
            <LocalFolderGrid
              childFolders={childFolders}
              nodes={nodes}
              songsById={songsById}
              selectedFolderPaths={selectedFolderPaths}
              multiSelect={multiSelect}
              isCompactLayout={isCompactLayout}
              t={t}
              onPlayFolder={onPlayFolder}
              onAddFolder={onAddFolder}
              onRefreshFolder={onRefreshFolder}
              onSearchFolder={onSearchFolder}
              onRevealFolder={onRevealFolder}
              onOpenFolder={onOpenFolder}
              onToggleFolderSelection={onToggleFolderSelection}
              onDragFolderStart={onDragFolderStart}
              onDropFolder={onDropFolder}
              onOpenFolderMenu={onOpenFolderMenu}
            />
          </LocalContentSection>
        ) : (
          <LocalFolderGrid
            childFolders={childFolders}
            nodes={nodes}
            songsById={songsById}
            selectedFolderPaths={selectedFolderPaths}
            multiSelect={multiSelect}
            isCompactLayout={isCompactLayout}
            t={t}
            onPlayFolder={onPlayFolder}
            onAddFolder={onAddFolder}
            onRefreshFolder={onRefreshFolder}
            onSearchFolder={onSearchFolder}
            onRevealFolder={onRevealFolder}
            onOpenFolder={onOpenFolder}
            onToggleFolderSelection={onToggleFolderSelection}
            onDragFolderStart={onDragFolderStart}
            onDropFolder={onDropFolder}
            onOpenFolderMenu={onOpenFolderMenu}
          />
        )
      ) : null}
      {currentSongs.length > 0 ? (
        showLocalSectionHeaders ? (
          <LocalContentSection
            count={currentSongs.length}
            expanded={songsExpanded}
            title={t('local.allSongs')}
            onToggle={onToggleSongsExpanded}
          >
            <LocalSongGrid
              currentSongs={currentSongs}
              selectedSongIds={selectedSongIds}
              selectedTrackId={selectedTrackId}
              isPlaying={isPlaying}
              multiSelect={multiSelect}
              isCompactLayout={isCompactLayout}
              showSongQuickJump={showSongQuickJump}
              songQuickJumpBasisName={songQuickJumpBasisName}
              songQuickJumpMap={songQuickJumpMap}
              queueSongIds={queueSongIds}
              t={t}
              localSongItemRefs={localSongItemRefs}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onToggleSongSelection={onToggleSongSelection}
              onAddSong={onAddSong}
              onOpenSongMenu={onOpenSongMenu}
              onDragSongStart={onDragSongStart}
              onJumpToSongKey={onJumpToSongKey}
            />
          </LocalContentSection>
        ) : (
          <LocalSongGrid
            currentSongs={currentSongs}
            selectedSongIds={selectedSongIds}
            selectedTrackId={selectedTrackId}
            isPlaying={isPlaying}
            multiSelect={multiSelect}
            isCompactLayout={isCompactLayout}
            showSongQuickJump={showSongQuickJump}
            songQuickJumpBasisName={songQuickJumpBasisName}
            songQuickJumpMap={songQuickJumpMap}
            queueSongIds={queueSongIds}
            t={t}
            localSongItemRefs={localSongItemRefs}
            onPlayTrack={onPlayTrack}
            onTogglePlayPause={onTogglePlayPause}
            onToggleSongSelection={onToggleSongSelection}
            onAddSong={onAddSong}
            onOpenSongMenu={onOpenSongMenu}
            onDragSongStart={onDragSongStart}
            onJumpToSongKey={onJumpToSongKey}
          />
        )
      ) : null}
    </>
  )
}

function LocalFolderGrid({
  childFolders,
  nodes,
  songsById,
  selectedFolderPaths,
  multiSelect,
  isCompactLayout,
  t,
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onOpenFolder,
  onToggleFolderSelection,
  onDragFolderStart,
  onDropFolder,
  onOpenFolderMenu,
}: {
  childFolders: FolderNode[]
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  selectedFolderPaths: Set<string>
  multiSelect: boolean
  isCompactLayout: boolean
  t: Translator
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onOpenFolder: (folderPath: string) => void
  onToggleFolderSelection: (folderPath: string) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
}) {
  return (
    <div className="local-folder-grid">
      {childFolders.map((folder) => (
        <LocalFolderCard
          folder={folder}
          key={folder.relativePath}
          selected={selectedFolderPaths.has(folder.relativePath)}
          multiSelect={multiSelect}
          nodes={nodes}
          songsById={songsById}
          t={t}
          variant={isCompactLayout ? 'list' : 'grid'}
          onPlayFolder={onPlayFolder}
          onAddFolder={(event, folder) => {
            onAddFolder(folder, event.clientX, event.clientY)
          }}
          onRefreshFolder={onRefreshFolder}
          onSearchFolder={onSearchFolder}
          onRevealFolder={onRevealFolder}
          onOpenFolder={onOpenFolder}
          onToggleSelection={onToggleFolderSelection}
          onDragStart={onDragFolderStart}
          onDrop={onDropFolder}
          onOpenFolderMenu={onOpenFolderMenu}
        />
      ))}
    </div>
  )
}

function LocalSongGrid({
  currentSongs,
  selectedSongIds,
  selectedTrackId,
  isPlaying,
  multiSelect,
  isCompactLayout,
  showSongQuickJump,
  songQuickJumpBasisName,
  songQuickJumpMap,
  queueSongIds,
  t,
  localSongItemRefs,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSongSelection,
  onAddSong,
  onOpenSongMenu,
  onDragSongStart,
  onJumpToSongKey,
}: {
  currentSongs: LibrarySong[]
  selectedSongIds: Set<number>
  selectedTrackId: number | null
  isPlaying: boolean
  multiSelect: boolean
  isCompactLayout: boolean
  showSongQuickJump: boolean
  songQuickJumpBasisName: string
  songQuickJumpMap: Map<string, number>
  queueSongIds: number[]
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSongSelection: (songId: number) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onJumpToSongKey: (key: string) => void
}) {
  return (
    <div className={showSongQuickJump ? 'local-song-grid-shell has-quick-jump' : 'local-song-grid-shell'}>
      {showSongQuickJump ? (
        <LocalSongQuickJump
          basisName={songQuickJumpBasisName}
          enabledKeys={songQuickJumpMap}
          t={t}
          visible={showSongQuickJump}
          onJump={onJumpToSongKey}
        />
      ) : null}
      <div className={isCompactLayout ? 'playlist-control-compact local-compact-song-list' : 'local-song-grid'}>
        {currentSongs.map((song, index) => (
          <div
            className={isCompactLayout ? 'local-compact-song-row' : 'local-song-grid-item'}
            key={song.id}
            ref={(element) => {
              localSongItemRefs.current[index] = element
            }}
          >
            {isCompactLayout ? (
              <PlaylistControlItem
                song={song}
                selected={selectedSongIds.has(song.id)}
                current={song.id === selectedTrackId}
                playing={song.id === selectedTrackId && isPlaying}
                selectionMode={multiSelect}
                dropPosition={null}
                queueSongIds={queueSongIds}
                t={t}
                showAlbum={false}
                onPlayTrack={onPlayTrack}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={() => onToggleSongSelection(song.id)}
                onAddToPlaylistClick={(song, x, y) => {
                  onAddSong(song, x, y)
                }}
                onContextMenu={(song, x, y) => {
                  onOpenSongMenu(song, x, y)
                }}
                onDragStart={(event) => {
                  onDragSongStart(event, song)
                }}
              />
            ) : (
              <GridViewMusicItemControl
                song={song}
                selected={selectedSongIds.has(song.id)}
                current={song.id === selectedTrackId}
                playing={song.id === selectedTrackId && isPlaying}
                multiSelect={multiSelect}
                queueSongIds={queueSongIds}
                t={t}
                variant="local"
                draggable
                onPlayTrack={onPlayTrack}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={onToggleSongSelection}
                onAddToPlaylistClick={(event, song) => {
                  onAddSong(song, event.clientX, event.clientY)
                }}
                onDragStart={onDragSongStart}
                onContextMenu={(event, song) => {
                  onOpenSongMenu(song, event.clientX, event.clientY)
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
