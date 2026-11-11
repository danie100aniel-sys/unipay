// UniPay PWA Service Worker for Push Notifications

self.addEventListener('push', function (event) {
  let data = {
    title: 'UniPay Alert',
    body: 'New administrative notification.',
    tag: 'unipay-alert',
    url: '/admin/'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: data.tag || 'unipay-alert',
    data: { url: data.url || '/admin/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  event.waitUntil((async function () {
    let targetUrl = '/admin/';

    try {
      const requestedUrl = new URL(
        event.notification.data?.url || '/admin/',
        self.location.origin
      );

      if (requestedUrl.origin === self.location.origin) {
        targetUrl = requestedUrl.href;
      }
    } catch {
      targetUrl = '/admin/';
    }

    const clientList = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clientList) {
      if ('navigate' in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }

    return clients.openWindow(targetUrl);
  })());
});
