import { haversineDistance } from '../../shared/lib/geo';

export type FixInput = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  timestamp?: number | null;
};
export type PrevFix = { lat: number; lng: number; fixAt: number } | null;
export type FixVerdict =
  | { ok: true; fixAt: number }
  | { ok: false; reason: 'invalid' | 'low_accuracy' | 'out_of_order' | 'jump' };

export const MAX_ACCURACY_TRIP_M = 30;
export const MAX_ACCURACY_ONLINE_M = 50;
/** A device timestamp further than this from server time is untrusted (slow/fast phone clock). */
export const MAX_CLOCK_SKEW_MS = 10_000;
export const MAX_SPEED_MS = 41.7;

export function evaluateFix(
  fix: FixInput,
  ctx: { onTrip: boolean; prev: PrevFix; now: number },
): FixVerdict {
  const { lat, lng } = fix;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  // Untrusted clock → server receive time. Never reject on age: a phone whose clock is
  // 30 s slow would otherwise be locked out forever (clients already skip fixes >10 s old).
  const ts = fix.timestamp;
  const fixAt =
    ts != null && Number.isFinite(ts) && Math.abs(ts - ctx.now) <= MAX_CLOCK_SKEW_MS ? ts : ctx.now;
  if (ctx.prev && fixAt < ctx.prev.fixAt) return { ok: false, reason: 'out_of_order' };

  // shortcut: missing accuracy is accepted until all clients send it (plan Task 8).
  const maxAcc = ctx.onTrip ? MAX_ACCURACY_TRIP_M : MAX_ACCURACY_ONLINE_M;
  if (fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > maxAcc) {
    return { ok: false, reason: 'low_accuracy' };
  }

  if (ctx.prev) {
    const dtS = Math.max(1, (fixAt - ctx.prev.fixAt) / 1000);
    const distM = haversineDistance(ctx.prev.lat, ctx.prev.lng, lat, lng) * 1000;
    if (distM / dtS > MAX_SPEED_MS) return { ok: false, reason: 'jump' };
  }

  return { ok: true, fixAt };
}
