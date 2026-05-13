import { useLayoutEffect, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface UseCustomScrollbarOptions {
  frameRef: RefObject<HTMLElement | null>
  scrollContainerRef: RefObject<HTMLElement | null>
  scrollbarTrackRef: RefObject<HTMLDivElement | null>
  disabled?: boolean
  refreshDependencies?: readonly unknown[]
}

export function useCustomScrollbar({
  frameRef,
  scrollContainerRef,
  scrollbarTrackRef,
  disabled = false,
  refreshDependencies = [],
}: UseCustomScrollbarOptions) {
  useLayoutEffect(() => {
    const scrollFrame = frameRef.current
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

      scrollFrame.style.setProperty('--custom-scrollbar-thumb-height', `${thumbHeight}px`)
      scrollFrame.style.setProperty('--custom-scrollbar-thumb-top', `${thumbTop}px`)
      scrollFrame.classList.toggle('has-custom-scrollbar', !disabled && maxScrollTop > 1)
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
    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(scrollContainer, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [disabled, frameRef, scrollContainerRef, ...refreshDependencies])

  return (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollFrame = frameRef.current
    const scrollContainer = scrollContainerRef.current
    const scrollbarTrack = scrollbarTrackRef.current

    if (!scrollFrame || !scrollContainer || !scrollbarTrack) {
      return
    }

    event.preventDefault()
    scrollFrame.classList.add('is-custom-scrollbar-dragging')
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const thumbHeight = Number.parseFloat(getComputedStyle(scrollFrame).getPropertyValue('--custom-scrollbar-thumb-height'))
    const trackRange = Math.max(1, scrollbarTrack.clientHeight - thumbHeight)
    const scrollPerPixel = maxScrollTop / trackRange
    const startY = event.clientY
    const startScrollTop = scrollContainer.scrollTop
    const onPointerMove = (moveEvent: PointerEvent) => {
      scrollContainer.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }
    const onPointerUp = () => {
      scrollFrame.classList.remove('is-custom-scrollbar-dragging')
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }
}
