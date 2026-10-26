import { apiClient } from '../api/client';
import { useMessagesUnreadStore } from '../store/messagesUnreadStore';
import { isRemotePushAvailable } from './notifications';

/** Sync OS app-icon badge (iOS + Android 8+ when supported by expo-notifications). */
export async function syncOsAppBadge(count: number): Promise<void> {
  if (!isRemotePushAvailable()) return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count) || 0));
  } catch {
    // best-effort (web / Expo Go Android / missing native module)
  }
}

/**
 * Pull server unread for Lifty account messages and mirror into store + OS badge.
 * Safe to call often (Profile focus, app resume, after mark-read).
 */
export async function refreshMessagesUnread(): Promise<number> {
  try {
    const res = await apiClient.get('/drivers/me/messages/unread-count');
    const payload = res.data?.data ?? res.data;
    const count = Number(payload?.unread_count ?? 0);
    const next = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    useMessagesUnreadStore.getState().setUnreadCount(next);
    void syncOsAppBadge(next);
    return next;
  } catch {
    return useMessagesUnreadStore.getState().unreadCount;
  }
}

/** Optimistic bump when a soft review_notes push arrives before the list refreshes. */
export function bumpMessagesUnreadFromPush(): void {
  useMessagesUnreadStore.getState().bumpUnread(1);
  const next = useMessagesUnreadStore.getState().unreadCount;
  void syncOsAppBadge(next);
}
