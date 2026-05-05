import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'

import type { AppInfo, SearchHistoryEntry } from '../shared/contracts'

const primaryLinks = [
  { to: '/songs', label: 'Songs', tag: 'SO' },
  { to: '/artists', label: 'Artists', tag: 'AR' },
  { to: '/albums', label: 'Albums', tag: 'AL' },
]

const secondaryLinks = [
  { to: '/now-playing', label: 'Now Playing', tag: 'NP' },
  { to: '/recent', label: 'Recent', tag: 'RC' },
  { to: '/local', label: 'Local', tag: 'LC' },
  { to: '/playlists', label: 'Playlists', tag: 'PL' },
  { to: '/favorites', label: 'My Favorites', tag: 'FV' },
  { to: '/settings', label: 'Settings', tag: 'ST' },
]

interface SidebarProps {
  appInfo: AppInfo
  searchQuery: string
  recentSearches: SearchHistoryEntry[]
  onSearchChange: (value: string) => void
  onSearchCommit: (value: string) => void
  onRecentSearchRemove: (entryId: number) => void
  onRecentSearchesClear: () => void
}

export function Sidebar({
  appInfo,
  searchQuery,
  recentSearches,
  onSearchChange,
  onSearchCommit,
  onRecentSearchRemove,
  onRecentSearchesClear,
}: SidebarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const visibleRecentSearches = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()

    return recentSearches
      .filter((entry) =>
        normalizedSearchQuery
          ? entry.query.toLocaleLowerCase().includes(normalizedSearchQuery)
          : true,
      )
      .slice(0, 6)
  }, [recentSearches, searchQuery])

  const showRecentSearches = isSearchFocused && visibleRecentSearches.length > 0

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-topline">Groove-inspired rebuild</span>
        <span className="brand-name">SMPlayer</span>
        <p className="brand-copy">
          The Electron rebuild now scans the local library, stores it in SQLite,
          and plays tracks with real queue state.
        </p>
      </div>

      <div className="search-shell">
        <label htmlFor="app-search">Search</label>
        <div className="search-field-shell">
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault()
              onSearchCommit(searchQuery)
            }}
          >
            <input
              id="app-search"
              type="search"
              placeholder="Search songs, albums, and playlists"
              value={searchQuery}
              onFocus={() => {
                setIsSearchFocused(true)
              }}
              onBlur={() => {
                setIsSearchFocused(false)
                onSearchCommit(searchQuery)
              }}
              onChange={(event) => {
                onSearchChange(event.currentTarget.value)
              }}
            />
            <button className="search-commit-button" type="submit">
              SAVE
            </button>
          </form>

          {showRecentSearches ? (
            <div className="search-history-panel">
              <div className="search-history-header">
                <span>Recent searches</span>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() => {
                    onRecentSearchesClear()
                  }}
                >
                  Clear
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
                      <small>{formatRecentSearchTime(entry.searchedAt)}</small>
                    </button>
                    <button
                      type="button"
                      className="search-history-remove"
                      aria-label={`Remove recent search ${entry.query}`}
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onClick={() => {
                        onRecentSearchRemove(entry.id)
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="nav-section" aria-label="Library sections">
        <span className="nav-section-label">Library</span>
        <div className="nav-links">
          {primaryLinks.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <nav className="nav-section" aria-label="Playback sections">
        <span className="nav-section-label">Playback</span>
        <div className="nav-links">
          {secondaryLinks.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <p>{appInfo.platform} target ready</p>
        <p>{appInfo.userDataPath}</p>
      </div>
    </aside>
  )
}

interface NavItemProps {
  to: string
  label: string
  tag: string
}

function NavItem({ to, label, tag }: NavItemProps) {
  return (
    <NavLink
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      to={to}
    >
      <span className="nav-tag">{tag}</span>
      <span>{label}</span>
    </NavLink>
  )
}

function formatRecentSearchTime(searchedAt: string) {
  const parsed = new Date(searchedAt)

  if (Number.isNaN(parsed.getTime())) {
    return 'saved'
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60_000))

  if (diffMinutes < 1) {
    return 'just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  if (diffMinutes < 1_440) {
    return `${Math.floor(diffMinutes / 60)} hr ago`
  }

  return parsed.toLocaleDateString()
}
