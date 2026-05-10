import { useEffect, useState } from 'react'

import type { Translator } from '../shared/i18n'
import { bindDialogService, type ConfirmDialogRequest, type TextDialogRequest } from './dialogService'
import { InputDialog } from './InputDialog'
import { RemoveDialog } from './RemoveDialog'

export function DialogHost({ t }: { t: Translator }) {
  const [textDialog, setTextDialog] = useState<TextDialogRequest | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogRequest | null>(null)

  useEffect(() => {
    bindDialogService({
      onTextDialog: setTextDialog,
      onConfirmDialog: setConfirmDialog,
    })
  }, [])

  const closeTextDialog = (value: string | null) => {
    textDialog!.resolve(value)
    setTextDialog(null)
  }

  const closeConfirmDialog = (value: boolean) => {
    confirmDialog!.resolve(value)
    setConfirmDialog(null)
  }

  return (
    <>
      {textDialog ? (
        <InputDialog
          t={t}
          title={textDialog.title}
          defaultValue={textDialog.defaultValue}
          placeholder={textDialog.placeholder}
          validate={textDialog.validate}
          onCancel={() => closeTextDialog(null)}
          onConfirm={(value) => closeTextDialog(value)}
        />
      ) : null}
      {confirmDialog ? (
        <RemoveDialog
          t={t}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          onCancel={() => closeConfirmDialog(false)}
          onConfirm={() => closeConfirmDialog(true)}
        />
      ) : null}
    </>
  )
}
