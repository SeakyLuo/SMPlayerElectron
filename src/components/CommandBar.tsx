import clsx from 'clsx'
import {
  Children,
  useMemo,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from 'react'

import { MenuFlyout } from './MenuFlyout'
import type { MenuFlyoutItem, MenuFlyoutPosition } from './MenuFlyoutHelper'
import { Icon, type IconName } from './icons'

interface CommandBarProps {
  children?: ReactNode
  className?: string
  content?: ReactNode
  dynamicOverflow?: boolean
  overflowItems?: MenuFlyoutItem[]
  overflowLabel?: string
}

interface CommandBarButtonProps {
  active?: boolean
  canOverflow?: boolean
  className?: string
  disabled?: boolean
  icon: IconName
  label: string
  showLabel?: boolean
  tabIndex?: number
  title?: string
  type?: 'button' | 'submit'
  ariaExpanded?: boolean
  ariaHasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
  onClick?: MouseEventHandler<HTMLButtonElement>
  onPointerDown?: PointerEventHandler<HTMLButtonElement>
}

export function CommandBar({
  children,
  className,
  content,
  dynamicOverflow = false,
  overflowItems = [],
  overflowLabel = 'More',
}: CommandBarProps) {
  const [overflowPosition, setOverflowPosition] = useState<MenuFlyoutPosition | null>(null)
  const childrenArray = useMemo(() => Children.toArray(children), [children])
  const overflowMenuItems = overflowItems

  return (
    <div className={clsx('uwp-commandbar', dynamicOverflow && 'is-dynamic-overflow', className)} role="toolbar">
      {content ? <div className="uwp-commandbar-content">{content}</div> : null}
      <div className="uwp-commandbar-primary">
        {childrenArray.map((child, index) => (
          <div
            className="uwp-commandbar-item"
            key={index}
          >
            {child}
          </div>
        ))}
        {overflowMenuItems.length > 0 ? (
          <div className="uwp-commandbar-more">
            <CommandBarButton
              icon="moreHorizontal"
              label={overflowLabel}
              showLabel={false}
              ariaHasPopup="menu"
              ariaExpanded={overflowPosition != null}
              canOverflow={false}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setOverflowPosition({ x: rect.left, y: rect.bottom + 4 })
              }}
            />
          </div>
        ) : null}
      </div>
      {overflowPosition ? (
        <MenuFlyout
          position={overflowPosition}
          items={overflowMenuItems}
          onClose={() => {
            setOverflowPosition(null)
          }}
        />
      ) : null}
    </div>
  )
}

export function CommandBarButton({
  active = false,
  ariaExpanded,
  ariaHasPopup,
  className,
  disabled,
  icon,
  label,
  showLabel = true,
  tabIndex,
  onClick,
  onPointerDown,
  title = label,
  type = 'button',
}: CommandBarButtonProps) {
  return (
    <button
      className={clsx('uwp-commandbar-button', active && 'is-active', className)}
      type={type}
      disabled={disabled}
      aria-label={showLabel ? undefined : label}
      title={title}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      tabIndex={tabIndex}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <Icon name={icon} />
      {showLabel ? <span className="uwp-commandbar-button-label">{label}</span> : null}
    </button>
  )
}
