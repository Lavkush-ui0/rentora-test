import api from './api';

// Utility to convert VAPID base64 string to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushNotificationService = {
  /**
   * Check if web push and service worker are supported in the current browser
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  /**
   * Get current notification permission ('default' | 'granted' | 'denied')
   */
  getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  },

  /**
   * Register the root service worker (/sw.js)
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error('[Push Service] Service worker registration failed:', error);
      return null;
    }
  },

  /**
   * Check if the user is already subscribed on this device
   */
  async isSubscribed(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch (error) {
      console.error('[Push Service] Error checking subscription:', error);
      return false;
    }
  },

  /**
   * Request permission and subscribe the user's browser to push notifications
   */
  async subscribe(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupported()) {
      return { success: false, message: 'Push notifications are not supported by this browser.' };
    }

    try {
      // 1. Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          message: permission === 'denied'
            ? 'Notifications were blocked. Please enable them in your browser site settings.'
            : 'Notification permission was dismissed.',
        };
      }

      // 2. Register service worker
      const registration = await this.registerServiceWorker();
      if (!registration) {
        return { success: false, message: 'Could not register service worker.' };
      }

      // 3. Fetch VAPID Public Key from server
      const keyRes = await api.get('/notifications/push/public-key');
      const publicKey = keyRes.data?.publicKey;
      if (!publicKey) {
        return { success: false, message: 'Failed to retrieve push server key.' };
      }

      const convertedKey = urlBase64ToUint8Array(publicKey);

      // 4. Subscribe with the PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });

      // 5. Send subscription to Rentora backend
      await api.post('/notifications/push/subscribe', {
        subscription: subscription.toJSON(),
      });

      return { success: true, message: 'Push notifications successfully activated!' };
    } catch (error: any) {
      console.error('[Push Service] Subscription error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to activate push notifications.',
      };
    }
  },

  /**
   * Unsubscribe the user from push notifications on this device
   */
  async unsubscribe(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupported()) return { success: false };
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Notify server
        await api.post('/notifications/push/unsubscribe', {
          endpoint: subscription.endpoint,
        }).catch((e) => console.warn('[Push Service] Backend unsubscribe warning:', e));

        // Unsubscribe locally
        await subscription.unsubscribe();
      }
      return { success: true, message: 'Push notifications disabled on this device.' };
    } catch (error: any) {
      console.error('[Push Service] Unsubscribe error:', error);
      return { success: false, message: error.message || 'Failed to unsubscribe.' };
    }
  },

  /**
   * Trigger a test notification from the server
   */
  async sendTest(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await api.post('/notifications/push/test');
      return {
        success: res.data?.success || false,
        message: res.data?.message || 'Test push sent!',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send test notification.',
      };
    }
  },
};

export default pushNotificationService;
