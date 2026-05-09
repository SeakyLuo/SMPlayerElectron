import { useEffect } from 'react'

export function useScrollbarHoverClass(hostSelector: string, hoverClassName: string) {
  useEffect(() => {
    let activeScrollbarHost: Element | null = null

    const setActiveScrollbarHost = (nextHost: Element | null) => {
      if (activeScrollbarHost === nextHost) {
        return
      }

      activeScrollbarHost?.classList.remove(hoverClassName)
      activeScrollbarHost = nextHost
      activeScrollbarHost?.classList.add(hoverClassName)
    }

    const updateScrollbarHover = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        setActiveScrollbarHost(null)
        return
      }

      const scrollbarHost = event.target.closest(hostSelector)
      if (!(scrollbarHost instanceof HTMLElement)) {
        setActiveScrollbarHost(null)
        return
      }

      const rect = scrollbarHost.getBoundingClientRect()
      const isVerticalScrollbarHovered =
        scrollbarHost.scrollHeight > scrollbarHost.clientHeight &&
        event.clientX >= rect.right - 12 &&
        event.clientX <= rect.right
      const isHorizontalScrollbarHovered =
        scrollbarHost.scrollWidth > scrollbarHost.clientWidth &&
        event.clientY >= rect.bottom - 12 &&
        event.clientY <= rect.bottom

      setActiveScrollbarHost(isVerticalScrollbarHovered || isHorizontalScrollbarHovered ? scrollbarHost : null)
    }

    const clearScrollbarHover = () => {
      setActiveScrollbarHost(null)
    }

    document.addEventListener('pointermove', updateScrollbarHover)
    document.addEventListener('pointerleave', clearScrollbarHover)

    return () => {
      document.removeEventListener('pointermove', updateScrollbarHover)
      document.removeEventListener('pointerleave', clearScrollbarHover)
      clearScrollbarHover()
    }
  }, [hostSelector, hoverClassName])
}
