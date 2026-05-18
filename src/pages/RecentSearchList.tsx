import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

import { Icon, type IconName } from '../components/icons'
import { LoadingState } from '../components/LoadingState'
import { MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER } from '../components/MultiSelectCommandBar'
import { useRecentScrollbar } from '../hooks/useRecentScrollbar'
import type { PreferredLanguage, SearchHistoryEntry, SearchHistoryType } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { formatRecentDateTime } from './recentPageModel'

const RECENT_SEARCH_ROW_HEIGHT = 56
const RECENT_SEARCH_BOTTOM_PADDING = 92
const RECENT_SEARCH_OVERSCAN_ROWS = 8

export function RecentSearchList({
  entries,
  multiSelect,
  selectedEntryIds,
  t,
  preferredLanguage,
  loading,
  onSearch,
  onToggleSelection,
  onRemove,
}: {
  entries: SearchHistoryEntry[]
  multiSelect: boolean
  selectedEntryIds: Set<number>
  t: Translator
  preferredLanguage: PreferredLanguage
  loading: boolean
  onSearch: (entry: SearchHistoryEntry) => void
  onToggleSelection: (entryId: number) => void
  onRemove: (entryId: number) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const listScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const listScrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const listHeight = entries.length * RECENT_SEARCH_ROW_HEIGHT
  const scrollContentHeight = listHeight + (multiSelect ? MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER : RECENT_SEARCH_BOTTOM_PADDING)
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, listHeight - viewportHeight))
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / RECENT_SEARCH_ROW_HEIGHT) - RECENT_SEARCH_OVERSCAN_ROWS,
  )
  const endIndex = Math.min(
    entries.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / RECENT_SEARCH_ROW_HEIGHT) + RECENT_SEARCH_OVERSCAN_ROWS,
  )
  const renderedEntries = entries.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * RECENT_SEARCH_ROW_HEIGHT
  const bottomSpacerHeight = (entries.length - endIndex) * RECENT_SEARCH_ROW_HEIGHT +
    (multiSelect ? MULTI_SELECT_COMMAND_BAR_SCROLL_SPACER : RECENT_SEARCH_BOTTOM_PADDING)
  const onListScrollbarPointerDown = useRecentScrollbar(
    listScrollFrameRef,
    listRef,
    listScrollbarTrackRef,
    scrollContentHeight,
  )

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(list.clientHeight)
    })

    setViewportHeight(list.clientHeight)
    resizeObserver.observe(list)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  if (entries.length === 0) {
    return loading ? <LoadingState t={t} compact /> : null
  }

  return (
    <div className="recent-search-scroll-frame" ref={listScrollFrameRef}>
      <div
        className="recent-search-list"
        ref={listRef}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop)
        }}
      >
        {topSpacerHeight > 0 ? <div className="recent-search-spacer" style={{ height: topSpacerHeight }} /> : null}
        {renderedEntries.map((entry) => {
          const searchTypeIcon = getSearchTypeIcon(entry.type)

          return (
            <div
              className={clsx('recent-search-row', {
                'is-selected': selectedEntryIds.has(entry.id),
              })}
              key={entry.id}
            >
              <button
                type="button"
                className="recent-search-row-main"
                onClick={() => {
                  if (multiSelect) {
                    onToggleSelection(entry.id)
                  } else {
                    onSearch(entry)
                  }
                }}
              >
                {multiSelect ? (
                  <span className="playlist-control-item-selection-mark">
                    {selectedEntryIds.has(entry.id) ? <Icon name="check" /> : null}
                  </span>
                ) : null}
                <span className="recent-search-type-icon">
                  <Icon name={searchTypeIcon} />
                </span>
                <span className="recent-search-query">{entry.query}</span>
                <span className="recent-search-meta">
                  <RecentSearchTime value={entry.searchedAt} preferredLanguage={preferredLanguage} />
                </span>
              </button>
              {!multiSelect ? (
                <button
                  type="button"
                  className="recent-search-remove"
                  aria-label={t('sidebar.removeRecentSearch', { query: entry.query })}
                  onClick={() => {
                    onRemove(entry.id)
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </div>
          )
        })}
        {bottomSpacerHeight > 0 ? <div className="recent-search-spacer" style={{ height: bottomSpacerHeight }} /> : null}
      </div>
      <div className="recent-scrollbar" ref={listScrollbarTrackRef} aria-hidden="true">
        <div className="recent-scrollbar-thumb" onPointerDown={onListScrollbarPointerDown} />
      </div>
    </div>
  )
}

function RecentSearchTime({ value, preferredLanguage }: { value: string; preferredLanguage: PreferredLanguage }) {
  const label = formatRecentDateTime(value, preferredLanguage)
  return label ? <small>{label}</small> : null
}

function getSearchTypeIcon(type: SearchHistoryEntry['type']): IconName {
  const icons: Record<SearchHistoryType, IconName> = {
    sidebar: 'search',
    artists: 'users',
    albums: 'albums',
    songs: 'songs',
    playlists: 'playlists',
    folders: 'folder',
  }

  return icons[type]
}
