import React, { useState, useEffect } from 'react';
import { Bell, X, Check, Loader2, Sparkles } from 'lucide-react';
import pushNotificationService from '../services/pushNotificationService';

const DISMISS_KEY = 'rentora_notif_banner_dismissed_at';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours cooldown if dismissed

export const NotificationPermissionBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Only check in browser environments supporting Push & Notifications
    if (!pushNotificationService.isSupported()) return;

    // Check if permission is default (neither granted nor blocked)
    const permission = pushNotificationService.getPermission();
    if (permission !== 'default') return;

    // Check if user recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_COOLDOWN_MS) {
        return;
      }
    }

    // Delay prompt slightly so page settles smoothly on initial visit
    const timer = setTimeout(() => {
      setVisible(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const handleAllow = async () => {
    setLoading(true);
    try {
      const res = await pushNotificationService.subscribe();
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          setVisible(false);
        }, 2200);
      } else {
        // If user dismissed browser prompt, hide banner
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
      }
    } catch (err) {
      console.warn('[Notification Banner] Subscription error:', err);
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Notification Permission"
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-white/95 dark:bg-[#1E2630]/95 backdrop-blur-md p-4 sm:p-5 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-2xl shadow-black/10 dark:shadow-black/40">
        
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Dismiss notification prompt"
        >
          <X className="h-4 w-4" />
        </button>

        {success ? (
          <div className="flex items-center space-x-3 py-1 text-emerald-600 dark:text-emerald-400">
            <div className="h-10 w-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm">Notifications Enabled! 🚀</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You'll receive instant updates for rentals and messages.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-3.5">
            <div className="flex items-start space-x-3.5 pr-6">
              <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-tr from-[#9E1B1B] to-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-red-500/20">
                <Bell className="h-5 w-5 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-[#9E1B1B] dark:text-red-400 font-display">
                    Instant Alerts
                  </span>
                  <Sparkles className="h-3 w-3 text-amber-500" />
                </div>
                <h3 className="font-black text-sm text-gray-900 dark:text-gray-100 font-outfit leading-tight mt-0.5">
                  Never Miss a Rental Request
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Get notified on your phone or PC when a classmate wants to rent your item or replies to your chat.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={handleAllow}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center space-x-2 bg-[#9E1B1B] hover:bg-[#801414] active:scale-[0.98] text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Enabling...</span>
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    <span>Enable Notifications</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPermissionBanner;
