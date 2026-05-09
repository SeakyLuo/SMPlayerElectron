import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { useSongArtwork } from '../hooks/useSongArtwork'

interface AlbumArtControlProps {
  title: string
  artworkUrl: string
  songId?: number
  className?: string
  fallbackClassName?: string
  fallbackText?: string
}

export function AlbumArtControl({ title, artworkUrl, songId, className, fallbackClassName, fallbackText }: AlbumArtControlProps) {
  const { artworkUrl: effectiveArtworkUrl, refreshArtwork } = useSongArtwork(songId, artworkUrl)

  return (
    <ArtworkImage
      className={`album-art-control${className ? ` ${className}` : ''}`}
      src={effectiveArtworkUrl}
      title={title}
      onError={refreshArtwork}
      renderFallback={() => (
        <div className={`album-art-control album-art-control-fallback${className ? ` ${className}` : ''}${fallbackClassName ? ` ${fallbackClassName}` : ''}`} aria-hidden="true">
          <DefaultAlbumArtwork className="album-art-control-fallback-image" />
          {fallbackText ? <span>{fallbackText}</span> : null}
        </div>
      )}
    />
  )
}
