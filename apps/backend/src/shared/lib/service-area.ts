import { AppError } from './errors';
import { haversineDistance } from './geo';
import { logger } from './logger';

/** Single launch hub — Villa Dolores (product lock LOCK D). */
export const SERVICE_AREA_HUB = {
  name: 'Villa Dolores',
  lat: -31.9449464,
  lng: -65.1905677,
} as const;

/** Max distance from hub to request a trip (pickup / origin). */
export const PICKUP_RADIUS_KM = 8;

/** Max distance from hub for destination (dropoff). */
export const DROPOFF_RADIUS_KM = 50;

const OUT_OF_PICKUP_MESSAGE =
  'No pedimos viajes desde esa zona. El origen debe estar cerca de Villa Dolores (hasta ~8 km).';

const OUT_OF_DROPOFF_MESSAGE = 'Destino fuera del alcance Lifty (~50 km desde Villa Dolores).';

function distanceFromHubKm(lat: number, lng: number): number {
  return haversineDistance(lat, lng, SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng);
}

/** True if point is within pickup radius of Villa Dolores hub. */
export function isInsidePickupArea(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return distanceFromHubKm(lat, lng) <= PICKUP_RADIUS_KM;
}

/** True if point is within dropoff radius of Villa Dolores hub. */
export function isInsideDropoffArea(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return distanceFromHubKm(lat, lng) <= DROPOFF_RADIUS_KM;
}

export function assertInsidePickupArea(
  lat: number,
  lng: number,
  label: 'origin' | 'destination' | string = 'point',
): void {
  if (isInsidePickupArea(lat, lng)) return;

  logger.warn('[SERVICE_AREA] point outside pickup area', {
    code: 'OUT_OF_PICKUP_AREA',
    label,
    lat,
    lng,
  });

  throw new AppError(OUT_OF_PICKUP_MESSAGE, 400, 'OUT_OF_PICKUP_AREA');
}

export function assertInsideDropoffArea(
  lat: number,
  lng: number,
  label: 'origin' | 'destination' | string = 'point',
): void {
  if (isInsideDropoffArea(lat, lng)) return;

  logger.warn('[SERVICE_AREA] point outside dropoff area', {
    code: 'OUT_OF_DROPOFF_AREA',
    label,
    lat,
    lng,
  });

  throw new AppError(OUT_OF_DROPOFF_MESSAGE, 400, 'OUT_OF_DROPOFF_AREA');
}

/**
 * Origin must be in pickup (8 km); destination in dropoff (50 km).
 * Checks origin first, then destination.
 */
export function assertTripInsideServiceArea(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): void {
  assertInsidePickupArea(origin.lat, origin.lng, 'origin');
  assertInsideDropoffArea(dest.lat, dest.lng, 'destination');
}

/** @deprecated Prefer isInsidePickupArea (same 8 km hub VD). */
export const isInsideLaunchCluster = isInsidePickupArea;

/** @deprecated Prefer assertTripInsideServiceArea (asymmetric 8/50). */
export const assertTripInsideLaunchCluster = assertTripInsideServiceArea;
