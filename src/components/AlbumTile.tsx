import { AlbumArtControl } from './AlbumArtControl'
import { Icon } from './icons'
import type { MenuFlyoutPosition } from './MenuFlyoutHelper'
import type { Translator } from '../shared/i18n'

export interface AlbumTileData {
  name: string
  artist: string
  artworkUrl: string
  songIds: number[]
}

export function AlbumTile({
  album,
  multiSelect,
  selected,
  t,
  onOpenAlbum,
  onPlayAlbum,
  onAddAlbum,
  onToggleSelection,
  onOpenContextMenu,
}: {
  album: AlbumTileData
  multiSelect: boolean
  selected: boolean
  t: Translator
  onOpenAlbum: () => void
  onPlayAlbum: () => void
  onAddAlbum: (position: MenuFlyoutPosition) => void
  onToggleSelection: () => void
  onOpenContextMenu: (position: MenuFlyoutPosition) => void
}) {
  const content = (
    <>
      <AlbumArtControl title={album.name} artworkUrl={album.artworkUrl} songId={album.songIds[0]} />
      <div className="album-tile-copy">
        <strong title={album.name}>{album.name}</strong>
        <span title={album.artist}>{album.artist}</span>
      </div>
    </>
  )

  return (
    <article
      className={[
        'album-tile',
        multiSelect ? 'is-selection-mode' : '',
        selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <button
        type="button"
        className="album-tile-surface"
        title={album.name}
        onClick={multiSelect ? onToggleSelection : onOpenAlbum}
      >
        {content}
      </button>
      <div className="album-hover-actions">
        <button type="button" onClick={onPlayAlbum} aria-label={t('detail.playAlbum')} title={t('detail.playAlbum')}>
          <Icon name="play" />
        </button>
        <button
          type="button"
          className="album-add-button"
          onClick={(event) => {
            event.stopPropagation()
            onAddAlbum({ x: event.clientX, y: event.clientY })
          }}
          aria-label={t('context.addToPlaylist')}
          title={t('context.addToPlaylist')}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {multiSelect || selected ? (
        <span className={selected ? 'album-select-mark is-selected' : 'album-select-mark'} aria-hidden="true">
          {selected ? <Icon name="check" /> : null}
        </span>
      ) : null}
    </article>
  )
}
