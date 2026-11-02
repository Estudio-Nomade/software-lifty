import { AppError } from './errors';
import { haversineDistance } from './geo';
import { logger } from './logger';

/**
 * Operational service market (geo hub + radii).
 * SoT for multi-city growth — see docs/architecture/service-markets-multi-city.md
 */
export type ServiceMarketGeo = {
  id: string;
  slug: string;
  name: string;
  province: string;
  status: 'draft' | 'active' | 'paused' | string;
  hub_lat: number;
  hub_lng: number;
  pickup_radius_km: number;
  dropoff_radius_km: number;
  match_radius_km: number;
  geo_bias_radius_km: number;
};

/** Legacy single-hub constants (LOCK D Villa Dolores) — used as boot/test fallback. */
export const SERVICE_AREA_HUB = {
  name: 'Villa Dolores',
  lat: -31.9449464,
  lng: -65.1905677,
} as const;

export const PICKUP_RADIUS_KM = 8;
export const DROPOFF_RADIUS_KM = 50;
export const MATCH_RADIUS_KM = 8;

export const LEGACY_VD_MARKET: ServiceMarketGeo = {
  id: 'legacy-villa-dolores',
  slug: 'villa-dolores',
  name: SERVICE_AREA_HUB.name,
  province: 'Córdoba',
  status: 'active',
  hub_lat: SERVICE_AREA_HUB.lat,
  hub_lng: SERVICE_AREA_HUB.lng,
  pickup_radius_km: PICKUP_RADIUS_KM,
  dropoff_radius_km: DROPOFF_RADIUS_KM,
  match_radius_km: MATCH_RADIUS_KM,
  geo_bias_radius_km: 20,
};

let activeMarkets: ServiceMarketGeo[] = [LEGACY_VD_MARKET];

/** Replace in-memory active markets (DB reload or tests). Empty → legacy VD. */
export function setActiveServiceMarkets(markets: ServiceMarketGeo[]): void {
  const next = markets.filter(
    (m) =>
      m.status === 'active' &&
      Number.isFinite(m.hub_lat) &&
      Number.isFinite(m.hub_lng) &&
      m.pickup_radius_km > 0 &&
      m.dropoff_radius_km > 0,
  );
  activeMarkets = next.length > 0 ? next : [LEGACY_VD_MARKET];
}

export function getActiveServiceMarkets(): readonly ServiceMarketGeo[] {
  return activeMarkets;
}

export function resetServiceMarketsToLegacy(): void {
  activeMarkets = [LEGACY_VD_MARKET];
}

function distanceToMarketHubKm(lat: number, lng: number, market: ServiceMarketGeo): number {
  return haversineDistance(lat, lng, market.hub_lat, market.hub_lng);
}

/**
 * Nearest active market whose pickup radius covers the point.
 * Tie-break: smaller distance, then slug asc.
 */
export function findPickupMarket(lat: number, lng: number): ServiceMarketGeo | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best: { market: ServiceMarketGeo; dist: number } | null = null;
  for (const market of activeMarkets) {
    const dist = distanceToMarketHubKm(lat, lng, market);
    if (dist > market.pickup_radius_km) continue;
    if (
      !best ||
      dist < best.dist - 1e-9 ||
      (Math.abs(dist - best.dist) <= 1e-9 && market.slug < best.market.slug)
    ) {
      best = { market, dist };
    }
  }
  return best?.market ?? null;
}

/** True if point is within pickup of any active market. */
export function isInsidePickupArea(lat: number, lng: number): boolean {
  return findPickupMarket(lat, lng) != null;
}

/**
 * Dropoff check.
 * - With `market`: distance to that market hub ≤ dropoff radius (trip same-market rule).
 * - Without: true if inside dropoff of ANY active market (loose / map UI).
 */
export function isInsideDropoffArea(lat: number, lng: number, market?: ServiceMarketGeo): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  if (market) {
    return distanceToMarketHubKm(lat, lng, market) <= market.dropoff_radius_km;
  }

  for (const m of activeMarkets) {
    if (distanceToMarketHubKm(lat, lng, m) <= m.dropoff_radius_km) return true;
  }
  return false;
}

export function assertInsidePickupArea(
  lat: number,
  lng: number,
  label: 'origin' | 'destination' | string = 'point',
): ServiceMarketGeo {
  const market = findPickupMarket(lat, lng);
  if (market) return market;

  const names = activeMarkets.map((m) => m.name).join(', ');
  logger.warn('[SERVICE_AREA] point outside pickup area', {
    code: 'OUT_OF_PICKUP_AREA',
    label,
    lat,
    lng,
    markets: activeMarkets.map((m) => m.slug),
  });

  throw new AppError(
    `No pedimos viajes desde esa zona. El origen debe estar cerca de ${names || 'una ciudad Lifty activa'} (núcleo de pickup).`,
    400,
    'OUT_OF_PICKUP_AREA',
  );
}

export function assertInsideDropoffArea(
  lat: number,
  lng: number,
  market: ServiceMarketGeo,
  label: 'origin' | 'destination' | string = 'point',
): void {
  if (isInsideDropoffArea(lat, lng, market)) return;

  logger.warn('[SERVICE_AREA] point outside dropoff area', {
    code: 'OUT_OF_DROPOFF_AREA',
    label,
    lat,
    lng,
    market: market.slug,
  });

  throw new AppError(
    `Destino fuera del alcance Lifty (~${market.dropoff_radius_km} km desde ${market.name}).`,
    400,
    'OUT_OF_DROPOFF_AREA',
  );
}

/**
 * Origin must be in some market pickup; destination in that same market's dropoff.
 * No intercity (cross-market) trips in v1.
 */
export function assertTripInsideServiceArea(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): ServiceMarketGeo {
  const market = assertInsidePickupArea(origin.lat, origin.lng, 'origin');
  assertInsideDropoffArea(dest.lat, dest.lng, market, 'destination');
  return market;
}
