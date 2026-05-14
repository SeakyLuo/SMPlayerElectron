import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'

import type { Translator } from '../shared/i18n'
import { Icon } from './icons'
import { addPopupDialogCloseHandler } from './popupDialogStack'

interface PopupDialogProps {
  t: Translator
  className: string
  navClassName: string
  navLabel: string
  children: ReactNode
  onClose: () => void
  ariaLabel?: string
  ariaLabelledBy?: string
  dialogRef?: Ref<HTMLElement>
  overlayClassName?: string
  navChildren?: ReactNode
  afterNav?: ReactNode
  footer?: ReactNode
  closeOnBackdrop?: boolean
}

function setRefValue(ref: Ref<HTMLElement> | undefined, value: HTMLElement | null) {
  if (!ref) {
    return
  }

  if (typeof ref === 'function') {
    ref(value)
    return
  }

  ;(ref as { current: HTMLElement | null }).current = value
}

function canScrollElement(element: HTMLElement, deltaX: number, deltaY: number) {
  const style = window.getComputedStyle(element)
  const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight
  const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth

  if (deltaY < 0 && canScrollY && element.scrollTop > 0) {
    return true
  }

  if (deltaY > 0 && canScrollY && element.scrollTop + element.clientHeight < element.scrollHeight) {
    return true
  }

  if (deltaX < 0 && canScrollX && element.scrollLeft > 0) {
    return true
  }

  if (deltaX > 0 && canScrollX && element.scrollLeft + element.clientWidth < element.scrollWidth) {
    return true
  }

  return false
}

function canScrollWithinDialog(dialog: HTMLElement, target: EventTarget | null, deltaX: number, deltaY: number) {
  if (!(target instanceof Element)) {
    return false
  }

  let element: Element | null = target
  while (element && dialog.contains(element)) {
    if (element instanceof HTMLElement && canScrollElement(element, deltaX, deltaY)) {
      return true
    }

    if (element === dialog) {
      break
    }

    element = element.parentElement
  }

  return false
}

export function PopupDialog({
  t,
  className,
  navClassName,
  navLabel,
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  dialogRef,
  overlayClassName = '',
  navChildren,
  afterNav,
  footer,
  closeOnBackdrop = false,
}: PopupDialogProps) {
  const onCloseRef = useRef(onClose)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const internalDialogRef = useRef<HTMLElement | null>(null)
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => addPopupDialogCloseHandler(() => onCloseRef.current()), [])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) {
      return
    }

    const containScrollInput = (event: WheelEvent | TouchEvent, deltaX: number, deltaY: number) => {
      event.stopPropagation()

      const dialog = internalDialogRef.current
      if (!dialog || !dialog.contains(event.target as Node) || !canScrollWithinDialog(dialog, event.target, deltaX, deltaY)) {
        event.preventDefault()
      }
    }

    const handleWheel = (event: WheelEvent) => {
      containScrollInput(event, event.deltaX, event.deltaY)
    }

    const handleTouchStart = (event: TouchEvent) => {
      event.stopPropagation()
      const touch = event.touches[0]
      lastTouchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      const lastTouch = lastTouchRef.current
      if (!touch || !lastTouch) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      const deltaX = lastTouch.x - touch.clientX
      const deltaY = lastTouch.y - touch.clientY
      containScrollInput(event, deltaX, deltaY)
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
    }

    overlay.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    overlay.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false })
    overlay.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false })

    return () => {
      overlay.removeEventListener('wheel', handleWheel, { capture: true })
      overlay.removeEventListener('touchstart', handleTouchStart, { capture: true })
      overlay.removeEventListener('touchmove', handleTouchMove, { capture: true })
    }
  }, [])

  const startWindowDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    void window.smplayer?.startWindowDrag()
  }

  const startToolbarWindowDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, a')) {
      return
    }

    startWindowDrag(event)
  }

  const stopWindowDrag = () => {
    void window.smplayer?.stopWindowDrag()
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={`song-dialog-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="popup-dialog-window-drag-strip"
        onPointerDown={startWindowDrag}
        onPointerUp={stopWindowDrag}
        onPointerCancel={stopWindowDrag}
        onLostPointerCapture={stopWindowDrag}
      />
      <div className="popup-dialog-mobile-titlebar">
        <button
          type="button"
          className="popup-dialog-mobile-back-button"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          aria-label={t('common.close')}
        >
          <Icon name="arrowLeft" />
        </button>
        <span
          onPointerDown={startWindowDrag}
          onPointerUp={stopWindowDrag}
          onPointerCancel={stopWindowDrag}
          onLostPointerCapture={stopWindowDrag}
        >
          {t('app.shell')}
        </span>
      </div>
      <section
        ref={(element) => {
          internalDialogRef.current = element
          setRefValue(dialogRef, element)
        }}
        className={`song-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <nav
          className={`song-dialog-tabs popup-dialog-toolbar ${navClassName}`}
          aria-label={navLabel}
          onPointerDown={startToolbarWindowDrag}
          onPointerUp={stopWindowDrag}
          onPointerCancel={stopWindowDrag}
          onLostPointerCapture={stopWindowDrag}
        >
          {navChildren}
          <button
            type="button"
            className="song-dialog-icon-button music-dialog-close-button CloseButton"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }}
            onMouseDown={(event) => {
              event.stopPropagation()
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            aria-label={t('common.close')}
          >
            <Icon name="arrowLeft" className="dialog-back-icon" />
            <Icon name="close" className="dialog-close-icon" />
          </button>
          <span className="dialog-titlebar-title">{t('app.shell')}</span>
        </nav>
        {afterNav}
        {children}
        {footer}
      </section>
    </div>,
    document.body,
  )
}
