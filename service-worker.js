const CACHE_NAME = 'voice-test-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './prompt.txt',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  'https://unpkg.com/pinyin-pro'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
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
  // We only cache GET requests
  if (event.request.method !== 'GET') return;
  // Skip cross-origin API calls if any (e.g. to OpenAI API)
  if (event.request.url.includes('api.openai.com')) return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cache if found, else fetch from network
        return response || fetch(event.request).then(
          (fetchResponse) => {
            // Optionally cache new dynamic assets here if needed
            return fetchResponse;
          }
        );
      })
  );
});