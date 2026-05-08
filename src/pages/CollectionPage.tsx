import { Link } from 'react-router-dom'

import { ArtworkImage } from '../components/ArtworkImage'
import { DefaultAlbumArtwork } from '../components/DefaultAlbumArtwork'
import type { CollectionCardData } from '../data/mockLibrary'
import type { Translator } from '../shared/i18n'

interface CollectionPageProps {
  title: string
  description: string
  items: CollectionCardData[]
  t?: Translator
  eyebrow?: string
  emptyTitle?: string
  emptyCopy?: string
  getItemPath?: (item: CollectionCardData) => string
}

export function CollectionPage({
  title,
  description,
  items,
  t,
  eyebrow,
  emptyTitle,
  emptyCopy,
  getItemPath,
}: CollectionPageProps) {
  return (
    <section className="page-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow ?? t?.('collection.library') ?? 'Library collection'}</p>
          <h2>{title}</h2>
          <p className="page-copy">{description}</p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="empty-state">
          <h3>{emptyTitle ?? t?.('collection.emptyTitle') ?? 'Nothing here yet'}</h3>
          <p>
            {emptyCopy ??
              t?.(
                'collection.emptyCopy',
              ) ??
              'This view will populate once the library and playback state have data to show.'}
          </p>
        </div>
      ) : (
        <div className="collection-grid">
          {items.map((item) => (
            getItemPath ? (
              <Link
                className="collection-card collection-card-link"
                key={`${item.title}-${item.subtitle}`}
                to={getItemPath(item)}
              >
                <CollectionArtwork title={item.title} artworkUrl={item.artworkUrl} />
                <h3>{item.title}</h3>
                <p className="collection-subtitle">{item.subtitle}</p>
                <p className="collection-detail">{item.detail}</p>
              </Link>
            ) : (
              <article className="collection-card" key={`${item.title}-${item.subtitle}`}>
                <CollectionArtwork title={item.title} artworkUrl={item.artworkUrl} />
                <h3>{item.title}</h3>
                <p className="collection-subtitle">{item.subtitle}</p>
                <p className="collection-detail">{item.detail}</p>
              </article>
            )
          ))}
        </div>
      )}
    </section>
  )
}

function CollectionArtwork({
  title,
  artworkUrl,
}: {
  title: string
  artworkUrl?: string
}) {
  return (
    <ArtworkImage
      className="collection-artwork"
      src={artworkUrl ?? ''}
      title={title}
      renderFallback={() => (
        <div className="collection-artwork collection-artwork-fallback" aria-hidden="true">
          <DefaultAlbumArtwork className="collection-artwork-fallback-image" />
        </div>
      )}
    />
  )
}
