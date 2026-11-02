import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import { haversineDistance } from './geo';
import {
  DROPOFF_RADIUS_KM,
  LEGACY_VD_MARKET,
  PICKUP_RADIUS_KM,
  SERVICE_AREA_HUB,
  type ServiceMarketGeo,
  assertTripInsideServiceArea,
  findPickupMarket,
  isInsideDropoffArea,
  isInsidePickupArea,
  resetServiceMarketsToLegacy,
  setActiveServiceMarkets,
} from './service-area';

const SP = { lat: -31.936553, lng: -65.2189268 };
const VS = { lat: -31.9358863, lng: -65.1915949 };
const CABA = { lat: -34.6037, lng: -58.3816 };
const CORDOBA = { lat: -31.4201, lng: -64.1888 };
/** Plaza Independencia Tandil approx. */
const TANDIL = { lat: -37.3217, lng: -59.1332 };

function pointEastOfHub(
  hub: { lat: number; lng: number },
  km: number,
): { lat: number; lng: number } {
  const latRad = (hub.lat * Math.PI) / 180;
  const degPerKm = 1 / (111.32 * Math.cos(latRad));
  return { lat: hub.lat, lng: hub.lng + km * degPerKm };
}

const near5km = pointEastOfHub(SERVICE_AREA_HUB, 5);
const rosas13 = pointEastOfHub(SERVICE_AREA_HUB, 13);
const tapias9_3 = pointEastOfHub(SERVICE_AREA_HUB, 9.3);

function tandilMarket(overrides: Partial<ServiceMarketGeo> = {}): ServiceMarketGeo {
  return {
    id: 'test-tandil',
    slug: 'tandil',
    name: 'Tandil',
    province: 'Buenos Aires',
    status: 'active',
    hub_lat: TANDIL.lat,
    hub_lng: TANDIL.lng,
    pickup_radius_km: 8,
    dropoff_radius_km: 50,
    match_radius_km: 8,
    geo_bias_radius_km: 20,
    ...overrides,
  };
}

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

describe('isInsidePickupArea (legacy VD)', () => {
  test('resets to legacy between multi-market cases', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  test('true at VD hub', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  test('true at SP / VS coords (within 8 km of VD)', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(SP.lat, SP.lng)).toBe(true);
    expect(isInsidePickupArea(VS.lat, VS.lng)).toBe(true);
  });

  test('true ~5 km from hub', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(near5km.lat, near5km.lng)).toBe(true);
  });

  test('false for Rosas ~13 km', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(rosas13.lat, rosas13.lng)).toBe(false);
  });

  test('false for Tapias ~9.3 km', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(tapias9_3.lat, tapias9_3.lng)).toBe(false);
  });

  test('false for CABA / Córdoba capital / Tandil (no Tandil market)', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
    expect(isInsidePickupArea(CORDOBA.lat, CORDOBA.lng)).toBe(false);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
  });

  test('false for NaN / non-finite', () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(Number.NaN, -65.19)).toBe(false);
    expect(isInsidePickupArea(-31.94, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isInsideDropoffArea (legacy VD)', () => {
  test('true at hub, SP, VS, Rosas, Tapias', () => {
    resetServiceMarketsToLegacy();
    expect(isInsideDropoffArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsideDropoffArea(SP.lat, SP.lng)).toBe(true);
    expect(isInsideDropoffArea(VS.lat, VS.lng)).toBe(true);
    expect(isInsideDropoffArea(rosas13.lat, rosas13.lng)).toBe(true);
    expect(isInsideDropoffArea(tapias9_3.lat, tapias9_3.lng)).toBe(true);
  });

  test('false for CABA / Córdoba capital', () => {
    resetServiceMarketsToLegacy();
    expect(isInsideDropoffArea(CABA.lat, CABA.lng)).toBe(false);
    expect(isInsideDropoffArea(CORDOBA.lat, CORDOBA.lng)).toBe(false);
  });

  test('false for NaN', () => {
    resetServiceMarketsToLegacy();
    expect(isInsideDropoffArea(Number.NaN, -65.19)).toBe(false);
  });
});

describe('assertTripInsideServiceArea (legacy VD)', () => {
  test('allows VD → Rosas (pickup ok, dropoff ok)', () => {
    resetServiceMarketsToLegacy();
    expect(() =>
      assertTripInsideServiceArea(
        { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng },
        rosas13,
      ),
    ).not.toThrow();
  });

  test('rejects Rosas → VD with OUT_OF_PICKUP_AREA', () => {
    resetServiceMarketsToLegacy();
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
    resetServiceMarketsToLegacy();
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
    resetServiceMarketsToLegacy();
    try {
      assertTripInsideServiceArea(CABA, CORDOBA);
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_PICKUP_AREA');
    }
  });
});

describe('multi-market service area', () => {
  test('activating Tandil allows Tandil pickup without breaking VD', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
    expect(findPickupMarket(TANDIL.lat, TANDIL.lng)?.slug).toBe('tandil');
    expect(findPickupMarket(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)?.slug).toBe(
      'villa-dolores',
    );
  });

  test('trip Tandil → nearby OK; Tandil → VD hub fails dropoff (no intercity)', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    const nearTandil = pointEastOfHub(TANDIL, 5);
    expect(() => assertTripInsideServiceArea(TANDIL, nearTandil)).not.toThrow();
    try {
      assertTripInsideServiceArea(TANDIL, {
        lat: SERVICE_AREA_HUB.lat,
        lng: SERVICE_AREA_HUB.lng,
      });
      expect.unreachable('should throw');
    } catch (err) {
      expect((err as AppError).code).toBe('OUT_OF_DROPOFF_AREA');
    }
  });

  test('Tandil → dest >50 km from Tandil hub → OUT_OF_DROPOFF_AREA', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    const farFromTandil = pointEastOfHub(TANDIL, 55);
    try {
      assertTripInsideServiceArea(TANDIL, farFromTandil);
      expect.unreachable('should throw');
    } catch (err) {
      expect((err as AppError).code).toBe('OUT_OF_DROPOFF_AREA');
      expect((err as AppError).message).toMatch(/Tandil/i);
    }
  });

  test('far from both hubs → OUT_OF_PICKUP_AREA names active markets', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    try {
      assertTripInsideServiceArea(CABA, CABA);
      expect.unreachable('should throw');
    } catch (err) {
      expect((err as AppError).code).toBe('OUT_OF_PICKUP_AREA');
      expect((err as AppError).message).toMatch(/Villa Dolores/i);
      expect((err as AppError).message).toMatch(/Tandil/i);
    }
  });

  test('VD hub trip still OK with both markets active', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    expect(() =>
      assertTripInsideServiceArea(
        { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng },
        rosas13,
      ),
    ).not.toThrow();
  });

  test('draft/paused markets are ignored', () => {
    setActiveServiceMarkets([
      LEGACY_VD_MARKET,
      tandilMarket({ status: 'draft' }),
      tandilMarket({ id: 'paused', status: 'paused' }),
    ]);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
  });

  test('empty set falls back to legacy VD', () => {
    setActiveServiceMarkets([]);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
  });
});
