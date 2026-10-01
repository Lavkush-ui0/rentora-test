import { supabase } from '../config/supabase';
import { config } from '../config/config';
import { getIO, getSocketIdByUser } from './socket.service';
import { sendPushNotification } from './push.service';
import { sendRentalNotificationEmail } from './mail.service';
import logger from '../utils/logger';

export interface NotificationMeta {
  itemTitle?: string;
  senderName?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  actionUrl?: string;
  reason?: string;
  message?: string;
  skipEmail?: boolean;
  skipPush?: boolean;
}

const RENTAL_NOTIFICATION_TYPES = [
  'RENTAL_REQUEST',
  'REQUEST_ACCEPTED',
  'REQUEST_REJECTED',
  'RENTAL_CANCELLED',
  'RENTAL_REMINDER',
  'RENTAL_COMPLETED',
];

/**
 * Creates a notification in the database and broadcasts it via:
 * 1. Socket.IO (if user is online on website)
 * 2. Web Push Notification (system desktop/mobile push when offline or backgrounded)
 * 3. Email Notification (for rental events when offline/away from website)
 */
export const createNotification = async (
  userId: string | Object,
  type: string,
  title: string,
  message: string,
  relatedId?: string | Object,
  meta?: NotificationMeta
) => {
  const targetUserId = userId.toString();

  try {
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: targetUserId,
        type,
        title,
        message,
        target_id: relatedId ? relatedId.toString() : null,
        is_read: false,
      }])
      .select()
      .single();

    if (error || !notification) {
      logger.error('[Notification Service] Error creating notification in DB:', error);
      return null;
    }

    // 1. Dispatch live socket notification if user is currently active on the site
    const io = getIO();
    if (io) {
      const socketId = getSocketIdByUser(targetUserId);
      if (socketId) {
        io.to(socketId).emit('newNotification', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          relatedId: notification.target_id,
          isRead: notification.is_read,
          createdAt: notification.created_at,
        });
        logger.info(`[Notification Service] Dispatched live socket notification to user: ${targetUserId}`);
      }
    }

    // 2. Dispatch Web Push notification (delivers to desktop/phone OS even when browser tab is closed)
    if (!meta?.skipPush) {
      const baseUrl = config.CLIENT_URL || 'https://rentora.org.in';
      let rawUrl = meta?.actionUrl;
      if (!rawUrl) {
        if (type === 'RENTAL_REQUEST' || type === 'REQUEST_ACCEPTED' || type === 'NEW_MESSAGE') {
          rawUrl = relatedId ? `/messages/${relatedId}` : '/messages';
        } else {
          rawUrl = '/my-rentals';
        }
      }

      let pushUrl = rawUrl;
      if (pushUrl.startsWith('/')) {
        pushUrl = `${baseUrl}${pushUrl}`;
      } else if (pushUrl.includes('vercel.app')) {
        try {
          const parsed = new URL(pushUrl);
          pushUrl = `${baseUrl}${parsed.pathname}${parsed.search}`;
        } catch {
          pushUrl = `${baseUrl}/messages`;
        }
      }

      sendPushNotification(targetUserId, {
        title,
        body: message,
        icon: '/rentora-logo.png',
        badge: '/favicon-48x48.png',
        url: pushUrl,
        tag: `rentora-${type.toLowerCase()}`,
        data: {
          notificationId: notification.id,
          type,
          relatedId: relatedId ? relatedId.toString() : null,
          url: pushUrl,
        },
      }).catch((pushErr) => {
        logger.warn(`[Notification Service] Push dispatch warning: ${pushErr.message || pushErr}`);
      });
    }

    // 3. Dispatch Email notification for offline users (for rental requests, acceptance, cancellations, etc.)
    if (!meta?.skipEmail && RENTAL_NOTIFICATION_TYPES.includes(type)) {
      (async () => {
        try {
          const { data: userRecord } = await supabase
            .from('users')
            .select('email, full_name')
            .eq('id', targetUserId)
            .maybeSingle();

          if (userRecord?.email) {
            await sendRentalNotificationEmail({
              recipientEmail: userRecord.email,
              recipientName: userRecord.full_name || 'Rentora Member',
              type,
              itemTitle: meta?.itemTitle || title,
              senderName: meta?.senderName || 'A Rentora user',
              startDate: meta?.startDate,
              endDate: meta?.endDate,
              message: message,
              reason: meta?.reason,
              actionUrl: meta?.actionUrl,
            });
          }
        } catch (mailErr: any) {
          logger.warn(`[Notification Service] Email dispatch warning: ${mailErr.message || mailErr}`);
        }
      })();
    }

    return notification;
  } catch (error) {
    logger.error('[Notification Service] Error creating notification:', error);
    // Never crash the request lifecycle if notification channels fail
    return null;
  }
};
