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
 * Safe to call often (Profile focus, app resume, after mark-read, push received).
 * Single source of truth for in-app + OS badge — no optimistic bump on push.
 */
export async function refreshMessagesUnread(): Promise<number> {
  const current = () => useMessagesUnreadStore.getState().unreadCount;
  try {
    const res = await apiClient.get('/drivers/me/messages/unread-count');
    const payload = res.data?.data ?? res.data;
    const count = Number(payload?.unread_count ?? 0);
    const next = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    useMessagesUnreadStore.getState().setUnreadCount(next);
    void syncOsAppBadge(next);
    return next;
  } catch {
    // Keep store as-is but always re-mirror OS badge so icon and UI stay aligned
    // when the request fails (offline / 401 mid-refresh).
    const fallback = current();
    void syncOsAppBadge(fallback);
    return fallback;
  }
}
