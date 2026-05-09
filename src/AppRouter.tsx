import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavigationType, Router, createPath, type To } from 'react-router-dom'

function normalizeRoutePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function getPathFromTarget(target: To) {
  return normalizeRoutePath(typeof target === 'string' ? target : createPath(target))
}

function getLocationFromHash() {
  const routePath = normalizeRoutePath(window.location.hash.slice(1) || '/')
  const url = new URL(routePath, 'http://smplayer.local')

  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    state: window.history.state,
    key: `${Date.now()}`,
  }
}

export function AppRouter({ children }: { children: ReactNode }) {
  const [routerState, setRouterState] = useState(() => ({
    action: NavigationType.Pop,
    location: getLocationFromHash(),
  }))

  const navigator = useMemo(() => ({
    createHref(target: To) {
      return `#${getPathFromTarget(target)}`
    },
    go(delta: number) {
      window.history.go(delta)
    },
    push(target: To, state?: unknown) {
      const routePath = getPathFromTarget(target)
      window.history.pushState(state, '', `#${routePath}`)
      setRouterState({
        action: NavigationType.Push,
        location: getLocationFromHash(),
      })
    },
    replace(target: To, state?: unknown) {
      const routePath = getPathFromTarget(target)
      window.history.replaceState(state, '', `#${routePath}`)
      setRouterState({
        action: NavigationType.Replace,
        location: getLocationFromHash(),
      })
    },
  }), [])

  useEffect(() => {
    const syncLocation = () => {
      setRouterState({
        action: NavigationType.Pop,
        location: getLocationFromHash(),
      })
    }

    window.addEventListener('hashchange', syncLocation)
    window.addEventListener('popstate', syncLocation)
    return () => {
      window.removeEventListener('hashchange', syncLocation)
      window.removeEventListener('popstate', syncLocation)
    }
  }, [])

  return (
    <Router
      location={routerState.location}
      navigationType={routerState.action}
      navigator={navigator}
    >
      {children}
    </Router>
  )
}
