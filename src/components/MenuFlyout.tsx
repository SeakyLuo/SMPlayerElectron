import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import type { MenuFlyoutItem, MenuFlyoutPosition } from './MenuFlyoutHelper'
import { Icon } from './icons'
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

  useEffect(() => {
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const menuElement = menuRef.current as HTMLDivElement
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
    scrollable: false,
  })
  const submenuLength = item.submenu!.length

  const updateLayout = () => {
    const triggerElement = triggerRef.current as HTMLSpanElement
    const panelElement = panelRef.current as HTMLDivElement
    const margin = 8
    const triggerRect = triggerElement.getBoundingClientRect()
    const panelWidth = panelElement.getBoundingClientRect().width
    const itemsHeight = getMenuFlyoutItemsHeight(item.submenu!)
    const fullPanelHeight = itemsHeight + MENU_FLYOUT_VERTICAL_PADDING
    const boundaryBottom = getMenuBoundaryBottom(margin)
    const availableHeight = Math.max(120, boundaryBottom - margin * 2)
    const panelHeight = Math.min(fullPanelHeight, availableHeight)

    let left = triggerRect.right - 2
    if (left + panelWidth > window.innerWidth - margin) {
      left = triggerRect.left - panelWidth + 2
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

    const top = Math.max(margin, Math.min(triggerRect.top - 6, boundaryBottom - panelHeight))
    const availablePanelHeight = Math.max(120, boundaryBottom - top - margin)
    const scrollable = itemsHeight > availablePanelHeight
    const maxHeight = scrollable ? availablePanelHeight : fullPanelHeight + 2
    setLayout({
      left,
      top,
      maxHeight,
      scrollable,
    })
  }

  useLayoutEffect(() => {
    updateLayout()
  }, [submenuLength, menuBoundaryHeight])

  return (
    <div
      className="library-context-submenu"
      onFocus={updateLayout}
      onPointerEnter={updateLayout}
    >
      <span ref={triggerRef}>
        {item.icon ? <Icon name={item.icon} /> : <span />}
        <span>{item.text}</span>
        <Icon name="chevronRight" />
      </span>
      <div
        ref={panelRef}
        className={`library-context-submenu-panel${layout.scrollable ? ' is-scrollable' : ''}`}
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

  if (item.kind === 'volume') {
    return <MenuFlyoutVolumeItem item={item} key={item.key} />
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

function MenuFlyoutVolumeItem({ item }: { item: MenuFlyoutItem }) {
  const volumeValue = item.volumeValue ?? 0
  const volumeTitle = item.text
  const [tooltipActive, setTooltipActive] = useState(false)
  const tooltipTimerRef = useRef<number | null>(null)
  const volumeTooltipValue = item.volumeMuted ? 0 : volumeValue
  const volumeIconName = getVolumeIconName(volumeValue, item.volumeMuted === true)

  const clearTooltipTimer = () => {
    if (tooltipTimerRef.current != null) {
      window.clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }

  const showTooltip = (timeout = 900) => {
    clearTooltipTimer()
    setTooltipActive(true)
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipActive(false)
      tooltipTimerRef.current = null
    }, timeout)
  }

  const keepTooltipVisible = () => {
    clearTooltipTimer()
    setTooltipActive(true)
  }

  const commitVolumeChange = (value: string) => {
    item.onVolumeChange?.(Number(value))
  }

  useEffect(() => {
    return () => {
      clearTooltipTimer()
    }
  }, [])

  return (
    <div className="library-context-volume-item" role="menuitem" aria-label={volumeTitle}>
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
      <div
        className={`library-context-volume-slider-wrap${tooltipActive ? ' is-active' : ''}${item.disabled ? ' is-disabled' : ''}`}
        style={{ '--volume-tooltip-left': `${volumeTooltipValue}%` } as CSSProperties}
      >
        <input
          className="media-slider library-context-volume-slider"
          type="range"
          min="0"
          max="100"
          value={volumeValue}
          disabled={item.disabled}
          style={{ '--range-progress': `${volumeValue}%` } as CSSProperties}
          onChange={() => {
            keepTooltipVisible()
          }}
          onInput={(event) => {
            commitVolumeChange(event.currentTarget.value)
          }}
          onPointerDown={() => {
            keepTooltipVisible()
          }}
          onPointerEnter={() => {
            keepTooltipVisible()
          }}
          onPointerLeave={() => {
            setTooltipActive(false)
          }}
          onPointerUp={(event) => {
            commitVolumeChange(event.currentTarget.value)
            showTooltip(650)
          }}
          onPointerCancel={() => {
            setTooltipActive(false)
          }}
          onLostPointerCapture={(event) => {
            commitVolumeChange(event.currentTarget.value)
            showTooltip(650)
          }}
          onFocus={() => {
            keepTooltipVisible()
          }}
          onBlur={() => {
            setTooltipActive(false)
          }}
          aria-label={volumeTitle}
          aria-valuetext={String(volumeTooltipValue)}
        />
        <span className="volume-slider-tooltip" aria-hidden="true">{volumeTooltipValue}</span>
      </div>
    </div>
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
