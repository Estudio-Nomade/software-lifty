import { haversineDistance } from './geo';

/**
 * Mirror of apps/backend/src/shared/lib/service-area.ts (multi-hub pickup).
 * Client preview only — SoT remains backend buildMunicipalityResult / findPickupMarket.
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

/** Legacy single-hub constants (LOCK D Villa Dolores) — boot/test fallback. */
export const SERVICE_AREA_HUB = {
  name: 'Villa Dolores',
  lat: -31.9449464,
  lng: -65.1905677,
} as const;

/** Max km from hub for driver address “inside launch” preview (legacy default). */
export const PICKUP_RADIUS_KM = 8;

export const LEGACY_VD_MARKET: ServiceMarketGeo = {
  id: 'legacy-villa-dolores',
  slug: 'villa-dolores',
  name: SERVICE_AREA_HUB.name,
  province: 'Córdoba',
  status: 'active',
  hub_lat: SERVICE_AREA_HUB.lat,
  hub_lng: SERVICE_AREA_HUB.lng,
  pickup_radius_km: PICKUP_RADIUS_KM,
  dropoff_radius_km: 50,
  match_radius_km: 8,
  geo_bias_radius_km: 20,
};

let activeMarkets: ServiceMarketGeo[] = [LEGACY_VD_MARKET];
let marketsVersion = 0;
let lastFetchedAt = 0;
let inFlight: Promise<number> | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Replace in-memory active markets (API hydrate or tests). Empty → legacy VD. */
export function setActiveServiceMarkets(markets: ServiceMarketGeo[]): void {
  const next = markets.filter(
    (m) =>
      m.status === 'active' &&
      Number.isFinite(m.hub_lat) &&
      Number.isFinite(m.hub_lng) &&
      m.pickup_radius_km > 0,
  );
  activeMarkets = next.length > 0 ? next : [LEGACY_VD_MARKET];
  marketsVersion += 1;
}

export function getActiveServiceMarkets(): readonly ServiceMarketGeo[] {
  return activeMarkets;
}

export function getServiceMarketsVersion(): number {
  return marketsVersion;
}

export function resetServiceMarketsToLegacy(): void {
  activeMarkets = [LEGACY_VD_MARKET];
  marketsVersion += 1;
  lastFetchedAt = 0;
}

function distanceToMarketHubKm(lat: number, lng: number, market: ServiceMarketGeo): number {
  return haversineDistance(lat, lng, market.hub_lat, market.hub_lng);
}

/**
 * Nearest active market whose pickup radius covers the point.
 * Tie-break: smaller distance, then slug asc (parity BE).
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
 * Bias for places autocomplete when GPS unknown.
 * Prefer Villa Dolores hub if still active (VD lab), else first active hub.
 */
export function getDefaultPlaceBias(): { lat: number; lng: number } {
  const vd = activeMarkets.find((m) => m.slug === 'villa-dolores') ?? activeMarkets[0];
  if (vd && Number.isFinite(vd.hub_lat) && Number.isFinite(vd.hub_lng)) {
    return { lat: vd.hub_lat, lng: vd.hub_lng };
  }
  return { lat: SERVICE_AREA_HUB.lat, lng: SERVICE_AREA_HUB.lng };
}

type ActiveMarketsPayload = {
  items?: unknown;
  data?: { items?: unknown };
};

function coerceMarketRow(row: unknown): ServiceMarketGeo | null {
  if (row == null || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const hub_lat = Number(r.hub_lat);
  const hub_lng = Number(r.hub_lng);
  const pickup_radius_km = Number(r.pickup_radius_km);
  if (!Number.isFinite(hub_lat) || !Number.isFinite(hub_lng) || !(pickup_radius_km > 0)) {
    return null;
  }
  const slug = typeof r.slug === 'string' ? r.slug : '';
  const name = typeof r.name === 'string' ? r.name : slug || 'Mercado';
  if (!slug) return null;
  return {
    id: typeof r.id === 'string' ? r.id : slug,
    slug,
    name,
    province: typeof r.province === 'string' ? r.province : '',
    // Public list is already status=active; coerce missing → active.
    status: typeof r.status === 'string' ? r.status : 'active',
    hub_lat,
    hub_lng,
    pickup_radius_km,
    dropoff_radius_km: Number(r.dropoff_radius_km) > 0 ? Number(r.dropoff_radius_km) : 50,
    match_radius_km: Number(r.match_radius_km) > 0 ? Number(r.match_radius_km) : pickup_radius_km,
    geo_bias_radius_km: Number(r.geo_bias_radius_km) > 0 ? Number(r.geo_bias_radius_km) : 20,
  };
}

export function parseActiveMarketsPayload(data: unknown): ServiceMarketGeo[] {
  const body = (data ?? {}) as ActiveMarketsPayload;
  const raw = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.data?.items)
      ? body.data.items
      : Array.isArray(data)
        ? data
        : [];
  return raw.map(coerceMarketRow).filter((m): m is ServiceMarketGeo => m != null);
}

type FetchActiveMarkets = () => Promise<unknown>;

let fetchActiveMarketsImpl: FetchActiveMarkets | null = null;

/** Injected from ensureServiceMarkets (avoids apiClient import cycle in pure geo). */
export function bindActiveServiceMarketsFetcher(fn: FetchActiveMarkets | null): void {
  fetchActiveMarketsImpl = fn;
}

/**
 * Fetch GET /service-markets/active and hydrate module cache.
 * - Success with items → set those markets
 * - Success empty → legacy VD (setActiveServiceMarkets([]))
 * - Failure → keep previous markets (or legacy boot); do NOT advance lastFetchedAt
 *   (early 401 before session must not lock 5 min on LEGACY_VD-only)
 * Returns marketsVersion after hydrate (or current if skipped).
 */
export async function ensureActiveServiceMarkets(options?: {
  force?: boolean;
}): Promise<number> {
  const force = options?.force === true;
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
    return marketsVersion;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let ok = false;
    try {
      if (!fetchActiveMarketsImpl) {
        const { fetchActiveServiceMarketsPayload } = await import('./serviceMarketsApi');
        fetchActiveMarketsImpl = fetchActiveServiceMarketsPayload;
      }
      const data = await fetchActiveMarketsImpl();
      // Always apply successful body — empty list → legacy VD via setActiveServiceMarkets([]).
      setActiveServiceMarkets(parseActiveMarketsPayload(data));
      ok = true;
      if (__DEV__) {
        const slugs = getActiveServiceMarkets()
          .map((m) => m.slug)
          .join(',');
        console.log(`[serviceMarkets] active: ${slugs || '(none)'}`);
      }
    } catch (err) {
      // Offline / 401 — keep last good or legacy boot; do not wipe markets.
      if (__DEV__) {
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[serviceMarkets] hydrate failed${status != null ? ` status=${status}` : ''}: ${message}`,
        );
      }
    } finally {
      // TTL only on success so a failed mount does not block Usar ubicación / retry.
      if (ok) lastFetchedAt = Date.now();
      inFlight = null;
    }
    return marketsVersion;
  })();

  return inFlight;
}
