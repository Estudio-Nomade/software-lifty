import type { Trip } from '../api/types';

const PASSENGER_DISPLAY_KEYS = [
  'passenger_name',
  'passenger_avatar_url',
  'passenger_phone',
  'passenger_rating',
  'passenger_cancel_visible',
  'passenger_cancel_rate_pct',
  'passenger_cancel_count_30d',
  'verification_code',
] as const;

/** Unwrap axios / safeCall body shapes. */
export function unwrapTripPayload(payload: unknown): Partial<Trip> | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (root.error) return null;
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    const inner = root.data as Record<string, unknown>;
    if (inner.error) return null;
    return inner as Partial<Trip>;
  }
  return root as Partial<Trip>;
}

/**
 * Merge trip API responses into the store trip.
 * Mutations historically returned bare `trips` rows without joined passenger_*
 * fields — keep prior display fields when the payload omits them / sends null.
 */
export function mergeTripUpdate(prev: Trip | null | undefined, payload: unknown): Trip | null {
  const next = unwrapTripPayload(payload);
  if (!next || !next.id) {
    return prev ?? null;
  }
  if (!prev || prev.id !== next.id) {
    return { ...(prev ?? {}), ...next } as Trip;
  }

  const merged: Trip = { ...prev, ...next };
  for (const key of PASSENGER_DISPLAY_KEYS) {
    const incoming = next[key as keyof Trip];
    const previous = prev[key as keyof Trip];
    if ((incoming === null || incoming === undefined) && previous != null) {
      (merged as Record<string, unknown>)[key] = previous;
    }
  }
  return merged;
}
