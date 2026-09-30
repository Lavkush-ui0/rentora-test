// Rentora Service Worker for Background Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming background push notifications (fired even when browser tab is closed)
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Rentora Notification',
    body: 'You have a new update on Rentora.',
    url: '/notifications',
    icon: '/rentora-logo.png',
    badge: '/favicon-48x48.png',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      notificationData = { ...notificationData, ...parsed };
    } catch (e) {
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/rentora-logo.png',
    badge: notificationData.badge || '/favicon-48x48.png',
    data: {
      url: notificationData.url || '/notifications',
    },
    vibrate: [200, 100, 200],
    tag: notificationData.tag || 'rentora-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Handle clicking on the notification popup
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url && !client.url.includes(targetUrl)) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window with the destination URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
