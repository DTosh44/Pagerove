// Cache only a public offline notice. Household data and API responses stay network-only.
const CACHE = 'pagerove-offline-v3';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/offline.html', '/offline.css'])),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pagerove-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const navigation = event.request.mode === 'navigate';
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    (!navigation && url.pathname !== '/offline.css')
  )
    return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const response = await caches.match(navigation ? '/offline.html' : '/offline.css');
      if (!response) throw new Error('Offline notice is unavailable.');
      // Workers Assets canonicalises .html URLs. Rebuild the cached response so a
      // redirected precache response is valid for a navigation with redirect=manual.
      return new Response(response.body, { status: response.status, headers: response.headers });
    }),
  );
});
