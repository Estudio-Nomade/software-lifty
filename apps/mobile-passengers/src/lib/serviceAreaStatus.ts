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

/**
 * Soft OOF on collapsed Home: dismiss lasts this app session only
 * (module memory — survives tab hops / Home remount, dies on process kill).
 * New login clears it via resetHomeOutOfServiceBannerSession().
 * UI must read isHomeOutOfServiceBannerDismissed() and subscribe — do not mirror in useState.
 */
let homeOofDismissed = false;
let homeOofLastInside: boolean | null = null;

type HomeOofListener = () => void;
const homeOofListeners = new Set<HomeOofListener>();

function emitHomeOofChange(): void {
  for (const listener of homeOofListeners) listener();
}

/** Re-render hooks when dismiss / fence / session reset changes. */
export function subscribeHomeOutOfServiceBanner(listener: HomeOofListener): () => void {
  homeOofListeners.add(listener);
  return () => {
    homeOofListeners.delete(listener);
  };
}

export function isHomeOutOfServiceBannerDismissed(): boolean {
  return homeOofDismissed;
}

export function dismissHomeOutOfServiceBanner(): void {
  if (homeOofDismissed) return;
  homeOofDismissed = true;
  emitHomeOofChange();
}

/**
 * Keep Home dismiss only while inside/outside is stable.
 * Crossing the fence re-arms the Home map banner.
 */
export function noteServiceAreaInside(inside: boolean): void {
  let changed = false;
  if (homeOofLastInside !== null && homeOofLastInside !== inside && homeOofDismissed) {
    homeOofDismissed = false;
    changed = true;
  }
  homeOofLastInside = inside;
  if (changed) emitHomeOofChange();
}

/** Call on logout / clearAuth so the next session sees Home OOF again. */
export function resetHomeOutOfServiceBannerSession(): void {
  const changed = homeOofDismissed || homeOofLastInside !== null;
  homeOofDismissed = false;
  homeOofLastInside = null;
  if (changed) emitHomeOofChange();
}

/** @deprecated alias — tests/old call sites */
export function resetOutOfServiceBannerDismissState(): void {
  resetHomeOutOfServiceBannerSession();
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
