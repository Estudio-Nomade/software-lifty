import { useLocationStore } from '../store/locationStore';
import { createSmoother } from './locationSmoother';

const smoother = createSmoother();

/** Call when tracking stops so the next session starts from a raw fix. */
export function resetLocationSmoothing(): void {
  smoother.reset();
}

/** Shared task name — keep in sync with stop/start Location APIs. */
export const LOCATION_TASK_NAME = 'lifty-location';

/** Max-precision tracking: battery is not a constraint (product decision 2026-11-26). */
export const BG_LOCATION_TIME_INTERVAL_MS = 2_000;
export const BG_LOCATION_DISTANCE_INTERVAL_M = 0;
export const FG_LOCATION_TIME_INTERVAL_MS = 1_000;
export const PRECISE_LOCATION_REQUIRED_MSG =
  'Lifty necesita tu ubicación exacta. Activá “Ubicación precisa” en Ajustes e intentá de nuevo.';

export const BG_LOCATION_PERMISSION_MSG =
  'Para seguir recibiendo viajes con la app en segundo plano, permití la ubicación “siempre” / “todo el tiempo” en Ajustes.';

/**
 * Expo Go (and some bare hosts) only expose When In Use in iOS Settings.
 * Always / background requires a native binary with UIBackgroundModes + Always plist keys.
 */
export const BG_LOCATION_UNAVAILABLE_MSG =
  'En este runtime (p. ej. Expo Go) iOS no ofrece ubicación “Siempre”. Podés conectarte igual con la app abierta. Para segundo plano real usá un build nativo (dev/preview).';

export const LOCATION_DENIED_MSG =
  'No pudimos obtener tu ubicación. Activá el GPS o permití el acceso e intentá de nuevo.';

/**
 * Client-side complete gate: block POST when fix accuracy is present and worse
 * than this (meters). Stricter than BE gpsAccuracyMaxM (~50) so we avoid
 * burning complete rate-limit on indoor/Expo Go noise. null/unknown does not block.
 */
export const COMPLETE_GPS_ACCURACY_MAX_M = 40;

export function normalizeGpsAccuracyM(accuracy: number | null | undefined): number | null {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return accuracy;
}

/** True only when accuracy is known and worse than maxM — null/unknown never blocks. */
export function isGpsAccuracyTooLow(
  accuracy: number | null | undefined,
  maxM: number = COMPLETE_GPS_ACCURACY_MAX_M,
): boolean {
  const m = normalizeGpsAccuracyM(accuracy);
  return m != null && m > maxM;
}

export function applyLocationCoords(
  lat: number,
  lng: number,
  heading?: number | null,
  accuracy?: number | null,
  speed?: number | null,
  timestamp?: number | null,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  const acc = normalizeGpsAccuracyM(accuracy);
  const spd = speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null;
  const ts = timestamp != null && Number.isFinite(timestamp) ? timestamp : null;
  const smooth = smoother.update({
    lat,
    lng,
    accuracy: acc,
    speed: spd,
    timestamp: ts ?? Date.now(),
  });
  useLocationStore.getState().setLocation(smooth.lat, smooth.lng, heading ?? null, acc, spd, ts);
  useLocationStore.getState().setLocationError(null);
  return true;
}

export type StartTrackingOptions = {
  /** When true (online / active trip), start TaskManager location updates for bg. */
  enableBackground?: boolean;
};

export function shouldStartBackgroundUpdates(
  options: StartTrackingOptions | undefined,
  isWeb: boolean,
): boolean {
  return Boolean(options?.enableBackground) && !isWeb;
}

export function buildBackgroundLocationOptions(accuracyBalanced: number) {
  return {
    accuracy: accuracyBalanced,
    timeInterval: BG_LOCATION_TIME_INTERVAL_MS,
    distanceInterval: BG_LOCATION_DISTANCE_INTERVAL_M,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Lifty — en línea',
      notificationBody: 'Compartiendo ubicación para recibir viajes.',
      notificationColor: '#1BBFAE',
    },
  };
}

/** Backend rejects fixes older than 10 s; do not bother sending them. */
const MAX_SEND_AGE_MS = 10_000;

export type FixPayload = {
  lat: number;
  lng: number;
  heading?: number;
  accuracy?: number;
  speed?: number;
  timestamp?: number;
};

/**
 * Body for WS frames and heartbeat PUTs, from the last stored fix.
 * Null fields are omitted (the backend schema takes optional numbers, not nulls).
 */
export function buildFixPayload(now: number = Date.now()): FixPayload | null {
  const { lat, lng, heading, accuracy, speed, fixAt } = useLocationStore.getState();
  if (lat == null || lng == null) return null;
  if (fixAt != null && now - fixAt > MAX_SEND_AGE_MS) return null;
  const payload: FixPayload = { lat, lng };
  if (heading != null) payload.heading = heading;
  if (accuracy != null) payload.accuracy = accuracy;
  if (speed != null) payload.speed = speed;
  if (fixAt != null) payload.timestamp = fixAt;
  return payload;
}
