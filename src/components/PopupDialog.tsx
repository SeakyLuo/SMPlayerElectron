import { type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'

import type { Translator } from '../shared/i18n'
import { Icon } from './icons'

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
  return createPortal(
    <div
      className={`song-dialog-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
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
        <nav className={`song-dialog-tabs ${navClassName}`} aria-label={navLabel}>
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
