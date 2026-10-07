const CACHE = 'gv-v14';
const RUNTIME_CACHE = 'gv-runtime-v14';
const RUNTIME_MAX_ITEMS = 80;
const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Çevrimdışı</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#EEF1F6;color:#101B33;text-align:center;padding:24px}button{margin-top:16px;padding:12px 22px;background:#2C4A8E;color:#fff;border:0;border-radius:12px;font-weight:700;font-size:15px}</style><div><div style="font-size:64px">📡</div><h1 style="margin:12px 0 6px">Çevrimdışısın</h1><p style="color:#66708A;max-width:320px">İnternet bağlantını kontrol edip tekrar dene.</p><button onclick="location.reload()">Tekrar Dene</button></div>';
const hasCaches = (typeof caches !== 'undefined');

/* LRU trim — runtime cache sınırsız büyümesin */
async function trimCache(name, maxItems){
  if(!hasCaches) return;
  try{
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if(keys.length > maxItems){
      const toDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(toDelete.map(k => cache.delete(k)));
    }
  }catch(_){}
}

/* === INSTALL === */
self.addEventListener('install', e => {
  self.skipWaiting();
  if (hasCaches) {
    e.waitUntil(
      caches.open(CACHE).then(c => {
        ['/', '/index.html', '/logo.png', '/manifest.json'].forEach(u => c.add(u).catch(() => {}));
      })
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

/* === FETCH — static: cache-first, dynamic: network-first === */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  const url = e.request.url;
  if (url.includes('supabase.co')) return;
  if (url.includes('googlesyndication')) return;
  if (url.includes('doubleclick')) return;
  if (url.includes('googleadservices')) return;
  if (url.includes('google-analytics')) return;

  if (!hasCaches) return;

  const sameOrigin = url.startsWith(self.location.origin);
  const isStatic = sameOrigin && /\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|css|js|json|ico)$/i.test(url);

  if(isStatic){
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if(cached) return cached;
      try{
        const res = await fetch(e.request);
        if(res && res.status === 200){
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => {
            c.put(e.request, copy).then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ITEMS)).catch(()=>{});
          });
        }
        return res;
      }catch(_){
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => {
          c.put(e.request, copy).then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ITEMS)).catch(()=>{});
        });
      }
      return res;
    } catch (_) {
      const cached = await caches.match(e.request);
      if (cached) return cached;

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

/* === PUSH === */
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

/* === NOTIFICATION CLICK === */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { await c.focus(); if (c.navigate && targetUrl !== '/') c.navigate(targetUrl); return; } catch (_) {}
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

/* === MESSAGE === */
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'CLEAR_CACHE' && hasCaches) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
