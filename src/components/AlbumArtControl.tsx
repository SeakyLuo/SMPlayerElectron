import { Icon } from './icons'
import { ArtworkImage } from './ArtworkImage'

interface AlbumArtControlProps {
  title: string
  artworkUrl: string
}

export function AlbumArtControl({ title, artworkUrl }: AlbumArtControlProps) {
  return (
    <ArtworkImage
      className="album-art-control"
      src={artworkUrl}
      title={title}
      renderFallback={() => (
        <div className="album-art-control album-art-control-fallback" aria-hidden="true">
          <Icon name="albums" />
        </div>
      )}
    />
  )
}
