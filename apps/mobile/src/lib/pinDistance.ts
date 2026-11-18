import { COMPLETE_EXCEPTION_MAX_M, COMPLETE_OK_RADIUS_M } from './completeException';
import { haversineDistance } from './geo';

export type PinDistanceTone = 'ok' | 'warn' | 'far';

/** Haversine meters from driver GPS to trip dest pin. Null if any coord missing. */
export function metersToDestPin(
  lat: number | null | undefined,
  lng: number | null | undefined,
  destLat: number | null | undefined,
  destLng: number | null | undefined,
): number | null {
  if (lat == null || lng == null || destLat == null || destLng == null) return null;
  return Math.round(haversineDistance(lat, lng, destLat, destLng) * 1000);
}

export function pinDistanceTone(meters: number): PinDistanceTone {
  if (meters <= COMPLETE_OK_RADIUS_M) return 'ok';
  if (meters <= COMPLETE_EXCEPTION_MAX_M) return 'warn';
  return 'far';
}

/** Idle label before FINALIZAR — haversine to pin, not route/manoeuvre distance. */
export function formatPinDistanceLabel(meters: number): string {
  const rounded = Math.round(meters);
  const body =
    rounded >= 1000
      ? `~${(rounded / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km del pin`
      : `~${rounded} m del pin`;

  if (rounded <= COMPLETE_OK_RADIUS_M) {
    return `${body} · OK para finalizar`;
  }
  if (rounded <= COMPLETE_EXCEPTION_MAX_M) {
    return `${body} · >${COMPLETE_OK_RADIUS_M} m — puede pedir motivo`;
  }
  return `${body} · muy lejos del pin`;
}
