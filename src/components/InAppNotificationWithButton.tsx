import { Icon } from './icons'
import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

export function InAppNotificationWithButton() {
  const notification = useUndoableNotificationStore((state) => state.notification)
  const dismiss = useUndoableNotificationStore((state) => state.dismiss)
  const run = useUndoableNotificationStore((state) => state.run)

  if (!notification) {
    return null
  }

  return (
    <div className="undoable-notification" role="status">
      <span>{notification.message}</span>
      <button type="button" onClick={() => void run()}>
        {notification.buttonText}
      </button>
      <button type="button" aria-label="Close" onClick={dismiss}>
        <Icon name="close" />
      </button>
    </div>
  )
}
