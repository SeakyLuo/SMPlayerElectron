import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { createPortal } from 'react-dom'

import { Icon } from '../components/icons'
import type {
  PreferenceEntityType,
  PreferenceItemSnapshot,
  PreferenceLevel,
} from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { usePreferenceStore } from '../state/usePreferenceStore'

interface PreferenceSettingsPageProps {
  t: Translator
  onClose: () => void
}

const preferenceLevels: PreferenceLevel[] = [
  'very-high',
  'higher',
  'high',
  'normal',
  'dislike',
  'do-not-appear',
]

type PreferenceSectionKey = 'songs' | 'artists' | 'albums' | 'playlists' | 'folders'

const preferenceSectionLimits: Record<PreferenceSectionKey, number> = {
  songs: 100,
  artists: 50,
  albums: 50,
  playlists: 30,
  folders: 30,
}

export function PreferenceSettingsPage({ t, onClose }: PreferenceSettingsPageProps) {
  const snapshot = usePreferenceStore((state) => state.snapshot)
  const error = usePreferenceStore((state) => state.error)
  const refresh = usePreferenceStore((state) => state.refresh)
  const updatePreferenceSettings = usePreferenceStore((state) => state.updateSettings)
  const updatePreferenceItem = usePreferenceStore((state) => state.updateItem)
  const removePreferenceItem = usePreferenceStore((state) => state.removeItem)
  const clearInvalidPreferenceItems = usePreferenceStore((state) => state.clearInvalidItems)
  const [expandedSections, setExpandedSections] = useState<Set<PreferenceSectionKey>>(new Set())
  const preferencePageRef = useRef<HTMLDivElement | null>(null)
  const preferenceScrollFrameRef = useRef<HTMLDivElement | null>(null)
  const preferenceScrollbarTrackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    void refresh()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, refresh])

  const updateSettings = async (section: PreferenceSectionKey, enabled: boolean) => {
    await updatePreferenceSettings({ [section]: enabled })
  }

  const updateItem = async (item: PreferenceItemSnapshot, update: { isEnabled?: boolean; level?: PreferenceLevel }) => {
    await updatePreferenceItem(item, update)
  }

  const removeItem = async (item: PreferenceItemSnapshot) => {
    await removePreferenceItem(item)
  }

  const clearInvalid = async (type: PreferenceEntityType) => {
    await clearInvalidPreferenceItems(type)
  }

  const toggleExpanded = (section: PreferenceSectionKey) => {
    setExpandedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  useLayoutEffect(() => {
    const scrollFrame = preferenceScrollFrameRef.current
    const scrollContainer = preferencePageRef.current
    if (!scrollFrame || !scrollContainer) {
      return
    }

    let animationFrame = 0
    const updateScrollbar = () => {
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      const trackHeight = scrollContainer.clientHeight
      const thumbHeight = maxScrollTop > 0
        ? Math.max(38, Math.round((trackHeight / scrollContainer.scrollHeight) * trackHeight))
        : trackHeight
      const thumbTop = maxScrollTop > 0
        ? Math.round((scrollContainer.scrollTop / maxScrollTop) * Math.max(0, trackHeight - thumbHeight))
        : 0

      scrollFrame.style.setProperty('--preference-scrollbar-thumb-height', `${thumbHeight}px`)
      scrollFrame.style.setProperty('--preference-scrollbar-thumb-top', `${thumbTop}px`)
      scrollFrame.classList.toggle('has-scrollbar', maxScrollTop > 1)
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateScrollbar)
    }

    updateScrollbar()
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(scrollFrame)
    resizeObserver.observe(scrollContainer)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scrollContainer.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [snapshot, expandedSections])

  const onPreferenceScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollContainer = preferencePageRef.current
    const scrollFrame = preferenceScrollFrameRef.current
    const scrollbarTrack = preferenceScrollbarTrackRef.current
    if (!scrollContainer || !scrollFrame || !scrollbarTrack) {
      return
    }

    event.preventDefault()
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const thumbHeight = Number.parseFloat(getComputedStyle(scrollFrame).getPropertyValue('--preference-scrollbar-thumb-height'))
    const trackRange = Math.max(1, scrollbarTrack.clientHeight - thumbHeight)
    const scrollPerPixel = maxScrollTop / trackRange
    const startY = event.clientY
    const startScrollTop = scrollContainer.scrollTop
    const onPointerMove = (moveEvent: PointerEvent) => {
      scrollContainer.scrollTop = startScrollTop + (moveEvent.clientY - startY) * scrollPerPixel
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  if (!snapshot) {
    return createPortal(
      <div
        className="settings-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <section className="settings-modal preference-modal" role="dialog" aria-modal="true">
          <header>
            <h2>{t('settings.preferenceSettings')}</h2>
            <button type="button" onClick={onClose} aria-label={t('common.close')}>
              <Icon name="arrowLeft" className="dialog-back-icon" />
              <Icon name="close" className="dialog-close-icon" />
            </button>
            <span className="dialog-titlebar-title">{t('app.shell')}</span>
          </header>
          <div className="preference-loading">{error || t('preferences.loading')}</div>
        </section>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className="settings-modal preference-modal" role="dialog" aria-modal="true">
        <header>
          <h2>{t('settings.preferenceSettings')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="arrowLeft" className="dialog-back-icon" />
            <Icon name="close" className="dialog-close-icon" />
          </button>
          <span className="dialog-titlebar-title">{t('app.shell')}</span>
        </header>
        <div className="preference-scroll-frame" ref={preferenceScrollFrameRef}>
          <div className="preference-page" ref={preferencePageRef}>
          <div className="preference-info">
            <span aria-hidden="true">i</span>
            <p>{t('preferences.info')}</p>
          </div>
          <PreferenceSection
            title={t('preferences.songs')}
            section="songs"
            limit={preferenceSectionLimits.songs}
            enabled={snapshot.enabled.songs}
            items={snapshot.songs}
            expanded={expandedSections.has('songs')}
            t={t}
            onClearInvalid={clearInvalid}
            onRemove={removeItem}
            onToggleEnabled={updateSettings}
            onToggleExpanded={toggleExpanded}
            onUpdateItem={updateItem}
          />
          <PreferenceSection
            title={t('preferences.artists')}
            section="artists"
            limit={preferenceSectionLimits.artists}
            enabled={snapshot.enabled.artists}
            items={snapshot.artists}
            expanded={expandedSections.has('artists')}
            t={t}
            onClearInvalid={clearInvalid}
            onRemove={removeItem}
            onToggleEnabled={updateSettings}
            onToggleExpanded={toggleExpanded}
            onUpdateItem={updateItem}
          />
          <PreferenceSection
            title={t('preferences.albums')}
            section="albums"
            limit={preferenceSectionLimits.albums}
            enabled={snapshot.enabled.albums}
            items={snapshot.albums}
            expanded={expandedSections.has('albums')}
            t={t}
            onClearInvalid={clearInvalid}
            onRemove={removeItem}
            onToggleEnabled={updateSettings}
            onToggleExpanded={toggleExpanded}
            onUpdateItem={updateItem}
          />
          <PreferenceSection
            title={t('preferences.playlists')}
            section="playlists"
            limit={preferenceSectionLimits.playlists}
            enabled={snapshot.enabled.playlists}
            items={snapshot.playlists}
            expanded={expandedSections.has('playlists')}
            t={t}
            onClearInvalid={clearInvalid}
            onRemove={removeItem}
            onToggleEnabled={updateSettings}
            onToggleExpanded={toggleExpanded}
            onUpdateItem={updateItem}
          />
          <PreferenceSection
            title={t('preferences.folders')}
            section="folders"
            limit={preferenceSectionLimits.folders}
            enabled={snapshot.enabled.folders}
            items={snapshot.folders}
            expanded={expandedSections.has('folders')}
            t={t}
            onClearInvalid={clearInvalid}
            onRemove={removeItem}
            onToggleEnabled={updateSettings}
            onToggleExpanded={toggleExpanded}
            onUpdateItem={updateItem}
          />
          <section className="preference-section">
            <div className="preference-section-header">
              <div className="preference-section-title">
                <strong>{t('settings.others')}</strong>
                <span>{snapshot.others.length}</span>
              </div>
            </div>
            <PreferenceItems
              items={snapshot.others}
              t={t}
              onRemove={removeItem}
              onUpdateItem={updateItem}
            />
          </section>
          </div>
          <div className="preference-scrollbar" ref={preferenceScrollbarTrackRef} aria-hidden="true">
            <div className="preference-scrollbar-thumb" onPointerDown={onPreferenceScrollbarPointerDown} />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function PreferenceSection({
  title,
  section,
  limit,
  enabled,
  items,
  expanded,
  t,
  onClearInvalid,
  onRemove,
  onToggleEnabled,
  onToggleExpanded,
  onUpdateItem,
}: {
  title: string
  section: PreferenceSectionKey
  limit: number
  enabled: boolean
  items: PreferenceItemSnapshot[]
  expanded: boolean
  t: Translator
  onClearInvalid: (type: PreferenceEntityType) => void
  onRemove: (item: PreferenceItemSnapshot) => void
  onToggleEnabled: (section: PreferenceSectionKey, enabled: boolean) => void
  onToggleExpanded: (section: PreferenceSectionKey) => void
  onUpdateItem: (item: PreferenceItemSnapshot, update: { isEnabled?: boolean; level?: PreferenceLevel }) => void
}) {
  const visibleItems = expanded ? items : items.slice(0, 5)
  const hasInvalid = items.some((item) => !item.isValid)

  return (
    <section className="preference-section">
      <div className="preference-section-header">
        <div className="preference-section-title">
          <strong>{title}</strong>
          <span>{items.length}/{limit}</span>
        </div>
        <div className="preference-section-actions">
          <button
            type="button"
            className="preference-section-switch"
            role="switch"
            aria-checked={enabled}
            onClick={() => {
              void onToggleEnabled(section, !enabled)
            }}
          >
            <span aria-hidden="true" />
            <em>{enabled ? t('preferences.enabled') : t('preferences.disabled')}</em>
          </button>
          <span className="preference-header-spacer" aria-hidden="true" />
          {items.length > 5 ? (
            <button className="preference-expand-button" type="button" onClick={() => onToggleExpanded(section)}>
              <span className={expanded ? 'is-expanded' : ''} aria-hidden="true" />
              {expanded ? t('preferences.collapse') : t('preferences.expand')}
            </button>
          ) : null}
          {hasInvalid ? (
            <button
              type="button"
              className="preference-clear-button"
              onClick={() => {
                void onClearInvalid(items[0].type)
              }}
            >
              {t('preferences.clearInvalid')}
            </button>
          ) : null}
        </div>
      </div>
      {items.length > 0 ? (
        <PreferenceItems items={visibleItems} t={t} onRemove={onRemove} onUpdateItem={onUpdateItem} />
      ) : (
        <div className="preference-empty">{t('preferences.noItems')}</div>
      )}
    </section>
  )
}

function PreferenceItems({
  items,
  t,
  onRemove,
  onUpdateItem,
}: {
  items: PreferenceItemSnapshot[]
  t: Translator
  onRemove: (item: PreferenceItemSnapshot) => void
  onUpdateItem: (item: PreferenceItemSnapshot, update: { isEnabled?: boolean; level?: PreferenceLevel }) => void
}) {
  return (
    <div className="preference-list">
      {items.map((item) => {
        const itemName = getPreferenceItemName(item, t)

        return (
          <div className="preference-item" key={item.id} title={item.tooltip}>
            <div className="preference-item-copy">
              <strong>{itemName}</strong>
              {!item.isValid ? <span>{t('preferences.invalid')}</span> : null}
            </div>
            {item.canRemove ? (
              <button
                type="button"
                className="preference-remove"
                aria-label={t('playlists.removeSelected')}
                title={t('playlists.removeSelected')}
                onClick={() => {
                  void onRemove(item)
                }}
              >
                <Icon name="close" />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <button
              type="button"
              className="preference-item-switch"
              role="switch"
              aria-checked={item.isEnabled}
              onClick={() => {
                void onUpdateItem(item, { isEnabled: !item.isEnabled })
              }}
            >
              <span aria-hidden="true" />
              <em>{item.isEnabled ? t('preferences.enabled') : t('preferences.disabled')}</em>
            </button>
            <PreferenceLevelSelect
              value={item.level}
              t={t}
              onChange={(level) => {
                void onUpdateItem(item, { level })
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

function PreferenceLevelSelect({
  value,
  t,
  onChange,
}: {
  value: PreferenceLevel
  t: Translator
  onChange: (level: PreferenceLevel) => void
}) {
  const [open, setOpen] = useState(false)
  const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuElement?.contains(target)) {
        return
      }

      setOpen(false)
    }

    document.addEventListener('pointerdown', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true)
    }
  }, [menuElement, open])

  return (
    <div
      className="preference-level-select"
      ref={setMenuElement}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className="preference-level-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <span>{t(`preferences.level.${value}`)}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} />
      </button>
      {open ? (
        <>
          <div className="dropdown-dismiss-layer" onPointerDown={() => setOpen(false)} />
          <div className="preference-level-menu" role="listbox">
            {preferenceLevels.map((level) => (
              <button
                type="button"
                role="option"
                aria-selected={level === value}
                className={level === value ? 'is-selected' : ''}
                key={level}
                onClick={() => {
                  onChange(level)
                  setOpen(false)
                }}
              >
                {t(`preferences.level.${level}`)}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function getPreferenceItemName(item: PreferenceItemSnapshot, t: Translator) {
  if (
    item.type === 'recent-added' ||
    item.type === 'my-favorites' ||
    item.type === 'most-played' ||
    item.type === 'least-played'
  ) {
    return t(`preferences.builtin.${item.type}`)
  }

  return item.name
}
