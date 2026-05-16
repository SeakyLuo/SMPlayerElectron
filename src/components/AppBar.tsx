import type { ReactNode } from 'react'
import clsx from 'clsx'

import { Icon } from './icons'

export const APPBAR_PAGE_ACTIONS_ID = 'smplayer-page-appbar-actions'
export const APPBAR_PAGE_BOTTOM_ID = 'smplayer-page-appbar-bottom'

interface AppBarProps {
  menuLabel: string
  menuTitle?: string
  onMenuClick: () => void
  children?: ReactNode
  actions?: ReactNode
  className?: string
}

export function AppBar({
  menuLabel,
  menuTitle = menuLabel,
  onMenuClick,
  children,
  actions,
  className,
}: AppBarProps) {
  return (
    <header className={clsx('workspace-header', className)}>
      <div className="appbar-title-group">
        <button
          className="appbar-icon-button appbar-menu-button"
          type="button"
          aria-label={menuLabel}
          title={menuTitle}
          onClick={onMenuClick}
        >
          <Icon name="menu" />
        </button>
        {children}
      </div>
      <div className="appbar-spacer drag-spacer" />
      {actions ? <div className="appbar-actions">{actions}</div> : null}
      <div className="appbar-bottom" id={APPBAR_PAGE_BOTTOM_ID} />
    </header>
  )
}
