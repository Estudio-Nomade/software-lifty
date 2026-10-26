import { queryClient } from './queryClient';
import { supabase } from './supabase';

/** Must match backend `PLATFORM_REALTIME_TOPIC`. */
export const PLATFORM_REALTIME_TOPIC = 'platform:config';

/**
 * Passenger-facing keys that can shift when ops change platform config
 * (fuel/commission → fares). Broad invalidate keeps home/request fresh.
 */
export function invalidatePlatformConfigQueries(): void {
  void queryClient.invalidateQueries();
}

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
