import { useEffect } from 'react';
import { apiClient } from '../api/client';
import { useLocationWS } from '../hooks/useLocationWS';
import { startTracking, stopTracking } from '../lib/location';
import { useLocationStore } from '../store/locationStore';
import { useOnlineStore } from '../store/onlineStore';
import { useTripStore } from '../store/tripStore';

const ACTIVE_TRIP_STATUSES = new Set(['accepted', 'en_route', 'waiting', 'in_trip']);

export function LocationSync() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  const tripStatus = useTripStore((s) => s.tripStatus);

  const shouldTrack = isOnline || (tripStatus != null && ACTIVE_TRIP_STATUSES.has(tripStatus));

  useLocationWS(shouldTrack);

  useEffect(() => {
    if (!shouldTrack) return;

    let cancelled = false;
    const heartbeatInterval = setInterval(() => {
      const { lat, lng, heading } = useLocationStore.getState();
      apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    // Background TaskManager updates + heartbeat PUT keep matching freshness (5 min)
    // and offline grace (10 min) while the app is backgrounded.
    // start/stop are serialized inside location.ts (no orphan FGS on rapid toggle).
    void startTracking({ enableBackground: true }).then(() => {
      if (cancelled) void stopTracking();
    });

    return () => {
      cancelled = true;
      clearInterval(heartbeatInterval);
      useOnlineStore.getState().setHeartbeatRef(null);
      void stopTracking();
    };
  }, [shouldTrack]);

  return null;
}
