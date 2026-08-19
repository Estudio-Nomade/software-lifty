import type { Trip } from '../api/types';

const OFFER_LIVE_MS = 60 * 1000;
const WAITING_LIVE_MS = 5 * 60 * 1000;
const IN_PROGRESS_LIVE_MS = 6 * 60 * 60 * 1000;

export function isLiveTrip(trip: Trip | null | undefined, now: number = Date.now()): boolean {
  if (!trip) return false;
  const updatedAt = Date.parse(trip.updated_at);
  if (Number.isNaN(updatedAt)) return false;
  const age = now - updatedAt;
  if (age < 0) return false;

  switch (trip.status) {
    case 'offered':
    case 'request_received':
      return age < OFFER_LIVE_MS;
    case 'waiting':
      return age < WAITING_LIVE_MS;
    case 'accepted':
    case 'en_route':
    case 'in_trip':
      return age < IN_PROGRESS_LIVE_MS;
    default:
      return false;
  }
}
