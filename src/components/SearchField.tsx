import type { FocusEvent, FormEvent, MouseEvent, ReactNode, Ref } from 'react'

import { Icon } from './icons'

interface SearchFieldProps {
  id: string
  label: string
  value: string
  placeholder: string
  searchLabel: string
  clearLabel: string
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClear: () => void
  inputRef?: Ref<HTMLInputElement>
  dropdown?: ReactNode
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  onCommitButtonClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function SearchField({
  id,
  label,
  value,
  placeholder,
  searchLabel,
  clearLabel,
  onValueChange,
  onSubmit,
  onClear,
  inputRef,
  dropdown,
  onFocus,
  onBlur,
  onCommitButtonClick,
}: SearchFieldProps) {
  return (
    <div className="search-shell">
      <label htmlFor={id}>{label}</label>
      <div className="search-field-shell">
        <form className={`search-form${value ? ' has-query' : ''}`} onSubmit={onSubmit}>
          <button
            className="search-commit-button"
            type="submit"
            aria-label={searchLabel}
            data-tooltip={searchLabel}
            onClick={onCommitButtonClick}
          >
            <Icon name="search" />
          </button>
          <input
            ref={inputRef}
            id={id}
            type="search"
            placeholder={placeholder}
            value={value}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(event) => {
              onValueChange(event.currentTarget.value)
            }}
          />
          {value ? (
            <button
              className="search-clear-button"
              type="button"
              title={clearLabel}
              aria-label={clearLabel}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={onClear}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </form>
        {dropdown}
      </div>
    </div>
  )
}
