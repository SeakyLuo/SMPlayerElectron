import { useLayoutEffect, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export function useRecentScrollbar(
  scrollFrameRef: RefObject<HTMLDivElement | null>,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  scrollbarTrackRef: RefObject<HTMLDivElement | null>,
  contentHeight: number,
) {
  useLayoutEffect(() => {
    const scrollFrame = scrollFrameRef.current
    const scrollContainer = scrollContainerRef.current
    if (!scrollFrame || !scrollContainer) {
      return
    }

    let animationFrame = 0
    const updateScrollbar = () => {
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      const trackHeight = scrollContainer.clientHeight
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((trackHeight / scrollContainer.scrollHeight) * trackHeight))
        : trackHeight
      const thumbTop = maxScrollTop > 0
        ? Math.round((scrollContainer.scrollTop / maxScrollTop) * Math.max(0, trackHeight - thumbHeight))
        : 0

      scrollFrame.style.setProperty('--recent-scrollbar-thumb-height', `${thumbHeight}px`)
      scrollFrame.style.setProperty('--recent-scrollbar-thumb-top', `${thumbTop}px`)
      scrollFrame.classList.toggle('has-scrollbar', maxScrollTop > 1)
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateScrollbar)
    }

    updateScrollbar()
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(scrollFrame)
    resizeObserver.observe(scrollContainer)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [contentHeight, scrollFrameRef, scrollContainerRef])

  return (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollFrame = scrollFrameRef.current
    const scrollContainer = scrollContainerRef.current
    const scrollbarTrack = scrollbarTrackRef.current
    if (!scrollFrame || !scrollContainer || !scrollbarTrack) {
      return
    }

    event.preventDefault()
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const thumbHeight = Number.parseFloat(getComputedStyle(scrollFrame).getPropertyValue('--recent-scrollbar-thumb-height'))
    const trackRange = Math.max(1, scrollbarTrack.clientHeight - thumbHeight)
    const scrollPerPixel = maxScrollTop / trackRange
    const startY = event.clientY
    const startScrollTop = scrollContainer.scrollTop
    const onPointerMove = (moveEvent: PointerEvent) => {
      scrollContainer.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }
}
