import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { CustomRequest } from '../types';
import CustomError from '../utils/customError';

export const getNotifications = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user._id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !notifications) {
      throw new CustomError('Failed to fetch notifications', 500, 'FETCH_FAILED');
    }

    const formatted = notifications.map((n: any) => ({
      _id: n.id,
      user: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      targetId: n.target_id,
      isRead: n.is_read,
      createdAt: n.created_at,
    }));

    return res.json({
      success: true,
      notifications: formatted,
    });
  } catch (error) {
    return next(error);
  }
};

export const markAllAsRead = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user._id)
      .eq('is_read', false);

    if (error) {
      throw new CustomError('Failed to mark notifications as read', 500, 'UPDATE_FAILED');
    }

    return res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    return next(error);
  }
};

export const markOneAsRead = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: notification, error: findError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (findError || !notification) {
      throw new CustomError('Notification not found', 404, 'NOT_FOUND');
    }

    if (notification.user_id !== req.user._id) {
      throw new CustomError('You are not authorized to edit this notification', 403, 'FORBIDDEN');
    }

    const { data: updated, error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError || !updated) {
      throw new CustomError('Failed to update notification', 500, 'UPDATE_FAILED');
    }

    return res.json({
      success: true,
      message: 'Notification marked as read',
      notification: {
        _id: updated.id,
        isRead: updated.is_read,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns the VAPID public key so client can subscribe to PushManager
 */
export const getPushPublicKey = async (_req: any, res: Response) => {
  const { getVapidPublicKey } = await import('../services/push.service');
  return res.json({
    success: true,
    publicKey: getVapidPublicKey(),
  });
};

/**
 * Saves a browser push subscription for the authenticated user
 */
export const subscribePush = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      throw new CustomError('Valid push subscription object is required', 400, 'INVALID_SUBSCRIPTION');
    }

    const { savePushSubscription } = await import('../services/push.service');
    const saved = await savePushSubscription(req.user._id, subscription);

    if (!saved) {
      throw new CustomError('Failed to save push subscription', 500, 'SAVE_FAILED');
    }

    return res.status(201).json({
      success: true,
      message: 'Push notification subscription registered successfully',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Removes a browser push subscription
 */
export const unsubscribePush = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { endpoint } = req.body;
    if (!endpoint) {
      throw new CustomError('Push subscription endpoint is required', 400, 'ENDPOINT_REQUIRED');
    }

    const { removePushSubscription } = await import('../services/push.service');
    await removePushSubscription(req.user._id, endpoint);

    return res.json({
      success: true,
      message: 'Push subscription removed successfully',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Sends an immediate test push notification to the user's active device
 */
export const sendTestPush = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { sendPushNotification } = await import('../services/push.service');
    const count = await sendPushNotification(req.user._id, {
      title: 'Rentora Push Active! 🚀',
      body: `Hello ${req.user.fullName || 'there'}! You will now receive rental request updates even when Rentora is closed.`,
      url: '/notifications',
    });

    return res.json({
      success: true,
      message: count > 0 
        ? `Test notification sent to ${count} device(s)!` 
        : 'Subscription received, but no active device connection found. Ensure notifications are allowed.',
      deviceCount: count,
    });
  } catch (error) {
    return next(error);
  }
};
