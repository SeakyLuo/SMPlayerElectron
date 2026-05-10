import { useEffect, useRef, useState } from 'react'

import type { Translator } from '../shared/i18n'

export function InputDialog({
  t,
  title,
  defaultValue,
  placeholder,
  validate,
  onCancel,
  onConfirm,
}: {
  t: Translator
  title: string
  defaultValue: string
  placeholder?: string
  validate?: (value: string) => string
  onCancel: () => void
  onConfirm: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const nextValue = value.trim()
    const validationError = validate?.(nextValue) ?? ''
    if (validationError) {
      setError(validationError)
      return
    }

    onConfirm(nextValue)
  }

  return (
    <div className="input-dialog-overlay" role="presentation">
      <section className="input-dialog" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title">
        <h3 id="input-dialog-title">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.currentTarget.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              confirm()
            } else if (event.key === 'Escape') {
              onCancel()
            }
          }}
        />
        {error ? <p className="input-dialog-error">{error}</p> : null}
        <div className="input-dialog-actions">
          <button type="button" className="input-dialog-primary" onClick={confirm}>
            {t('common.confirm')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
