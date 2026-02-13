/* Service worker for push notifications */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Notification', body: '', url: '/notifications' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text() || '';
  }
  const options = {
    body: payload.body,
    icon: '/logos/plottwistco-logo.svg',
    badge: '/logos/plottwistco-logo.svg',
    tag: payload.tag || 'notification',
    data: { url: payload.url || '/notifications' },
    requireInteraction: false
  };
  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + (url.startsWith('/') ? url : '/' + url));
      }
    })
  );
});
