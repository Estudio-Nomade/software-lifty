export type SmoothFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  /** Ground speed in m/s, used as process noise; unknown → DEFAULT_SPEED_MS. */
  speed?: number | null;
};

const DEFAULT_SPEED_MS = 3;
const DEFAULT_ACCURACY_M = 20;
const MIN_ACCURACY_M = 1;
/** After this long without a fix the driver may have moved far; start over. */
const RESET_GAP_MS = 30_000;

/**
 * Accuracy-weighted Kalman filter on lat/lng (variance tracked in m²).
 * Good fixes pull the estimate hard, poor fixes barely move it, and a faster driver
 * widens the process noise so the marker keeps up.
 */
export function createSmoother() {
  let state: { lat: number; lng: number; variance: number; ts: number } | null = null;

  return {
    update(fix: SmoothFix): { lat: number; lng: number } {
      const acc = Math.max(fix.accuracy ?? DEFAULT_ACCURACY_M, MIN_ACCURACY_M);
      if (!state || fix.timestamp - state.ts > RESET_GAP_MS) {
        state = { lat: fix.lat, lng: fix.lng, variance: acc * acc, ts: fix.timestamp };
        return { lat: fix.lat, lng: fix.lng };
      }

      const dtS = Math.max(0, fix.timestamp - state.ts) / 1000;
      const q = fix.speed != null && fix.speed > 0 ? fix.speed : DEFAULT_SPEED_MS;
      const variance = state.variance + dtS * q * q;
      const k = variance / (variance + acc * acc);
      // lng degrees shrink with latitude, but k is a unitless blend so degrees are fine here.
      state = {
        lat: state.lat + k * (fix.lat - state.lat),
        lng: state.lng + k * (fix.lng - state.lng),
        variance: (1 - k) * variance,
        ts: Math.max(state.ts, fix.timestamp),
      };
      return { lat: state.lat, lng: state.lng };
    },
    reset(): void {
      state = null;
    },
  };
}
