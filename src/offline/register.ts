import { setSync } from './state'

let waiting: ServiceWorker | null = null

/** Store the app for offline use (production builds only). A new version is announced, never applied by surprise. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const url = `${import.meta.env.BASE_URL}sw.js`
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).then((reg) => {
      const announce = (w: ServiceWorker | null) => { if (w && navigator.serviceWorker.controller) { waiting = w; setSync({ updateReady: true }) } }
      announce(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => { if (w.state === 'installed') announce(w) })
      })
      // Look for a new version now and then, and when the tab is shown again.
      const check = () => { void reg.update().catch(() => undefined) }
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    }).catch(() => undefined)
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; window.location.reload() } })
  })
}

/** The user chose to update: let the waiting version take over; the page reloads when it does. */
export function applyUpdate() {
  if (waiting) waiting.postMessage('SKIP_WAITING')
  else window.location.reload()
}
