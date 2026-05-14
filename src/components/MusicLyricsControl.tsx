import type { RefObject } from 'react'

import type { LyricsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { CommandBar, CommandBarButton } from './CommandBar'

export function MusicLyricsControl({
  t,
  loading,
  saving,
  showBusy,
  lyrics,
  lyricsText,
  lyricsTextAreaRef,
  lyricsCanToggleTimestamps,
  showLyricsTimestamps,
  onSearch,
  onImport,
  onSave,
  onReset,
  onToggleTimestamps,
  onLyricsTextChange,
}: {
  t: Translator
  loading: boolean
  saving: boolean
  showBusy: boolean
  lyrics: LyricsSnapshot | null
  lyricsText: string
  lyricsTextAreaRef: RefObject<HTMLTextAreaElement | null>
  lyricsCanToggleTimestamps: boolean
  showLyricsTimestamps: boolean
  onSearch: () => void
  onImport: () => void
  onSave: () => void
  onReset?: () => void
  onToggleTimestamps: (checked: boolean) => void
  onLyricsTextChange: (value: string) => void
}) {
  return (
    <>
      <CommandBar className="song-dialog-commandbar music-info-control-commandbar MusicLyricsControllerCommandBar" overflowLabel={t('player.more')}>
        <CommandBarButton icon="search" label={t('common.search')} className="SearchLyricsButton" disabled={loading || saving} onClick={onSearch} />
        <CommandBarButton icon="import" label={t('common.import')} className="ImportLyricsButton" disabled={loading || saving} onClick={onImport} />
        <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button save-lyrics-button SaveLyricsButton" disabled={loading || saving} onClick={onSave} />
        {onReset ? <CommandBarButton icon="undo" label={t('common.reset')} className="reset-lyrics-button ResetLyricsButton" disabled={loading || saving} onClick={onReset} /> : null}
        {lyricsCanToggleTimestamps ? (
          <label className="song-dialog-lyrics-timestamp-toggle">
            <input type="checkbox" checked={showLyricsTimestamps} disabled={loading || saving} onChange={(event) => onToggleTimestamps(event.currentTarget.checked)} />
            {t('song.showLyricsTimestamps')}
          </label>
        ) : null}
        {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
      </CommandBar>
      <div className="song-dialog-body song-dialog-lyrics MusicLyricsControl MusicLyricsController">
        {loading ? (
          <div className="song-dialog-loading-placeholder" role="status" aria-label={t('nowPlaying.loading')}>
            <div className="song-dialog-loading" aria-hidden="true" />
          </div>
        ) : (
          <textarea
            className="LyricsTextBox"
            ref={lyricsTextAreaRef}
            value={lyricsText}
            disabled={saving}
            placeholder={lyrics?.source === 'none' ? t('nowPlaying.noLyrics') : ''}
            onChange={(event) => onLyricsTextChange(event.currentTarget.value)}
          />
        )}
      </div>
    </>
  )
}
