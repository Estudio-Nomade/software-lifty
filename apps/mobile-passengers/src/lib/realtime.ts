import type { RealtimeChannel } from '@supabase/supabase-js';
import type { TripMessage } from '../api/types';
import { isTripMessage } from './chatMessages';
import { supabase } from './supabase';

export interface TripChatCallbacks {
  onMessage?: (message: TripMessage) => void;
}

export type DriverLocationPayload = {
  lat: number;
  lng: number;
  heading?: number;
  driver_id: string;
  timestamp?: string;
};

type MessageListener = (message: TripMessage) => void;
type LocationListener = (location: DriverLocationPayload) => void;

/**
 * One shared Supabase channel per trip. Chat and driver-location both use the
 * `trip:{tripId}` topic; opening Chat on top of TripInProgress must not create
 * a second channel that fights the location subscription.
 */
type TripHub = {
  channel: RealtimeChannel;
  messageListeners: Set<MessageListener>;
  locationListeners: Set<LocationListener>;
  subscribed: boolean;
};

const tripHubs = new Map<string, TripHub>();

function ensureTripHub(tripId: string): TripHub {
  const existing = tripHubs.get(tripId);
  if (existing) return existing;

  const channel = supabase.channel(`trip:${tripId}`, {
    config: { broadcast: { self: false } },
  });

  const hub: TripHub = {
    channel,
    messageListeners: new Set(),
    locationListeners: new Set(),
    subscribed: false,
  };

  channel.on('broadcast', { event: 'message:sent' }, ({ payload }) => {
    if (!isTripMessage(payload)) return;
    for (const listener of hub.messageListeners) {
      listener(payload);
    }
  });

  channel.on('broadcast', { event: 'driver:location' }, ({ payload }) => {
    const loc = payload as DriverLocationPayload;
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return;
    for (const listener of hub.locationListeners) {
      listener(loc);
    }
  });

  channel.subscribe((status) => {
    hub.subscribed = status === 'SUBSCRIBED';
  });

  tripHubs.set(tripId, hub);
  return hub;
}

function releaseTripHub(tripId: string, hub: TripHub): void {
  if (hub.messageListeners.size > 0 || hub.locationListeners.size > 0) return;
  supabase.removeChannel(hub.channel);
  tripHubs.delete(tripId);
}

/**
 * Subscribes to `message:sent` on the shared `trip:{tripId}` channel.
 * Returns an unsubscribe that only tears the channel down when no other
 * listeners (chat or location) remain.
 */
export function subscribeToTripChannel(tripId: string, callbacks: TripChatCallbacks): () => void {
  const hub = ensureTripHub(tripId);
  const listener = callbacks.onMessage;
  if (listener) hub.messageListeners.add(listener);

  return () => {
    if (listener) hub.messageListeners.delete(listener);
    releaseTripHub(tripId, hub);
  };
}

export function subscribeToDriverLocation(
  tripId: string,
  onDriverLocation: (location: DriverLocationPayload) => void,
): () => void {
  const hub = ensureTripHub(tripId);
  hub.locationListeners.add(onDriverLocation);

  return () => {
    hub.locationListeners.delete(onDriverLocation);
    releaseTripHub(tripId, hub);
  };
}

export function subscribeToPassengerChannel(
  passengerId: string,
  onTripStatus: (trip: any) => void,
): () => void {
  const channel = supabase.channel(`passenger:${passengerId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'trip:status' }, ({ payload }) => {
    onTripStatus(payload);
  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Test helper — clears in-memory hubs (does not touch live sockets). */
export function __resetTripHubsForTests(): void {
  for (const [tripId, hub] of tripHubs) {
    supabase.removeChannel(hub.channel);
    tripHubs.delete(tripId);
  }
}
