import { useEffect, useState } from 'react'

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

/** The path inside the app (without the deploy base). Used by the signed-out screens, which sit outside the router. */
const here = () => (window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname) || '/'

export function usePath(): string {
  const [path, setPath] = useState(here)
  useEffect(() => {
    const on = () => setPath(here())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path
}

export function go(to: string, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', base + to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}
