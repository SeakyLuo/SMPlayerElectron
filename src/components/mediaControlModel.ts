import type { PlaybackMode } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { DEFAULT_ALBUM_ARTWORK_URL } from '../shared/staticAssets'

export const DEFAULT_ARTWORK_URL = DEFAULT_ALBUM_ARTWORK_URL

export function getShuffleTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'shuffle' ? t('player.shuffleEnabled') : t('player.shuffleDisabled')
}

export function getRepeatTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat' ? t('player.repeatEnabled') : t('player.repeatDisabled')
}

export function getRepeatOneTitle(t: Translator, mode: PlaybackMode) {
  return mode === 'repeat-one' ? t('player.repeatOneEnabled') : t('player.repeatOneDisabled')
}
