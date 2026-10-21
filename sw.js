const CACHE = 'mediavault-v11';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
];

// Install: pre-cache all known assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for page navigations (so a normal refresh always shows
// whatever is actually deployed); cache-first for static assets (fonts, icon
// CSS, JS libraries) since those rarely change; network-only for Supabase
// API, auth, and TMDB (live data).
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Pass live API calls straight through — let them fail naturally offline
  if (url.includes('supabase.co/rest') ||
      url.includes('supabase.co/auth') ||
      url.includes('supabase.co/functions') ||
      url.includes('themoviedb.org') ||
      url.includes('fonts.gstatic.com')) {
    return;
  }

  // Page navigations: try the network first so deployed changes show up on
  // the very next normal refresh — no hard-refresh needed. Only fall back to
  // the last cached copy of the shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Everything else: cache-first, falling back to network and caching what we get.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (e.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {});
    })
  );
});
