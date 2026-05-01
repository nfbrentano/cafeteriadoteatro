/* =========================================================
   SW.JS — Service Worker Básica para Cafeteria do Teatro
   ========================================================= */

const CACHE_NAME = 'cafeteria-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/cardapio.html',
  '/css/base.css',
  '/css/components.css',
  '/css/home.css',
  '/css/cardapio.css',
  '/assets/icons/favicon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Instalação: Cacheia ativos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Estratégia Stale-While-Revalidate (serve do cache e atualiza)
self.addEventListener('fetch', (event) => {
  // Ignora requisições para Supabase ou CDNs externos se necessário, 
  // mas aqui vamos focar no core app.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Atualiza o cache com a nova resposta
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback offline para navegação
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
