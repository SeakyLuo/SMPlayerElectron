const ARTWORK_COLOR_MIN_VALUE = 10
const ARTWORK_COLOR_MAX_VALUE = 205
const ARTWORK_COLOR_GRID_DIVISIONS = 16
const DEFAULT_ARTWORK_COLOR_RGB = '91, 135, 182'

export function getDefaultArtworkColorRgb() {
  return DEFAULT_ARTWORK_COLOR_RGB
}

function getArtworkColorDistance(red: number, green: number, blue: number) {
  return (
    (red - ARTWORK_COLOR_MIN_VALUE) ** 2 +
    (green - ARTWORK_COLOR_MIN_VALUE) ** 2 +
    (blue - ARTWORK_COLOR_MIN_VALUE) ** 2
  )
}

export async function extractArtworkColorRgb(artworkUrl: string) {
  if (!artworkUrl) {
    return getDefaultArtworkColorRgb()
  }

  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => {
      resolve()
    }
    image.onerror = () => {
      reject(new Error('Failed to load artwork.'))
    }
    image.src = artworkUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width <= 0 || canvas.height <= 0) {
    return getDefaultArtworkColorRgb()
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let selected = [91, 135, 182]
  let selectedDistance = -1

  for (let xIndex = 1; xIndex < ARTWORK_COLOR_GRID_DIVISIONS; xIndex += 1) {
    for (let yIndex = 1; yIndex < ARTWORK_COLOR_GRID_DIVISIONS; yIndex += 1) {
      const x = Math.min(canvas.width - 1, Math.floor((canvas.width * xIndex) / ARTWORK_COLOR_GRID_DIVISIONS))
      const y = Math.min(canvas.height - 1, Math.floor((canvas.height * yIndex) / ARTWORK_COLOR_GRID_DIVISIONS))
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data

      if (
        alpha === 0 ||
        red < ARTWORK_COLOR_MIN_VALUE ||
        red > ARTWORK_COLOR_MAX_VALUE ||
        green < ARTWORK_COLOR_MIN_VALUE ||
        green > ARTWORK_COLOR_MAX_VALUE ||
        blue < ARTWORK_COLOR_MIN_VALUE ||
        blue > ARTWORK_COLOR_MAX_VALUE
      ) {
        continue
      }

      const distance = getArtworkColorDistance(red, green, blue)
      if (distance > selectedDistance) {
        selected = [red, green, blue]
        selectedDistance = distance
      }
    }
  }

  return selected.join(', ')
}
