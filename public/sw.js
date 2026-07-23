/* AutoBrand cache reset service worker.
 * This intentionally does not intercept requests. It replaces stale older
 * service workers, clears their caches, and lets all dashboard/publishing
 * requests reach the current server code directly.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
