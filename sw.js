/* =========================================================
   SW.JS — Service Worker Otimizado | Cafeteria do Teatro
   Performance · Estratégia Híbrida de Cache · Suporte Offline
   ========================================================= */

const STATIC_CACHE = 'cafeteria-static-v3';
const RUNTIME_CACHE = 'cafeteria-runtime-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/cardapio.html',
  '/404.html',
  '/manifest.json',
  '/css/base.css',
  '/css/components.css',
  '/css/home.css',
  '/css/cardapio.css',
  '/css/promocoes.css',
  '/css/curtain.css',
  '/js/supabase-client.js',
  '/js/db.js',
  '/js/home-dynamic.js',
  '/js/curtain.js',
  '/js/main.js',
  '/js/cardapio-dynamic.js',
  '/js/cardapio.js',
  '/assets/icons/favicon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Instalação: Pré-cache dos ativos estáticos principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Erro ao pré-cachear alguns ativos:', err);
      });
    })
  );
  self.skipWaiting();
});

// Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Gerenciamento inteligente de requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Apenas requisições GET
  if (request.method !== 'GET') return;

  // Ignorar protocolos não suportados (ex: chrome-extension)
  if (!url.protocol.startsWith('http')) return;

  // Não interceptar requisições ao painel admin, rotas de autenticação ou chamadas REST da API do Supabase
  if (
    url.pathname.includes('/admin') ||
    url.pathname.includes('/auth/v1') ||
    (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1'))
  ) {
    return; // Deixa o navegador ir direto para a rede
  }

  // 1. Navegação de páginas HTML -> Network First com fallback para cache/offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 2. Fontes do Google e CDNs estáticos -> Cache First com revalidação
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        }).catch(() => null);
      })
    );
    return;
  }

  // 3. Ativos estáticos locais (CSS, JS, Imagens locais) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
