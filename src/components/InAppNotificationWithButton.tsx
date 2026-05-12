import { useUndoableNotificationStore } from '../state/useUndoableNotificationStore'

export function InAppNotificationWithButton() {
  const notification = useUndoableNotificationStore((state) => state.notification)
  const run = useUndoableNotificationStore((state) => state.run)

  if (!notification) {
    return null
  }

  const hasActions = notification.actions.length > 0

  return (
    <div className={hasActions ? 'undoable-notification undoable-notification-with-action' : 'undoable-notification'} role="status">
      <span className="undoable-notification-message">{notification.message}</span>
      {hasActions ? (
        <div className="undoable-notification-actions">
          {notification.actions.map((action, index) => (
            <button key={`${action.text}-${index}`} className="undoable-notification-action" type="button" onClick={() => void run(index)}>
              {action.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
