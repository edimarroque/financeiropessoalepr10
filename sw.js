// Service worker: permite instalar como app e abrir a tela mesmo com internet ruim.
// Arquivos do próprio site: tenta a rede primeiro (sempre a versão mais nova), cai no cache se estiver offline.
// Chamadas ao Supabase (dados) NUNCA são guardadas em cache.
const CACHE = 'financeiro-v3';
const ARQUIVOS = [
  '/', '/index.html', '/css/style.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/config.js', '/js/db.js', '/js/state.js', '/js/calc.js', '/js/ui.js', '/js/seed.js',
  '/js/views/painel.js', '/js/views/lancamentos.js', '/js/views/cartoes.js', '/js/views/cadastros.js',
  '/js/views/mais.js', '/js/views/form-lancamento.js', '/js/views/importar.js', '/js/import/parsers.js',
  '/js/views/dashboards.js', '/js/views/novidades.js', '/js/views/ajuda.js', '/js/versoes.js',
  '/js/components/periodo.js', '/js/components/calendario.js', '/js/components/graficos.js', '/js/components/visual.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase/CDN: direto na rede
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
