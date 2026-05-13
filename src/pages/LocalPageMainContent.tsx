import type { ComponentProps, CSSProperties, DragEvent, MouseEvent, RefObject } from 'react'
import { Link } from 'react-router-dom'

import { CommandBar, CommandBarButton } from '../components/CommandBar'
import { CustomScrollbar } from '../components/CustomScrollbar'
import { Icon } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MultiSelectCommandBar } from '../components/MultiSelectCommandBar'
import type { LibraryPlaylist, LibrarySong, ScanLibraryProgress } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import type { FolderNode } from './localFolderModel'
import { LocalGridContent } from './LocalGridContent'
import { LocalTableContent } from './LocalTableContent'
import { getRefreshProgressMessage } from './localPageModel'

export function LocalPageMainContent({
  childFolders,
  currentSongs,
  nodes,
  songs,
  songsById,
  playablePlaylists,
  selectedFolderPaths,
  selectedSongIds,
  selectedTrackId,
  selectedListItemKey,
  isPlaying,
  multiSelect,
  isCompactLayout,
  showLocalSectionHeaders,
  showFolderItems,
  showSongItems,
  foldersExpanded,
  songsExpanded,
  showSongQuickJump,
  songQuickJumpBasisName,
  songQuickJumpMap,
  effectiveViewMode,
  currentRelativePath,
  queueSongIds,
  selectedQueueSongIds,
  selectedLocalItemCount,
  loading,
  scanning,
  scanProgress,
  refreshProgressAngle,
  refreshProgressPercent,
  error,
  localNotification,
  searchQuery,
  t,
  localSongItemRefs,
  localScrollFrameRef,
  localScrollShellRef,
  localScrollbarTrackRef,
  localTableScrollFrameRef,
  localTableShellRef,
  localTableScrollbarTrackRef,
  onLocalScrollbarPointerDown,
  onLocalTableScrollbarPointerDown,
  onHiddenFoldersListButtonClick,
  onCancelRefreshFolder,
  onPlayShuffled,
  onRefreshCurrentFolder,
  onShowSortMenu,
  onCreateFolder,
  onEnableMultiSelect,
  onDeleteSelectedItems,
  onOpenSelectionAddMenu,
  onOpenSelectionMoveMenu,
  selectedMoveTargetFolders,
  onSelectAll,
  onReverseSelection,
  onClearSelection,
  onCancelSelection,
  onToggleFoldersExpanded,
  onToggleSongsExpanded,
  onSelectListItem,
  onOpenFolder,
  onShuffleFolder,
  onOpenFolderAddMenu,
  onRefreshFolder,
  onSearchFolder,
  onRevealFolder,
  onToggleFolderSelection,
  onDragFolderStart,
  onDropFolder,
  onOpenFolderMenu,
  onPlayTrack,
  onTogglePlayPause,
  onMoveToMusicOrPlay,
  onPlayNext,
  onToggleSongSelection,
  onOpenSongAddMenu,
  onOpenSongMenu,
  onDragSongStart,
  onJumpToSongKey,
}: {
  childFolders: FolderNode[]
  currentSongs: LibrarySong[]
  nodes: Map<string, FolderNode>
  songs: LibrarySong[]
  songsById: Map<number, LibrarySong>
  playablePlaylists: LibraryPlaylist[]
  selectedFolderPaths: Set<string>
  selectedSongIds: Set<number>
  selectedTrackId: number | null
  selectedListItemKey: string
  isPlaying: boolean
  multiSelect: boolean
  isCompactLayout: boolean
  showLocalSectionHeaders: boolean
  showFolderItems: boolean
  showSongItems: boolean
  foldersExpanded: boolean
  songsExpanded: boolean
  showSongQuickJump: boolean
  songQuickJumpBasisName: string
  songQuickJumpMap: Map<string, number>
  effectiveViewMode: 'grid' | 'list'
  currentRelativePath: string
  queueSongIds: number[]
  selectedQueueSongIds: number[]
  selectedLocalItemCount: number
  loading: boolean
  scanning: boolean
  scanProgress: ScanLibraryProgress | null
  refreshProgressAngle: string
  refreshProgressPercent: number
  error: string | null
  localNotification: string
  searchQuery: string
  t: Translator
  localSongItemRefs: RefObject<Array<HTMLElement | null>>
  localScrollFrameRef: RefObject<HTMLDivElement | null>
  localScrollShellRef: RefObject<HTMLDivElement | null>
  localScrollbarTrackRef: RefObject<HTMLDivElement | null>
  localTableScrollFrameRef: RefObject<HTMLDivElement | null>
  localTableShellRef: RefObject<HTMLDivElement | null>
  localTableScrollbarTrackRef: RefObject<HTMLDivElement | null>
  onLocalScrollbarPointerDown: ComponentProps<typeof CustomScrollbar>['onThumbPointerDown']
  onLocalTableScrollbarPointerDown: ComponentProps<typeof CustomScrollbar>['onThumbPointerDown']
  onHiddenFoldersListButtonClick: () => void
  onCancelRefreshFolder: () => void
  onPlayShuffled: () => void
  onRefreshCurrentFolder: () => void
  onShowSortMenu: (event: MouseEvent<HTMLElement>) => void
  onCreateFolder: () => void
  onEnableMultiSelect: () => void
  onDeleteSelectedItems: () => void
  onOpenSelectionAddMenu: (x: number, y: number) => void
  onOpenSelectionMoveMenu: (x: number, y: number) => void
  selectedMoveTargetFolders: FolderNode[]
  onSelectAll: () => void
  onReverseSelection: () => void
  onClearSelection: () => void
  onCancelSelection: () => void
  onToggleFoldersExpanded: () => void
  onToggleSongsExpanded: () => void
  onSelectListItem: (key: string) => void
  onOpenFolder: (folderPath: string) => void
  onShuffleFolder: (folder: FolderNode) => void
  onOpenFolderAddMenu: (folder: FolderNode, x: number, y: number) => void
  onRefreshFolder: (folder: FolderNode) => void
  onSearchFolder: (folder: FolderNode) => void
  onRevealFolder: (folder: FolderNode) => void
  onToggleFolderSelection: (folderPath: string) => void
  onDragFolderStart: (event: DragEvent, folder: FolderNode) => void
  onDropFolder: (event: DragEvent, folder: FolderNode) => void
  onOpenFolderMenu: (folder: FolderNode, x: number, y: number) => void
  onPlayTrack: (trackId: number, queueSongIds: number[]) => void
  onTogglePlayPause: () => void
  onMoveToMusicOrPlay: (songId: number) => void
  onPlayNext: (songId: number) => void
  onToggleSongSelection: (songId: number) => void
  onOpenSongAddMenu: (song: LibrarySong, x: number, y: number) => void
  onOpenSongMenu: (song: LibrarySong, x: number, y: number) => void
  onDragSongStart: (event: DragEvent, song: LibrarySong) => void
  onJumpToSongKey: (key: string) => void
}) {
  return (
    <>
      <div className="local-toolbar">
        <CommandBar
          className="local-commandbar"
          overflowReserve={isCompactLayout ? 44 : 0}
          overflowLabel={t('player.more')}
          overflowItems={isCompactLayout ? [
            {
              key: 'hidden-folders',
              text: t('local.viewHiddenFolders'),
              icon: 'hiddenFolders',
              onClick: onHiddenFoldersListButtonClick,
            },
          ] : []}
          content={(
            <p>
              {t('local.headerStats', {
                folders: childFolders.length,
                songs: currentSongs.length,
              })}
            </p>
          )}
        >
          <CommandBarButton icon="shuffle" label={t('nowPlaying.randomPlay')} onClick={onPlayShuffled} />
          <CommandBarButton
            icon="refresh"
            label={scanning ? t('library.scanning') : isCompactLayout ? t('local.updateFolderShort') : t('local.updateFolder')}
            onClick={onRefreshCurrentFolder}
            disabled={scanning}
          />
          <CommandBarButton icon="sort" label={t('common.sort')} onClick={onShowSortMenu} />
          <CommandBarButton icon="folder" label={t('local.newFolder')} onClick={onCreateFolder} />
          <CommandBarButton icon="multiSelect" label={t('albums.multiSelect')} active={multiSelect} onClick={onEnableMultiSelect} />
          {multiSelect ? (
            <CommandBarButton
              icon="trash"
              label={t('context.deleteFromDisk')}
              disabled={selectedLocalItemCount === 0}
              onClick={onDeleteSelectedItems}
            />
          ) : null}
        </CommandBar>
      </div>

      {loading ? <div className="root-banner">{t('library.refreshing')}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {localNotification ? <div className="root-banner">{localNotification}</div> : null}
      {scanning ? (
        <div className="local-refresh-overlay" role="status" aria-live="polite">
          <span
            className="local-refresh-progress-ring"
            style={{ '--local-refresh-progress-angle': refreshProgressAngle } as CSSProperties}
            aria-hidden="true"
          >
            <span className="local-refresh-progress-value">{refreshProgressPercent}%</span>
          </span>
          <p>{getRefreshProgressMessage(scanProgress, t)}</p>
          {scanProgress?.canCancel ? (
            <button type="button" className="local-refresh-stop-button" onClick={onCancelRefreshFolder}>
              {t('common.pause')}
            </button>
          ) : null}
        </div>
      ) : null}

      <MultiSelectCommandBar
        visible={multiSelect}
        selectedCount={selectedLocalItemCount}
        t={t}
        playlists={playablePlaylists}
        showPlay={selectedQueueSongIds.length > 0}
        showAddTo={selectedQueueSongIds.length > 0}
        onPlay={() => {
          onPlayTrack(selectedQueueSongIds[0]!, selectedQueueSongIds)
        }}
        onAddToPlaylistMenuClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          onOpenSelectionAddMenu(rect.left, rect.top - 8)
        }}
        onRemove={onDeleteSelectedItems}
        removeLabel={t('context.deleteFromDisk')}
        extraActions={[
          {
            key: 'move-to-folder',
            text: t('context.moveToFolder'),
            icon: 'folder',
            disabled: selectedLocalItemCount === 0 || selectedMoveTargetFolders.length === 0,
            onClick: (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onOpenSelectionMoveMenu(rect.left, rect.top - 8)
            },
          },
        ]}
        onSelectAll={onSelectAll}
        onReverseSelection={onReverseSelection}
        onClearSelection={onClearSelection}
        onCancel={onCancelSelection}
      />

      {childFolders.length === 0 && currentSongs.length === 0 ? (
        loading || scanning ? (
          <LoadingState t={t} />
        ) : songs.length === 0 || searchQuery.trim() ? (
          <div className="empty-state">
            <h3>
              {songs.length === 0
                ? t('local.noSongsScanned')
                : t('local.noSongsBranch', { query: searchQuery })}
            </h3>
            <p>
              {songs.length === 0
                ? t('local.scanPopulate')
                : t('local.searchHelp')}
            </p>
            {songs.length === 0 ? (
              <Link className="local-command" to="/settings">
                <Icon name="settings" />
                {t('local.goToSettings')}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="local-empty-folder" aria-hidden="true" />
        )
      ) : effectiveViewMode === 'grid' ? (
        <div className="local-scroll-frame custom-scrollbar-frame" ref={localScrollFrameRef}>
          <div className="local-scroll-shell custom-scrollbar-container" ref={localScrollShellRef}>
            <LocalGridContent
              childFolders={childFolders}
              currentSongs={currentSongs}
              nodes={nodes}
              songsById={songsById}
              selectedFolderPaths={selectedFolderPaths}
              selectedSongIds={selectedSongIds}
              selectedTrackId={selectedTrackId}
              isPlaying={isPlaying}
              multiSelect={multiSelect}
              isCompactLayout={isCompactLayout}
              showLocalSectionHeaders={showLocalSectionHeaders}
              foldersExpanded={foldersExpanded}
              songsExpanded={songsExpanded}
              showSongQuickJump={showSongQuickJump}
              songQuickJumpBasisName={songQuickJumpBasisName}
              songQuickJumpMap={songQuickJumpMap}
              queueSongIds={queueSongIds}
              t={t}
              localSongItemRefs={localSongItemRefs}
              onToggleFoldersExpanded={onToggleFoldersExpanded}
              onToggleSongsExpanded={onToggleSongsExpanded}
              onPlayFolder={onShuffleFolder}
              onAddFolder={onOpenFolderAddMenu}
              onRefreshFolder={onRefreshFolder}
              onSearchFolder={onSearchFolder}
              onRevealFolder={onRevealFolder}
              onOpenFolder={onOpenFolder}
              onToggleFolderSelection={onToggleFolderSelection}
              onDragFolderStart={onDragFolderStart}
              onDropFolder={onDropFolder}
              onOpenFolderMenu={onOpenFolderMenu}
              onPlayTrack={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause}
              onToggleSongSelection={onToggleSongSelection}
              onAddSong={onOpenSongAddMenu}
              onOpenSongMenu={onOpenSongMenu}
              onDragSongStart={onDragSongStart}
              onJumpToSongKey={onJumpToSongKey}
            />
          </div>
          <CustomScrollbar
            scrollbarTrackRef={localScrollbarTrackRef}
            onThumbPointerDown={onLocalScrollbarPointerDown}
          />
        </div>
      ) : (
        <LocalTableContent
          frameRef={localTableScrollFrameRef}
          shellRef={localTableShellRef}
          scrollbarTrackRef={localTableScrollbarTrackRef}
          onThumbPointerDown={onLocalTableScrollbarPointerDown}
          childFolders={childFolders}
          currentSongs={currentSongs}
          currentRelativePath={currentRelativePath}
          selectedFolderPaths={selectedFolderPaths}
          selectedSongIds={selectedSongIds}
          selectedListItemKey={selectedListItemKey}
          selectedTrackId={selectedTrackId}
          isPlaying={isPlaying}
          multiSelect={multiSelect}
          showLocalSectionHeaders={showLocalSectionHeaders}
          showFolderItems={showFolderItems}
          showSongItems={showSongItems}
          foldersExpanded={foldersExpanded}
          songsExpanded={songsExpanded}
          showSongQuickJump={showSongQuickJump}
          songQuickJumpBasisName={songQuickJumpBasisName}
          songQuickJumpMap={songQuickJumpMap}
          queueSongIds={queueSongIds}
          t={t}
          localSongItemRefs={localSongItemRefs}
          onToggleFoldersExpanded={onToggleFoldersExpanded}
          onToggleSongsExpanded={onToggleSongsExpanded}
          onToggleFolderSelection={onToggleFolderSelection}
          onSelectListItem={onSelectListItem}
          onOpenFolder={onOpenFolder}
          onOpenFolderMenu={onOpenFolderMenu}
          onDragFolderStart={onDragFolderStart}
          onDropFolder={onDropFolder}
          onPlayFolder={onShuffleFolder}
          onAddFolder={onOpenFolderAddMenu}
          onRefreshFolder={onRefreshFolder}
          onSearchFolder={onSearchFolder}
          onRevealFolder={onRevealFolder}
          onToggleSongSelection={onToggleSongSelection}
          onOpenSongMenu={onOpenSongMenu}
          onDragSongStart={onDragSongStart}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onTogglePlayPause}
          onMoveToMusicOrPlay={onMoveToMusicOrPlay}
          onPlayNext={onPlayNext}
          onAddSong={onOpenSongAddMenu}
          onJumpToSongKey={onJumpToSongKey}
        />
      )}
    </>
  )
}
