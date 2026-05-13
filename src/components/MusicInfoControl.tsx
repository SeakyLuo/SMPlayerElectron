import type { ReactNode } from 'react'

import { useRevealItem } from '../hooks/useRevealItem'
import type { LibrarySong, SongPropertiesSnapshot } from '../shared/contracts'
import { formatBytes, formatDuration } from '../shared/formatters'
import type { Translator } from '../shared/i18n'
import { CommandBar, CommandBarButton } from './CommandBar'
import { Icon } from './icons'

export const MAX_ARTIST_CELLS = 6

function PropertyRow({
  label,
  children,
  className,
  labelClassName,
}: {
  label: string
  children: ReactNode
  className?: string
  labelClassName?: string
}) {
  return (
    <div className={`song-dialog-property-row music-property-row${className ? ` ${className}` : ''}`}>
      <span className={`song-dialog-property-label music-property-label${labelClassName ? ` ${labelClassName}` : ''}`}>{label}</span>
      <div className="song-dialog-property-control music-property-control">{children}</div>
    </div>
  )
}

export function MusicInfoControl({
  song,
  t,
  loading,
  saving,
  showBusy,
  controlsDisabled,
  canPause,
  properties,
  onPlay,
  onSave,
  onReset,
  onClearPlayCount,
  onUpdateProperty,
  onUpdateArtistCell,
  onAddArtistCell,
  onRemoveArtistCell,
  onUpdateNumericProperty,
}: {
  song: LibrarySong
  t: Translator
  loading: boolean
  saving: boolean
  showBusy: boolean
  controlsDisabled: boolean
  canPause: boolean
  properties: SongPropertiesSnapshot | null
  onPlay: () => void
  onSave: () => void
  onReset: () => void
  onClearPlayCount: () => void
  onUpdateProperty: (key: keyof SongPropertiesSnapshot, value: string) => void
  onUpdateArtistCell: (index: number, value: string) => void
  onAddArtistCell: () => void
  onRemoveArtistCell: (index: number) => void
  onUpdateNumericProperty: (key: keyof SongPropertiesSnapshot, value: string) => void
}) {
  const formatTagList = (value: string) => value.split(', ').join(t('common.comma'))
  const revealItem = useRevealItem()

  return (
    <>
      <CommandBar className="song-dialog-commandbar music-info-control-commandbar MusicInfoControllerCommandBar" overflowLabel={t('player.more')}>
        <CommandBarButton icon={canPause ? 'pause' : 'play'} label={canPause ? t('context.pause') : t('context.play')} className={canPause ? 'PauseButton' : 'PlayButton'} onClick={onPlay} />
        <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button save-music-properties-button SaveMusicPropertiesButton" disabled={controlsDisabled} onClick={onSave} />
        <CommandBarButton icon="undo" label={t('common.reset')} className="reset-music-properties-button ResetMusicPropertiesButton" disabled={controlsDisabled} onClick={onReset} />
        {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
      </CommandBar>
      <div className="song-dialog-body music-info-control-scroll-viewer MusicInfoController">
        {loading || !properties ? (
          <div className="song-dialog-loading-placeholder" aria-label={t('nowPlaying.loading')} />
        ) : (
          <div className="song-dialog-property-list music-info-control-properties-grid MusicInfoControlPropertiesGrid">
            <PropertyRow label={t('table.title')} className="TitlePropertyRow" labelClassName="TitleTextBlock">
              <input className="title-text-box TitleTextBox" value={properties.title} disabled={saving} onChange={(event) => onUpdateProperty('title', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('song.subtitle')} className="SubtitlePropertyRow" labelClassName="SubtitleTextBlock">
              <input className="subtitle-text-box SubtitleTextBox" value={properties.subtitle} disabled={saving} onChange={(event) => onUpdateProperty('subtitle', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('common.artist')} className="song-dialog-artist-row ArtistPropertyRow" labelClassName="ArtistTextBlock">
              <span className="song-dialog-artist-editor ArtistTextBoxPanel">
                <span
                  className="song-dialog-artist-grid ArtistTextBoxGrid"
                  style={{ gridTemplateColumns: `repeat(${Math.min(properties.artists.length || 1, 2)}, minmax(0, 1fr))` }}
                >
                  {(properties.artists.length > 0 ? properties.artists : ['']).slice(0, MAX_ARTIST_CELLS).map((artist, index) => (
                    <span key={index} className="song-dialog-artist-cell ArtistTextBoxCell">
                      <input className="artist-text-box ArtistTextBox" value={artist} disabled={saving} onChange={(event) => onUpdateArtistCell(index, event.currentTarget.value)} />
                      {properties.artists.length > 1 ? (
                        <button type="button" className="song-dialog-artist-remove-button RemoveArtistButton" disabled={saving} onClick={() => onRemoveArtistCell(index)} aria-label={t('playlists.removeSelected')}>
                          <Icon name="close" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </span>
                <button type="button" className="song-dialog-icon-button song-dialog-add-artist-button AddArtistButton" disabled={saving || properties.artists.length >= MAX_ARTIST_CELLS} onClick={onAddArtistCell} aria-label={t('common.add')}>
                  <Icon name="plus" />
                </button>
              </span>
            </PropertyRow>
            <PropertyRow label={t('common.album')} className="AlbumPropertyRow" labelClassName="AlbumTextBlock">
              <input className="album-text-box AlbumTextBox" value={properties.album} disabled={saving} onChange={(event) => onUpdateProperty('album', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('song.albumArtist')} className="AlbumArtistPropertyRow" labelClassName="AlbumArtistTextBlock">
              <input className="album-artist-text-box AlbumArtistTextBox" value={properties.albumArtist} disabled={saving} onChange={(event) => onUpdateProperty('albumArtist', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('common.playCount')} labelClassName="PlayCountTextBlock">
              <span className="song-dialog-inline-field music-property-inline-field">
                <input className="play-count-text-block PlayCountTextBlock" value={properties.playCount || ''} disabled title={properties.playCount === 0 ? t('song.notPlayedYet', { title: song.title }) : t('song.hasBeenPlayed', { title: song.title, count: properties.playCount })} />
                {properties.playCount > 0 ? <button type="button" className="clear-play-count-button ClearPlayCountButton" onClick={onClearPlayCount}>{t('song.clearPlayCount')}</button> : null}
              </span>
            </PropertyRow>
            <PropertyRow label={t('song.publisher')} labelClassName="PublisherTextBlock">
              <input className="publisher-text-box PublisherTextBox" value={properties.publisher} disabled={saving} onChange={(event) => onUpdateProperty('publisher', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('song.trackNumber')} labelClassName="TrackNumberTextBlock">
              <input className="track-number-text-box TrackNumberTextBox" inputMode="numeric" value={properties.trackNumber || ''} disabled={saving} onChange={(event) => onUpdateNumericProperty('trackNumber', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('song.year')} labelClassName="YearTextBlock">
              <input className="year-text-box YearTextBox" inputMode="numeric" value={properties.year || ''} disabled={saving} onChange={(event) => onUpdateNumericProperty('year', event.currentTarget.value)} />
            </PropertyRow>
            <PropertyRow label={t('song.bitrate')} labelClassName="BitrateTextBlock"><input className="bitrate-text-box BitRateTextBox" value={properties.bitrate || ''} disabled /></PropertyRow>
            <PropertyRow label={t('song.composers')} labelClassName="ComposersTextBlock"><input className="composers-text-box ComposersTextBox" value={formatTagList(properties.composers)} disabled /></PropertyRow>
            <PropertyRow label={t('song.dateCreated')} labelClassName="DateCreatedTextBlock"><input className="date-created-text-box DateCreatedTextBox" value={new Date(properties.dateCreated).toLocaleString()} disabled /></PropertyRow>
            <PropertyRow label={t('song.dateModified')} labelClassName="DateModifiedTextBlock"><input className="date-modified-text-box DateModifiedTextBox" value={new Date(properties.dateModified).toLocaleString()} disabled /></PropertyRow>
            <PropertyRow label={t('common.duration')} labelClassName="DurationTextBlock"><input className="duration-text-box DurationTextBox" value={formatDuration(properties.duration)} disabled /></PropertyRow>
            <PropertyRow label={t('song.fileSize')} labelClassName="FileSizeTextBlock"><input className="file-size-text-box FileSizeTextBox" value={formatBytes(properties.fileSize)} disabled /></PropertyRow>
            <PropertyRow label={t('song.fileType')} labelClassName="FileTypeTextBlock"><input className="file-type-text-box FileTypeTextBox" value={properties.fileType} disabled /></PropertyRow>
            <PropertyRow label={t('song.genre')} labelClassName="GenreTextBlock"><input className="genre-text-box GenreTextBox" value={formatTagList(properties.genre)} disabled /></PropertyRow>
            <PropertyRow label={t('local.path')} labelClassName="PathTextBlock">
              <span className="song-dialog-inline-field music-property-inline-field">
                <input className="path-text-box PathTextBox" value={properties.path} disabled />
                <button type="button" className="show-in-explorer-button ShowInExplorerButton" onClick={() => revealItem(properties.path)}>{t('song.showInExplorer')}</button>
              </span>
            </PropertyRow>
          </div>
        )}
      </div>
    </>
  )
}
