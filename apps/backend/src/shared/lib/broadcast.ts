import { haversineDistance } from './geo';
import { logger } from './logger';

interface LocationPayload {
  lat: number;
  lng: number;
  heading?: number;
  driver_id: string;
}

interface LastBroadcast {
  timestamp: number;
  lat: number;
  lng: number;
}

const lastBroadcastMap = new Map<string, LastBroadcast>();
const MIN_INTERVAL_MS = 500;
const MIN_DISTANCE_M = 5;

/** Shared Realtime topic for admin/platform config that every signed-in app can join. */
export const PLATFORM_REALTIME_TOPIC = 'platform:config';

function shouldBroadcast(tripId: string, lat: number, lng: number): boolean {
  const last = lastBroadcastMap.get(tripId);
  if (!last) return true;

  const timeSinceLast = Date.now() - last.timestamp;
  if (timeSinceLast < MIN_INTERVAL_MS) return false;

  const distanceKm = haversineDistance(last.lat, last.lng, lat, lng);
  if (distanceKm * 1000 < MIN_DISTANCE_M) return false;

  return true;
}

function supabaseBroadcastCredentials(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return null;
  }
  return { url, key };
}

/** Low-level Realtime HTTP broadcast (fire-and-forget). */
export function postRealtimeBroadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  const creds = supabaseBroadcastCredentials();
  if (!creds) return;

  fetch(`${creds.url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event,
          payload: {
            ...payload,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    }),
  })
    .then((res) => logger.info('[BROADCAST]', topic, event, res.status))
    .catch((err) => logger.error('[BROADCAST] Error:', (err as Error).message));
}

/** Admin/ops changed shared platform config (payout alias/CVU, phases, etc.). */
export function broadcastPlatformConfigUpdated(payload: Record<string, unknown> = {}): void {
  postRealtimeBroadcast(PLATFORM_REALTIME_TOPIC, 'config:updated', {
    scope: 'platform',
    ...payload,
  });
}

/** Admin/ops changed something on a specific driver account (review, docs, debt…). */
export function broadcastDriverAccountUpdated(
  driverId: string,
  payload: Record<string, unknown> = {},
): void {
  if (!driverId) return;
  postRealtimeBroadcast(`driver:${driverId}`, 'account:updated', {
    driver_id: driverId,
    ...payload,
  });
}

export function broadcastTripLocation(tripId: string, payload: LocationPayload): void {
  if (!shouldBroadcast(tripId, payload.lat, payload.lng)) return;

  lastBroadcastMap.set(tripId, {
    timestamp: Date.now(),
    lat: payload.lat,
    lng: payload.lng,
  });

  postRealtimeBroadcast(`trip:${tripId}`, 'driver:location', {
    ...payload,
  });
}

export function clearBroadcastThrottle(tripId: string): void {
  lastBroadcastMap.delete(tripId);
}

export function broadcastTripMessage(tripId: string, payload: Record<string, unknown>): void {
  postRealtimeBroadcast(`trip:${tripId}`, 'message:sent', payload);
}
