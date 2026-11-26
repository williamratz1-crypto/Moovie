/**
 * Moovie service worker.
 *
 * This file lives in `public/` so Vite copies it to the build output verbatim —
 * it must NOT be hashed, because the manifest/registration point at a stable
 * `sw.js` path. Everything it precaches is likewise served from the site root
 * (previously the manifest and icon were hashed into `assets/`, which made
 * `cache.addAll()` reject and silently killed the whole service worker).
 *
 * The cache name is versioned so a deploy rotates the cache; `activate` deletes
 * every older one.
 */
const CACHE_NAME = 'moovie-shell-v2';

// All relative to the service worker's own URL, so this keeps working when the
// app is deployed under a sub-path (e.g. /app/).
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './moovie-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Add entries individually: one missing file must not abort the install
      // (that is exactly how the service worker used to end up permanently
      // unregistered when this list drifted from the build output).
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // TMDB, Firebase and the player iframe are cross-origin: never touch them.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first so a fresh deploy is picked up immediately; fall back to
    // the cached shell so an offline deep link still boots the app.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(async () => (
          (await caches.match(request))
          || (await caches.match('./index.html'))
          || Response.error()
        )),
    );
    return;
  }

  // Static assets carry content hashes in their filenames, so cache-first is
  // safe and avoids a network round trip on every reload.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    })),
  );
});
