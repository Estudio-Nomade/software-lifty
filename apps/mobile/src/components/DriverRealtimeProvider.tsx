import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  buildTripCancelledParams,
  isCancelledTripStatus,
  resolveActiveGoneAction,
} from '../lib/cancellation';
import { hasActiveTrip } from '../lib/isLiveTrip';
import { subscribeToDriverChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useOnlineStore } from '../store/onlineStore';
import { useTripStore } from '../store/tripStore';

export const DriverRealtimeProvider: React.FC = () => {
  const { replace } = useAppNavigation();
  const driverId = useAuthStore((s) => s.driverId);
  const isOnline = useOnlineStore((s) => s.isOnline);
  const handledTripRef = useRef<string | null>(null);
  const handledCancelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!driverId || !isOnline) return;

    const goTripCancelled = (
      payload: Record<string, unknown> | null | undefined,
      tripId?: string,
    ) => {
      const id = tripId ?? (payload?.id != null ? String(payload.id) : null);
      if (id && handledCancelRef.current === id) return;
      if (id) handledCancelRef.current = id;
      handledTripRef.current = null;
      // Navigate BEFORE clearTrip. AuthRedirectWatcher bounces TRIP_ROUTES → Active
      // when the store is empty; clearing first races and closes without notice.
      // TripCancelledScreen clears on VOLVER.
      replace('TripCancelled', buildTripCancelledParams(payload));
    };

    const onTripRequest = (payload: any) => {
      if (!payload?.id) return;
      if (payload.status !== 'request_received' && payload.status !== 'offered') return;
      if (handledTripRef.current === payload.id) return;
      handledTripRef.current = payload.id;
      handledCancelRef.current = null;
      useTripStore.getState().setActiveTrip(payload);
      replace('IncomingRequest');
    };

    const onTripCancelled = (payload: any) => {
      goTripCancelled(payload, payload?.id != null ? String(payload.id) : undefined);
    };

    const unsubscribe = subscribeToDriverChannel(driverId, onTripRequest, onTripCancelled);

    // Fallback poll: recovers offers missed by realtime, and detects passenger
    // cancel post-accept when the trip:cancelled broadcast is lost (/trips/active
    // only returns non-terminal trips → null when cancelled).
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        const trip = data?.data ?? data;
        const store = useTripStore.getState();

        if (!trip) {
          const localId = store.activeTripId;
          const localTrip = store.trip;
          if (!localId || !hasActiveTrip(localTrip)) return;
          if (handledCancelRef.current === localId) return;
          try {
            const detailRes = await apiClient.get(`/trips/${localId}`);
            const detail = detailRes.data?.data ?? detailRes.data;
            const resolved = resolveActiveGoneAction(detail);
            if (resolved.action === 'trip_cancelled') {
              goTripCancelled(detail, localId);
            }
          } catch {
            /* keep local state; realtime may still deliver */
          }
          return;
        }

        if (isCancelledTripStatus(trip.status)) {
          goTripCancelled(trip, trip.id);
          return;
        }

        if (trip.status !== 'request_received' && trip.status !== 'offered') return;
        if (handledTripRef.current === trip.id) return;
        handledTripRef.current = trip.id;
        handledCancelRef.current = null;
        useTripStore.getState().setActiveTrip(trip);
        replace('IncomingRequest');
      } catch {}
    }, 5_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [driverId, isOnline, replace]);

  return null;
};
