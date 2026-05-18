import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { CustomScrollbar } from './CustomScrollbar'
import { Icon } from './icons'
import { PopupDialog } from './PopupDialog'
import type { AppSettingsUpdate, MusicData, LyricsRequestMode } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { getDisplayArtists } from '../shared/artists'
import { useSongArtwork } from '../hooks/useSongArtwork'
import { useCustomScrollbar } from '../hooks/useCustomScrollbar'
import type { LyricsBatchDetailItem, LyricsBatchDetailResult } from '../state/useLyricsBatchStore'
import { useLyricsBatchStore } from '../state/useLyricsBatchStore'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

interface LyricsBatchControlProps {
  t: Translator
  snapshot: MusicData
  onUpdateSettings: (update: AppSettingsUpdate) => Promise<void> | void
}

const lyricsDetailLabels: Record<LyricsBatchDetailResult, string> = {
  saved: 'settings.lyricsBatchSaved',
  overwritten: 'settings.lyricsBatchOverwritten',
  skipped: 'settings.lyricsBatchSkipped',
  missing: 'settings.lyricsBatchMissing',
  failed: 'settings.lyricsBatchFailed',
}

const lyricsReasonLabels: Record<string, string> = {
  'already-exists': 'settings.lyricsBatchReasonAlreadyExists',
  'same-content': 'settings.lyricsBatchReasonSameContent',
}

const LYRICS_DETAIL_GROUP_ORDER: LyricsBatchDetailResult[] = ['overwritten', 'saved', 'skipped', 'missing', 'failed']

type LyricsDetailSong = MusicData['songs'][number]

function normalizeLyricsForCompare(rawLyrics: string) {
  return rawLyrics.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n').trim()
}

function getStringByteSize(text: string) {
  return new TextEncoder().encode(text).length
}

function formatBytes(size: number) {
  if (size <= 0) {
    return '0 B'
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function LyricsToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="settings-row">
      <input
        className="settings-switch"
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked)
        }}
      />
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
    </label>
  )
}

function LyricsSelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionsRef = useRef<HTMLSpanElement | null>(null)
  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) {
      return
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    document.addEventListener('pointerdown', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !optionsRef.current) {
      return
    }

    const workspaceContent = menuRef.current?.closest('.workspace-content') as HTMLElement | null
    const boundaryRect = workspaceContent?.getBoundingClientRect()
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const optionsRect = optionsRef.current.getBoundingClientRect()
    const dropdownHeight = optionsRect.height || Math.max(options.length * 38 + 12, 120)
    const boundaryTop = boundaryRect?.top ?? 8
    const boundaryBottom = boundaryRect?.bottom ?? (window.innerHeight - 8)
    const spaceBelow = Math.max(0, boundaryBottom - triggerRect.bottom - 6)
    const spaceAbove = Math.max(0, triggerRect.top - boundaryTop - 6)
    const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow
    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow

    setOpenUpward(shouldOpenUpward)
    setDropdownMaxHeight(Math.max(120, Math.floor(availableSpace)))
  }, [open, options.length])

  return (
    <div className="settings-row settings-row-with-control" ref={menuRef}>
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <span className="settings-select-menu">
        <button
          ref={triggerRef}
          type="button"
          className={open ? 'settings-select-trigger is-open' : 'settings-select-trigger'}
          onClick={() => {
            setOpen((current) => !current)
          }}
        >
          <span>{selectedOption?.label}</span>
          <Icon name="chevronDown" />
        </button>
        {open ? (
          <>
            <span className="dropdown-dismiss-layer" onPointerDown={() => setOpen(false)} />
            <span
              ref={optionsRef}
              className={openUpward ? 'settings-select-options is-open-upward' : 'settings-select-options'}
              style={dropdownMaxHeight ? { maxHeight: `${dropdownMaxHeight}px` } : undefined}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === value ? 'is-selected' : ''}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Icon name={option.value === value ? 'check' : 'blank'} />
                  <span>{option.label}</span>
                </button>
              ))}
            </span>
          </>
        ) : null}
      </span>
    </div>
  )
}

