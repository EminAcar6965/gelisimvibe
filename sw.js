const CACHE = 'gv-v10';
const hasCaches = (typeof caches !== 'undefined');

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  // Sadece GET istekleri
  if (e.request.method !== 'GET') return;

  // Farklı origin ve reklam isteklerine dokunma
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googlesyndication')) return;
  if (e.request.url.includes('doubleclick')) return;
  if (e.request.url.includes('googleadservices')) return;
  if (!e.request.url.startsWith('http')) return;

  // iOS Lockdown Mode gibi durumlarda caches tanımsız olabilir.
  // Bu durumda service worker hiçbir şeye müdahale etmesin.
  if (!hasCaches) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        try {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
        } catch (_) {}
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(r =>
          r || new Response('', { status: 504, statusText: 'Offline' })
        )
      )
  );
});
