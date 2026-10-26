import { DeviceEventEmitter } from 'react-native';
import { queryClient } from './queryClient';
import { supabase } from './supabase';

/** Must match backend `PLATFORM_REALTIME_TOPIC`. */
export const PLATFORM_REALTIME_TOPIC = 'platform:config';

/** Local bridge for screens that still use useState fetches (Profile). */
export const DRIVER_ACCOUNT_REFRESH_EVENT = 'lifty:driver-account-refresh';

/** Query keys refreshed when admin/platform config changes (payout alias/CVU, etc.). */
export const PLATFORM_CONFIG_QUERY_KEYS = [
  ['payout-info'],
  ['commission-receipts'],
  ['earnings-daily'],
  ['earnings-summary'],
] as const;

/** Query keys refreshed when this driver's account changes (review, docs, debt…). */
export const DRIVER_ACCOUNT_QUERY_KEYS = [
  ['payout-info'],
  ['commission-receipts'],
  ['driver-profile'],
  ['driver-status'],
  ['payment-methods'],
  ['earnings-daily'],
  ['messages-inbox'],
] as const;

export function invalidatePlatformConfigQueries(): void {
  for (const key of PLATFORM_CONFIG_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
}

export function invalidateDriverAccountQueries(): void {
  for (const key of DRIVER_ACCOUNT_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
  // Broad status/profile refresh used across Profile + gates.
  void queryClient.invalidateQueries({ queryKey: ['drivers', 'me'] });
  DeviceEventEmitter.emit(DRIVER_ACCOUNT_REFRESH_EVENT);
}

/**
 * Join shared platform config channel. Any signed-in driver session should hold this
 * so admin payout/fuel/commission edits hit open screens without a manual pull.
 */
export function subscribeToPlatformConfig(onUpdated?: () => void): () => void {
  const channel = supabase.channel(PLATFORM_REALTIME_TOPIC);

  channel.on('broadcast', { event: 'config:updated' }, () => {
    invalidatePlatformConfigQueries();
    onUpdated?.();
  });

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Extra account events on `driver:{id}` (beyond trip:request / trip:cancelled).
 * Keep this subscribed even when offline so review/payout account updates still land.
 */
export function subscribeToDriverAccount(
  driverId: string,
  onUpdated?: (payload: Record<string, unknown>) => void,
): () => void {
  if (!driverId) return () => {};

  const channel = supabase.channel(`driver:${driverId}`);

  channel.on('broadcast', { event: 'account:updated' }, ({ payload }) => {
    invalidateDriverAccountQueries();
    onUpdated?.((payload ?? {}) as Record<string, unknown>);
  });

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
