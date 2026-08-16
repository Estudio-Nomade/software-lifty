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

    const heartbeatInterval = setInterval(() => {
      const { lat, lng, heading } = useLocationStore.getState();
      apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    startTracking();

    return () => {
      clearInterval(heartbeatInterval);
      useOnlineStore.getState().setHeartbeatRef(null);
      stopTracking();
    };
  }, [shouldTrack]);

  return null;
}
