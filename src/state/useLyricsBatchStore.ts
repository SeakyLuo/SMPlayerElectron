import { create } from 'zustand'

export type LyricsBatchJobStatus = 'idle' | 'running' | 'paused' | 'canceling' | 'canceled' | 'done'
export type LyricsBatchDetailResult = 'saved' | 'overwritten' | 'skipped' | 'missing' | 'failed'

export interface LyricsBatchRunOptions {
  overwriteWithBackup: boolean
}

export interface LyricsBatchJobState {
  status: LyricsBatchJobStatus
  currentIndex: number
  total: number
  currentSong: string
  saved: number
  overwritten: number
  skipped: number
  missing: number
  failed: number
  backupCount: number
  backupBytes: number
  message: string
}

export interface LyricsBatchDetailItem {
  id: string
  songId: number
  title: string
  result: LyricsBatchDetailResult
  reason?: string
  sourceRawLyrics?: string
  targetRawLyrics?: string
}

export interface LyricsBatchStoreState {
  lyricsJob: LyricsBatchJobState
  lyricsJobRunId: number
  runOptions: LyricsBatchRunOptions
  details: LyricsBatchDetailItem[]
  beginLyricsJob: (total: number, message: string, options: LyricsBatchRunOptions) => number
  updateLyricsJob: (runId: number, update: Partial<LyricsBatchJobState>) => void
  pushDetail: (runId: number, detail: LyricsBatchDetailItem) => void
  pauseLyricsJob: () => void
  resumeLyricsJob: () => void
  cancelLyricsJob: (message: string) => void
  finishLyricsJob: (runId: number, status: 'done' | 'canceled', message: string) => void
  resetLyricsJob: () => void
}

function createLyricsBatchJobState(total: number): LyricsBatchJobState {
  return {
    status: 'idle',
    currentIndex: 0,
    total,
    currentSong: '',
    saved: 0,
    overwritten: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
    backupCount: 0,
    backupBytes: 0,
    message: '',
  }
}

export const useLyricsBatchStore = create<LyricsBatchStoreState>((set, get) => ({
  lyricsJob: createLyricsBatchJobState(0),
  lyricsJobRunId: 0,
  runOptions: { overwriteWithBackup: false },
  details: [],
  beginLyricsJob: (total, message, options) => {
    const runId = get().lyricsJobRunId + 1
    set({
      lyricsJobRunId: runId,
      runOptions: options,
      details: [],
      lyricsJob: {
        status: 'running',
        currentIndex: 0,
        total,
        currentSong: '',
        saved: 0,
        overwritten: 0,
        skipped: 0,
        missing: 0,
        failed: 0,
        backupCount: 0,
        backupBytes: 0,
        message,
      },
    })
    return runId
  },
  updateLyricsJob: (runId, update) => {
    if (get().lyricsJobRunId !== runId) {
      return
    }

    set((state) => ({
      lyricsJob: {
        ...state.lyricsJob,
        ...update,
      },
    }))
  },
  pushDetail: (runId, detail) => {
    if (get().lyricsJobRunId !== runId) {
      return
    }

    set((state) => ({ details: [...state.details, detail] }))
  },
  pauseLyricsJob: () => {
    if (get().lyricsJob.status !== 'running') {
      return
    }

    set((state) => ({
      lyricsJob: {
        ...state.lyricsJob,
        status: 'paused',
        message: state.lyricsJob.message || 'Paused',
      },
    }))
  },
  resumeLyricsJob: () => {
    if (get().lyricsJob.status !== 'paused') {
      return
    }

    set((state) => ({
      lyricsJob: {
        ...state.lyricsJob,
        status: 'running',
      },
    }))
  },
  cancelLyricsJob: (message) => {
    if (get().lyricsJob.status !== 'running' && get().lyricsJob.status !== 'paused') {
      return
    }

    set((state) => ({
      lyricsJob: {
        ...state.lyricsJob,
        status: 'canceling',
        message,
      },
    }))
  },
  finishLyricsJob: (runId, status, message) => {
    if (get().lyricsJobRunId !== runId) {
      return
    }

    set((state) => ({
      lyricsJob: {
        ...state.lyricsJob,
        status,
        currentSong: '',
        message,
      },
    }))
  },
  resetLyricsJob: () => {
    const runId = get().lyricsJobRunId + 1
    set((state) => ({
      lyricsJobRunId: runId,
      details: [],
      lyricsJob: {
        ...state.lyricsJob,
        status: 'idle',
        currentSong: '',
        saved: 0,
        overwritten: 0,
        skipped: 0,
        missing: 0,
        failed: 0,
        backupCount: 0,
        backupBytes: 0,
        currentIndex: 0,
        message: '',
      },
    }))
  },
}))

