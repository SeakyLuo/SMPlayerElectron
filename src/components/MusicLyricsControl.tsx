import type { RefObject } from 'react'

import type { LyricsSnapshot } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { CommandBar, CommandBarButton } from './CommandBar'

export function MusicLyricsControl({
  t,
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
  onReset: () => void
  onToggleTimestamps: (checked: boolean) => void
  onLyricsTextChange: (value: string) => void
}) {
  return (
    <>
      <CommandBar className="song-dialog-commandbar music-info-control-commandbar MusicLyricsControllerCommandBar" overflowLabel={t('player.more')}>
        <CommandBarButton icon="search" label={t('common.search')} className="SearchLyricsButton" disabled={saving} onClick={onSearch} />
        <CommandBarButton icon="import" label={t('common.import')} className="ImportLyricsButton" disabled={saving} onClick={onImport} />
        <CommandBarButton icon="save" label={t('settings.save')} className="song-dialog-primary-button save-lyrics-button SaveLyricsButton" disabled={saving} onClick={onSave} />
        <CommandBarButton icon="undo" label={t('common.reset')} className="reset-lyrics-button ResetLyricsButton" disabled={saving} onClick={onReset} />
        {lyricsCanToggleTimestamps ? (
          <label className="song-dialog-lyrics-timestamp-toggle">
            <input type="checkbox" checked={showLyricsTimestamps} onChange={(event) => onToggleTimestamps(event.currentTarget.checked)} />
            {t('song.showLyricsTimestamps')}
          </label>
        ) : null}
        {showBusy ? <div className="music-info-save-progress SaveProgress" /> : null}
      </CommandBar>
      <div className="song-dialog-body song-dialog-lyrics MusicLyricsControl MusicLyricsController">
        <textarea
          className="LyricsTextBox"
          ref={lyricsTextAreaRef}
          value={lyricsText}
          disabled={saving}
          placeholder={lyrics?.source === 'none' ? t('nowPlaying.noLyrics') : ''}
          onChange={(event) => onLyricsTextChange(event.currentTarget.value)}
        />
      </div>
    </>
  )
}
