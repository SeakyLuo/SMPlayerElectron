import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { Icon, type IconName } from './icons'
import type { SearchHistoryEntry } from '../shared/contracts'
import type { Translator } from '../shared/i18n'

interface NavLinkItem {
  to: string
  labelKey: string
  label: string
  icon: IconName
}

const primaryLinks: NavLinkItem[] = [
  { to: '/songs', labelKey: 'library.title', label: 'Music Library', icon: 'songs' },
  { to: '/artists', labelKey: 'common.artists', label: 'Artists', icon: 'users' },
  { to: '/albums', labelKey: 'common.albums', label: 'Albums', icon: 'albums' },
]

const secondaryLinks: NavLinkItem[] = [
  { to: '/now-playing', labelKey: 'common.nowPlaying', label: 'Now Playing', icon: 'nowPlaying' },
  { to: '/recent', labelKey: 'common.recent', label: 'Recent', icon: 'recent' },
  { to: '/local', labelKey: 'common.local', label: 'Local', icon: 'local' },
  { to: '/playlists', labelKey: 'common.playlists', label: 'Playlists', icon: 'playlists' },
  { to: '/favorites', labelKey: 'common.myFavorites', label: 'My Favorites', icon: 'heart' },
]

const settingsLink: NavLinkItem = {
  to: '/settings',
  labelKey: 'common.settings',
  label: 'Settings',
  icon: 'settings',
}

interface SidebarProps {
  t: Translator
  collapsed: boolean
  appName: string
  canGoBack: boolean
  searchQuery: string
  recentSearches: SearchHistoryEntry[]
  onSearchChange: (value: string) => void
  onSearchCommit: (value: string) => void
  onRecentSearchRemove: (entryId: number) => void
  onRecentSearchesClear: () => void
  onSearchClear: () => void
  onToggleCollapsed: () => void
}

export function Sidebar({
  t,
  collapsed,
  appName,
  canGoBack,
  searchQuery,
  recentSearches,
  onSearchChange,
  onSearchCommit,
  onSearchClear,
  onRecentSearchRemove,
  onRecentSearchesClear,
  onToggleCollapsed,
}: SidebarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const focusSearchAfterExpandRef = useRef(false)
  const navigate = useNavigate()

  const visibleRecentSearches = recentSearches.slice(0, 10)

  const showRecentSearches = isSearchFocused && visibleRecentSearches.length > 0

  useEffect(() => {
    if (collapsed || !focusSearchAfterExpandRef.current) {
      return
    }

    focusSearchAfterExpandRef.current = false
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [collapsed])

  const expandAndFocusSearch = () => {
    focusSearchAfterExpandRef.current = true
    onToggleCollapsed()
  }

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      {canGoBack || !collapsed ? (
        <div className="sidebar-titlebar">
          {canGoBack ? (
            <button
              className="sidebar-back-button"
              type="button"
              aria-label={t('sidebar.back')}
              title={t('sidebar.back')}
              data-tooltip={t('sidebar.back')}
              onClick={() => {
                navigate(-1)
              }}
            >
              <Icon name="arrowLeft" />
            </button>
          ) : null}
          <span className="sidebar-app-name">{appName}</span>
        </div>
      ) : null}
      <button
        className="sidebar-collapse-button"
        type="button"
        aria-label={collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
        title={collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
        data-tooltip={collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
        onClick={onToggleCollapsed}
      >
        <Icon name="menu" />
      </button>

      <div className="search-shell">
        <label htmlFor="app-search">{t('common.search')}</label>
        <div className="search-field-shell">
          <form
            className={`search-form${searchQuery ? ' has-query' : ''}`}
            onSubmit={(event) => {
              event.preventDefault()
              if (collapsed) {
                expandAndFocusSearch()
                return
              }

              onSearchCommit(searchQuery)
            }}
          >
            <button
              className="search-commit-button"
              type="submit"
              title={t('common.search')}
              data-tooltip={t('common.search')}
              onClick={(event) => {
                if (!collapsed) {
                  return
                }

                event.preventDefault()
                expandAndFocusSearch()
              }}
            >
              <Icon name="search" />
            </button>
            <input
              ref={searchInputRef}
              id="app-search"
              type="search"
              placeholder={t('common.search')}
              value={searchQuery}
              onFocus={() => {
                setIsSearchFocused(true)
              }}
              onBlur={() => {
                setIsSearchFocused(false)
              }}
              onChange={(event) => {
                onSearchChange(event.currentTarget.value)
              }}
            />
            {searchQuery ? (
              <button
                className="search-clear-button"
                type="button"
                title={t('common.clear')}
                aria-label={t('common.clear')}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  onSearchClear()
                }}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </form>

          {showRecentSearches ? (
            <div className="search-history-panel">
              <div className="search-history-header">
                <span>{t('sidebar.recentSearches')}</span>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() => {
                    onRecentSearchesClear()
                  }}
                >
                  {t('common.clear')}
                </button>
              </div>
              <div className="search-history-list">
                {visibleRecentSearches.map((entry) => (
                  <div className="search-history-item" key={entry.id}>
                    <button
                      type="button"
                      className="search-history-select"
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onClick={() => {
                        onSearchChange(entry.query)
                        onSearchCommit(entry.query)
                      }}
                    >
                      <span>{entry.query}</span>
                    </button>
                    <button
                      type="button"
                      className="search-history-remove"
                      aria-label={t('sidebar.removeRecentSearch', {
                        query: entry.query,
                      })}
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onClick={() => {
                        onRecentSearchRemove(entry.id)
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="nav-section" aria-label="Library sections">
        <span className="nav-section-label">{t('sidebar.library')}</span>
        <div className="nav-links">
          {primaryLinks.map((item) => (
            <NavItem key={item.to} {...item} label={t(item.labelKey)} />
          ))}
        </div>
      </nav>

      <nav className="nav-section" aria-label="Playback sections">
        <span className="nav-section-label">{t('sidebar.playback')}</span>
        <div className="nav-links">
          {secondaryLinks.map((item) => (
            <NavItem key={item.to} {...item} label={t(item.labelKey)} />
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <NavItem {...settingsLink} label={t(settingsLink.labelKey)} />
      </div>
    </aside>
  )
}

interface NavItemProps {
  to: string
  label: string
  icon: IconName
}

function NavItem({ to, label, icon }: NavItemProps) {
  return (
    <NavLink
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      to={to}
      title={label}
      data-tooltip={label}
    >
      <span className="nav-tag" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>{label}</span>
    </NavLink>
  )
}
