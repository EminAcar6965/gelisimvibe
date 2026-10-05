const CACHE = 'gv-v11';
const RUNTIME_CACHE = 'gv-runtime-v11';
const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Çevrimdışı</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#EEF1F6;color:#101B33;text-align:center;padding:24px}button{margin-top:16px;padding:12px 22px;background:#2C4A8E;color:#fff;border:0;border-radius:12px;font-weight:700;font-size:15px}</style><div><div style="font-size:64px">📡</div><h1 style="margin:12px 0 6px">Çevrimdışısın</h1><p style="color:#66708A;max-width:320px">İnternet bağlantını kontrol edip tekrar dene.</p><button onclick="location.reload()">Tekrar Dene</button></div>';
const hasCaches = (typeof caches !== 'undefined');

/* === INSTALL === */
self.addEventListener('install', e => {
  self.skipWaiting();
  // Opsiyonel: kritik dosyaları önceden cache'le
  if (hasCaches) {
    e.waitUntil(
      caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/logo.png', '/manifest.json']).catch(() => {}))
    );
  }
});

/* === ACTIVATE — eski cache'leri temizle === */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
      );
      await self.clients.claim();
    } catch (_) {}
  })());
});

/* === FETCH — network-first, cache fallback === */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  // Reklam ve Supabase isteklerine dokunma
  const url = e.request.url;
  if (url.includes('supabase.co')) return;
  if (url.includes('googlesyndication')) return;
  if (url.includes('doubleclick')) return;
  if (url.includes('googleadservices')) return;
  if (url.includes('google-analytics')) return;

  // Cache API yoksa (iOS Lockdown) hiçbir şeye müdahale etme
  if (!hasCaches) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      // Başarılı GET yanıtlarını runtime cache'e koy
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      // Offline: cache'ten dene
      const cached = await caches.match(e.request);
      if (cached) return cached;

      // Navigasyon isteği → offline sayfası
      if (e.request.mode === 'navigate') {
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/* === PUSH — arka plan bildirimleri === */
self.addEventListener('push', e => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (_) {
    data = { title: 'Gelişim Vibe', body: e.data ? e.data.text() : '' };
  }
  const title = data.title || 'Gelişim Vibe';
  const opts = {
    body: data.body || 'Yeni bir bildirim var',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    tag: data.tag || 'gv-notif',
    data: data.data || {},
    renotify: !!data.tag,
    vibrate: [80, 40, 80],
    requireInteraction: false
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

/* === NOTIFICATION CLICK — uygulamayı aç === */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Açık pencere varsa onu öne getir
    for (const c of all) {
      if ('focus' in c) {
        try { await c.focus(); if (c.navigate && targetUrl !== '/') c.navigate(targetUrl); return; } catch (_) {}
      }
    }
    // Yoksa yeni pencere aç
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

/* === MESSAGE — ana thread'den cache tetikleme (opsiyonel) === */
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'CLEAR_CACHE' && hasCaches) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