export function LyricsBatchControl({ t, snapshot, onUpdateSettings }: LyricsBatchControlProps) {
  const [showStartOptions, setShowStartOptions] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [overwriteWithBackup, setOverwriteWithBackup] = useState(false)

  const lyricsJob = useLyricsBatchStore((state) => state.lyricsJob)
  const details = useLyricsBatchStore((state) => state.details)
  const beginLyricsJob = useLyricsBatchStore((state) => state.beginLyricsJob)
  const updateLyricsJob = useLyricsBatchStore((state) => state.updateLyricsJob)
  const pushDetail = useLyricsBatchStore((state) => state.pushDetail)
  const pauseLyricsJob = useLyricsBatchStore((state) => state.pauseLyricsJob)
  const resumeLyricsJob = useLyricsBatchStore((state) => state.resumeLyricsJob)
  const cancelLyricsJob = useLyricsBatchStore((state) => state.cancelLyricsJob)
  const finishLyricsJob = useLyricsBatchStore((state) => state.finishLyricsJob)
  const resetLyricsJob = useLyricsBatchStore((state) => state.resetLyricsJob)
  const showNotification = useUndoableNotificationStore((state) => state.showMessage)

  const lyricsJobActive = lyricsJob.status === 'running' || lyricsJob.status === 'paused' || lyricsJob.status === 'canceling'
  const lyricsProgressRatio = lyricsJob.total > 0 ? lyricsJob.currentIndex / lyricsJob.total : 0
  const lyricsSourceOptions: Array<{
    value: LyricsRequestMode
    label: string
  }> = [
    { value: 'auto', label: t('song.lyrics.auto') },
    { value: 'internet', label: t('settings.sourceInternet') },
    { value: 'local', label: t('settings.sourceLocal') },
    { value: 'embedded', label: t('settings.sourceEmbedded') },
  ]

  const waitForLyricsThrottle = (durationMs: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs)
    })

  const stopLyricsJob = () => {
    cancelLyricsJob(t('settings.lyricsBatchStopped'))
  }

  const startLyricsJob = async (overwriteMode: boolean) => {
    const songs = snapshot.songs
    const runId = beginLyricsJob(songs.length, t('settings.lyricsBatchStarting'), {
      overwriteWithBackup: overwriteMode,
    })
    setShowStartOptions(false)
    await waitForLyricsThrottle(0)

    let saved = 0
    let overwritten = 0
    let skipped = 0
    let missing = 0
    let failed = 0
    let backupCount = 0
    let backupBytes = 0
    let lastRequestStartedAt = 0

    const throttleRemoteLyricsRequest = async () => {
      const elapsedSinceLastRequest = Date.now() - lastRequestStartedAt
      const interval = 200
      if (lastRequestStartedAt > 0 && elapsedSinceLastRequest < interval) {
        await waitForLyricsThrottle(interval - elapsedSinceLastRequest)
      }
      lastRequestStartedAt = Date.now()
    }

    const complete = (status: 'done' | 'canceled', message: string) => {
      finishLyricsJob(runId, status, message)
      const summary = [
        `${t('settings.lyricsBatchSaved')} ${saved}`,
        `${t('settings.lyricsBatchOverwritten')} ${overwritten}`,
        `${t('settings.lyricsBatchSkipped')} ${skipped}`,
        `${t('settings.lyricsBatchMissing')} ${missing}`,
        `${t('settings.lyricsBatchFailed')} ${failed}`,
      ].join(' · ')
      const backupSummary = overwriteMode
        ? `，${t('settings.lyricsBatchBackedUp')} ${backupCount}（${formatBytes(backupBytes)}）`
        : ''
      showNotification(`${message}：${summary}${backupSummary}`, 6000)
    }

    for (const [index, song] of songs.entries()) {
      const stateBeforeLoop = useLyricsBatchStore.getState()
      if (stateBeforeLoop.lyricsJobRunId !== runId) {
        return
      }

      if (stateBeforeLoop.lyricsJob.status === 'canceling') {
        complete('canceled', t('settings.lyricsBatchStopped'))
        return
      }

      while (useLyricsBatchStore.getState().lyricsJob.status === 'paused') {
        await waitForLyricsThrottle(180)
        const pausedState = useLyricsBatchStore.getState()
        if (pausedState.lyricsJobRunId !== runId) {
          return
        }
        if (pausedState.lyricsJob.status === 'canceling') {
          complete('canceled', t('settings.lyricsBatchStopped'))
          return
        }
      }

      const stateBeforeSong = useLyricsBatchStore.getState()
      if (stateBeforeSong.lyricsJobRunId !== runId) {
        return
      }

      if (stateBeforeSong.lyricsJob.status === 'canceling') {
        complete('canceled', t('settings.lyricsBatchStopped'))
        return
      }

      updateLyricsJob(runId, {
        currentIndex: index + 1,
        currentSong: [song.title, getDisplayArtists(song, '')].filter(Boolean).join(' - '),
        message: t('settings.lyricsBatchRequesting'),
      })
      await waitForLyricsThrottle(0)

      if (useLyricsBatchStore.getState().lyricsJobRunId !== runId) {
        return
      }

      try {
        let detailReason: string | undefined
        let detailResult: LyricsBatchDetailResult = 'failed'
        let sourceRawLyrics = ''
        let targetRawLyrics = ''

        if (!overwriteMode) {
          const localLyrics = await window.smplayer!.getLyrics(song.id, 'local')
          sourceRawLyrics = localLyrics.rawText
          if (sourceRawLyrics.trim()) {
            skipped += 1
            detailResult = 'skipped'
            detailReason = 'already-exists'
          } else {
            await throttleRemoteLyricsRequest()
            const result = await window.smplayer!.saveInternetLyricsToFile(song.id)
            if (result.status === 'saved') {
              saved += 1
              detailResult = 'saved'
            } else if (result.status === 'skipped') {
              skipped += 1
              detailResult = 'skipped'
              detailReason = 'already-exists'
            } else if (result.status === 'missing') {
              missing += 1
              detailResult = 'missing'
            } else {
              failed += 1
              detailResult = 'failed'
            }
          }
        } else {
          const localLyrics = await window.smplayer!.getLyrics(song.id, 'local')
          sourceRawLyrics = localLyrics.rawText
          await throttleRemoteLyricsRequest()
          const internetLyrics = await window.smplayer!.getLyrics(song.id, 'internet')
          targetRawLyrics = internetLyrics.rawText

          if (!targetRawLyrics.trim()) {
            missing += 1
            detailResult = 'missing'
          } else if (normalizeLyricsForCompare(sourceRawLyrics) === normalizeLyricsForCompare(targetRawLyrics)) {
            skipped += 1
            detailResult = 'skipped'
            detailReason = 'same-content'
          } else {
            if (sourceRawLyrics.trim()) {
              backupCount += 1
              backupBytes += getStringByteSize(sourceRawLyrics)
            }
            await window.smplayer!.saveSongLyrics(song.id, targetRawLyrics)
            if (sourceRawLyrics.trim()) {
              overwritten += 1
              detailResult = 'overwritten'
            } else {
              saved += 1
              detailResult = 'saved'
            }
          }
        }

        if (useLyricsBatchStore.getState().lyricsJobRunId !== runId) {
          return
        }

        pushDetail(runId, {
          id: `${runId}-${song.id}-${index}`,
          songId: song.id,
          title: song.title,
          result: detailResult,
          reason: detailReason,
          sourceRawLyrics: sourceRawLyrics || undefined,
          targetRawLyrics: targetRawLyrics || undefined,
        })
      } catch {
        if (useLyricsBatchStore.getState().lyricsJobRunId !== runId) {
          return
        }
        failed += 1
        pushDetail(runId, {
          id: `${runId}-${song.id}-${index}`,
          songId: song.id,
          title: song.title,
          result: 'failed',
        })
      }

      updateLyricsJob(runId, {
        saved,
        overwritten,
        skipped,
        missing,
        failed,
        backupCount,
        backupBytes,
      })
    }

    complete('done', t('settings.lyricsBatchDone'))
  }

  const handlePrimaryAction = () => {
    if (lyricsJob.status === 'running') {
      pauseLyricsJob()
      return
    }

    if (lyricsJob.status === 'paused') {
      resumeLyricsJob()
      return
    }

    setShowStartOptions((current) => !current)
  }

  const detailCount = details.length
  const resultCountText = `${lyricsJob.currentIndex}/${lyricsJob.total}`
  const songsById = useMemo(() => {
    return new Map(snapshot.songs.map((song) => [song.id, song]))
  }, [snapshot.songs])

  return (
    <section className="settings-card">
      <header className="settings-card-header">
        <h3>{t('settings.lyrics')}</h3>
      </header>
      <div className="settings-card-body">
        <LyricsSelectRow
          label={t('settings.playerLyricsSource')}
          value={snapshot.settings.playerLyricsSource}
          options={lyricsSourceOptions}
          onChange={(value) => {
            onUpdateSettings({ playerLyricsSource: value })
          }}
        />
        <LyricsToggleRow
          label={t('settings.autoLyrics')}
          checked={snapshot.settings.autoLyrics}
          onChange={(checked) => {
            onUpdateSettings({ autoLyrics: checked })
          }}
        />
        <LyricsToggleRow
          label={t('settings.preserveLyricsTimestamps')}
          checked={snapshot.settings.preserveInternetLyricsTimestamps}
          onChange={(checked) => {
            onUpdateSettings({ preserveInternetLyricsTimestamps: checked })
          }}
        />

        <div className="lyrics-action-row">
          <button
            className="settings-link-button"
            type="button"
            disabled={snapshot.songs.length === 0 || lyricsJob.status === 'canceling'}
            onClick={handlePrimaryAction}
          >
            {lyricsJob.status === 'running'
              ? t('common.pause')
              : lyricsJob.status === 'paused'
                ? t('common.continue')
                : t('settings.batchAddLyrics')}
          </button>
          <span className="settings-hint-icon" title={t('settings.batchAddLyricsCopy')} aria-label={t('settings.batchAddLyricsCopy')}>
            <Icon name="info" />
          </span>
          {lyricsJobActive ? (
            <button className="settings-link-button" type="button" onClick={stopLyricsJob}>
              {t('common.cancel')}
            </button>
          ) : null}
          {detailCount > 0 ? (
            <button
              className="settings-link-button"
              type="button"
              onClick={() => {
                setShowDetails(true)
              }}
            >
              {t('common.detail')}
            </button>
          ) : null}
          {lyricsJob.status !== 'running' && lyricsJob.status !== 'paused' && detailCount > 0 ? (
            <button
              className="settings-link-button"
              type="button"
              onClick={() => {
                resetLyricsJob()
                setShowDetails(false)
              }}
            >
              {t('common.clear')}
            </button>
          ) : null}
        </div>

        {showStartOptions ? (
          <div className="lyrics-progress-panel">
            <div className="lyrics-progress-header">
              <strong>{t('settings.lyricsBatchWriteStrategy')}</strong>
            </div>
            <label className="settings-row">
              <input
                className="settings-switch"
                type="checkbox"
                checked={overwriteWithBackup}
                onChange={(event) => {
                  setOverwriteWithBackup(event.currentTarget.checked)
                }}
              />
              <span className="settings-row-copy">
                <strong>{t('settings.lyricsBatchOverwriteToggle')}</strong>
              </span>
            </label>
            <div className="settings-button-row">
              <button
                className="settings-link-button primary"
                type="button"
                onClick={() => {
                  void startLyricsJob(overwriteWithBackup)
                }}
              >
                {t('common.start')}
              </button>
              <button
                className="settings-link-button"
                type="button"
                onClick={() => {
                  setShowStartOptions(false)
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        {lyricsJob.status !== 'idle' ? (
          <div className="lyrics-progress-panel">
            <div className="lyrics-progress-header">
              <strong>{lyricsJob.message}</strong>
              <span>{resultCountText}</span>
            </div>
            <div className="lyrics-progress-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(lyricsProgressRatio * 100)}%` }} />
            </div>
            <div className="lyrics-progress-current">{lyricsJob.currentSong || t('settings.lyricsBatchNoCurrent')}</div>
            <div className="lyrics-progress-stats">
              <span>{t('settings.lyricsBatchSaved')} {lyricsJob.saved}</span>
              <span>{t('settings.lyricsBatchOverwritten')} {lyricsJob.overwritten}</span>
              <span>{t('settings.lyricsBatchSkipped')} {lyricsJob.skipped}</span>
              <span>{t('settings.lyricsBatchMissing')} {lyricsJob.missing}</span>
              <span>{t('settings.lyricsBatchFailed')} {lyricsJob.failed}</span>
              <span>{t('settings.lyricsBatchBackedUp')} {lyricsJob.backupCount}（{formatBytes(lyricsJob.backupBytes)}）</span>
            </div>
          </div>
        ) : null}

      </div>
      {showDetails && detailCount > 0 ? (
        <LyricsBatchDetailsDialog
          t={t}
          details={details}
          songsById={songsById}
          onClose={() => {
            setShowDetails(false)
          }}
        />
      ) : null}
    </section>
  )
}

function LyricsBatchDetailsDialog({
  t,
  details,
  songsById,
  onClose,
}: {
  t: Translator
  details: LyricsBatchDetailItem[]
  songsById: Map<number, LyricsDetailSong>
  onClose: () => void
}) {
  const groupedDetails = useMemo(() => {
    return LYRICS_DETAIL_GROUP_ORDER
      .map((result) => ({
        result,
        items: details.filter((detail) => detail.result === result),
      }))
      .filter((group) => group.items.length > 0)
  }, [details])
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)
  const [expandedLyricsById, setExpandedLyricsById] = useState<Record<string, {
    loading: boolean
    error: boolean
    before: string
    after: string
  }>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Partial<Record<LyricsBatchDetailResult, boolean>>>({})
  const scrollFrameRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const onScrollbarPointerDown = useCustomScrollbar({
    frameRef: scrollFrameRef,
    scrollContainerRef,
    scrollbarTrackRef,
    refreshDependencies: [groupedDetails],
  })
  const selectedDetail = useMemo(
    () => (selectedDetailId ? details.find((detail) => detail.id === selectedDetailId) ?? null : null),
    [details, selectedDetailId],
  )

  useEffect(() => {
    if (!selectedDetail) {
      return
    }

    if (expandedLyricsById[selectedDetail.id]) {
      return
    }

    const before = selectedDetail.sourceRawLyrics ?? ''
    const after = selectedDetail.targetRawLyrics ?? ''
    const shouldLoadWrittenLyrics =
      (selectedDetail.result === 'saved' || selectedDetail.result === 'overwritten')
      && !after.trim()

    if (!shouldLoadWrittenLyrics) {
      setExpandedLyricsById((current) => ({
        ...current,
        [selectedDetail.id]: {
          loading: false,
          error: false,
          before,
          after,
        },
      }))
      return
    }

    let disposed = false
    setExpandedLyricsById((current) => ({
      ...current,
      [selectedDetail.id]: {
        loading: true,
        error: false,
        before,
        after,
      },
    }))

    void window.smplayer!.getLyrics(selectedDetail.songId, 'local')
      .then((snapshot) => {
        if (disposed) {
          return
        }

        setExpandedLyricsById((current) => ({
          ...current,
          [selectedDetail.id]: {
            loading: false,
            error: false,
            before,
            after: snapshot.rawText,
          },
        }))
      })
      .catch(() => {
        if (disposed) {
          return
        }

        setExpandedLyricsById((current) => ({
          ...current,
          [selectedDetail.id]: {
            loading: false,
            error: true,
            before,
            after,
          },
        }))
      })

    return () => {
      disposed = true
    }
  }, [selectedDetail, expandedLyricsById])

  useEffect(() => {
    if (!selectedDetailId) {
      return
    }

    if (!details.some((detail) => detail.id === selectedDetailId)) {
      setSelectedDetailId(null)
    }
  }, [details, selectedDetailId])

  return (
    <PopupDialog
      t={t}
      overlayClassName="lyrics-detail-popup-overlay"
      className="lyrics-detail-dialog ContentDialog"
      navClassName="lyrics-detail-dialog-nav"
      navLabel={t('settings.lyricsBatchTaskDetails')}
      ariaLabelledBy="lyrics-detail-dialog-title"
      onClose={onClose}
      navChildren={(
        <div className="popup-dialog-title-block">
          <h2 id="lyrics-detail-dialog-title">{t('settings.lyricsBatchTaskDetails')}</h2>
        </div>
      )}
    >
      <div className="lyrics-detail-dialog-content custom-scrollbar-frame" ref={scrollFrameRef}>
        <div className="lyrics-detail-group-list custom-scrollbar-container" ref={scrollContainerRef}>
          {groupedDetails.map((group) => (
            <LyricsBatchDetailsGroup
              key={group.result}
              t={t}
              result={group.result}
              items={group.items}
              songsById={songsById}
              expandedLyricsById={expandedLyricsById}
              selectedDetailId={selectedDetailId}
              isCollapsed={Boolean(collapsedGroups[group.result])}
              onToggleCollapse={() => {
                setCollapsedGroups((current) => ({
                  ...current,
                  [group.result]: !current[group.result],
                }))
              }}
              onSelectDetail={(detailId) => {
                setSelectedDetailId((current) => (current === detailId ? null : detailId))
              }}
            />
          ))}
        </div>
        <CustomScrollbar
          className="lyrics-detail-dialog-scrollbar"
          scrollbarTrackRef={scrollbarTrackRef}
          onThumbPointerDown={onScrollbarPointerDown}
        />
      </div>
    </PopupDialog>
  )
}

function LyricsBatchDetailsGroup({
  t,
  result,
  items,
  songsById,
  expandedLyricsById,
  selectedDetailId,
  isCollapsed,
  onToggleCollapse,
  onSelectDetail,
}: {
  t: Translator
  result: LyricsBatchDetailResult
  items: LyricsBatchDetailItem[]
  songsById: Map<number, LyricsDetailSong>
  expandedLyricsById: Record<string, {
    loading: boolean
    error: boolean
    before: string
    after: string
  }>
  selectedDetailId: string | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelectDetail: (detailId: string) => void
}) {
  const [overwriteCanceledIds, setOverwriteCanceledIds] = useState<Record<string, boolean>>({})

  const expandedDetail = useMemo(
    () => (selectedDetailId ? items.find((item) => item.id === selectedDetailId) ?? null : null),
    [items, selectedDetailId],
  )
  const expandedState = expandedDetail ? expandedLyricsById[expandedDetail.id] : undefined
  const isOverwriteCanceled = expandedDetail ? Boolean(overwriteCanceledIds[expandedDetail.id]) : false

  return (
    <section className={`lyrics-detail-group folder-update-result-group is-${result}`}>
      <header className="lyrics-detail-group-header folder-update-result-group-header">
        <button
          type="button"
          className="folder-update-result-group-toggle lyrics-detail-group-toggle"
          onClick={onToggleCollapse}
        >
          <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} />
          <strong>{t(lyricsDetailLabels[result])}</strong>
          <span>{items.length}</span>
        </button>
      </header>
      {!isCollapsed ? (
        <div className="folder-update-result-list lyrics-detail-list-viewport">
          <div className="lyrics-detail-list-spacer">
            {items.map((detail) => {
              const song = songsById.get(detail.songId)
              const isExpanded = selectedDetailId === detail.id
              const artist = song ? getDisplayArtists(song, '') : ''

              return (
                <div key={detail.id} className="lyrics-detail-inline-row">
                  <button
                    type="button"
                    className={`folder-update-result-item is-song lyrics-detail-item is-${detail.result}${isExpanded ? ' is-expanded' : ''}`}
                    onClick={() => {
                      onSelectDetail(detail.id)
                    }}
                  >
                    <LyricsDetailArtwork song={song} fallbackTitle={detail.title} />
                    <span className="lyrics-detail-item-main">
                      <span className="folder-update-result-song-title">{detail.title}</span>
                      <small className="lyrics-detail-item-artist">{artist}</small>
                    </span>
                    <span className="lyrics-detail-item-status">
                      {detail.result === 'overwritten' ? (
                        <span className="lyrics-detail-item-status-text is-overwritten">{t(lyricsDetailLabels[detail.result])}</span>
                      ) : (
                        <span className={`lyrics-detail-item-status-text is-${detail.result}`}>
                          {t(lyricsDetailLabels[detail.result])}
                          {detail.reason ? ` (${t(lyricsReasonLabels[detail.reason] ?? detail.reason)})` : ''}
                        </span>
                      )}
                      <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} />
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className={`lyrics-detail-inline-panel${isOverwriteCanceled ? ' is-canceled' : ''}`}>
                      <LyricsDetailExpandedPanel
                        t={t}
                        detail={expandedDetail ?? detail}
                        expandedState={expandedState}
                        isOverwriteCanceled={isOverwriteCanceled}
                        onToggleOverwrite={() => {
                          if (!expandedDetail) {
                            return
                          }

                          setOverwriteCanceledIds((current) => ({
                            ...current,
                            [expandedDetail.id]: !current[expandedDetail.id],
                          }))
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function LyricsDetailArtwork({
  song,
  fallbackTitle,
}: {
  song: LyricsDetailSong | undefined
  fallbackTitle: string
}) {
  const { artworkUrl, refreshArtwork } = useSongArtwork(song?.id, song?.artworkUrl ?? '')

  return (
    <span className="folder-update-result-artwork-wrap">
      <ArtworkImage
        className="folder-update-result-artwork"
        src={artworkUrl}
        title={song?.title ?? fallbackTitle}
        onError={refreshArtwork}
        renderFallback={() => (
          <span className="folder-update-result-artwork folder-update-result-artwork-fallback" aria-hidden="true">
            <DefaultAlbumArtwork className="folder-update-result-artwork-fallback-image" />
          </span>
        )}
      />
    </span>
  )
}

function LyricsScrollablePane({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null)
  const onScrollbarPointerDown = useCustomScrollbar({
    frameRef,
    scrollContainerRef,
    scrollbarTrackRef,
  })

  return (
    <div className={`${className}-frame custom-scrollbar-frame`} ref={frameRef}>
      <div className={`${className} custom-scrollbar-container`} ref={scrollContainerRef}>
        {children}
      </div>
      <CustomScrollbar
        className={`${className}-scrollbar`}
        scrollbarTrackRef={scrollbarTrackRef}
        onThumbPointerDown={onScrollbarPointerDown}
      />
    </div>
  )
}

function LyricsDetailExpandedPanel({
  t,
  detail,
  expandedState,
  isOverwriteCanceled,
  onToggleOverwrite,
}: {
  t: Translator
  detail: LyricsBatchDetailItem
  expandedState:
    | {
      loading: boolean
      error: boolean
      before: string
      after: string
    }
    | undefined
  isOverwriteCanceled: boolean
  onToggleOverwrite: () => void
}) {
  const beforeLyrics = expandedState?.before ?? detail.sourceRawLyrics ?? ''
  const afterLyrics = expandedState?.after ?? detail.targetRawLyrics ?? ''
  const isOverwritten = detail.result === 'overwritten'

  return (
    <div className={`lyrics-detail-expanded-panel${isOverwritten ? ' is-overwritten' : ''}`}>
      {isOverwritten ? (
        <div className="lyrics-detail-overwrite-banner">
          <div className="lyrics-detail-overwrite-banner-copy">
            <Icon name="info" />
            <span>{t('settings.lyricsBatchOverwriteWarning')}</span>
          </div>
          <button
            type="button"
            className={`lyrics-detail-overwrite-toggle${isOverwriteCanceled ? ' is-canceled' : ''}`}
            onClick={onToggleOverwrite}
          >
            {isOverwriteCanceled ? t('settings.lyricsBatchAgainOverwrite') : t('settings.lyricsBatchCancelOverwrite')}
          </button>
        </div>
      ) : null}
      {isOverwritten ? (
        <div className="lyrics-detail-compare-grid">
          <section className="lyrics-detail-compare-card">
            <header className="lyrics-detail-compare-header">
              <div className="lyrics-detail-compare-header-row">
                <strong>{t('settings.lyricsBatchCurrentLyrics')}</strong>
                <span className="lyrics-detail-compare-header-badge is-old">{t('settings.lyricsBatchOldVersion')}</span>
              </div>
            </header>
            <LyricsScrollablePane className="lyrics-detail-compare-scroll">
              <pre>{beforeLyrics.trim() ? beforeLyrics : t('settings.lyricsBatchDetailNoLyrics')}</pre>
            </LyricsScrollablePane>
          </section>
          <span className="lyrics-detail-compare-arrow" aria-hidden="true">
            <Icon name="arrowRight" />
          </span>
          <section className="lyrics-detail-compare-card">
            <header className="lyrics-detail-compare-header">
              <div className="lyrics-detail-compare-header-row">
                <strong>{t('settings.lyricsBatchNewLyrics')}</strong>
                <span className="lyrics-detail-compare-header-badge is-new">{t('settings.lyricsBatchNewVersion')}</span>
              </div>
            </header>
            <LyricsScrollablePane className="lyrics-detail-compare-scroll">
              <pre>{afterLyrics.trim() ? afterLyrics : t('settings.lyricsBatchDetailNoLyrics')}</pre>
            </LyricsScrollablePane>
          </section>
        </div>
      ) : null}
      {expandedState?.loading ? <p>{t('nowPlaying.loading')}</p> : null}
      {expandedState?.error ? <p>{t('settings.lyricsBatchDetailLoadFailed')}</p> : null}
      {!isOverwritten && !expandedState?.loading && !expandedState?.error ? (
        <LyricsScrollablePane className="lyrics-detail-plain-text">
          <pre>{afterLyrics.trim() ? afterLyrics : t('settings.lyricsBatchDetailNoLyrics')}</pre>
        </LyricsScrollablePane>
      ) : null}
    </div>
  )
}

