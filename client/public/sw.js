// Rentora Service Worker for Background Push Notifications
const PRODUCTION_ORIGIN = 'https://rentora.org.in';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Automatically unregister obsolete service worker registrations on vercel.app domains
      (async () => {
        if (self.location.hostname.includes('vercel.app')) {
          try {
            await self.registration.unregister();
            console.log('[SW] Obsolete Vercel service worker unregistered successfully.');
          } catch (err) {
            console.warn('[SW] Error unregistering obsolete Vercel service worker:', err);
          }
        }
      })(),
    ])
  );
});

/**
 * Resolves any target URL to the official Rentora production domain (https://rentora.org.in)
 * while preserving localhost for local development testing.
 */
function resolveDestinationUrl(rawUrl) {
  const isLocalhost =
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1';

  const baseOrigin = isLocalhost ? self.location.origin : PRODUCTION_ORIGIN;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return `${baseOrigin}/messages`;
  }

  // Handle absolute URLs
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrl);
      // If URL points to old/defunct vercel domain, swap to official domain
      if (parsed.hostname.includes('vercel.app')) {
        return `${baseOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return parsed.href;
    } catch {
      return `${baseOrigin}/messages`;
    }
  }

  // Handle relative paths
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${baseOrigin}${path}`;
}

// Handle incoming background push notifications (fired even when browser tab is closed)
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Rentora Notification',
    body: 'You have a new update on Rentora.',
    url: '/messages',
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

  // Ensure default URL points to chat or specified destination on rentora.org.in
  const rawUrl = notificationData.url || notificationData.data?.url || '/messages';
  const destinationUrl = resolveDestinationUrl(rawUrl);

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/rentora-logo.png',
    badge: notificationData.badge || '/favicon-48x48.png',
    data: {
      url: destinationUrl,
      ...notificationData.data,
    },
    vibrate: [200, 100, 200],
    tag: notificationData.tag || 'rentora-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Handle clicking on the notification popup: redirects to chat/target page on rentora.org.in
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/messages';
  const destinationUrl = resolveDestinationUrl(rawUrl);

  // If this notification was triggered on an obsolete vercel deployment, clean up the SW registration
  if (self.location.hostname.includes('vercel.app')) {
    self.registration.unregister().catch(() => {});
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(destinationUrl);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window with the official rentora.org.in destination
      if (self.clients.openWindow) {
        return self.clients.openWindow(destinationUrl);
      }
    })
  );
});
