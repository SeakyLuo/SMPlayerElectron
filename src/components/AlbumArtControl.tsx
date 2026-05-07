import { Icon } from './icons'
import { ArtworkImage } from './ArtworkImage'
import { useEffect, useState } from 'react'

interface AlbumArtControlProps {
  title: string
  artworkUrl: string
  songId?: number
  className?: string
  fallbackClassName?: string
  fallbackText?: string
}

export function AlbumArtControl({ title, artworkUrl, songId, className, fallbackClassName, fallbackText }: AlbumArtControlProps) {
  const [resolvedArtwork, setResolvedArtwork] = useState<{ songId: number; artworkUrl: string } | null>(null)
  const effectiveArtworkUrl = artworkUrl || (resolvedArtwork && resolvedArtwork.songId === songId ? resolvedArtwork.artworkUrl : '')

  useEffect(() => {
    if (artworkUrl || songId == null) {
      return
    }

    let canceled = false
    void window.smplayer?.getSongArtwork(songId).then((nextArtworkUrl) => {
      if (!canceled) {
        setResolvedArtwork({ songId, artworkUrl: nextArtworkUrl })
      }
    })

    return () => {
      canceled = true
    }
  }, [artworkUrl, songId])

  return (
    <ArtworkImage
      className={`album-art-control${className ? ` ${className}` : ''}`}
      src={effectiveArtworkUrl}
      title={title}
      renderFallback={() => (
        <div className={`album-art-control album-art-control-fallback${className ? ` ${className}` : ''}${fallbackClassName ? ` ${fallbackClassName}` : ''}`} aria-hidden="true">
          <Icon name="albums" />
          {fallbackText ? <span>{fallbackText}</span> : null}
        </div>
      )}
    />
  )
}
