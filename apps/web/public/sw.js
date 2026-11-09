/* Cook for Friends service worker (W3-06). Hand-written, no dependencies.
 *
 * Caches ONLY: /_next/static/** (hashed build assets + fonts), /icons/**, and
 * the offline fallback pages. NEVER caches HTML of any page, /api/**,
 * /admin/**, account/auth pages, video, or anything carrying credentials.
 * Navigations are network-only; when offline they get the fallback page.
 * Bump VERSION to invalidate; old caches are deleted on activate.
 */
const VERSION = "v1"
const STATIC_CACHE = `cff-static-${VERSION}`
const OFFLINE_CACHE = `cff-offline-${VERSION}`
const CACHE_PREFIX = "cff-"
const OFFLINE_URLS = ["/offline.html?lang=fr", "/offline.html?lang=en"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== STATIC_CACHE && k !== OFFLINE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Static, non-personalised assets only. */
function isCacheableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")
}

function offlineFor(url) {
  const lang = url.pathname.startsWith("/en") ? "en" : "fr"
  return caches.match(`/offline.html?lang=${lang}`).then((res) => res || Response.error())
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    // Network-only. Never store the HTML.
    event.respondWith(fetch(request).catch(() => offlineFor(url)))
    return
  }

  if (!isCacheableAsset(url) || request.headers.has("range") || request.headers.has("authorization")) return

  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok && res.type === "basic") cache.put(request, res.clone())
            return res
          }),
      ),
    ),
  )
})
