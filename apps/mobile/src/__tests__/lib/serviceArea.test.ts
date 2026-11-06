import {
  LEGACY_VD_MARKET,
  PICKUP_RADIUS_KM,
  SERVICE_AREA_HUB,
  findPickupMarket,
  getActiveServiceMarkets,
  isInsidePickupArea,
  resetServiceMarketsToLegacy,
  setActiveServiceMarkets,
  type ServiceMarketGeo,
} from '../../lib/serviceArea';

const TANDIL = { lat: -37.3217, lng: -59.1332 };
const CABA = { lat: -34.6037, lng: -58.3816 };

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

describe('serviceArea (driver address preview)', () => {
  afterEach(() => {
    resetServiceMarketsToLegacy();
  });

  it('mirrors BE hub near Villa Dolores', () => {
    expect(SERVICE_AREA_HUB.lat).toBeCloseTo(-31.945, 2);
    expect(SERVICE_AREA_HUB.lng).toBeCloseTo(-65.19, 2);
    expect(PICKUP_RADIUS_KM).toBe(8);
  });

  it('treats hub center as inside pickup (legacy boot)', () => {
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  it('treats Córdoba capital as outside pickup', () => {
    expect(isInsidePickupArea(-31.4201, -64.1888)).toBe(false);
  });

  it('rejects non-finite coords', () => {
    expect(isInsidePickupArea(Number.NaN, SERVICE_AREA_HUB.lng)).toBe(false);
  });

  it('with VD + Tandil active, Tandil hub is inside and CABA outside', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
    expect(findPickupMarket(TANDIL.lat, TANDIL.lng)?.slug).toBe('tandil');
    expect(findPickupMarket(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)?.slug).toBe(
      'villa-dolores',
    );
  });

  it('ignores draft/paused markets (parity BE)', () => {
    setActiveServiceMarkets([
      LEGACY_VD_MARKET,
      tandilMarket({ status: 'draft' }),
      tandilMarket({ id: 'paused', status: 'paused' }),
    ]);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
    expect(getActiveServiceMarkets().every((m) => m.status === 'active')).toBe(true);
  });

  it('empty set falls back to legacy VD', () => {
    setActiveServiceMarkets([]);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
  });
});
