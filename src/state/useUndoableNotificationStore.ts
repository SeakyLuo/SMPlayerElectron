import { create } from 'zustand'

interface UndoableNotification {
  id: number
  message: string
  actions: UndoableNotificationAction[]
  onDismiss?: () => void | Promise<void>
}

interface UndoableNotificationAction {
  text: string
  action: () => void | Promise<void>
}

interface UndoableNotificationStoreState {
  notification: UndoableNotification | null
  show: (message: string, buttonText: string, action: () => void | Promise<void>, duration?: number, onDismiss?: () => void | Promise<void>) => void
  showButtons: (message: string, actions: UndoableNotificationAction[], duration?: number, onDismiss?: () => void | Promise<void>) => void
  showMessage: (message: string, duration?: number) => void
  dismiss: () => void
  run: (actionIndex?: number) => Promise<void>
}

let nextNotificationId = 1
let dismissTimer: number | null = null

function clearDismissTimer() {
  if (dismissTimer != null) {
    window.clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

function runDismiss(notification: UndoableNotification | null) {
  if (notification?.onDismiss) {
    void notification.onDismiss()
  }
}

export const useUndoableNotificationStore = create<UndoableNotificationStoreState>((set, get) => ({
  notification: null,
  show: (message, buttonText, action, duration = 5000, onDismiss) => {
    get().showButtons(message, [{ text: buttonText, action }], duration, onDismiss)
  },
  showButtons: (message, actions, duration = 5000, onDismiss) => {
    clearDismissTimer()
    runDismiss(get().notification)
    const id = nextNotificationId++
    set({
      notification: {
        id,
        message,
        actions,
        onDismiss,
      },
    })
    dismissTimer = window.setTimeout(() => {
      const current = get().notification
      if (current?.id === id) {
        set({ notification: null })
        runDismiss(current)
      }
    }, duration)
  },
  showMessage: (message, duration = 2000) => {
    clearDismissTimer()
    runDismiss(get().notification)
    const id = nextNotificationId++
    set({
      notification: {
        id,
        message,
        actions: [],
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
    runDismiss(get().notification)
    set({ notification: null })
  },
  run: async (actionIndex = 0) => {
    const current = get().notification
    const action = current?.actions[actionIndex]
    if (!action) {
      return
    }

    clearDismissTimer()
    set({ notification: null })
    await action.action()
  },
}))
