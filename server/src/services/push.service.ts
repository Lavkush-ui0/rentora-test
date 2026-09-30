import webpush from 'web-push';
import { config } from '../config/config';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';

// Default VAPID keys fallback if not defined in .env
const DEFAULT_VAPID_PUBLIC = 'BB0wS0P6Pj4kLvPTnj6xpWeXVen4M47gP2vPzaE106Vypa3jb_HM6ZpljB2S13kh3jr2-PIC9PzufKjP4NSk5p4';
const DEFAULT_VAPID_PRIVATE = 'qdc8I5NIJSyaiJ3LAhuiC9GlvnHyOmdkOshbt3AxGGY';
const DEFAULT_VAPID_SUBJECT = 'mailto:support@rentora.org.in';

const publicKey = config.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC;
const privateKey = config.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE;
const subject = config.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

try {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  logger.info('🔔 Web Push (VAPID) service initialized successfully');
} catch (err) {
  logger.error('❌ Failed to configure Web Push VAPID details:', err);
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface ClientPushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime?: number | null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, any>;
  tag?: string;
}

// In-memory fallback cache to ensure instant reliability even if Supabase table is not yet migrated
const memorySubscriptionCache = new Map<string, Map<string, PushSubscriptionKeys>>();

export const getVapidPublicKey = (): string => publicKey;

/**
 * Saves or updates a push subscription for a user.
 */
export const savePushSubscription = async (
  userId: string,
  subscription: ClientPushSubscription
): Promise<boolean> => {
  if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    logger.warn('[Push Service] Invalid subscription payload received');
    return false;
  }

  // 1. Always save in memory cache as immediate fallback
  if (!memorySubscriptionCache.has(userId)) {
    memorySubscriptionCache.set(userId, new Map());
  }
  memorySubscriptionCache.get(userId)!.set(subscription.endpoint, {
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });

  // 2. Persist to Supabase push_subscriptions table
  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      logger.warn(`[Push Service] Supabase push_subscriptions upsert warning: ${error.message}. (Memory cache active)`);
    } else {
      logger.info(`[Push Service] Saved push subscription for user ${userId}`);
    }
  } catch (dbErr: any) {
    logger.warn(`[Push Service] Error persisting subscription to DB: ${dbErr.message}`);
  }

  return true;
};

/**
 * Removes a push subscription for a user.
 */
export const removePushSubscription = async (
  userId: string,
  endpoint: string
): Promise<void> => {
  if (memorySubscriptionCache.has(userId)) {
    memorySubscriptionCache.get(userId)!.delete(endpoint);
  }

  try {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
  } catch (err: any) {
    logger.warn(`[Push Service] Failed to remove subscription from DB: ${err.message}`);
  }
};

/**
 * Fetches all active subscriptions for a given user.
 */
export const getUserPushSubscriptions = async (
  userId: string
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> => {
  const result: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
  const seenEndpoints = new Set<string>();

  // 1. Try fetching from Supabase
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (!error && Array.isArray(data)) {
      data.forEach((item) => {
        if (item.endpoint && item.p256dh && item.auth) {
          result.push({
            endpoint: item.endpoint,
            p256dh: item.p256dh,
            auth: item.auth,
          });
          seenEndpoints.add(item.endpoint);
        }
      });
    }
  } catch (err: any) {
    logger.warn(`[Push Service] Error querying push_subscriptions: ${err.message}`);
  }

  // 2. Merge with memory cache
  const userMemory = memorySubscriptionCache.get(userId);
  if (userMemory) {
    userMemory.forEach((keys, endpoint) => {
      if (!seenEndpoints.has(endpoint)) {
        result.push({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
      }
    });
  }

  return result;
};

/**
 * Dispatches a push notification to all devices registered for a user.
 */
export const sendPushNotification = async (
  userId: string,
  payload: PushPayload
): Promise<number> => {
  const subscriptions = await getUserPushSubscriptions(userId);

  if (!subscriptions || subscriptions.length === 0) {
    logger.info(`[Push Service] No push subscriptions found for user: ${userId}`);
    return 0;
  }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/rentora-logo.png',
    badge: payload.badge || '/favicon-48x48.png',
    url: payload.url || '/notifications',
    tag: payload.tag || 'rentora-alert',
    data: payload.data || {},
  });

  let successful = 0;

  const pushPromises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadString
      );
      successful++;
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription is no longer valid or unsubscribed
        logger.info(`[Push Service] Removing stale subscription for user ${userId}`);
        await removePushSubscription(userId, sub.endpoint);
      } else {
        logger.warn(`[Push Service] Failed to send push to ${sub.endpoint}: ${err.message || err}`);
      }
    }
  });

  await Promise.allSettled(pushPromises);
  logger.info(`[Push Service] Dispatched push notification to ${successful}/${subscriptions.length} devices for user ${userId}`);
  return successful;
};
