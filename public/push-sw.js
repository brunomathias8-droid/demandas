/* Notificações: carregado pelo service worker principal (importScripts) */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const jobs = [
    self.registration.showNotification(d.title || 'Demandas', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' }
    })
  ];
  if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) {
    jobs.push(d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(jobs).catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        try { c.postMessage({ type: 'open-url', url }); } catch (e) { /* */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
