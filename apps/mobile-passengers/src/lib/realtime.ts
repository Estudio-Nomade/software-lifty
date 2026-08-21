import type { TripMessage } from '../api/types';
import { isTripMessage } from './chatMessages';
import { supabase } from './supabase';

export interface TripChatCallbacks {
  onMessage?: (message: TripMessage) => void;
}

/**
 * Subscribes to the `trip:{tripId}` Supabase Realtime channel and forwards
 * `message:sent` broadcasts (emitted by the backend after persisting a chat
 * message). Returns an unsubscribe function that removes the channel.
 */
export function subscribeToTripChannel(tripId: string, callbacks: TripChatCallbacks): () => void {
  const channel = supabase.channel(`trip:${tripId}`);

  if (callbacks.onMessage) {
    channel.on('broadcast', { event: 'message:sent' }, ({ payload }) => {
      if (isTripMessage(payload)) {
        callbacks.onMessage?.(payload);
      }
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

export function subscribeToPassengerChannel(
  passengerId: string,
  onTripStatus: (trip: any) => void,
): () => void {
  const channel = supabase.channel(`passenger:${passengerId}`);

  channel.on('broadcast', { event: 'trip:status' }, ({ payload }) => {
    onTripStatus(payload);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToDriverLocation(
  tripId: string,
  onDriverLocation: (location: {
    lat: number;
    lng: number;
    heading?: number;
    driver_id: string;
    timestamp?: string;
  }) => void,
): () => void {
  const channel = supabase.channel(`trip:${tripId}`);

  channel.on('broadcast', { event: 'driver:location' }, ({ payload }) => {
    onDriverLocation(payload);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}
