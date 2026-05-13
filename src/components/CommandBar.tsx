import clsx from 'clsx'
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
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
  overflowReserve?: number
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
  onOverflowClick?: (position: MenuFlyoutPosition) => void
  onPointerDown?: PointerEventHandler<HTMLButtonElement>
}

export function CommandBar({
  children,
  className,
  content,
  dynamicOverflow = true,
  overflowReserve = 0,
  overflowItems = [],
  overflowLabel = 'More',
}: CommandBarProps) {
  const [overflowPosition, setOverflowPosition] = useState<MenuFlyoutPosition | null>(null)
  const [overflowedIndexes, setOverflowedIndexes] = useState<Set<number>>(new Set())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const primaryRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  const itemWidths = useRef<number[]>([])
  const animationFrameRef = useRef(0)
  const childrenArray = useMemo(() => flattenCommandBarChildren(children), [children])
  const dynamicOverflowItems = useMemo(() => {
    const items: MenuFlyoutItem[] = []
    childrenArray.forEach((child, index) => {
      if (overflowedIndexes.has(index) && isCommandBarButtonElement(child)) {
        items.push(commandBarButtonToMenuFlyoutItem(child, index, overflowPosition))
      }
    })
    return items
  }, [childrenArray, overflowedIndexes, overflowPosition])
  const overflowMenuItems = useMemo(
    () => [...dynamicOverflowItems, ...overflowItems],
    [dynamicOverflowItems, overflowItems],
  )

  useEffect(() => {
    if (overflowMenuItems.length === 0) {
      setOverflowPosition(null)
    }
  }, [overflowMenuItems.length])

  const measureDynamicOverflow = useCallback(() => {
    if (!dynamicOverflow) {
      setOverflowedIndexes((current) => current.size === 0 ? current : new Set())
      return
    }

    const primaryElement = primaryRef.current
    if (!primaryElement) {
      return
    }

    childrenArray.forEach((_, index) => {
      const itemElement = itemRefs.current[index]
      if (itemElement) {
        itemWidths.current[index] = getCommandBarItemOuterWidth(itemElement)
      }
    })

    const availableWidth = Math.max(0, primaryElement.clientWidth - overflowReserve)
    const moreWidth = moreRef.current ? getCommandBarItemOuterWidth(moreRef.current) : 52
    const nextOverflowedIndexes = new Set<number>()
    let totalWidth = childrenArray.reduce<number>((total, _, index) => total + (itemWidths.current[index] ?? 0), 0)
    const reservedMoreWidth = overflowItems.length > 0 || totalWidth > availableWidth ? moreWidth : 0
    const overflowableIndexes = childrenArray
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => isCommandBarItemOverflowable(child))
      .map(({ index }) => index)

    for (const index of overflowableIndexes.slice().reverse()) {
      if (totalWidth + reservedMoreWidth <= availableWidth) {
        break
      }

      nextOverflowedIndexes.add(index)
      totalWidth -= itemWidths.current[index] ?? 0
    }

    setOverflowedIndexes((current) => (
      areIndexSetsEqual(current, nextOverflowedIndexes) ? current : nextOverflowedIndexes
    ))
  }, [childrenArray, dynamicOverflow, overflowItems.length, overflowReserve])

  const updateDynamicOverflow = useCallback(() => {
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = window.requestAnimationFrame(() => {
      measureDynamicOverflow()
    })
  }, [measureDynamicOverflow])

  useLayoutEffect(() => {
    updateDynamicOverflow()
    return () => {
      window.cancelAnimationFrame(animationFrameRef.current)
    }
  }, [updateDynamicOverflow])

  useLayoutEffect(() => {
    if (!dynamicOverflow) {
      return
    }

    const rootElement = rootRef.current
    const primaryElement = primaryRef.current
    const resizeObserver = new ResizeObserver(() => {
      updateDynamicOverflow()
    })
    resizeObserver.observe(rootElement!)
    resizeObserver.observe(primaryElement!)
    return () => {
      resizeObserver.disconnect()
    }
  }, [dynamicOverflow, updateDynamicOverflow])

  return (
    <div ref={rootRef} className={clsx('uwp-commandbar', dynamicOverflow && 'is-dynamic-overflow', className)} role="toolbar">
      {content ? <div className="uwp-commandbar-content">{content}</div> : null}
      <div className="uwp-commandbar-primary" ref={primaryRef}>
        {childrenArray.map((child, index) => (
          <div
            className={clsx('uwp-commandbar-item', overflowedIndexes.has(index) && 'is-overflowed')}
            key={index}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
          >
            {child}
          </div>
        ))}
        {overflowMenuItems.length > 0 ? (
          <div className="uwp-commandbar-more" ref={moreRef}>
            <CommandBarButton
              icon="moreHorizontal"
              label={overflowLabel}
              showLabel={false}
              ariaHasPopup="menu"
              ariaExpanded={overflowPosition != null}
              canOverflow={false}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setOverflowPosition({ x: rect.left, y: rect.bottom + 4, anchor: event.currentTarget })
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

function flattenCommandBarChildren(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = []
  Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') {
      return
    }

    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      result.push(...flattenCommandBarChildren(child.props.children))
      return
    }

    result.push(child)
  })
  return result
}

function isCommandBarButtonElement(child: ReactNode): child is ReactElement<CommandBarButtonProps> {
  return isValidElement<CommandBarButtonProps>(child) && child.type === CommandBarButton
}

function isCommandBarItemOverflowable(child: ReactNode) {
  return isCommandBarButtonElement(child) && child.props.canOverflow !== false
}

function commandBarButtonToMenuFlyoutItem(
  button: ReactElement<CommandBarButtonProps>,
  index: number,
  overflowPosition: MenuFlyoutPosition | null,
): MenuFlyoutItem {
  return {
    key: `commandbar-overflow-${index}`,
    text: button.props.label,
    icon: button.props.icon,
    disabled: button.props.disabled,
    onClick: () => {
      if (button.props.onOverflowClick) {
        button.props.onOverflowClick(overflowPosition ?? { x: 0, y: 0 })
        return
      }
      button.props.onClick?.({} as Parameters<NonNullable<CommandBarButtonProps['onClick']>>[0])
    },
  }
}

function areIndexSetsEqual(left: Set<number>, right: Set<number>) {
  return left.size === right.size && [...left].every((item) => right.has(item))
}

function getCommandBarItemOuterWidth(element: HTMLElement) {
  const childElement = element.firstElementChild as HTMLElement
  const rect = childElement.getBoundingClientRect()
  const style = window.getComputedStyle(childElement)
  return Math.ceil(rect.width + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight))
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
