import type { CSSProperties, DragEvent, RefObject } from 'react'

import { GridViewMusicItemControl } from '../components/GridViewMusicItemControl'
import { LocalFolderCard } from '../components/LocalFolderCard'
import { PlaylistControlItem } from '../components/PlaylistControlItem'
import { getDisplayArtists } from '../shared/artists'
import type { LibrarySong } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { FolderNode } from './localFolderModel'
import { LocalContentSection, LocalSongQuickJump } from './LocalPageQuickJump'
import type { LocalSortMode } from './localPageModel'

export type LocalCompactTreeRow =
  | {
    key: string
    type: 'folder'
    folder: FolderNode
    depth: number
    expanded: boolean
    expandable: boolean
  }
  | {
    key: string
    type: 'song'
    song: LibrarySong
    depth: number
    songIndex: number
  }

export function LocalGridContent({
  childFolders,
  currentSongs,
  nodes,
  songsById,
  selectedFolderPaths,
  selectedSongIds,
  dragOverFolderPath,
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
  compactTreeRows,
  compactQueueSongIds,
  sortMode,
  currentSortMode,
  queueSongIds,
  t,
  localSongItemRefs,
  onToggleFoldersExpanded,
  onToggleSongsExpanded,
  onToggleTreeFolderExpanded,
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onOpenFolder,
  onToggleFolderSelection,
  onDragFolderStart,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropFolder,
  onDragLocalItemEnd,
  onOpenFolderMenu,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSongSelection,
  onPlayNext,
  onToggleFavorite,
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
  dragOverFolderPath: string
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
  compactTreeRows?: LocalCompactTreeRow[]
  compactQueueSongIds?: number[]
  sortMode: LocalSortMode
  currentSortMode: LocalSortMode
  queueSongIds: number[]
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  onToggleFoldersExpanded: () => void
  onToggleSongsExpanded: () => void
  onToggleTreeFolderExpanded?: (folderPath: string) => void
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onOpenFolder: (folderPath: string) => void
  onToggleFolderSelection: (folderPath: string) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDragOverFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLeaveFolder: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLocalItemEnd: () => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSongSelection: (songId: number) => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onJumpToSongKey: (key: string) => void
}) {
  const folderContent = isCompactLayout && compactTreeRows ? (
    <LocalCompactTreeContent
      rows={compactTreeRows}
      nodes={nodes}
      songsById={songsById}
      selectedFolderPaths={selectedFolderPaths}
      selectedSongIds={selectedSongIds}
      dragOverFolderPath={dragOverFolderPath}
      selectedTrackId={selectedTrackId}
      isPlaying={isPlaying}
      multiSelect={multiSelect}
      queueSongIds={compactQueueSongIds ?? []}
      t={t}
      onToggleTreeFolderExpanded={onToggleTreeFolderExpanded}
      onPlayFolder={onPlayFolder}
      onAddFolder={onAddFolder}
      onRefreshFolder={onRefreshFolder}
      onSearchFolder={onSearchFolder}
      onRevealFolder={onRevealFolder}
      onOpenFolder={onOpenFolder}
      onToggleFolderSelection={onToggleFolderSelection}
      onDragFolderStart={onDragFolderStart}
      onDragOverFolder={onDragOverFolder}
      onDragLeaveFolder={onDragLeaveFolder}
      onDropFolder={onDropFolder}
      onDragLocalItemEnd={onDragLocalItemEnd}
      onOpenFolderMenu={onOpenFolderMenu}
      onPlayTrack={onPlayTrack}
      onTogglePlayPause={onTogglePlayPause}
      onToggleSongSelection={onToggleSongSelection}
      onPlayNext={onPlayNext}
      onToggleFavorite={onToggleFavorite}
      onAddSong={onAddSong}
      onOpenSongMenu={onOpenSongMenu}
      onDragSongStart={onDragSongStart}
    />
  ) : (
    <LocalFolderGrid
      childFolders={childFolders}
      nodes={nodes}
      songsById={songsById}
      selectedFolderPaths={selectedFolderPaths}
      dragOverFolderPath={dragOverFolderPath}
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
      onDragOverFolder={onDragOverFolder}
      onDragLeaveFolder={onDragLeaveFolder}
      onDropFolder={onDropFolder}
      onDragLocalItemEnd={onDragLocalItemEnd}
      onOpenFolderMenu={onOpenFolderMenu}
    />
  )

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
            {folderContent}
          </LocalContentSection>
        ) : (
          folderContent
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
              sortMode={sortMode}
              currentSortMode={currentSortMode}
              queueSongIds={queueSongIds}
              t={t}
              localSongItemRefs={localSongItemRefs}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onToggleSongSelection={onToggleSongSelection}
              onPlayNext={onPlayNext}
              onToggleFavorite={onToggleFavorite}
              onAddSong={onAddSong}
              onOpenSongMenu={onOpenSongMenu}
              onDragSongStart={onDragSongStart}
              onDragLocalItemEnd={onDragLocalItemEnd}
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
            sortMode={sortMode}
            currentSortMode={currentSortMode}
            queueSongIds={queueSongIds}
            t={t}
            localSongItemRefs={localSongItemRefs}
            onPlayTrack={onPlayTrack}
            onTogglePlayPause={onTogglePlayPause}
            onToggleSongSelection={onToggleSongSelection}
            onPlayNext={onPlayNext}
            onToggleFavorite={onToggleFavorite}
            onAddSong={onAddSong}
            onOpenSongMenu={onOpenSongMenu}
            onDragSongStart={onDragSongStart}
            onDragLocalItemEnd={onDragLocalItemEnd}
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
  dragOverFolderPath,
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
  onDragOverFolder,
  onDragLeaveFolder,
  onDropFolder,
  onDragLocalItemEnd,
  onOpenFolderMenu,
}: {
  childFolders: FolderNode[]
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  selectedFolderPaths: Set<string>
  dragOverFolderPath: string
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
  onDragOverFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLeaveFolder: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLocalItemEnd: () => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
}) {
  return (
    <div className="local-folder-grid">
      {childFolders.map((folder) => (
        <LocalFolderCard
          folder={folder}
          key={folder.relativePath}
          selected={selectedFolderPaths.has(folder.relativePath)}
          dropTarget={dragOverFolderPath === folder.relativePath}
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
          onDragOver={onDragOverFolder}
          onDragLeave={onDragLeaveFolder}
          onDrop={onDropFolder}
          onDragEnd={onDragLocalItemEnd}
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
  sortMode,
  currentSortMode,
  queueSongIds,
  t,
  localSongItemRefs,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSongSelection,
  onPlayNext,
  onToggleFavorite,
  onAddSong,
  onOpenSongMenu,
  onDragSongStart,
  onDragLocalItemEnd,
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
  sortMode: LocalSortMode
  currentSortMode: LocalSortMode
  queueSongIds: number[]
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSongSelection: (songId: number) => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onDragLocalItemEnd: () => void
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
        {currentSongs.map((song, index) => {
          const detailLabel = getLocalSongDetailLabel(song, sortMode, currentSortMode, t)
          return (
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
                showAlbum
                onPlayTrack={onPlayTrack}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={() => onToggleSongSelection(song.id)}
                onToggleFavorite={onToggleFavorite}
                onAddToPlaylistClick={(song, x, y) => {
                  onAddSong(song, x, y)
                }}
                onPlayNextClick={(song) => {
                  onPlayNext(song.id)
                }}
                onContextMenu={(song, x, y) => {
                  onOpenSongMenu(song, x, y)
                }}
                onDragStart={(event) => {
                  onDragSongStart(event, song)
                }}
                onDragEnd={onDragLocalItemEnd}
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
                detailLabel={detailLabel}
                draggable
                onPlayTrack={onPlayTrack}
                onTogglePlayPause={onTogglePlayPause}
                onToggleSelection={onToggleSongSelection}
                onAddToPlaylistClick={(event, song) => {
                  onAddSong(song, event.clientX, event.clientY)
                }}
                onDragStart={onDragSongStart}
                onDragEnd={onDragLocalItemEnd}
                onContextMenu={(event, song) => {
                  onOpenSongMenu(song, event.clientX, event.clientY)
                }}
              />
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

function LocalCompactTreeContent({
  rows,
  nodes,
  songsById,
  selectedFolderPaths,
  selectedSongIds,
  dragOverFolderPath,
  selectedTrackId,
  isPlaying,
  multiSelect,
  queueSongIds,
  t,
  onToggleTreeFolderExpanded,
  onPlayFolder,
  onAddFolder,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onOpenFolder,
  onToggleFolderSelection,
  onDragFolderStart,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropFolder,
  onDragLocalItemEnd,
  onOpenFolderMenu,
  onPlayTrack,
  onTogglePlayPause,
  onToggleSongSelection,
  onPlayNext,
  onToggleFavorite,
  onAddSong,
  onOpenSongMenu,
  onDragSongStart,
}: {
  rows: LocalCompactTreeRow[]
  nodes: Map<string, FolderNode>
  songsById: Map<number, LibrarySong>
  selectedFolderPaths: Set<string>
  selectedSongIds: Set<number>
  dragOverFolderPath: string
  selectedTrackId: number | null
  isPlaying: boolean
  multiSelect: boolean
  queueSongIds: number[]
  t: Translator
  onToggleTreeFolderExpanded?: (folderPath: string) => void
  onPlayFolder: (folder: FolderNode) => void
  onAddFolder: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onOpenFolder: (folderPath: string) => void
  onToggleFolderSelection: (folderPath: string) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDragOverFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLeaveFolder: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onDragLocalItemEnd: () => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onToggleSongSelection: (songId: number) => void
  onPlayNext: (songId: number) => void
  onToggleFavorite: (songId: number, favorite: boolean) => void
  onAddSong: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
}) {
  return (
    <div className="playlist-control-compact local-compact-tree-list">
      {rows.map((row) => row.type === 'folder' ? (
        <div
          className="local-compact-tree-row"
          key={row.key}
          style={{ '--local-tree-depth': row.depth } as CSSProperties}
        >
          <LocalFolderCard
            folder={row.folder}
            selected={selectedFolderPaths.has(row.folder.relativePath)}
            dropTarget={dragOverFolderPath === row.folder.relativePath}
            multiSelect={multiSelect}
            nodes={nodes}
            songsById={songsById}
            t={t}
            variant="list"
            treeExpanded={row.expanded}
            treeExpandable={row.expandable}
            onToggleTreeExpanded={() => onToggleTreeFolderExpanded?.(row.folder.relativePath)}
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
            onDragOver={onDragOverFolder}
            onDragLeave={onDragLeaveFolder}
            onDrop={onDropFolder}
            onDragEnd={onDragLocalItemEnd}
            onOpenFolderMenu={onOpenFolderMenu}
          />
        </div>
      ) : (
        <div
          className="local-compact-tree-row local-compact-song-row local-compact-tree-song-row"
          key={row.key}
          style={{ '--local-tree-depth': row.depth } as CSSProperties}
        >
          <PlaylistControlItem
            song={row.song}
            selected={selectedSongIds.has(row.song.id)}
            current={row.song.id === selectedTrackId}
            playing={row.song.id === selectedTrackId && isPlaying}
            selectionMode={multiSelect}
            dropPosition={null}
            queueSongIds={queueSongIds}
            t={t}
            showAlbum
            onPlayTrack={onPlayTrack}
            onTogglePlayPause={onTogglePlayPause}
            onToggleSelection={() => onToggleSongSelection(row.song.id)}
            onToggleFavorite={onToggleFavorite}
            onAddToPlaylistClick={(song, x, y) => {
              onAddSong(song, x, y)
            }}
            onPlayNextClick={(song) => {
              onPlayNext(song.id)
            }}
            onContextMenu={(song, x, y) => {
              onOpenSongMenu(song, x, y)
            }}
            onDragStart={(event) => {
              onDragSongStart(event, row.song)
            }}
            onDragEnd={onDragLocalItemEnd}
          />
        </div>
      ))}
    </div>
  )
}

function getLocalSongDetailLabel(song: LibrarySong, sortMode: LocalSortMode, currentSortMode: LocalSortMode, t: Translator) {
  const effectiveSortMode = sortMode === 'reverse' ? currentSortMode : sortMode

  if (effectiveSortMode === 'album') {
    const artistLabel = getDisplayArtists(song, t('common.artistUnknown'), t('common.artistSeparator'))
    const albumLabel = song.album || t('common.albumUnknown')
    return `${artistLabel} · ${albumLabel}`
  }

  return undefined
}
