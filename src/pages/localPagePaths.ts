export function buildLocalRoute(relativePath: string) {
  if (!relativePath) {
    return '/local'
  }

  return `/local/${relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

export function decodeLocalRoute(routeValue: string | undefined) {
  return (routeValue ?? '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join('/')
}
