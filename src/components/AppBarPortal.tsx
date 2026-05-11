import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

import type { Translator } from '../shared/i18n'
import { APPBAR_PAGE_ACTIONS_ID, APPBAR_PAGE_BOTTOM_ID } from './AppBar'
import { Icon } from './icons'

export function AppBarPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const updateHost = () => {
      setHost(document.getElementById(APPBAR_PAGE_ACTIONS_ID))
    }

    updateHost()
    window.addEventListener('resize', updateHost)

    return () => {
      window.removeEventListener('resize', updateHost)
    }
  }, [])

  if (!host?.isConnected) {
    return null
  }

  return createPortal(children, host)
}

export function AppBarBottomPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const updateHost = () => {
      setHost(document.getElementById(APPBAR_PAGE_BOTTOM_ID))
    }

    updateHost()
    window.addEventListener('resize', updateHost)

    return () => {
      window.removeEventListener('resize', updateHost)
    }
  }, [])

  if (!host?.isConnected) {
    return null
  }

  return createPortal(children, host)
}

export function AppBarSearch({
  t,
  active,
  open,
  onOpenChange,
  children,
}: {
  t: Translator
  active: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <AppBarPortal>
      <div
        className={clsx('appbar-page-search', active && 'has-query', open && 'is-open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onOpenChange(false)
          }
        }}
      >
        <button
          className="appbar-icon-button appbar-page-search-button"
          type="button"
          aria-label={open ? t('common.close') : t('common.search')}
          title={open ? t('common.close') : t('common.search')}
          onClick={() => {
            onOpenChange(!open)
          }}
        >
          <Icon name={open ? 'close' : 'search'} />
        </button>
        {open ? (
          <div className="appbar-page-search-panel">
            <div className="appbar-page-search-content">{children}</div>
            <button
              className="appbar-icon-button appbar-page-search-close-button"
              type="button"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        ) : null}
      </div>
    </AppBarPortal>
  )
}
