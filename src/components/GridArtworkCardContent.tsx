import type { MouseEvent, ReactNode } from 'react'

import { ArtworkImage } from './ArtworkImage'
import { DefaultAlbumArtwork } from './DefaultAlbumArtwork'
import { Icon, type IconName } from './icons'

const NOT_FOUND_ARTWORK_URL = '/colorful_bg_wide.png'

export interface GridArtworkAction {
  key: string
  title: string
  icon: IconName
  disabled?: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
}

interface GridArtworkCardContentProps {
  title: string
  subtitle: ReactNode
  artworkUrls: string[]
  fallbackIcon: IconName
  badge?: ReactNode
  selectedMark?: ReactNode
  actions?: GridArtworkAction[]
}

export function GridArtworkCardContent({
  title,
  subtitle,
  artworkUrls,
  fallbackIcon,
  badge,
  selectedMark,
  actions = [],
}: GridArtworkCardContentProps) {
  const renderFallbackArtwork = () => fallbackIcon === 'folder' || fallbackIcon === 'playlists'
    ? <img className="grid-artwork-card-fallback-image" src={NOT_FOUND_ARTWORK_URL} alt="" />
    : <DefaultAlbumArtwork className="grid-artwork-card-fallback-image" />

  return (
    <>
      <span className={`grid-artwork-card-cover artwork-count-${artworkUrls.length <= 2 ? 1 : artworkUrls.length}`} aria-hidden="true">
        {artworkUrls.length === 0 ? (
          <span className="grid-artwork-card-cover-fallback">
            {renderFallbackArtwork()}
          </span>
        ) : artworkUrls.length <= 2 ? (
          <ArtworkImage
            className="grid-artwork-card-image"
            src={artworkUrls[0]}
            title={title}
            renderFallback={() => (
              <span className="grid-artwork-card-cover-fallback">
                {renderFallbackArtwork()}
              </span>
            )}
          />
        ) : (
          <>
            {artworkUrls.slice(0, 4).map((artworkUrl, index) => (
              <ArtworkImage
                className="grid-artwork-card-image"
                key={`${artworkUrl}:${index}`}
                src={artworkUrl}
                title={title}
                renderFallback={() => (
                  <span className="grid-artwork-card-cover-fallback grid-artwork-card-cover-tile-fallback">
                    {renderFallbackArtwork()}
                  </span>
                )}
              />
            ))}
            {artworkUrls.length === 3 ? (
              <span className="grid-artwork-card-cover-fallback grid-artwork-card-cover-tile-fallback">
                {renderFallbackArtwork()}
              </span>
            ) : null}
          </>
        )}
        {badge}
      </span>
      {selectedMark}
      <span className="grid-artwork-card-copy">
        <strong className="grid-artwork-card-title">{title}</strong>
        <span className="grid-artwork-card-subtitle">{subtitle}</span>
      </span>
      {actions.length > 0 ? (
        <span className="grid-artwork-card-actions">
          {actions.map((action) => (
            <button
              disabled={action.disabled}
              key={action.key}
              title={action.title}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void action.onClick(event)
              }}
            >
              <Icon name={action.icon} />
            </button>
          ))}
        </span>
      ) : null}
    </>
  )
}
