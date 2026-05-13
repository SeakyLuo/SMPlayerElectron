import { useEffect } from 'react'

const TOUCH_CONTEXT_MENU_DELAY_MS = 650
const TOUCH_CONTEXT_MENU_MOVE_TOLERANCE = 10
const TOUCH_CONTEXT_MENU_SUPPRESSION_MS = 800

interface PendingTouchContextMenu {
  pointerId: number
  target: Element
  x: number
  y: number
  timer: number
}

interface SuppressedTouchEvent {
  x: number
  y: number
  expiresAt: number
}

const syntheticTouchContextMenuEvents = new WeakSet<Event>()

export function useTouchContextMenu() {
  useEffect(() => {
    let pendingMenu: PendingTouchContextMenu | null = null
    let suppressedClick: SuppressedTouchEvent | null = null
    let suppressedNativeContextMenu: SuppressedTouchEvent | null = null

    const clearPendingMenu = () => {
      if (pendingMenu) {
        window.clearTimeout(pendingMenu.timer)
        pendingMenu = null
      }
    }

    const getDistanceFromTouch = (event: MouseEvent, touchEvent: SuppressedTouchEvent) =>
      Math.hypot(event.clientX - touchEvent.x, event.clientY - touchEvent.y)

    const shouldSuppressEvent = (event: MouseEvent, touchEvent: SuppressedTouchEvent | null) =>
      touchEvent !== null &&
      performance.now() <= touchEvent.expiresAt &&
      getDistanceFromTouch(event, touchEvent) <= TOUCH_CONTEXT_MENU_MOVE_TOLERANCE * 2

    const suppressFollowUpEvents = (x: number, y: number) => {
      const expiresAt = performance.now() + TOUCH_CONTEXT_MENU_SUPPRESSION_MS
      suppressedClick = { x, y, expiresAt }
      suppressedNativeContextMenu = { x, y, expiresAt }
    }

    const openContextMenu = () => {
      const menu = pendingMenu as PendingTouchContextMenu
      pendingMenu = null
      const contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: menu.x,
        clientY: menu.y,
        button: 2,
        buttons: 0,
        view: window,
      })
      syntheticTouchContextMenuEvents.add(contextMenuEvent)

      if (!menu.target.dispatchEvent(contextMenuEvent)) {
        suppressFollowUpEvents(menu.x, menu.y)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || event.button !== 0 || !event.isPrimary) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      clearPendingMenu()
      pendingMenu = {
        pointerId: event.pointerId,
        target,
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(openContextMenu, TOUCH_CONTEXT_MENU_DELAY_MS),
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!pendingMenu || event.pointerId !== pendingMenu.pointerId) {
        return
      }

      if (Math.hypot(event.clientX - pendingMenu.x, event.clientY - pendingMenu.y) > TOUCH_CONTEXT_MENU_MOVE_TOLERANCE) {
        clearPendingMenu()
      }
    }

    const onPointerEnd = (event: PointerEvent) => {
      if (pendingMenu && event.pointerId === pendingMenu.pointerId) {
        clearPendingMenu()
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      if (syntheticTouchContextMenuEvents.has(event)) {
        return
      }

      if (shouldSuppressEvent(event, suppressedNativeContextMenu)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        suppressedNativeContextMenu = null
        return
      }

      if (pendingMenu) {
        clearPendingMenu()
        window.setTimeout(() => {
          if (event.defaultPrevented) {
            suppressFollowUpEvents(event.clientX, event.clientY)
          }
        }, 0)
      }
    }

    const onClick = (event: MouseEvent) => {
      if (shouldSuppressEvent(event, suppressedClick)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        suppressedClick = null
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerEnd, true)
    window.addEventListener('pointercancel', onPointerEnd, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('click', onClick, true)

    return () => {
      clearPendingMenu()
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
