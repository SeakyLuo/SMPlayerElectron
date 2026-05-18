import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface ArtworkImageProps {
  src: string
  className: string
  title: string
  onError?: () => void
  onLoad?: () => void
  renderFallback: () => ReactNode
  showFallbackWhileLoading?: boolean
}

export function ArtworkImage({ src, className, title, onError, onLoad, renderFallback, showFallbackWhileLoading = true }: ArtworkImageProps) {
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set())
  const [loadedSrcs, setLoadedSrcs] = useState<Set<string>>(new Set())
  const failed = failedSrcs.has(src)
  const loaded = loadedSrcs.has(src)

  useEffect(() => {
    if (!showFallbackWhileLoading || !src || failed || loaded) {
      return
    }

    let disposed = false
    const image = new Image()
    image.onload = () => {
      if (!disposed) {
        setLoadedSrcs((current) => new Set(current).add(src))
      }
    }
    image.onerror = () => {
      if (!disposed) {
        setFailedSrcs((current) => new Set(current).add(src))
        onError?.()
      }
    }
    image.src = src

    return () => {
      disposed = true
    }
  }, [failed, loaded, onError, showFallbackWhileLoading, src])

  if (!src || failed) {
    return renderFallback()
  }

  if (showFallbackWhileLoading && !loaded) {
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
      onLoad={() => {
        setLoadedSrcs((current) => new Set(current).add(src))
        onLoad?.()
      }}
    />
  )
}
