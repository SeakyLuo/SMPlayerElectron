import { type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface CustomScrollbarProps {
  className?: string
  scrollbarTrackRef: RefObject<HTMLDivElement | null>
  onThumbPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}

export function CustomScrollbar({ className, scrollbarTrackRef, onThumbPointerDown }: CustomScrollbarProps) {
  return (
    <div className={className ? `custom-scrollbar ${className}` : 'custom-scrollbar'} ref={scrollbarTrackRef} aria-hidden="true">
      <div className="custom-scrollbar-thumb" onPointerDown={onThumbPointerDown} />
    </div>
  )
}
