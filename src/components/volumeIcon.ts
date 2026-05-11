import type { IconName } from './icons'

export function getVolumeIconName(volume: number, isMuted: boolean): IconName {
  if (isMuted) {
    return 'volumeMuted'
  }

  if (volume === 0) {
    return 'volumeOff'
  }

  if (volume < 34) {
    return 'volumeLow'
  }

  if (volume < 67) {
    return 'volumeMedium'
  }

  return 'volume'
}
