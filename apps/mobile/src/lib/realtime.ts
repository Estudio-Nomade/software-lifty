import { apiClient } from '../api/client';
import { supabase } from './supabase';

export function subscribeToDriverChannel(
  driverId: string,
  onTripRequest: (trip: any) => void,
  onTripCancelled?: (trip: any) => void,
): () => void {
  const channel = supabase.channel(`driver:${driverId}`);

  channel.on('broadcast', { event: 'trip:request' }, ({ payload }) => {
    onTripRequest(payload);
  });

  if (onTripCancelled) {
    channel.on('broadcast', { event: 'trip:cancelled' }, ({ payload }) => {
      onTripCancelled(payload);
    });
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToTripChannel(
  tripId: string,
  callbacks: {
    onMessage?: (message: any) => void;
    onTripAccepted?: () => void;
    onTripArrived?: () => void;
    onTripStarted?: () => void;
    onTripCompleted?: () => void;
    onTripCancelled?: () => void;
    onDriverLocation?: (location: {
      lat: number;
      lng: number;
      heading?: number;
      driver_id: string;
      timestamp: string;
    }) => void;
  },
): () => void {
  const channel = supabase.channel(`trip:${tripId}`);

  if (callbacks.onMessage) {
    channel.on('broadcast', { event: 'message:sent' }, ({ payload }) => {
      callbacks.onMessage?.(payload);
    });
  }

  if (callbacks.onTripAccepted) {
    channel.on('broadcast', { event: 'trip:accepted' }, () => {
      callbacks.onTripAccepted?.();
    });
  }

  if (callbacks.onTripArrived) {
    channel.on('broadcast', { event: 'trip:arrived' }, () => {
      callbacks.onTripArrived?.();
    });
  }

  if (callbacks.onTripStarted) {
    channel.on('broadcast', { event: 'trip:started' }, () => {
      callbacks.onTripStarted?.();
    });
  }

  if (callbacks.onTripCompleted) {
    channel.on('broadcast', { event: 'trip:completed' }, () => {
      callbacks.onTripCompleted?.();
    });
  }

  if (callbacks.onTripCancelled) {
    channel.on('broadcast', { event: 'trip:cancelled' }, () => {
      callbacks.onTripCancelled?.();
    });
  }

  if (callbacks.onDriverLocation) {
    channel.on('broadcast', { event: 'driver:location' }, ({ payload }) => {
      callbacks.onDriverLocation?.(payload);
    });
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendMessage(tripId: string, text: string): Promise<void> {
  await apiClient.post(`/trips/${tripId}/messages`, { text });
}
