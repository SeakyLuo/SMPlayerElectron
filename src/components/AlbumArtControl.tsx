import type { ReactNode } from 'react'

import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { useSongArtwork } from '../hooks/useSongArtwork'

interface AlbumArtControlProps {
  title: string
  artworkUrl: string
  songId?: number
  className?: string
  fallbackClassName?: string
  fallbackArtwork?: boolean
  fallbackText?: ReactNode
  onLoad?: () => void
}

export function AlbumArtControl({ title, artworkUrl, songId, className, fallbackClassName, fallbackArtwork = true, fallbackText, onLoad }: AlbumArtControlProps) {
  const { artworkUrl: effectiveArtworkUrl, refreshArtwork } = useSongArtwork(songId, artworkUrl)

  return (
    <ArtworkImage
      className={`album-art-control${className ? ` ${className}` : ''}`}
      src={effectiveArtworkUrl}
      title={title}
      onError={refreshArtwork}
      onLoad={onLoad}
      renderFallback={() => (
        <div className={`album-art-control album-art-control-fallback${className ? ` ${className}` : ''}${fallbackClassName ? ` ${fallbackClassName}` : ''}`} aria-hidden="true">
          {fallbackArtwork ? <DefaultAlbumArtwork className="album-art-control-fallback-image" /> : null}
          {fallbackText ? <span>{fallbackText}</span> : null}
        </div>
      )}
    />
  )
}
