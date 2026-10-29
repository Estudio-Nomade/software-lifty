import { AppError } from './errors';
import { haversineDistance } from './geo';
import { logger } from './logger';

/** Geofence radius per launch hub (km). Product lock: 20 km × 3. */
export const LAUNCH_CLUSTER_RADIUS_KM = 20;

/** Launch hubs — Villa Dolores + San Pedro + Villa Sarmiento (Maps lock). */
export const LAUNCH_CLUSTER_HUBS = [
  { name: 'Villa Dolores', lat: -31.9449464, lng: -65.1905677 },
  { name: 'San Pedro', lat: -31.936553, lng: -65.2189268 },
  { name: 'Villa Sarmiento', lat: -31.9358863, lng: -65.1915949 },
] as const;

const OUT_OF_SERVICE_MESSAGE =
  'El origen o destino está fuera de la zona de servicio Lifty (Villa Dolores, San Pedro, Villa Sarmiento).';

/** True if point is within 20 km of any launch hub. */
export function isInsideLaunchCluster(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return LAUNCH_CLUSTER_HUBS.some(
    (hub) => haversineDistance(lat, lng, hub.lat, hub.lng) <= LAUNCH_CLUSTER_RADIUS_KM,
  );
}

export function assertInsideLaunchCluster(
  lat: number,
  lng: number,
  label: 'origin' | 'destination' | string = 'point',
): void {
  if (isInsideLaunchCluster(lat, lng)) return;

  logger.warn('[SERVICE_AREA] point outside launch cluster', {
    code: 'OUT_OF_SERVICE_AREA',
    label,
    lat,
    lng,
  });

  throw new AppError(OUT_OF_SERVICE_MESSAGE, 400, 'OUT_OF_SERVICE_AREA');
}

/** Reject fare/trip when origin or destination is outside the launch cluster. */
export function assertTripInsideLaunchCluster(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): void {
  assertInsideLaunchCluster(origin.lat, origin.lng, 'origin');
  assertInsideLaunchCluster(dest.lat, dest.lng, 'destination');
}
