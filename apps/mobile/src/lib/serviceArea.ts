import { haversineDistance } from './geo';

/**
 * Mirror of apps/backend/src/shared/lib/service-area.ts (hub + pickup radius).
 * Client preview only — SoT remains backend buildMunicipalityResult (#477/#481).
 */
export const SERVICE_AREA_HUB = {
  name: 'Villa Dolores',
  lat: -31.9449464,
  lng: -65.1905677,
} as const;

/** Max km from hub for driver address “inside launch” preview. */
export const PICKUP_RADIUS_KM = 8;

export function isInsidePickupArea(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    haversineDistance(lat, lng, SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng) <= PICKUP_RADIUS_KM
  );
}
