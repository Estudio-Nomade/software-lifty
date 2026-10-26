import { useEffect } from 'react';
import { refreshMessagesUnread } from '../lib/messagesUnread';
import { subscribeToDriverAccount, subscribeToPlatformConfig } from '../lib/platformRealtime';
import { useAuthStore } from '../store/authStore';

/**
 * Always-on Realtime for admin/platform config + this driver's account mutations.
 * Separate from trip offer channel (which only runs while online).
 */
export function PlatformRealtimeProvider() {
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const token = useAuthStore((s) => s.token);
  const driverId = useAuthStore((s) => s.driverId);

  useEffect(() => {
    if (!sessionRestored || !token) return;
    return subscribeToPlatformConfig();
  }, [sessionRestored, token]);

  useEffect(() => {
    if (!sessionRestored || !token || !driverId) return;
    return subscribeToDriverAccount(driverId, (payload) => {
      if (payload?.reason === 'review' || payload?.action === 'request_changes') {
        void refreshMessagesUnread();
      }
    });
  }, [sessionRestored, token, driverId]);

  return null;
}
