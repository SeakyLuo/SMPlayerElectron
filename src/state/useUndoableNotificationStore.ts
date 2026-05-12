import { create } from 'zustand'

interface UndoableNotification {
  id: number
  message: string
  buttonText?: string
  action?: () => void | Promise<void>
}

interface UndoableNotificationStoreState {
  notification: UndoableNotification | null
  show: (message: string, buttonText: string, action: () => void | Promise<void>, duration?: number) => void
  showMessage: (message: string, duration?: number) => void
  dismiss: () => void
  run: () => Promise<void>
}

let nextNotificationId = 1
let dismissTimer: number | null = null

function clearDismissTimer() {
  if (dismissTimer != null) {
    window.clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

export const useUndoableNotificationStore = create<UndoableNotificationStoreState>((set, get) => ({
  notification: null,
  show: (message, buttonText, action, duration = 5000) => {
    clearDismissTimer()
    const id = nextNotificationId++
    set({
      notification: {
        id,
        message,
        buttonText,
        action,
      },
    })
    dismissTimer = window.setTimeout(() => {
      if (get().notification?.id === id) {
        set({ notification: null })
      }
    }, duration)
  },
  showMessage: (message, duration = 5000) => {
    clearDismissTimer()
    const id = nextNotificationId++
    set({
      notification: {
        id,
        message,
      },
    })
    dismissTimer = window.setTimeout(() => {
      if (get().notification?.id === id) {
        set({ notification: null })
      }
    }, duration)
  },
  dismiss: () => {
    clearDismissTimer()
    set({ notification: null })
  },
  run: async () => {
    const current = get().notification
    if (!current?.action) {
      return
    }

    clearDismissTimer()
    set({ notification: null })
    await current.action()
  },
}))
