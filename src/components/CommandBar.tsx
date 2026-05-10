import clsx from 'clsx'
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
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
  const [overflowedIndexes, setOverflowedIndexes] = useState<Set<number>>(new Set())
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
        items.push(commandBarButtonToMenuFlyoutItem(child, index))
      }
    })
    return items
  }, [childrenArray, overflowedIndexes])
  const overflowMenuItems = useMemo(
    () => [...dynamicOverflowItems, ...overflowItems],
    [dynamicOverflowItems, overflowItems],
  )

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
        itemWidths.current[index] = Math.ceil(itemElement.getBoundingClientRect().width)
      }
    })

    const availableWidth = primaryElement.clientWidth
    const moreWidth = Math.ceil(moreRef.current?.getBoundingClientRect().width ?? 52)
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
  }, [childrenArray, dynamicOverflow, overflowItems.length])

  const updateDynamicOverflow = useCallback(() => {
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = window.requestAnimationFrame(() => {
      measureDynamicOverflow()
    })
  }, [measureDynamicOverflow])

  useEffect(() => {
    updateDynamicOverflow()
    return () => {
      window.cancelAnimationFrame(animationFrameRef.current)
    }
  }, [updateDynamicOverflow])

  useEffect(() => {
    if (!dynamicOverflow) {
      return
    }

    const primaryElement = primaryRef.current
    if (!primaryElement) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      updateDynamicOverflow()
    })
    resizeObserver.observe(primaryElement)
    return () => {
      resizeObserver.disconnect()
    }
  }, [dynamicOverflow, updateDynamicOverflow])

  return (
    <div className={clsx('uwp-commandbar', dynamicOverflow && 'is-dynamic-overflow', className)} role="toolbar">
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
): MenuFlyoutItem {
  return {
    key: `commandbar-overflow-${index}`,
    text: button.props.label,
    icon: button.props.icon,
    disabled: button.props.disabled,
    onClick: () => {
      button.props.onClick?.({} as Parameters<NonNullable<CommandBarButtonProps['onClick']>>[0])
    },
  }
}

function areIndexSetsEqual(left: Set<number>, right: Set<number>) {
  return left.size === right.size && [...left].every((item) => right.has(item))
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
