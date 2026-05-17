import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import type { MenuFlyoutItem, MenuFlyoutPosition } from './MenuFlyoutHelper'
import { Icon } from './icons'
import { VolumeSlider } from './VolumeSlider'
import { getVolumeIconName } from './volumeIcon'

const MENU_FLYOUT_VERTICAL_PADDING = 12

export function MenuFlyout({
  items,
  position,
  onClose,
  layer = 'default',
}: {
  items: MenuFlyoutItem[]
  position: MenuFlyoutPosition
  onClose: () => void
  layer?: 'default' | 'dialog'
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const animationFrameRef = useRef(0)
  const [activeSubmenuKey, setActiveSubmenuKey] = useState<string | null>(null)
  const [resolvedPosition, setResolvedPosition] = useState({ left: position.x, top: position.y })
  const [menuBoundaryHeight, setMenuBoundaryHeight] = useState(window.innerHeight)

  const resolveRequestedPosition = useCallback((menuElement: HTMLDivElement) => {
    const anchor = position.anchor
    if (anchor) {
      if (!anchor.isConnected) {
        onClose()
        return { x: position.x, y: position.y }
      }

      const anchorRect = anchor.getBoundingClientRect()
      const menuRect = menuElement.getBoundingClientRect()
      const shouldOpenAbove = position.y < anchorRect.top
      return {
        x: anchorRect.left + (position.x - anchorRect.left),
        y: shouldOpenAbove ? anchorRect.top - (anchorRect.top - position.y) : anchorRect.bottom + (position.y - anchorRect.bottom),
        fallbackTop: shouldOpenAbove ? anchorRect.top - menuRect.height - 8 : undefined,
      }
    }

    return { x: position.x, y: position.y }
  }, [onClose, position.anchor, position.x, position.y])

  const updatePosition = useCallback(() => {
    const menuElement = menuRef.current
    if (!menuElement) {
      return
    }

    const requestedPosition = resolveRequestedPosition(menuElement)
    const margin = 8
    const boundaryBottom = getMenuBoundaryBottom(margin, position.anchor)
    const rect = menuElement.getBoundingClientRect()
    const top = Math.max(margin, Math.min(requestedPosition.y, boundaryBottom - rect.height))
    const left = Math.max(margin, Math.min(requestedPosition.x, window.innerWidth - rect.width - margin))
    const resolvedTop = requestedPosition.fallbackTop == null
      ? top
      : Math.max(margin, Math.min(top, requestedPosition.fallbackTop))
    setResolvedPosition((current) => {
      if (current.left === left && current.top === resolvedTop) {
        return current
      }

      return { left, top: resolvedTop }
    })
    setMenuBoundaryHeight((current) => {
      if (current === boundaryBottom) {
        return current
      }

      return boundaryBottom
    })
  }, [position.anchor, resolveRequestedPosition])

  const schedulePositionUpdate = useCallback(() => {
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = window.requestAnimationFrame(updatePosition)
  }, [updatePosition])

  useLayoutEffect(() => {
    updatePosition()
    return () => {
      window.cancelAnimationFrame(animationFrameRef.current)
    }
  }, [items.length, updatePosition])

  useEffect(() => {
    window.addEventListener('resize', schedulePositionUpdate)
    window.addEventListener('scroll', schedulePositionUpdate, true)

    return () => {
      window.removeEventListener('resize', schedulePositionUpdate)
      window.removeEventListener('scroll', schedulePositionUpdate, true)
    }
  }, [schedulePositionUpdate])

  useEffect(() => {
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const menuElement = menuRef.current
      if (!menuElement) {
        return
      }

      if (!menuElement.contains(event.target as Node)) {
        onClose()
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className={layer === 'dialog' ? 'library-context-menu-overlay is-dialog-layer' : 'library-context-menu-overlay'} onClick={onClose} />
      <div
        ref={menuRef}
        className={layer === 'dialog' ? 'library-context-menu is-dialog-layer' : 'library-context-menu'}
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
        {items.map((item) => renderMenuItem(item, menuBoundaryHeight, activeSubmenuKey, setActiveSubmenuKey, onClose))}
      </div>
    </>,
    document.body,
  )
}

function MenuFlyoutSubmenu({
  item,
  menuBoundaryHeight,
  active,
  onActivate,
  onClose,
}: {
  item: MenuFlyoutItem
  menuBoundaryHeight: number
  active: boolean
  onActivate: () => void
  onClose: () => void
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState({
    left: -10000,
    top: 8,
    maxHeight: Math.max(120, menuBoundaryHeight - 16),
    scrollable: false,
  })
  const [activeSubmenuKey, setActiveSubmenuKey] = useState<string | null>(null)
  const submenu = item.submenu!
  const submenuLength = submenu.length

  const updateLayout = useCallback(() => {
    const triggerElement = triggerRef.current
    const panelElement = panelRef.current
    if (!triggerElement || !panelElement) {
      return
    }

    const margin = 8
    const triggerRect = triggerElement.getBoundingClientRect()
    const panelWidth = panelElement.getBoundingClientRect().width
    const itemsHeight = getMenuFlyoutItemsHeight(submenu)
    const fullPanelHeight = itemsHeight + MENU_FLYOUT_VERTICAL_PADDING
    const boundaryBottom = menuBoundaryHeight
    const availableHeight = Math.max(120, boundaryBottom - margin * 2)
    const panelHeight = Math.min(fullPanelHeight, availableHeight)

    let left = triggerRect.right + 8
    if (left + panelWidth > window.innerWidth - margin) {
      left = triggerRect.left - panelWidth - 8
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

    const top = Math.max(margin, Math.min(triggerRect.top - 6, boundaryBottom - panelHeight))
    const availablePanelHeight = Math.max(120, boundaryBottom - top - margin)
    const scrollable = itemsHeight > availablePanelHeight
    const maxHeight = scrollable ? availablePanelHeight : fullPanelHeight + 2
    setLayout((current) => {
      if (current.left === left && current.top === top && current.maxHeight === maxHeight && current.scrollable === scrollable) {
        return current
      }

      return {
        left,
        top,
        maxHeight,
        scrollable,
      }
    })
  }, [menuBoundaryHeight, submenu])

  useLayoutEffect(() => {
    if (active) {
      updateLayout()
    }
  }, [active, updateLayout])

  useEffect(() => {
    if (!active) {
      setActiveSubmenuKey(null)
      return
    }

    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)
    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
    }
  }, [active, submenuLength, menuBoundaryHeight, updateLayout])

  return (
    <div
      className="library-context-submenu"
      onFocus={() => {
        onActivate()
      }}
      onPointerEnter={() => {
        onActivate()
      }}
    >
      <span ref={triggerRef}>
        {item.icon ? <Icon name={item.icon} className={item.iconTone === 'favorite' ? 'library-context-menu-icon-favorite' : undefined} /> : <span />}
        <span>{item.text}</span>
        <Icon name="chevronRight" />
      </span>
      {active ? (
        <div
          ref={panelRef}
          className={`library-context-submenu-panel is-active${layout.scrollable ? ' is-scrollable' : ''}`}
          style={{
            '--submenu-left': `${layout.left}px`,
            '--submenu-top': `${layout.top}px`,
            '--submenu-max-height': `${layout.maxHeight}px`,
          } as CSSProperties}
        >
          {submenu.map((subitem) => renderMenuItem(subitem, menuBoundaryHeight, activeSubmenuKey, setActiveSubmenuKey, onClose))}
        </div>
      ) : null}
    </div>
  )
}

function renderMenuItem(
  item: MenuFlyoutItem,
  menuBoundaryHeight: number,
  activeSubmenuKey: string | null,
  setActiveSubmenuKey: (key: string | null) => void,
  onClose: () => void,
) {
  if (item.separator) {
    return <div className="library-context-menu-separator" key={item.key} role="separator" />
  }

  if (item.kind === 'volume') {
    return <MenuFlyoutVolumeItem item={item} key={item.key} onPointerEnter={() => setActiveSubmenuKey(null)} />
  }

  if (item.submenu) {
    return (
      <MenuFlyoutSubmenu
        item={item}
        key={item.key}
        menuBoundaryHeight={menuBoundaryHeight}
        active={activeSubmenuKey === item.key}
        onActivate={() => setActiveSubmenuKey(item.key)}
        onClose={onClose}
      />
    )
  }

  return <MenuFlyoutButton item={item} key={item.key} onPointerEnter={() => setActiveSubmenuKey(null)} onClose={onClose} />
}

function getMenuFlyoutItemsHeight(items: MenuFlyoutItem[]) {
  return items.reduce((height, item) => {
    if (item.separator) {
      return height + 13
    }
    if (item.kind === 'volume') {
      return height + 42
    }
    return height + 34
  }, 0)
}

function MenuFlyoutVolumeItem({ item, onPointerEnter }: { item: MenuFlyoutItem; onPointerEnter: () => void }) {
  const volumeValue = item.volumeValue ?? 0
  const volumeTitle = item.text
  const [liveVolumeValue, setLiveVolumeValue] = useState(volumeValue)
  const volumeIconName = getVolumeIconName(liveVolumeValue, item.volumeMuted === true)

  useEffect(() => {
    setLiveVolumeValue(volumeValue)
  }, [volumeValue])

  return (
    <div className="library-context-volume-item" role="menuitem" aria-label={volumeTitle} onPointerEnter={onPointerEnter}>
      <button
        type="button"
        className="library-context-volume-button"
        disabled={item.disabled}
        aria-label={volumeTitle}
        title={volumeTitle}
        onClick={item.onToggleMute}
      >
        <Icon name={volumeIconName} />
      </button>
      <VolumeSlider
        className="library-context-volume-slider-wrap"
        inputClassName="media-slider library-context-volume-slider"
        value={volumeValue}
        disabled={item.disabled}
        ariaLabel={volumeTitle}
        onChange={item.onVolumeChange}
        onLiveValueChange={setLiveVolumeValue}
      />
    </div>
  )
}

function MenuFlyoutButton({ item, onPointerEnter, onClose }: { item: MenuFlyoutItem; onPointerEnter: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={item.checked === undefined ? undefined : item.checked}
      className={item.checked ? 'is-checked' : undefined}
      disabled={item.disabled || busy}
      onPointerEnter={onPointerEnter}
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
      {item.icon ? <Icon name={item.icon} className={item.iconTone === 'favorite' ? 'library-context-menu-icon-favorite' : undefined} /> : <span />}
      <span>{busy ? item.pendingText ?? item.text : item.text}</span>
      {item.checked ? <Icon name="check" className="library-context-menu-check" /> : null}
    </button>
  )
}

function getMenuBoundaryBottom(margin: number, anchor?: HTMLElement) {
  if (anchor?.closest('.player-bar')) {
    return window.innerHeight - margin
  }

  const playerBar = document.querySelector('.player-bar')
  return playerBar instanceof HTMLElement
    ? playerBar.getBoundingClientRect().top - margin
    : window.innerHeight - margin
}
