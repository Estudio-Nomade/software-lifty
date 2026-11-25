import { getServiceAreaStatus } from '../api/passenger';

export type ServiceAreaStatus = {
  inside: boolean;
  markets: Array<{ name: string; slug: string }>;
};

type CacheEntry = {
  key: string;
  at: number;
  value: ServiceAreaStatus;
};

const TTL_MS = 60_000;
let cache: CacheEntry | null = null;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function clearServiceAreaStatusCache(): void {
  cache = null;
}

/** Soft OOF banner dismiss — survives Home remount / tab hops (not AsyncStorage). */
let oofBannerDismissed = false;
let oofBannerLastInside: boolean | null = null;

export function isOutOfServiceBannerDismissed(): boolean {
  return oofBannerDismissed;
}

export function dismissOutOfServiceBanner(): void {
  oofBannerDismissed = true;
}

/**
 * Keep dismiss only while the inside/outside answer is stable.
 * Crossing the fence (in↔out) re-arms the banner for the next Buscar open.
 */
export function noteServiceAreaInside(inside: boolean): void {
  if (oofBannerLastInside !== null && oofBannerLastInside !== inside) {
    oofBannerDismissed = false;
  }
  oofBannerLastInside = inside;
}

/** Test helper — reset module dismiss + fence memory. */
export function resetOutOfServiceBannerDismissState(): void {
  oofBannerDismissed = false;
  oofBannerLastInside = null;
}

export function shouldShowOutOfServiceBanner(
  status: ServiceAreaStatus | null | undefined,
): boolean {
  return status != null && status.inside === false;
}

/**
 * Auth GET /passenger/service-area/status with short in-memory cache.
 * Returns null on network/auth failure (do not show banner on unknown).
 */
export async function fetchServiceAreaStatus(
  lat: number,
  lng: number,
): Promise<ServiceAreaStatus | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = cacheKey(lat, lng);
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < TTL_MS) {
    return cache.value;
  }

  try {
    const value = await getServiceAreaStatus(lat, lng);
    cache = { key, at: now, value };
    return value;
  } catch {
    return null;
  }
}
