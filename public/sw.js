const CACHE_NAME = 'golden-hour-shell-v1';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match('/index.html'))),
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const kind = data.kind === 'sunset' ? 'Sunset' : 'Sunrise';
  event.waitUntil(self.registration.showNotification('Golden Hour', {
    body: data.message || `${kind} is near. A little outside time is waiting.`,
    tag: `golden-hour-${data.kind || 'reminder'}`,
    data: { url: '/?go=outside', kind: data.kind || 'sunrise' },
    icon: '/icon.svg',
    badge: '/icon.svg',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('/?go=outside', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((window) => new URL(window.url).origin === self.location.origin);
      return existing ? existing.focus().then(() => existing.navigate(target)) : self.clients.openWindow(target);
    }),
  );
});
