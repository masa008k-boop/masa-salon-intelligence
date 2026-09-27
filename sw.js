const CACHE = 'masa-salon-phase1-20260925';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest'];
const assetUrls = ASSETS.map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(assetUrls.map(url => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCacheName = 'masa-salon-v1';
    if (!(await caches.keys()).includes(oldCacheName)) return;
    const oldCache = await caches.open(oldCacheName);
    // Cache Storage is shared by origin; preserve entries belonging to other apps.
    for (const request of await oldCache.keys()) {
      if (assetUrls.includes(request.url)) await oldCache.delete(request);
    }
    if ((await oldCache.keys()).length === 0) await caches.delete(oldCacheName);
  })());
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.open(CACHE).then(cache =>
    cache.match(event.request).then(response => response || fetch(event.request))
  ));
});
