// Rep · minimal service worker.
//
// Two purposes:
//   1. Make the site installable (Add to Home Screen) — the platform looks
//      for ANY service worker registered with a fetch handler.
//   2. Receive web-push notifications (shared VAPID with the central
//      thanks/cron gateway at f1.anirudhgoel.xyz).
//
// We DO NOT cache anything at the SW level. Cloudflare + _headers handles
// HTTP caching, and we want fresh data on every visit.

const SLUG = 'rep';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Update', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Rep';
  const body  = data.body  || '';
  const url   = data.url   || '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url },
    tag: SLUG + ':' + (data.tag || 'msg'),
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const c of clients) {
      if (c.url.includes(url) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});

// Strict passthrough. No app-shell caching.
self.addEventListener('fetch', (event) => { /* no-op */ });
