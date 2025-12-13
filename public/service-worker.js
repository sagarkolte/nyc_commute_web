const CACHE_NAME = 'nyc-commute-v1';

// URLs to cache immediately
const PRECACHE_URLS = [
    '/',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. API Calls: Network First
    // We don't want to show stale arrival times.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // Optional: Return a fallback JSON or just let it fail
                    // return new Response(JSON.stringify({ error: 'Offline' }), { headers: { 'Content-Type': 'application/json' } });
                    return caches.match(event.request); // Fallback to cache if available? Unlikely for realtime data.
                })
        );
        return;
    }

    // 2. Next.js Static/Build Assets: Stale-While-Revalidate or Cache First
    // For simplicity, we'll use a general strategy for everything else.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                // Don't cache non-successful calls or API calls that slipped through
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clone/Cache validation
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            });
        })
    );
});
