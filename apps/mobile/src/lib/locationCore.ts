import { useLocationStore } from '../store/locationStore';

/** Shared task name — keep in sync with stop/start Location APIs. */
export const LOCATION_TASK_NAME = 'lifty-location';

/** BG location interval targets BE freshness (5 min) with battery headroom. */
export const BG_LOCATION_TIME_INTERVAL_MS = 60_000;
export const BG_LOCATION_DISTANCE_INTERVAL_M = 50;

export const BG_LOCATION_PERMISSION_MSG =
  'Para seguir recibiendo viajes con la app en segundo plano, permití la ubicación “siempre” / “todo el tiempo” en Ajustes.';

export const LOCATION_DENIED_MSG =
  'No pudimos obtener tu ubicación. Activá el GPS o permití el acceso e intentá de nuevo.';

export function applyLocationCoords(lat: number, lng: number, heading?: number | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  useLocationStore.getState().setLocation(lat, lng, heading ?? null);
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
    deferredUpdatesInterval: BG_LOCATION_TIME_INTERVAL_MS,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Lifty — en línea',
      notificationBody: 'Compartiendo ubicación para recibir viajes.',
      notificationColor: '#1BBFAE',
    },
  };
}
