import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/notificationService';
import {
  Bell,
  BellOff,
  CheckCheck,
  Package,
  MessageCircle,
  Star,
  AlertTriangle,
  ArrowRight,
  PauseCircle,
  Edit3,
  Smartphone,
  Send,
  Check,
  Loader2,
  Info,
} from 'lucide-react';
import pushNotificationService from '../services/pushNotificationService';

const notifIcons: Record<string, React.FC<any>> = {
  RENTAL_REQUEST: Package,
  REQUEST_ACCEPTED: CheckCheck,
  REQUEST_REJECTED: BellOff,
  NEW_MESSAGE: MessageCircle,
  RENTAL_REMINDER: Bell,
  RENTAL_COMPLETED: CheckCheck,
  NEW_REVIEW: Star,
  LISTING_REMOVED: AlertTriangle,
  LISTING_PAUSED: PauseCircle,
  ACCOUNT_STATUS: AlertTriangle,
};

const notifColors: Record<string, string> = {
  RENTAL_REQUEST: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
  REQUEST_ACCEPTED: 'text-green-500 bg-green-50 dark:bg-green-950/30',
  REQUEST_REJECTED: 'text-red-500 bg-red-50 dark:bg-red-950/30',
  NEW_MESSAGE: 'text-primary-500 bg-primary-50 dark:bg-primary-950/30',
  RENTAL_REMINDER: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
  RENTAL_COMPLETED: 'text-green-500 bg-green-50 dark:bg-green-950/30',
  NEW_REVIEW: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
  LISTING_REMOVED: 'text-red-500 bg-red-50 dark:bg-red-950/30',
  LISTING_PAUSED: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
  ACCOUNT_STATUS: 'text-red-500 bg-red-50 dark:bg-red-950/30',
};

const getDefaultTabForNotification = (notif: any): 'incoming' | 'sent' => {
  if (notif.type === 'REQUEST_ACCEPTED') return 'sent';
  if (notif.type === 'RENTAL_REQUEST') return 'incoming';
  if (notif.type === 'RENTAL_REMINDER') return 'sent';
  if (notif.type === 'RENTAL_COMPLETED') {
    const msg = (notif.message || '').toLowerCase();
    if (msg.includes('listing') || msg.includes('returned')) {
      return 'incoming';
    }
    return 'sent';
  }
  return 'incoming';
};

