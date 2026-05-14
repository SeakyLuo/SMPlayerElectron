type PopupDialogCloseHandler = () => void

const POPUP_DIALOG_STACK_CHANGE_EVENT = 'smplayer-popup-dialog-stack-change'
const closeHandlers: PopupDialogCloseHandler[] = []

function emitStackChange() {
  document.body.classList.toggle('popup-dialog-open', closeHandlers.length > 0)
  window.dispatchEvent(new CustomEvent<number>(POPUP_DIALOG_STACK_CHANGE_EVENT, {
    detail: closeHandlers.length,
  }))
}

export function addPopupDialogCloseHandler(closeHandler: PopupDialogCloseHandler) {
  closeHandlers.push(closeHandler)
  emitStackChange()

  return () => {
    const index = closeHandlers.lastIndexOf(closeHandler)
    if (index >= 0) {
      closeHandlers.splice(index, 1)
      emitStackChange()
    }
  }
}

export function closeTopPopupDialog() {
  const closeHandler = closeHandlers[closeHandlers.length - 1]
  if (!closeHandler) {
    return false
  }

  closeHandler()
  return true
}

export function subscribePopupDialogStackChange(onChange: (depth: number) => void) {
  const handleStackChange = (event: Event) => {
    onChange((event as CustomEvent<number>).detail)
  }

  window.addEventListener(POPUP_DIALOG_STACK_CHANGE_EVENT, handleStackChange)
  onChange(closeHandlers.length)

  return () => {
    window.removeEventListener(POPUP_DIALOG_STACK_CHANGE_EVENT, handleStackChange)
  }
}
