import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import type { HeaderedPlaylistType } from './HeaderedPlaylistControl'

export function HeaderedPlaylistCover({
  artworkUrls,
  title,
  type,
}: {
  artworkUrls: string[]
  title: string
  type: HeaderedPlaylistType
}) {
  if (artworkUrls.length >= 3 && type !== 'album') {
    return (
      <span className="headered-playlist-cover headered-playlist-cover-mosaic" aria-hidden="true">
        {artworkUrls.slice(0, 4).map((artworkUrl, index) => (
          <img
            alt=""
            key={`${artworkUrl}:${index}`}
            src={artworkUrl}
          />
        ))}
        {artworkUrls.length === 3 ? (
          <span className="headered-playlist-cover-mosaic-fallback">
            <img src="/colorful_bg_wide.png" alt="" />
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <ArtworkImage
      className="headered-playlist-cover"
      src={artworkUrls[0] ?? ''}
      title={title}
      renderFallback={() => (
        <div className="headered-playlist-cover headered-playlist-cover-fallback" aria-hidden="true">
          {type === 'album'
            ? <DefaultAlbumArtwork className="headered-playlist-cover-fallback-image" />
            : <DefaultAlbumArtwork className="headered-playlist-cover-fallback-image" />}
        </div>
      )}
    />
  )
}
