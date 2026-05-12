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
      <span className="undoable-notification-message">{notification.message}</span>
      {notification.action ? (
        <button className="undoable-notification-action" type="button" onClick={() => void run()}>
          {notification.buttonText}
        </button>
      ) : null}
      <button className="undoable-notification-close" type="button" aria-label="Close" onClick={dismiss}>
        <Icon name="close" />
      </button>
    </div>
  )
}
