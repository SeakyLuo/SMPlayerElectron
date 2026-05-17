import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties, type ForwardedRef, type PointerEvent } from 'react'

type VolumeSliderOrientation = 'horizontal' | 'vertical'

interface VolumeSliderProps {
  value: number
  disabled?: boolean
  orientation?: VolumeSliderOrientation
  className: string
  inputClassName: string
  ariaLabel: string
  showTooltipOnMount?: boolean
  onChange?: (value: number) => void
  onLiveValueChange?: (value: number) => void
}

function clampVolume(value: number) {
  return Math.min(Math.max(value, 0), 100)
}

function setForwardedRef(ref: ForwardedRef<HTMLDivElement>, node: HTMLDivElement | null) {
  if (typeof ref === 'function') {
    ref(node)
  } else if (ref) {
    ref.current = node
  }
}

export const VolumeSlider = forwardRef<HTMLDivElement, VolumeSliderProps>(function VolumeSlider({
  value,
  disabled = false,
  orientation = 'horizontal',
  className,
  inputClassName,
  ariaLabel,
  showTooltipOnMount = false,
  onChange,
  onLiveValueChange,
}, forwardedRef) {
  const initialValue = Math.round(clampVolume(value))
  const [liveValue, setLiveValue] = useState(initialValue)
  const [tooltipActive, setTooltipActive] = useState(showTooltipOnMount)
  const [draggingPointerId, setDraggingPointerId] = useState<number | null>(null)
  const liveValueRef = useRef(initialValue)
  const tooltipTimerRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const draggingPointerIdRef = useRef<number | null>(null)
  const ignoreNativeInputUntilRef = useRef(0)

  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    setForwardedRef(forwardedRef, node)
  }, [forwardedRef])

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current != null) {
      window.clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }, [])

  const keepTooltipVisible = useCallback(() => {
    if (disabled) {
      return
    }

    clearTooltipTimer()
    setTooltipActive(true)
  }, [clearTooltipTimer, disabled])

  const showTooltip = useCallback((duration = 900) => {
    if (disabled) {
      return
    }

    clearTooltipTimer()
    setTooltipActive(true)
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipActive(false)
      tooltipTimerRef.current = null
    }, duration)
  }, [clearTooltipTimer, disabled])

  const hideTooltip = useCallback(() => {
    clearTooltipTimer()
    setTooltipActive(false)
  }, [clearTooltipTimer])

  const commitValue = useCallback((rawValue: number) => {
    const nextValue = Math.round(clampVolume(rawValue))
    if (liveValueRef.current === nextValue) {
      return
    }

    liveValueRef.current = nextValue
    setLiveValue(nextValue)
    onLiveValueChange?.(nextValue)
    onChange?.(nextValue)
  }, [onChange, onLiveValueChange])

  const commitPointerValue = useCallback((clientX: number, clientY: number) => {
    const inputElement = inputRef.current!
    const rect = inputElement.getBoundingClientRect()
    const rawValue = orientation === 'vertical'
      ? ((rect.bottom - clientY) / rect.height) * 100
      : ((clientX - rect.left) / rect.width) * 100
    commitValue(rawValue)
  }, [commitValue, orientation])

  const finishPointerDrag = useCallback((pointerId: number | null, keepVisible: boolean) => {
    if (pointerId != null && draggingPointerIdRef.current !== pointerId) {
      return
    }

    draggingPointerIdRef.current = null
    ignoreNativeInputUntilRef.current = performance.now() + 120
    setDraggingPointerId(null)
    if (keepVisible) {
      showTooltip(650)
    } else {
      hideTooltip()
    }
  }, [hideTooltip, showTooltip])

  useEffect(() => {
    return () => {
      clearTooltipTimer()
    }
  }, [clearTooltipTimer])

  useEffect(() => {
    const nextValue = Math.round(clampVolume(value))
    if (draggingPointerIdRef.current == null && liveValueRef.current !== nextValue) {
      liveValueRef.current = nextValue
      setLiveValue(nextValue)
      onLiveValueChange?.(nextValue)
    }
  }, [onLiveValueChange, value])

  useEffect(() => {
    if (!showTooltipOnMount || disabled) {
      return
    }

    showTooltip(900)
  }, [disabled, showTooltip, showTooltipOnMount])

  useEffect(() => {
    if (draggingPointerId == null) {
      return
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== draggingPointerId) {
        return
      }

      commitPointerValue(event.clientX, event.clientY)
      keepTooltipVisible()
    }

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      finishPointerDrag(event.pointerId, true)
    }

    const handlePointerCancel = (event: globalThis.PointerEvent) => {
      finishPointerDrag(event.pointerId, false)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [commitPointerValue, draggingPointerId, finishPointerDrag, keepTooltipVisible])

  const style = orientation === 'vertical'
    ? {
      '--range-progress': `${liveValue}%`,
      '--volume-tooltip-bottom': `${liveValue}%`,
    } as CSSProperties
    : {
      '--range-progress': `${liveValue}%`,
      '--volume-tooltip-left': `${liveValue}%`,
      '--volume-tooltip-anchor-left': `${liveValue}%`,
    } as CSSProperties

  return (
    <div
      ref={setRootRef}
      className={`${className}${tooltipActive ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      style={style}
    >
      <input
        ref={inputRef}
        className={inputClassName}
        type="range"
        min="0"
        max="100"
        value={liveValue}
        disabled={disabled}
        style={{ '--range-progress': `${liveValue}%` } as CSSProperties}
        onChange={() => {
          keepTooltipVisible()
        }}
        onInput={(event) => {
          if (draggingPointerIdRef.current != null || performance.now() < ignoreNativeInputUntilRef.current) {
            return
          }

          commitValue(Number(event.currentTarget.value))
        }}
        onPointerDown={(event: PointerEvent<HTMLInputElement>) => {
          if (disabled) {
            return
          }

          draggingPointerIdRef.current = event.pointerId
          setDraggingPointerId(event.pointerId)
          event.currentTarget.setPointerCapture(event.pointerId)
          commitPointerValue(event.clientX, event.clientY)
          keepTooltipVisible()
        }}
        onPointerMove={(event) => {
          if (draggingPointerIdRef.current !== event.pointerId) {
            return
          }

          commitPointerValue(event.clientX, event.clientY)
          keepTooltipVisible()
        }}
        onPointerEnter={() => {
          keepTooltipVisible()
        }}
        onPointerLeave={() => {
          if (draggingPointerIdRef.current == null) {
            hideTooltip()
          }
        }}
        onPointerUp={(event) => {
          finishPointerDrag(event.pointerId, true)
        }}
        onPointerCancel={(event) => {
          finishPointerDrag(event.pointerId, false)
        }}
        onLostPointerCapture={(event) => {
          finishPointerDrag(event.pointerId, true)
        }}
        onFocus={() => {
          showTooltip(900)
        }}
        onBlur={() => {
          hideTooltip()
        }}
        aria-label={ariaLabel}
        aria-valuetext={String(liveValue)}
      />
      <span className="volume-slider-tooltip" aria-hidden="true">{liveValue}</span>
    </div>
  )
})
