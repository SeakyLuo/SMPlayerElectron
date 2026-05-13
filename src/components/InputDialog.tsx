import { useEffect, useRef, useState } from 'react'

import type { Translator } from '../shared/i18n'

export function InputDialog({
  t,
  title,
  defaultValue,
  placeholder,
  confirmText = t('common.confirm'),
  validate,
  onCancel,
  onConfirm,
}: {
  t: Translator
  title: string
  defaultValue: string
  placeholder?: string
  confirmText?: string
  validate?: (value: string) => string
  onCancel: () => void
  onConfirm: (value: string) => void | Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mountedRef = useRef(true)
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()

    return () => {
      mountedRef.current = false
    }
  }, [])

  const confirm = async () => {
    if (submitting) {
      return
    }

    const nextValue = value.trim()
    const validationError = validate?.(nextValue) ?? ''
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      await onConfirm(nextValue)
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="input-dialog-overlay" role="presentation">
      <section className="input-dialog" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title">
        <h3 id="input-dialog-title">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={submitting}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.currentTarget.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void confirm()
            } else if (event.key === 'Escape' && !submitting) {
              onCancel()
            }
          }}
        />
        {error ? <p className="input-dialog-error">{error}</p> : null}
        <div className="input-dialog-actions">
          <button
            type="button"
            className={`input-dialog-primary${submitting ? ' is-loading' : ''}`}
            disabled={submitting}
            onClick={() => {
              void confirm()
            }}
          >
            {submitting ? <span className="input-dialog-button-spinner" aria-hidden="true" /> : null}
            <span>{confirmText}</span>
          </button>
          <button type="button" disabled={submitting} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
