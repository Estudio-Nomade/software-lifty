import {
  LEGACY_VD_MARKET,
  PICKUP_RADIUS_KM,
  SERVICE_AREA_HUB,
  bindActiveServiceMarketsFetcher,
  ensureActiveServiceMarkets,
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
    bindActiveServiceMarketsFetcher(null);
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

  it('successful empty /active response falls back to legacy (drops prior Tandil)', async () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket()]);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);

    bindActiveServiceMarketsFetcher(async () => ({ items: [] }));
    await ensureActiveServiceMarkets({ force: true });

    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  it('ensure with VD+Tandil payload makes Tandil inside (ops mirror path)', async () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);

    bindActiveServiceMarketsFetcher(async () => ({
      items: [
        {
          id: LEGACY_VD_MARKET.id,
          slug: LEGACY_VD_MARKET.slug,
          name: LEGACY_VD_MARKET.name,
          province: LEGACY_VD_MARKET.province,
          hub_lat: LEGACY_VD_MARKET.hub_lat,
          hub_lng: LEGACY_VD_MARKET.hub_lng,
          pickup_radius_km: LEGACY_VD_MARKET.pickup_radius_km,
          dropoff_radius_km: LEGACY_VD_MARKET.dropoff_radius_km,
          match_radius_km: LEGACY_VD_MARKET.match_radius_km,
          geo_bias_radius_km: LEGACY_VD_MARKET.geo_bias_radius_km,
        },
        {
          id: 'api-tandil',
          slug: 'tandil',
          name: 'Tandil',
          province: 'Buenos Aires',
          hub_lat: TANDIL.lat,
          hub_lng: TANDIL.lng,
          pickup_radius_km: 8,
          dropoff_radius_km: 50,
          match_radius_km: 8,
          geo_bias_radius_km: 20,
        },
      ],
    }));
    await ensureActiveServiceMarkets({ force: true });

    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
    expect(getActiveServiceMarkets().map((m) => m.slug).sort()).toEqual([
      'tandil',
      'villa-dolores',
    ]);
  });

  it('failed fetch does not lock non-force retry (Usar ubicación recovery)', async () => {
    let calls = 0;
    bindActiveServiceMarketsFetcher(async () => {
      calls += 1;
      throw new Error('offline');
    });

    await ensureActiveServiceMarkets({ force: true });
    await ensureActiveServiceMarkets();
    expect(calls).toBe(2);
  });

  it('fail then force success with tandil payload → Tandil inside (locate path)', async () => {
    resetServiceMarketsToLegacy();
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);

    let calls = 0;
    bindActiveServiceMarketsFetcher(async () => {
      calls += 1;
      if (calls === 1) throw new Error('401');
      return {
        items: [
          {
            id: LEGACY_VD_MARKET.id,
            slug: LEGACY_VD_MARKET.slug,
            name: LEGACY_VD_MARKET.name,
            province: LEGACY_VD_MARKET.province,
            hub_lat: LEGACY_VD_MARKET.hub_lat,
            hub_lng: LEGACY_VD_MARKET.hub_lng,
            pickup_radius_km: LEGACY_VD_MARKET.pickup_radius_km,
            dropoff_radius_km: LEGACY_VD_MARKET.dropoff_radius_km,
            match_radius_km: LEGACY_VD_MARKET.match_radius_km,
            geo_bias_radius_km: LEGACY_VD_MARKET.geo_bias_radius_km,
          },
          {
            id: 'api-tandil',
            slug: 'tandil',
            name: 'Tandil',
            province: 'Buenos Aires',
            hub_lat: TANDIL.lat,
            hub_lng: TANDIL.lng,
            pickup_radius_km: 8,
            dropoff_radius_km: 50,
            match_radius_km: 8,
            geo_bias_radius_km: 20,
          },
        ],
      };
    });

    await ensureActiveServiceMarkets({ force: true });
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(false);

    await ensureActiveServiceMarkets({ force: true });
    expect(calls).toBe(2);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);
    // 9 de Julio 658, Tandil ≈ 0.44 km from hub
    expect(isInsidePickupArea(-37.32515, -59.13572)).toBe(true);
    expect(isInsidePickupArea(CABA.lat, CABA.lng)).toBe(false);
  });

  it('successful fetch still TTL-skips non-force within window', async () => {
    let calls = 0;
    bindActiveServiceMarketsFetcher(async () => {
      calls += 1;
      return {
        items: [
          {
            id: 'api-tandil',
            slug: 'tandil',
            name: 'Tandil',
            province: 'Buenos Aires',
            hub_lat: TANDIL.lat,
            hub_lng: TANDIL.lng,
            pickup_radius_km: 8,
            dropoff_radius_km: 50,
            match_radius_km: 8,
            geo_bias_radius_km: 20,
          },
        ],
      };
    });

    await ensureActiveServiceMarkets({ force: true });
    await ensureActiveServiceMarkets();
    expect(calls).toBe(1);
    expect(isInsidePickupArea(TANDIL.lat, TANDIL.lng)).toBe(true);

    await ensureActiveServiceMarkets({ force: true });
    expect(calls).toBe(2);
  });
});
