export interface TextDialogRequest {
  title: string
  defaultValue: string
  placeholder?: string
  validate?: (value: string) => string
  resolve: (value: string | null) => void
}

export interface ConfirmDialogRequest {
  title: string
  message: string
  confirmText?: string
  resolve: (value: boolean) => void
}

let showTextDialog: (request: TextDialogRequest) => void
let showConfirmDialog: (request: ConfirmDialogRequest) => void

export function bindDialogService({
  onTextDialog,
  onConfirmDialog,
}: {
  onTextDialog: (request: TextDialogRequest) => void
  onConfirmDialog: (request: ConfirmDialogRequest) => void
}) {
  showTextDialog = onTextDialog
  showConfirmDialog = onConfirmDialog
}

export function requestTextDialog(options: Omit<TextDialogRequest, 'resolve'>) {
  return new Promise<string | null>((resolve) => {
    showTextDialog({ ...options, resolve })
  })
}

export function requestConfirmDialog(options: Omit<ConfirmDialogRequest, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    showConfirmDialog({ ...options, resolve })
  })
}
