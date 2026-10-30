import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import { haversineDistance } from './geo';
import {
  DROPOFF_RADIUS_KM,
  PICKUP_RADIUS_KM,
  SERVICE_AREA_HUB,
  assertTripInsideServiceArea,
  isInsideDropoffArea,
  isInsidePickupArea,
} from './service-area';

const SP = { lat: -31.936553, lng: -65.2189268 };
const VS = { lat: -31.9358863, lng: -65.1915949 };
const CABA = { lat: -34.6037, lng: -58.3816 };
const CORDOBA = { lat: -31.4201, lng: -64.1888 };

/** Offset east of hub by approx `km` (lng degrees ≈ km / (111.32 * cos(lat))). */
function pointEastOfHub(km: number): { lat: number; lng: number } {
  const latRad = (SERVICE_AREA_HUB.lat * Math.PI) / 180;
  const degPerKm = 1 / (111.32 * Math.cos(latRad));
  return { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng + km * degPerKm };
}

const near5km = pointEastOfHub(5);
const rosas13 = pointEastOfHub(13);
const tapias9_3 = pointEastOfHub(9.3);

describe('service area radii vs hub', () => {
  test('synthetic points land at expected haversine bands', () => {
    const d5 = haversineDistance(near5km.lat, near5km.lng, SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng);
    const d13 = haversineDistance(rosas13.lat, rosas13.lng, SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng);
    const d93 = haversineDistance(
      tapias9_3.lat,
      tapias9_3.lng,
      SERVICE_AREA_HUB.lat,
      SERVICE_AREA_HUB.lng,
    );
    expect(d5).toBeLessThan(PICKUP_RADIUS_KM);
    expect(d13).toBeGreaterThan(PICKUP_RADIUS_KM);
    expect(d13).toBeLessThan(DROPOFF_RADIUS_KM);
    expect(d93).toBeGreaterThan(PICKUP_RADIUS_KM);
    expect(d93).toBeLessThan(DROPOFF_RADIUS_KM);
  });
});

describe('isInsidePickupArea', () => {
  test('true at VD hub', () => {
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  test('true at SP / VS coords (within 8 km of VD)', () => {
    expect(isInsidePickupArea(SP.lat, SP.lng)).toBe(true);
    expect(isInsidePickupArea(VS.lat, VS.lng)).toBe(true);
  });

  test('true ~5 km from hub', () => {
    expect(isInsidePickupArea(near5km.lat, near5km.lng)).toBe(true);
  });

  test('false for Rosas ~13 km', () => {
    expect(isInsidePickupArea(rosas13.lat, rosas13.lng)).toBe(false);
  });

  test('false for Tapias ~9.3 km', () => {
    expect(isInsidePickupArea(tapias9_3.lat, tapias9_3.lng)).toBe(false);
  });

  test('false for CABA / Córdoba capital', () => {
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
    expect(isInsidePickupArea(CORDOBA.lat, CORDOBA.lng)).toBe(false);
  });

  test('false for NaN / non-finite', () => {
    expect(isInsidePickupArea(Number.NaN, -65.19)).toBe(false);
    expect(isInsidePickupArea(-31.94, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isInsideDropoffArea', () => {
  test('true at hub, SP, VS, Rosas, Tapias', () => {
    expect(isInsideDropoffArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsideDropoffArea(SP.lat, SP.lng)).toBe(true);
    expect(isInsideDropoffArea(VS.lat, VS.lng)).toBe(true);
    expect(isInsideDropoffArea(rosas13.lat, rosas13.lng)).toBe(true);
    expect(isInsideDropoffArea(tapias9_3.lat, tapias9_3.lng)).toBe(true);
  });

  test('false for CABA / Córdoba capital', () => {
    expect(isInsideDropoffArea(CABA.lat, CABA.lng)).toBe(false);
    expect(isInsideDropoffArea(CORDOBA.lat, CORDOBA.lng)).toBe(false);
  });

  test('false for NaN', () => {
    expect(isInsideDropoffArea(Number.NaN, -65.19)).toBe(false);
  });
});

describe('assertTripInsideServiceArea', () => {
  test('allows VD → Rosas (pickup ok, dropoff ok)', () => {
    expect(() =>
      assertTripInsideServiceArea(
        { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng },
        rosas13,
      ),
    ).not.toThrow();
  });

  test('rejects Rosas → VD with OUT_OF_PICKUP_AREA', () => {
    try {
      assertTripInsideServiceArea(rosas13, {
        lat: SERVICE_AREA_HUB.lat,
        lng: SERVICE_AREA_HUB.lng,
      });
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_PICKUP_AREA');
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toMatch(/no pedimos viajes desde esa zona/i);
    }
  });

  test('rejects VD → CABA with OUT_OF_DROPOFF_AREA', () => {
    try {
      assertTripInsideServiceArea(
        { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng },
        CABA,
      );
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_DROPOFF_AREA');
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toMatch(/destino fuera del alcance/i);
    }
  });

  test('origin outside + dest outside fails on origin first', () => {
    try {
      assertTripInsideServiceArea(CABA, CORDOBA);
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_PICKUP_AREA');
    }
  });
});
