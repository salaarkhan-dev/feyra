/* Minimal service worker for Feyra PWA */
const CACHE_NAME = 'feyra-v1';

// Derive base path from the service worker location (e.g., /feyra/)
const SW_PATH = self.location.pathname; // e.g., /feyra/service-worker.js or /service-worker.js
const BASE_PATH = SW_PATH.replace(/service-worker\.js$/, ''); // e.g., /feyra/ or /

const CORE_ASSETS = [
  BASE_PATH, // app shell
  BASE_PATH + 'site.webmanifest',
  BASE_PATH + 'android-chrome-192x192.png',
  BASE_PATH + 'android-chrome-512x512.png',
  BASE_PATH + 'apple-touch-icon.png',
  BASE_PATH + 'favicon-32x32.png',
  BASE_PATH + 'favicon-16x16.png',
  BASE_PATH + 'favicon.ico',
  // Precache audio so reminder sounds are always available
  BASE_PATH + 'sounds/toast.mp3',
  BASE_PATH + 'sounds/reminder.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Helpers
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (e) {
    return cached || new Response(null, { status: 504 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || network || new Response(null, { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Audio: CacheFirst for fast playback
  const isAudio = /\.(mp3|ogg)(\?|$)/i.test(pathname) || pathname.includes('/sounds/');
  if (isAudio) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Shaders (if any .glsl files or /shaders/ route): Stale-While-Revalidate
  const isShader = /\.(glsl)(\?|$)/i.test(pathname) || pathname.includes('/shaders/');
  if (isShader) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        const respClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response(null, { status: 504 })))
  );
});
