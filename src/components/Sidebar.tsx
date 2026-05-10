import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'

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
  { to: '/songs', labelKey: 'library.title', label: 'Music Library', icon: 'musicLibrary' },
  { to: '/artists', labelKey: 'common.artists', label: 'Artists', icon: 'users' },
  { to: '/albums', labelKey: 'common.albums', label: 'Albums', icon: 'albums' },
]

const secondaryLinks: NavLinkItem[] = [
  { to: '/local', labelKey: 'common.local', label: 'Local', icon: 'local' },
  { to: '/recent', labelKey: 'common.recent', label: 'Recent', icon: 'recent' },
  { to: '/now-playing', labelKey: 'common.nowPlaying', label: 'Now Playing', icon: 'songs' },
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
  onGoBack: () => void
  onNavigate: () => void
  onCreatePlaylist: () => void
  onReorderPlaylists: (playlistIds: number[]) => void
  onQuickPlayPlaylist: (playlistId: number) => void
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
  onGoBack,
  onNavigate,
  onCreatePlaylist,
  onReorderPlaylists,
  onQuickPlayPlaylist,
  getRestoredNavTarget,
}: SidebarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isPlaylistNavExpanded, setIsPlaylistNavExpanded] = useState(false)
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<number | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ playlistId: number; position: 'before' | 'after' } | null>(null)
  const [collapsedTooltip, setCollapsedTooltip] = useState<{ text: string; left: number; top: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const focusSearchAfterExpandRef = useRef(false)
  const draggedPlaylistIdRef = useRef<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const visibleRecentSearches = recentSearches.slice(0, 10)
  const customPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.isBuiltIn), [playlists])
  const customPlaylistIds = useMemo(() => customPlaylists.map((playlist) => playlist.id), [customPlaylists])
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

  useEffect(() => {
    if (!collapsed) {
      setCollapsedTooltip(null)
    }
  }, [collapsed])

  const expandAndFocusSearch = () => {
    focusSearchAfterExpandRef.current = true
    onToggleCollapsed()
  }

  const clearPlaylistDragState = () => {
    draggedPlaylistIdRef.current = null
    setDraggingPlaylistId(null)
    setDropIndicator(null)
  }

  const reorderDraggedPlaylist = (targetPlaylistId: number, insertAfter: boolean) => {
    const draggedPlaylistId = draggedPlaylistIdRef.current
    if (draggedPlaylistId == null || draggedPlaylistId === targetPlaylistId) {
      clearPlaylistDragState()
      return
    }

    const nextPlaylistIds = customPlaylistIds.filter((playlistId) => playlistId !== draggedPlaylistId)
    const targetIndex = nextPlaylistIds.indexOf(targetPlaylistId)
    nextPlaylistIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedPlaylistId)
    clearPlaylistDragState()
    onReorderPlaylists(nextPlaylistIds)
  }

  const openPlaylist = (playlistId: number) => {
    flushSync(() => {
      onNavigate()
      navigate(`/playlists/${playlistId}`)
    })
  }

  const openPlaylistOnKeyDown = (event: KeyboardEvent<HTMLElement>, playlistId: number) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPlaylist(playlistId)
    }
  }

  const showCollapsedTooltip = (target: EventTarget | null) => {
    if (!collapsed || !(target instanceof Element)) {
      return
    }

    const tooltipTarget = target.closest<HTMLElement>('[data-tooltip]')
    if (!tooltipTarget) {
      setCollapsedTooltip(null)
      return
    }

    const text = tooltipTarget.dataset.tooltip
    if (!text) {
      return
    }

    const rect = tooltipTarget.getBoundingClientRect()
    setCollapsedTooltip({
      text,
      left: rect.right + 10,
      top: rect.top + rect.height / 2,
    })
  }

  const hideCollapsedTooltip = () => {
    setCollapsedTooltip(null)
  }

  return (
    <>
    <aside
      className={`sidebar${collapsed ? ' is-collapsed' : ''}`}
      onPointerOver={(event: PointerEvent<HTMLElement>) => {
        showCollapsedTooltip(event.target)
      }}
      onPointerOut={(event: PointerEvent<HTMLElement>) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          hideCollapsedTooltip()
        }
      }}
      onFocus={(event: FocusEvent<HTMLElement>) => {
        showCollapsedTooltip(event.target)
      }}
      onBlur={(event: FocusEvent<HTMLElement>) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          hideCollapsedTooltip()
        }
      }}
      onScroll={hideCollapsedTooltip}
    >
      <div className="sidebar-titlebar">
        {canGoBack ? (
          <button
            className="sidebar-back-button"
            type="button"
            aria-label={t('sidebar.back')}
            data-tooltip={t('sidebar.back')}
            onClick={onGoBack}
          >
            <Icon name="arrowLeft" />
          </button>
        ) : null}
        <span className="sidebar-app-name">{appName}</span>
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
            <>
              <div className="dropdown-dismiss-layer" onPointerDown={() => setIsSearchFocused(false)} />
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
            </>
          ) : null}
        </div>
      </div>

      <nav className="nav-section" aria-label="Library sections">
        <span className="nav-section-label">{t('sidebar.library')}</span>
        <div className="nav-links">
          {primaryLinks.map((item) => (
            <NavItem key={item.to} {...item} label={t(item.labelKey)} targetTo={getRestoredNavTarget(item.to)} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      <nav className="nav-section" aria-label="Playback sections">
        <span className="nav-section-label">{t('sidebar.playback')}</span>
        <div className="nav-links">
          {secondaryLinks.map((item) => (
            <NavItem key={item.to} {...item} label={t(item.labelKey)} targetTo={getRestoredNavTarget(item.to)} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      <nav className="nav-section playlist-nav-section" aria-label={t('common.playlists')}>
        {collapsed ? (
          <NavItem to="/playlists" icon="playlists" label={t('common.playlists')} onNavigate={onNavigate} exactActive />
        ) : (
          <>
            <div className="playlist-nav-heading">
              <NavItem to="/playlists" icon="playlists" label={t('common.playlists')} onNavigate={onNavigate} exactActive />
              <button
                type="button"
                className="playlist-nav-create"
                title={t('playlists.createNew')}
                aria-label={t('playlists.createNew')}
                onClick={() => {
                  onCreatePlaylist()
                  setIsPlaylistNavExpanded(true)
                }}
              >
                <Icon name="plus" />
              </button>
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
                <div
                  key={playlist.id}
                  className={`playlist-nav-child${location.pathname === `/playlists/${playlist.id}` ? ' active' : ''}${draggingPlaylistId === playlist.id ? ' is-dragging' : ''}${dropIndicator?.playlistId === playlist.id ? ` is-drop-${dropIndicator.position}` : ''}`}
                  role="button"
                  tabIndex={0}
                  data-nav-to={`/playlists/${playlist.id}`}
                  title={playlist.name}
                  draggable
                  onClick={() => openPlaylist(playlist.id)}
                  onKeyDown={(event) => openPlaylistOnKeyDown(event, playlist.id)}
                  onDragStart={(event) => {
                    draggedPlaylistIdRef.current = playlist.id
                    setDraggingPlaylistId(playlist.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', playlist.name)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    const rect = event.currentTarget.getBoundingClientRect()
                    setDropIndicator({
                      playlistId: playlist.id,
                      position: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before',
                    })
                  }}
                  onDragLeave={() => {
                    setDropIndicator((current) => current?.playlistId === playlist.id ? null : current)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const rect = event.currentTarget.getBoundingClientRect()
                    reorderDraggedPlaylist(playlist.id, event.clientY > rect.top + rect.height / 2)
                  }}
                  onDragEnd={clearPlaylistDragState}
                >
                  <span className="playlist-nav-child-icon" aria-hidden="true">
                    <Icon name="playlists" />
                  </span>
                  <span className="playlist-nav-child-label">{playlist.name}</span>
                  <button
                    className="playlist-nav-child-quick-play"
                    type="button"
                    title={t('nowPlaying.quickPlay')}
                    aria-label={`${t('nowPlaying.quickPlay')} ${playlist.name}`}
                    draggable={false}
                    disabled={playlist.songIds.length === 0}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onQuickPlayPlaylist(playlist.id)
                    }}
                    onDragStart={(event) => {
                      event.preventDefault()
                    }}
                  >
                    <Icon name="play" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <NavItem {...settingsLink} label={t(settingsLink.labelKey)} targetTo={getRestoredNavTarget(settingsLink.to)} onNavigate={onNavigate} />
      </div>
    </aside>
    {collapsed && collapsedTooltip
      ? createPortal(
          <div
            className="sidebar-floating-tooltip"
            style={{
              left: collapsedTooltip.left,
              top: collapsedTooltip.top,
            }}
          >
            {collapsedTooltip.text}
          </div>,
          document.body,
        )
      : null}
    </>
  )
}

interface NavItemProps {
  to: string
  targetTo?: string
  label: string
  icon: IconName
  onNavigate?: () => void
  exactActive?: boolean
}

function NavItem({ to, targetTo = to, label, icon, onNavigate, exactActive = false }: NavItemProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const isActive = exactActive ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`)

  return (
    <button
      className={`nav-link${isActive ? ' active' : ''}`}
      type="button"
      data-nav-to={targetTo}
      data-tooltip={label}
      ref={(node) => {
        if (node) {
          node.onclick = (event) => {
            event.preventDefault()
            flushSync(() => {
              onNavigate?.()
              navigate(targetTo)
            })
          }
        }
      }}
    >
      <span className="nav-tag" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>{label}</span>
    </button>
  )
}
