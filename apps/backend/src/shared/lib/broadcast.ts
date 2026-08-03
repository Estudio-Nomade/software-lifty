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

function shouldBroadcast(tripId: string, lat: number, lng: number): boolean {
  const last = lastBroadcastMap.get(tripId);
  if (!last) return true;

  const timeSinceLast = Date.now() - last.timestamp;
  if (timeSinceLast < MIN_INTERVAL_MS) return false;

  const distanceKm = haversineDistance(last.lat, last.lng, lat, lng);
  if (distanceKm * 1000 < MIN_DISTANCE_M) return false;

  return true;
}

export function broadcastTripLocation(tripId: string, payload: LocationPayload): void {
  if (!shouldBroadcast(tripId, payload.lat, payload.lng)) return;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return;
  }

  const topic = `trip:${tripId}`;

  lastBroadcastMap.set(tripId, {
    timestamp: Date.now(),
    lat: payload.lat,
    lng: payload.lng,
  });

  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event: 'driver:location',
          payload: {
            ...payload,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    }),
  })
    .then((res) => logger.info('[BROADCAST] Response:', res.status))
    .catch((err) => logger.error('[BROADCAST] Error:', (err as Error).message));
}

export function clearBroadcastThrottle(tripId: string): void {
  lastBroadcastMap.delete(tripId);
}
