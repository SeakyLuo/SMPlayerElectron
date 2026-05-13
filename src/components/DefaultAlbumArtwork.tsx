export { DEFAULT_ALBUM_ARTWORK_URL } from '../shared/staticAssets'
import { DEFAULT_ALBUM_ARTWORK_URL } from '../shared/staticAssets'

interface DefaultAlbumArtworkProps {
  className: string
  title?: string
}

export function DefaultAlbumArtwork({ className, title = '' }: DefaultAlbumArtworkProps) {
  return (
    <span className={`default-album-artwork ${className}`} aria-hidden={!title} aria-label={title ? `${title} artwork` : undefined}>
      <img className="default-album-artwork-logo" src={DEFAULT_ALBUM_ARTWORK_URL} alt="" />
    </span>
  )
}
