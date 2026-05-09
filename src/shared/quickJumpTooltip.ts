import type { Translator } from './i18n'

export function getQuickJumpTooltip(
  key: string,
  enabled: boolean,
  targetName: string,
  basisName: string,
  t: Translator,
) {
  const group = key === '#'
    ? t('quickJump.symbolGroup')
    : t('quickJump.letterGroup', { key })

  return enabled
    ? t('quickJump.enabled', { target: targetName, basis: basisName, group })
    : t('quickJump.disabled', { target: targetName, basis: basisName, group })
}
