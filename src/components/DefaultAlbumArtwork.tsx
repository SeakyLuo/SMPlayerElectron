export const DEFAULT_ALBUM_ARTWORK_URL = '/monotone_bg_wide.png'

interface DefaultAlbumArtworkProps {
  className: string
  title?: string
}

export function DefaultAlbumArtwork({ className, title = '' }: DefaultAlbumArtworkProps) {
  return <img className={className} src={DEFAULT_ALBUM_ARTWORK_URL} alt={title ? `${title} artwork` : ''} aria-hidden={!title} />
}
