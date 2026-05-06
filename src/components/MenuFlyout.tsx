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
  const [submenuOpensLeft, setSubmenuOpensLeft] = useState(false)
  const [submenuOpensUp, setSubmenuOpensUp] = useState(false)
  const [menuBoundaryHeight, setMenuBoundaryHeight] = useState(window.innerHeight)

  useLayoutEffect(() => {
    const menuElement = menuRef.current
    if (!menuElement) {
      return
    }

    const margin = 8
    const playerBar = document.querySelector('.player-bar')
    const boundaryBottom = playerBar instanceof HTMLElement
      ? playerBar.getBoundingClientRect().top - margin
      : window.innerHeight - margin
    const rect = menuElement.getBoundingClientRect()
    setResolvedPosition({
      left: Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(position.y, boundaryBottom - rect.height)),
    })
    setMenuBoundaryHeight(boundaryBottom)
    setSubmenuOpensLeft(position.x + rect.width + 280 > window.innerWidth - margin)
    setSubmenuOpensUp(position.y + rect.height + 280 > boundaryBottom)
  }, [position.x, position.y, items.length])

  useEffect(() => {
    window.addEventListener('click', onClose)
    window.addEventListener('resize', onClose)

    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className={`library-context-menu${submenuOpensLeft ? ' is-submenu-left' : ''}${submenuOpensUp ? ' is-submenu-up' : ''}`}
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
      {items.map((item) =>
        item.submenu ? (
          <div className="library-context-submenu" key={item.key}>
            <span>
              {item.icon ? <Icon name={item.icon} /> : <span />}
              <span>{item.text}</span>
              <Icon name="chevronRight" />
            </span>
            <div className="library-context-submenu-panel">
              {item.submenu.map((subitem) => (
                <MenuFlyoutButton item={subitem} key={subitem.key} onClose={onClose} />
              ))}
            </div>
          </div>
        ) : (
          <MenuFlyoutButton item={item} key={item.key} onClose={onClose} />
        ),
      )}
    </div>,
    document.body,
  )
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
            onClose()
          }
          return
        }
        onClose()
      }}
    >
      {item.icon ? <Icon name={item.icon} /> : <span />}
      <span>{busy ? item.pendingText ?? item.text : item.text}</span>
    </button>
  )
}
