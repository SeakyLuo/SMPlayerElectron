import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import type { MenuFlyoutItem, MenuFlyoutPosition } from './MenuFlyoutHelper'
import { Icon } from './icons'

export function MenuFlyout({
  items,
  position,
  onClose,
}: {
  items: MenuFlyoutItem[]
  position: MenuFlyoutPosition
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [resolvedPosition, setResolvedPosition] = useState({ left: position.x, top: position.y })
  const [menuBoundaryHeight, setMenuBoundaryHeight] = useState(window.innerHeight)

  useLayoutEffect(() => {
    const menuElement = menuRef.current as HTMLDivElement

    const margin = 8
    const boundaryBottom = getMenuBoundaryBottom(margin)
    const rect = menuElement.getBoundingClientRect()
    setResolvedPosition({
      left: Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(position.y, boundaryBottom - rect.height)),
    })
    setMenuBoundaryHeight(boundaryBottom)
  }, [position.x, position.y, items.length])

  useEffect(() => {
    window.addEventListener('resize', onClose)

    return () => {
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className="library-context-menu-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        className="library-context-menu"
        style={{
          left: resolvedPosition.left,
          top: resolvedPosition.top,
          '--menu-boundary-height': `${menuBoundaryHeight}px`,
        } as CSSProperties}
        role="menu"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        {items.map((item) => renderMenuItem(item, menuBoundaryHeight, onClose))}
      </div>
    </>,
    document.body,
  )
}

function MenuFlyoutSubmenu({
  item,
  menuBoundaryHeight,
  onClose,
}: {
  item: MenuFlyoutItem
  menuBoundaryHeight: number
  onClose: () => void
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState({
    left: -10000,
    top: 8,
    maxHeight: Math.max(120, menuBoundaryHeight - 16),
  })
  const submenuLength = item.submenu!.length

  const updateLayout = () => {
    const triggerElement = triggerRef.current as HTMLSpanElement
    const panelElement = panelRef.current as HTMLDivElement
    const margin = 8
    const triggerRect = triggerElement.getBoundingClientRect()
    const panelWidth = panelElement.getBoundingClientRect().width
    const fullPanelHeight = panelElement.scrollHeight
    const boundaryBottom = getMenuBoundaryBottom(margin)
    const availableHeight = Math.max(120, boundaryBottom - margin)
    const panelHeight = Math.min(fullPanelHeight, availableHeight)

    let left = triggerRect.right - 2
    if (left + panelWidth > window.innerWidth - margin) {
      left = triggerRect.left - panelWidth + 2
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

    const top = Math.max(margin, Math.min(triggerRect.top - 6, boundaryBottom - panelHeight))
    setLayout({
      left,
      top,
      maxHeight: Math.max(120, boundaryBottom - top - margin),
    })
  }

  useLayoutEffect(() => {
    updateLayout()
  }, [submenuLength, menuBoundaryHeight])

  return (
    <div className="library-context-submenu" onFocus={updateLayout} onPointerEnter={updateLayout}>
      <span ref={triggerRef}>
        {item.icon ? <Icon name={item.icon} /> : <span />}
        <span>{item.text}</span>
        <Icon name="chevronRight" />
      </span>
      <div
        ref={panelRef}
        className="library-context-submenu-panel"
        style={{
          '--submenu-left': `${layout.left}px`,
          '--submenu-top': `${layout.top}px`,
          '--submenu-max-height': `${layout.maxHeight}px`,
        } as CSSProperties}
      >
        {item.submenu!.map((subitem) => renderMenuItem(subitem, menuBoundaryHeight, onClose))}
      </div>
    </div>
  )
}

function renderMenuItem(item: MenuFlyoutItem, menuBoundaryHeight: number, onClose: () => void) {
  if (item.separator) {
    return <div className="library-context-menu-separator" key={item.key} role="separator" />
  }

  if (item.submenu) {
    return (
      <MenuFlyoutSubmenu
        item={item}
        key={item.key}
        menuBoundaryHeight={menuBoundaryHeight}
        onClose={onClose}
      />
    )
  }

  return <MenuFlyoutButton item={item} key={item.key} onClose={onClose} />
}

function MenuFlyoutButton({ item, onClose }: { item: MenuFlyoutItem; onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled || busy}
      onClick={async () => {
        const result = item.onClick?.()
        if (result instanceof Promise) {
          setBusy(true)
          try {
            await result
          } finally {
            if (!item.keepOpen) {
              onClose()
            }
          }
          return
        }
        if (!item.keepOpen) {
          onClose()
        }
      }}
    >
      {item.icon ? <Icon name={item.icon} /> : <span />}
      <span>{busy ? item.pendingText ?? item.text : item.text}</span>
    </button>
  )
}

function getMenuBoundaryBottom(margin: number) {
  const playerBar = document.querySelector('.player-bar')
  return playerBar instanceof HTMLElement
    ? playerBar.getBoundingClientRect().top - margin
    : window.innerHeight - margin
}
