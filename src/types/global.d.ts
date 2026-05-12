import type { SmplayerApi } from '../shared/contracts'

declare global {
  interface Window {
    smplayer?: SmplayerApi
  }
}

export {}
