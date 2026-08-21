import { apiClient } from '../api/client';
import type { TripMessage } from '../api/types';
import { isTripMessage } from './chatMessages';
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

export async function sendMessage(tripId: string, text: string): Promise<TripMessage> {
  const res = await apiClient.post(`/trips/${tripId}/messages`, { text });
  return res.data?.data ?? res.data;
}
