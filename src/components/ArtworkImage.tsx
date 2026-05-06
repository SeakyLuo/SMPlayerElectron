import { useState } from 'react'
import type { ReactNode } from 'react'

interface ArtworkImageProps {
  src: string
  className: string
  title: string
  renderFallback: () => ReactNode
}

export function ArtworkImage({ src, className, title, renderFallback }: ArtworkImageProps) {
  const [failedSrc, setFailedSrc] = useState('')

  if (!src || src === failedSrc) {
    return renderFallback()
  }

  return (
    <img
      className={className}
      src={src}
      alt={`${title} artwork`}
      onError={() => {
        setFailedSrc(src)
      }}
    />
  )
}
