/**
 * sw.js — Service Worker for offline cache.
 *
 * Strategy: Network First with cache fallback.
 * - Navigation requests (HTML): serves from cache if the network fails.
 * - Assets (JS/CSS/fonts): serves from cache if the network fails.
 * - External requests (Cloudflare ping, Cognito API): go straight to the network,
 *   never cached — the connectivity monitor needs them to fail in order to
 *   detect offline correctly.
 *
 * The cache name includes a version. When CACHE_VERSION changes,
 * the SW installs a new cache and removes the old one on activate.
 */

const CACHE_VERSION = "v2";
const CACHE_NAME    = `sia-cache-${CACHE_VERSION}`;

// Local assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/chat.html",
  "/policies.html",
  "/manifest.webmanifest",
];

// External domains that are NEVER cached
const BYPASS_ORIGINS = [
  "1.1.1.1",
  "cognito-idp",
  "amazonaws.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// ----------------------------------------------------------------
// Install: pre-cache HTML pages
// ----------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    // A resource that fails must not prevent the rest from installing
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  // Activate immediately without waiting for previous tabs to close
  self.skipWaiting();
});

// ----------------------------------------------------------------
// Activate: clean up old caches
// ----------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ----------------------------------------------------------------
// Fetch: Network First with cache fallback
// ----------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Let external requests pass through untouched
  const isBypass = BYPASS_ORIGINS.some(
    (origin) => url.hostname.includes(origin)
  );
  if (isBypass) return;

  // Only intercept GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Valid response — update cache and return
        if (response && response.status === 200 && response.type !== "opaque") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, responseClone)
          );
        }
        return response;
      })
      .catch(() => {
        // No network — try the cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // If there is no cache for this resource, return the index page as fallback
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          // For uncached assets, return an empty response that does not break the SW
          return new Response("", { status: 503, statusText: "Offline" });
        });
      })
  );
});
