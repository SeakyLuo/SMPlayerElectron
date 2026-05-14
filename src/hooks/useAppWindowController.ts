import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface AppWindowControllerOptions {
  onQuickPlay: () => void | Promise<unknown>
  onEnterMiniMode: () => void
}

export function useAppWindowController({
  onQuickPlay,
  onEnterMiniMode,
}: AppWindowControllerOptions) {
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false)
  const [isMiniMode, setIsMiniMode] = useState(false)

  useEffect(() => {
    void window.smplayer?.getWindowFullScreen().then(setIsWindowFullScreen)
    return window.smplayer?.onWindowFullScreenChange(setIsWindowFullScreen)
  }, [])

  useEffect(() => {
    void window.smplayer?.getWindowMiniMode().then((miniMode) => {
      setIsMiniMode(miniMode)
      if (miniMode) {
        onEnterMiniMode()
      }
    })
    return window.smplayer?.onWindowMiniModeChange((miniMode) => {
      setIsMiniMode(miniMode)
      if (miniMode) {
        onEnterMiniMode()
      }
    })
  }, [onEnterMiniMode])

  useEffect(() => {
    return window.smplayer?.onTrayCommand((command) => {
      if (command === 'quick-play') {
        void onQuickPlay()
      }
    })
  }, [onQuickPlay])

  const startWindowDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    void window.smplayer?.startWindowDrag()
  }, [])

  const stopWindowDrag = useCallback(() => {
    void window.smplayer?.stopWindowDrag()
  }, [])

  const enterMiniMode = useCallback(() => {
    onEnterMiniMode()
    setIsMiniMode(true)
    void window.smplayer?.setWindowMiniMode(true)
  }, [onEnterMiniMode])

  const exitMiniMode = useCallback(() => {
    setIsMiniMode(false)
    void window.smplayer?.setWindowMiniMode(false)
  }, [])

  const toggleWindowFullScreen = useCallback(() => {
    const nextFullScreen = !isWindowFullScreen
    setIsWindowFullScreen(nextFullScreen)
    void window.smplayer?.setWindowFullScreen(nextFullScreen)
  }, [isWindowFullScreen])

  return {
    isWindowFullScreen,
    isMiniMode,
    startWindowDrag,
    stopWindowDrag,
    enterMiniMode,
    exitMiniMode,
    toggleWindowFullScreen,
  }
}

export function useWindowControlsLight(usesLightWindowControls: boolean) {
  useEffect(() => {
    void window.smplayer?.setWindowControlsLight(usesLightWindowControls)
  }, [usesLightWindowControls])
}