export const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPushSupported, setIsPushSupported] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const navigate = useNavigate();

  const syncPushStatus = async () => {
    const supported = pushNotificationService.isSupported();
    setIsPushSupported(supported);
    if (supported) {
      setPermission(pushNotificationService.getPermission());
      const subbed = await pushNotificationService.isSubscribed();
      setIsSubscribed(subbed);
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await notificationService.getNotifications();
        if (res.data?.success) setNotifications(res.data.notifications);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
    syncPushStatus();
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    try {
      if (isSubscribed) {
        const res = await pushNotificationService.unsubscribe();
        if (res.success) {
          setIsSubscribed(false);
          setPushFeedback('Push notifications disabled on this device.');
        } else {
          setPushFeedback(res.message || 'Failed to disable push.');
        }
      } else {
        const res = await pushNotificationService.subscribe();
        if (res.success) {
          setIsSubscribed(true);
          setPermission('granted');
          setPushFeedback('Push notifications active! You will get alerts even when the website is closed.');
        } else {
          setPermission(pushNotificationService.getPermission());
          setPushFeedback(res.message || 'Could not enable push notifications.');
        }
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    try {
      const res = await pushNotificationService.sendTest();
      setPushFeedback(res.message);
    } finally {
      setPushLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      window.dispatchEvent(new Event('unreadNotificationsUpdated'));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      try {
        await notificationService.markOneAsRead(notif._id);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
        window.dispatchEvent(new Event('unreadNotificationsUpdated'));
      } catch (err) {
        console.error(err);
      }
    }

    if (notif.type === 'REQUEST_REJECTED') {
      return; // Do not navigate
    }

    if (notif.type === 'LISTING_PAUSED') {
      if (notif.relatedId) {
        navigate(`/edit-item/${notif.relatedId}`);
      } else {
        navigate('/my-listings');
      }
      return;
    }

    if (notif.relatedId) {
      if (['RENTAL_REQUEST', 'NEW_MESSAGE', 'REQUEST_ACCEPTED'].includes(notif.type)) {
        navigate(`/messages/${notif.relatedId}`);
      } else {
        navigate('/my-rentals', { state: { defaultTab: getDefaultTabForNotification(notif) } });
      }
    } else {
      navigate('/my-rentals', { state: { defaultTab: getDefaultTabForNotification(notif) } });
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-outfit text-gray-900 dark:text-gray-100">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center space-x-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Offline Device Push & Email Notifications Card */}
      <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${
              isSubscribed
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
            }`}>
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Offline & Device Notifications
                </h3>
                {isSubscribed ? (
                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    <span>Active on this browser</span>
                  </span>
                ) : permission === 'denied' ? (
                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Blocked in browser</span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Receive popup alerts on your device for incoming rental requests and updates even when Rentora is closed. Verified campus email alerts are also sent automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-center flex-shrink-0">
            {isSubscribed && (
              <button
                onClick={handleSendTestPush}
                disabled={pushLoading}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                title="Send a sample notification to your device"
              >
                {pushLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Test Alert</span>
              </button>
            )}

            {isPushSupported && (
              <button
                onClick={handleTogglePush}
                disabled={pushLoading || permission === 'denied'}
                className={`flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 ${
                  isSubscribed
                    ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/30'
                    : 'bg-[#9E1B1B] hover:bg-[#831616] text-white shadow-red-900/20'
                }`}
              >
                {pushLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bell className="h-3.5 w-3.5" />
                )}
                <span>{isSubscribed ? 'Turn Off' : 'Enable Device Push'}</span>
              </button>
            )}
          </div>
        </div>

        {permission === 'denied' && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center space-x-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>
              Notifications are currently blocked. Click the lock/tune icon in your browser URL bar and change Notifications to <strong>Allow</strong>.
            </span>
          </div>
        )}

        {pushFeedback && (
          <div className="mt-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>{pushFeedback}</span>
            <button onClick={() => setPushFeedback(null)} className="text-slate-400 hover:text-slate-600 text-xs">
              ✕
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse flex items-center space-x-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800"
            >
              <div className="h-10 w-10 bg-gray-100 dark:bg-slate-800 rounded-2xl flex-shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded-full w-2/3"></div>
                <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded-full w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const IconComponent = notifIcons[notif.type] || Bell;
            const iconStyle = notifColors[notif.type] || 'text-gray-500 bg-gray-100 dark:bg-slate-800';

            return (
              <div
                key={notif._id}
                onClick={() => handleNotificationClick(notif)}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                  notif.isRead
                    ? 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800'
                    : 'bg-primary-50/50 dark:bg-primary-950/20 border-primary-100 dark:border-primary-900/30'
                }`}
              >
                <div className="flex items-start space-x-4 flex-1 min-w-0">
                  <div className={`h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconStyle}`}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${notif.isRead ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-normal">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="mt-3 sm:mt-0 flex items-center space-x-2 self-end sm:self-center">
                  {['RENTAL_REQUEST', 'REQUEST_ACCEPTED'].includes(notif.type) ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotificationClick(notif);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 text-xs font-bold rounded-xl hover:bg-primary-100 transition-all"
                      >
                        <span>Open Chat</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!notif.isRead) {
                            notificationService.markOneAsRead(notif._id).catch(console.error);
                            setNotifications((prev) =>
                              prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
                            );
                          }
                          navigate('/my-rentals', { state: { defaultTab: notif.type === 'REQUEST_ACCEPTED' ? 'sent' : 'incoming' } });
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-all"
                      >
                        <span>Review Request</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : notif.type === 'REQUEST_REJECTED' ? (
                    null
                  ) : notif.type === 'LISTING_PAUSED' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationClick(notif);
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all shadow-sm"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Description</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationClick(notif);
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 text-xs font-bold rounded-xl hover:bg-primary-100 transition-all"
                    >
                      <span>{['RENTAL_REQUEST', 'NEW_MESSAGE', 'REQUEST_ACCEPTED'].includes(notif.type) ? 'Open Chat' : 'View'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!notif.isRead && (
                    <div className="h-2.5 w-2.5 rounded-full bg-primary-500 flex-shrink-0"></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <Bell className="h-16 w-16 mx-auto text-gray-200 dark:text-gray-700 mb-4" />
          <p className="font-bold text-gray-500 dark:text-gray-400">You're all caught up!</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">No notifications to show.</p>
        </div>
      )}
    </div>
  );
};
export default Notifications;
