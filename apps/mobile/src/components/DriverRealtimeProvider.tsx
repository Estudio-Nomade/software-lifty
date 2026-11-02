import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  buildTripCancelledParams,
  claimTripCancelNotice,
  isCancelledTripStatus,
  resetTripCancelNoticeClaim,
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

  useEffect(() => {
    if (!driverId || !isOnline) return;

    const goTripCancelled = (
      payload: Record<string, unknown> | null | undefined,
      tripId?: string,
    ) => {
      const id = tripId ?? (payload?.id != null ? String(payload.id) : undefined);
      // Shared claim with IncomingRequest — one replace('TripCancelled') per trip.
      // Navigate first; TripCancelledScreen clears store on mount (outside TRIP_ROUTES).
      if (!claimTripCancelNotice(id)) return;
      handledTripRef.current = null;
      replace('TripCancelled', buildTripCancelledParams(payload));
    };

    const onTripRequest = (payload: any) => {
      if (!payload?.id) return;
      if (payload.status !== 'request_received' && payload.status !== 'offered') return;
      if (handledTripRef.current === payload.id) return;
      handledTripRef.current = payload.id;
      resetTripCancelNoticeClaim();
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
        resetTripCancelNoticeClaim();
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
