import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { Icon, type IconName } from './icons'
import type { LibraryPlaylist, SearchHistoryEntry } from '../shared/contracts'
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
  playlists: LibraryPlaylist[]
  canGoBack: boolean
  searchQuery: string
  recentSearches: SearchHistoryEntry[]
  onSearchChange: (value: string) => void
  onSearchCommit: (value: string) => void
  onRecentSearchRemove: (entryId: number) => void
  onRecentSearchesClear: () => void
  onSearchClear: () => void
  onToggleCollapsed: () => void
  getRestoredNavTarget: (target: string) => string
}

export function Sidebar({
  t,
  collapsed,
  appName,
  playlists,
  canGoBack,
  searchQuery,
  recentSearches,
  onSearchChange,
  onSearchCommit,
  onSearchClear,
  onRecentSearchRemove,
  onRecentSearchesClear,
  onToggleCollapsed,
  getRestoredNavTarget,
}: SidebarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isPlaylistNavExpanded, setIsPlaylistNavExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const focusSearchAfterExpandRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()

  const visibleRecentSearches = recentSearches.slice(0, 10)
  const customPlaylists = playlists.filter((playlist) => !playlist.isBuiltIn)
  const isPlaylistRoute = location.pathname.startsWith('/playlists')

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

  useEffect(() => {
    if (isPlaylistRoute && !collapsed) {
      setIsPlaylistNavExpanded(true)
    }
  }, [collapsed, isPlaylistRoute])

  const expandAndFocusSearch = () => {
    focusSearchAfterExpandRef.current = true
    onToggleCollapsed()
  }

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-titlebar">
        {canGoBack ? (
          <button
            className="sidebar-back-button"
            type="button"
            aria-label={t('sidebar.back')}
            data-tooltip={t('sidebar.back')}
            onClick={() => {
              navigate(-1)
            }}
          >
            <Icon name="arrowLeft" />
          </button>
        ) : null}
        {!collapsed ? <span className="sidebar-app-name">{appName}</span> : null}
      </div>
      <button
        className="sidebar-collapse-button"
        type="button"
        aria-label={collapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
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
            <NavItem key={item.to} {...item} label={t(item.labelKey)} targetTo={getRestoredNavTarget(item.to)} />
          ))}
        </div>
      </nav>

      <nav className="nav-section" aria-label="Playback sections">
        <span className="nav-section-label">{t('sidebar.playback')}</span>
        <div className="nav-links">
          {secondaryLinks.map((item) => (
            <NavItem key={item.to} {...item} label={t(item.labelKey)} targetTo={getRestoredNavTarget(item.to)} />
          ))}
        </div>
      </nav>

      <nav className="nav-section playlist-nav-section" aria-label={t('common.playlists')}>
        {collapsed ? (
          <NavItem to="/playlists" icon="playlists" label={t('common.playlists')} />
        ) : (
          <>
            <div className="playlist-nav-heading">
              <NavItem to="/playlists" icon="playlists" label={t('common.playlists')} />
              <button
                type="button"
                className="playlist-nav-toggle"
                aria-label={isPlaylistNavExpanded ? t('sidebar.collapseNavigation') : t('sidebar.expandNavigation')}
                aria-expanded={isPlaylistNavExpanded}
                onClick={() => {
                  setIsPlaylistNavExpanded((current) => !current)
                }}
              >
                <Icon name={isPlaylistNavExpanded ? 'chevronUp' : 'chevronDown'} />
              </button>
            </div>
            <div className={`playlist-nav-children${isPlaylistNavExpanded ? ' is-expanded' : ''}`}>
              {customPlaylists.map((playlist) => (
                <NavLink
                  key={playlist.id}
                  className={({ isActive }) => `playlist-nav-child${isActive ? ' active' : ''}`}
                  to={`/playlists/${playlist.id}`}
                  title={playlist.name}
                >
                  <span className="playlist-nav-child-icon" aria-hidden="true">
                    <Icon name="playlists" />
                  </span>
                  <span>{playlist.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <NavItem {...settingsLink} label={t(settingsLink.labelKey)} targetTo={getRestoredNavTarget(settingsLink.to)} />
      </div>
    </aside>
  )
}

interface NavItemProps {
  to: string
  targetTo?: string
  label: string
  icon: IconName
}

function NavItem({ to, targetTo = to, label, icon }: NavItemProps) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`)

  return (
    <NavLink
      className={() => `nav-link${isActive ? ' active' : ''}`}
      to={targetTo}
      data-tooltip={label}
    >
      <span className="nav-tag" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>{label}</span>
    </NavLink>
  )
}
