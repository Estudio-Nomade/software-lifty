import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { buildTripCancelledParams } from '../lib/cancellation';
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

    const onTripRequest = (payload: any) => {
      if (!payload?.id) return;
      if (payload.status !== 'request_received' && payload.status !== 'offered') return;
      if (handledTripRef.current === payload.id) return;
      handledTripRef.current = payload.id;
      useTripStore.getState().setActiveTrip(payload);
      replace('IncomingRequest');
    };

    const onTripCancelled = (payload: any) => {
      handledTripRef.current = null;
      useTripStore.getState().clearTrip();
      replace('TripCancelled', buildTripCancelledParams(payload));
    };

    const unsubscribe = subscribeToDriverChannel(driverId, onTripRequest, onTripCancelled);

    // Fallback poll: recovers offers missed by the realtime channel (e.g. a
    // brief disconnection) while the driver is online, regardless of screen.
    // Shares `handledTripRef` with the realtime handler so a single offer never
    // triggers two navigations.
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        const trip = data?.data ?? data;
        if (!trip) return;
        if (trip.status !== 'request_received' && trip.status !== 'offered') return;
        if (handledTripRef.current === trip.id) return;
        handledTripRef.current = trip.id;
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
