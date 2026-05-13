import { useState } from 'react'
import type { ReactNode } from 'react'

interface ArtworkImageProps {
  src: string
  className: string
  title: string
  onError?: () => void
  renderFallback: () => ReactNode
}

export function ArtworkImage({ src, className, title, onError, renderFallback }: ArtworkImageProps) {
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set())

  if (!src || failedSrcs.has(src)) {
    return renderFallback()
  }

  return (
    <img
      className={className}
      src={src}
      alt={`${title} artwork`}
      onError={() => {
        setFailedSrcs((current) => new Set(current).add(src))
        onError?.()
      }}
    />
  )
}
