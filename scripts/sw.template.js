/* RapidBill service worker. Generated into dist/sw.js at build time (see vite.config.ts): the version and file list below are filled in.
 *
 * - The whole app (code, styles, fonts, both languages) is stored on install, so it opens with no connection.
 * - A new version waits until the page asks for it (no surprise reload in the middle of a bill).
 * - Anything under the API path, other origins and non-GET requests are never touched.
 */
const VERSION = '__VERSION__'
const CACHE = `rapidbill-${VERSION}`
const PRECACHE = __PRECACHE__
const scope = self.registration.scope
const abs = (p) => new URL(p, scope).toString()

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map(abs))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rapidbill-') && k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms)
  p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith(new URL('api/', scope).pathname)) return

  // Page loads: the network if it answers quickly (so a fresh deploy is picked up), otherwise the stored app shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await withTimeout(fetch(req), 3000) } catch { /* offline or slow */ }
      return (await caches.match(abs('index.html'))) || Response.error()
    })())
    return
  }

  // Files: stored copy first (their names change with their content), then the network.
  event.respondWith((async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    try {
      const res = await fetch(req)
      if (res.ok && url.pathname.startsWith(new URL('assets/', scope).pathname)) (await caches.open(CACHE)).put(req, res.clone())
      return res
    } catch {
      return Response.error()
    }
  })())
})
