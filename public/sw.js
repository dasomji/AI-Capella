// Build replaces this manifest with exact public output paths. No API or runtime HTML is stored.
const PUBLIC_ASSETS = /* PUBLIC_ASSETS */ [];
const CACHE = 'lightscore-public-/* BUILD_ID */';
const allowed = (request) => {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin && !url.search && PUBLIC_ASSETS.includes(url.pathname);
};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS))));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if ((key.startsWith('ai-capella-') || key.startsWith('lightscore-public-')) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/app' && !url.search && request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
  } else if (allowed(request)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request)) || fetch(request))());
  }
});
