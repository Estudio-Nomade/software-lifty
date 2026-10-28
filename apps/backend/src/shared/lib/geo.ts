import { logger } from './logger';
import { getRedis } from './redis';

const PHOTON_URL = process.env.PHOTON_URL || 'https://photon.komoot.io';
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const IS_PROD = process.env.NODE_ENV === 'production';
const GEO_USER_AGENT = 'Lifty/1.0 (contact: liftyviajes.com)';
const GEO_TIMEOUT_MS = 8000;
/** Autocomplete must fail fast — Photon public can take 5–8s cold from AR. */
const GEO_AUTOCOMPLETE_TIMEOUT_MS = Number(process.env.GEO_AUTOCOMPLETE_TIMEOUT_MS) || 2500;
const GEO_AUTOCOMPLETE_CACHE_TTL = 7 * 24 * 60 * 60;
/** ~5 km buckets so nearby users share cache without leaking exact pin. */
const GEO_BIAS_BUCKET = 0.05;
/** Villa Dolores launch footprint — bias when caller omits GPS (same as passenger client). */
const GEO_LAUNCH_LAT = -31.9456;
const GEO_LAUNCH_LNG = -65.1895;
const GEO_DEFAULT_LAT = process.env.GEO_DEFAULT_LAT
  ? Number(process.env.GEO_DEFAULT_LAT)
  : GEO_LAUNCH_LAT;
const GEO_DEFAULT_LNG = process.env.GEO_DEFAULT_LNG
  ? Number(process.env.GEO_DEFAULT_LNG)
  : GEO_LAUNCH_LNG;

const GEO_CACHE_TTL = 24 * 60 * 60;

export interface PlaceResult {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
  city?: string | null;
  province?: string | null;
}

function localityFromPhotonProps(props: Record<string, string | number | undefined>): {
  city: string | null;
  province: string | null;
} {
  const cityRaw =
    props.city || props.town || props.village || props.municipality || props.county || props.name;
  const provinceRaw = props.state;
  return {
    city: cityRaw ? String(cityRaw) : null,
    province: provinceRaw ? String(provinceRaw) : null,
  };
}

export interface DirectionsResult {
  distance_km: number;
  duration_minutes: number;
  polyline: string;
  steps: ManeuverStep[];
  alternatives: DirectionsResult[];
}

export interface ManeuverStep {
  maneuver_type: string;
  maneuver_modifier?: string;
  name: string;
  distance: number;
  geometry: string;
}

export interface DistanceMatrixResult {
  distance_km: number;
  duration_minutes: number;
}

interface OSRMStep {
  name: string;
  distance: number;
  duration: number;
  geometry: string;
  maneuver: {
    type: string;
    modifier?: string;
  };
}

const MAIN_ROAD_PATTERNS = [
  /^Av\.?\b/i,
  /^Av(da)?\.?\s/i,
  /^Autopista\b/i,
  /^AU\b/i,
  /^RN\b/i,
  /^Ruta\b/i,
  /^Bv\.?\b/i,
  /^Boulevard\b/i,
];

function scoreRoute(steps: OSRMStep[]): number {
  let score = 0;
  for (const step of steps) {
    if (MAIN_ROAD_PATTERNS.some((p) => p.test(step.name))) {
      score += step.distance / 100;
    }
    score += step.distance / 500;
    if (['turn', 'roundabout', 'fork', 'end of road'].includes(step.maneuver.type)) {
      score -= 20;
    }
  }
  return score;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get(key);
}

async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.setex(key, ttlSeconds, value);
}

function isHighwayPhoton(props: Record<string, string | number | undefined>): boolean {
  const osmKey = props.osm_key ? String(props.osm_key) : '';
  const osmValue = props.osm_value ? String(props.osm_value) : '';
  const type = props.type ? String(props.type) : '';
  return osmKey === 'highway' || type === 'street' || type === 'road' || osmValue === 'residential';
}

/**
 * Highways/addresses → street(+number); named POIs (amenity/tourism/leisure/…) → name first
 * so dique/calvario/plaza don't collapse to an adjacent street.
 */
export function formatPhotonAddress(props: Record<string, string | number | undefined>): string {
  const name = props.name ? String(props.name).trim() : '';
  const street = props.street ? String(props.street).trim() : '';
  const housenumber = props.housenumber ? String(props.housenumber).trim() : '';
  const highway = isHighwayPhoton(props);

  let primary = '';
  if (highway) {
    primary = [street || name, housenumber].filter(Boolean).join(' ');
  } else if (housenumber && street) {
    primary = [street, housenumber].filter(Boolean).join(' ');
  } else if (name) {
    primary = name;
  } else {
    primary = [street, housenumber].filter(Boolean).join(' ');
  }
  if (!primary) return '';

  const parts = [
    primary,
    String(props.city || props.town || props.village || ''),
    String(props.state || ''),
    String(props.country || ''),
  ].filter(Boolean);
  return parts.join(', ');
}

function normalizePlaceMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Soft-rank Photon hits: query name match + proximity to bias. */
export function rankPhotonPlaceFeatures(
  features: PhotonFeature[],
  query: string,
  biasLat?: number,
  biasLng?: number,
): PhotonFeature[] {
  const q = normalizePlaceMatch(query);
  if (!q || features.length <= 1) return features;

  const hasBias =
    typeof biasLat === 'number' &&
    Number.isFinite(biasLat) &&
    typeof biasLng === 'number' &&
    Number.isFinite(biasLng);

  const scored = features.map((f, index) => {
    const props = f.properties ?? {};
    const name = normalizePlaceMatch(props.name ? String(props.name) : '');
    const street = normalizePlaceMatch(props.street ? String(props.street) : '');
    const label = normalizePlaceMatch(formatPhotonAddress(props));
    let match = 0;
    if (name === q || street === q) match = 100;
    else if (name.startsWith(q) || street.startsWith(q)) match = 70;
    else if (name.includes(q) || street.includes(q) || label.includes(q)) match = 45;

    let distKm = 1e9;
    if (hasBias && f.geometry?.coordinates?.length >= 2) {
      const [lng, lat] = f.geometry.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        distKm = haversineDistance(biasLat as number, biasLng as number, lat, lng);
      }
    }
    const proximity = Number.isFinite(distKm) ? Math.max(0, 150 - distKm) : 0;
    const score = match + proximity;
    return { f, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.f);
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    [key: string]: string | number | undefined;
  };
}

async function fetchPhoton(
  url: URL,
  timeoutMs: number = GEO_TIMEOUT_MS,
): Promise<{ features?: PhotonFeature[] }> {
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': GEO_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Photon API error: ${res.status}`);
  return (await res.json()) as { features?: PhotonFeature[] };
}

/** Exported for unit tests — do not use as public API. */
export function normalizeAutocompleteQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function biasBucket(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'none';
  return String(Math.round(value / GEO_BIAS_BUCKET) * GEO_BIAS_BUCKET);
}

/** Exported for unit tests — do not use as public API. */
export function autocompleteCacheKey(query: string, lat?: number, lng?: number): string {
  return `geo:ac:v2:${normalizeAutocompleteQuery(query)}:${biasBucket(lat)}:${biasBucket(lng)}`;
}

export async function autocomplete(
  input: string,
  lat?: number,
  lng?: number,
): Promise<PlaceResult[]> {
  if (!input || input.trim().length === 0) return [];

  const t0 = Date.now();
  try {
    if (process.env.NODE_ENV === 'test') {
      return [
        {
          description: `${input}, Buenos Aires, Argentina`,
          place_id: 'mock-1',
          lat: -34.6037,
          lng: -58.3816,
        },
        {
          description: `${input}, Mendoza, Argentina`,
          place_id: 'mock-2',
          lat: -32.8908,
          lng: -68.8272,
        },
      ];
    }

    const biasLat = lat ?? GEO_DEFAULT_LAT;
    const biasLng = lng ?? GEO_DEFAULT_LNG;
    const cacheKey = autocompleteCacheKey(input, biasLat, biasLng);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const hits = JSON.parse(cached) as PlaceResult[];
      logger.info('[geo] autocomplete', {
        ms: Date.now() - t0,
        cache: 'hit',
        count: hits.length,
        qLen: input.trim().length,
      });
      return hits;
    }

    const url = new URL(`${PHOTON_URL}/api/`);
    url.searchParams.set('q', input.trim());
    url.searchParams.set('limit', '10');
    url.searchParams.set('lang', 'default');
    if (biasLat != null && biasLng != null) {
      url.searchParams.set('lat', String(biasLat));
      url.searchParams.set('lon', String(biasLng));
    }

    const data = await fetchPhoton(url, GEO_AUTOCOMPLETE_TIMEOUT_MS);
    const ranked = rankPhotonPlaceFeatures(data.features || [], input.trim(), biasLat, biasLng);

    const results: PlaceResult[] = [];
    for (const f of ranked) {
      const description = formatPhotonAddress(f.properties);
      if (!description) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat === 0 && lng === 0) continue;
      results.push({
        description,
        place_id: String(f.properties.osm_id),
        lat,
        lng,
      });
    }

    if (results.length > 0) {
      await cacheSet(cacheKey, JSON.stringify(results), GEO_AUTOCOMPLETE_CACHE_TTL);
    }

    logger.info('[geo] autocomplete', {
      ms: Date.now() - t0,
      cache: 'miss',
      count: results.length,
      qLen: input.trim().length,
    });
    return results;
  } catch (err) {
    logger.error('[geo] autocomplete failed:', (err as Error).message, {
      ms: Date.now() - t0,
      qLen: input.trim().length,
    });
    return [];
  }
}

export async function geocode(params: {
  lat?: number;
  lng?: number;
  address?: string;
  /** Optional proximity bias for forward geocode (passenger GPS). */
  bias_lat?: number;
  bias_lng?: number;
}): Promise<GeocodeResult> {
  try {
    if (process.env.NODE_ENV === 'test') {
      const addr = params.address?.toLowerCase() ?? '';
      if (addr.includes('villa dolores') || addr.includes('v. dolores')) {
        return {
          lat: -31.9456,
          lng: -65.1895,
          formatted_address: params.address ?? 'Villa Dolores, Córdoba, Argentina',
          city: 'Villa Dolores',
          province: 'Córdoba',
        };
      }
      if (addr.includes('córdoba capital') || addr.includes('cordoba capital')) {
        return {
          lat: -31.4201,
          lng: -64.1888,
          formatted_address: params.address ?? 'Córdoba, Argentina',
          city: 'Córdoba',
          province: 'Córdoba',
        };
      }
      if (params.lat !== undefined && params.lng !== undefined) {
        // Test coords near Villa Dolores (approx)
        if (params.lat > -32.1 && params.lat < -31.8 && params.lng > -65.4 && params.lng < -64.9) {
          return {
            lat: params.lat,
            lng: params.lng,
            formatted_address: 'Villa Dolores, Córdoba, Argentina',
            city: 'Villa Dolores',
            province: 'Córdoba',
          };
        }
        return {
          lat: params.lat,
          lng: params.lng,
          formatted_address: 'Buenos Aires, Argentina',
          city: 'Buenos Aires',
          province: 'Buenos Aires',
        };
      }
      // Empty forward query must fail like prod (no silent BA).
      if (!addr) {
        throw new Error('No geocoding results');
      }
      // Forward address mocks keep BA only for known city queries used by maps tests.
      if (addr.includes('buenos aires') || addr.includes('mendoza')) {
        return {
          lat: -34.6037,
          lng: -58.3816,
          formatted_address: params.address ?? 'Buenos Aires, Argentina',
          city: 'Buenos Aires',
          province: 'Buenos Aires',
        };
      }
      throw new Error('No geocoding results');
    }

    let url: URL;
    let forwardQuery: string | undefined;

    if (params.lat !== undefined && params.lng !== undefined) {
      const reverseUrl = new URL(`${PHOTON_URL}/reverse`);
      reverseUrl.searchParams.set('lat', String(params.lat));
      reverseUrl.searchParams.set('lon', String(params.lng));
      reverseUrl.searchParams.set('lang', 'default');
      url = reverseUrl;
    } else if (params.address) {
      forwardQuery = params.address.trim();
      const biasLat = params.bias_lat ?? GEO_DEFAULT_LAT;
      const biasLng = params.bias_lng ?? GEO_DEFAULT_LNG;
      const forwardUrl = new URL(`${PHOTON_URL}/api/`);
      forwardUrl.searchParams.set('q', forwardQuery);
      forwardUrl.searchParams.set('limit', '5');
      forwardUrl.searchParams.set('lang', 'default');
      if (biasLat != null && biasLng != null) {
        forwardUrl.searchParams.set('lat', String(biasLat));
        forwardUrl.searchParams.set('lon', String(biasLng));
      }
      url = forwardUrl;
    } else {
      throw new Error('No geocoding input');
    }

    const data = await fetchPhoton(url);
    let feature = data.features?.[0];
    if (forwardQuery && data.features && data.features.length > 0) {
      const biasLat = params.bias_lat ?? GEO_DEFAULT_LAT;
      const biasLng = params.bias_lng ?? GEO_DEFAULT_LNG;
      const ranked = rankPhotonPlaceFeatures(data.features, forwardQuery, biasLat, biasLng);
      feature = ranked[0];
    }
    if (!feature) throw new Error('No geocoding results');

    const [lng, lat] = feature.geometry.coordinates;
    const locality = localityFromPhotonProps(feature.properties);
    return {
      lat: Math.round(lat * 1000000) / 1000000,
      lng: Math.round(lng * 1000000) / 1000000,
      formatted_address: formatPhotonAddress(feature.properties),
      city: locality.city,
      province: locality.province,
    };
  } catch (err) {
    logger.error('[geo] geocode failed:', (err as Error).message);
    if (params.lat !== undefined && params.lng !== undefined) {
      return {
        lat: params.lat,
        lng: params.lng,
        formatted_address: `Ubicación (${params.lat.toFixed(4)}, ${params.lng.toFixed(4)})`,
        city: null,
        province: null,
      };
    }
    // Forward geocode: fail honestly — never invent Buenos Aires coords.
    throw err instanceof Error ? err : new Error('No geocoding results');
  }
}

export async function directions(
  origin_lat: number,
  origin_lng: number,
  dest_lat: number,
  dest_lng: number,
): Promise<DirectionsResult> {
  try {
    if (process.env.NODE_ENV === 'test') {
      return {
        distance_km: 5.2,
        duration_minutes: 12,
        polyline: 'mock_polyline',
        steps: [],
        alternatives: [],
      };
    }

    const cacheKey = `geo:directions:${origin_lat},${origin_lng}:${dest_lat},${dest_lng}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);

    const coords = `${origin_lng},${origin_lat};${dest_lng},${dest_lat}`;
    const url = `${OSRM_URL}/route/v1/driving/${coords}?geometries=polyline&overview=full&alternatives=true&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM API error: ${res.status}`);

    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: string;
        legs?: Array<{ steps?: OSRMStep[] }>;
      }>;
    };

    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No routes found');

    const scored = data.routes
      .map((route) => {
        const s = route.legs?.[0]?.steps;
        if (!s || s.length === 0) return null;
        return { route, score: scoreRoute(s) };
      })
      .filter((r): r is { route: (typeof data.routes)[number]; score: number } => r !== null)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) throw new Error('No valid routes found');

    const convertSteps = (rawSteps: OSRMStep[]): ManeuverStep[] =>
      rawSteps
        .filter((s) => s.distance >= 50)
        .map((s) => ({
          maneuver_type: s.maneuver.type,
          maneuver_modifier: s.maneuver.modifier,
          name: s.name,
          distance: s.distance,
          geometry: s.geometry,
        }));

    const buildResult = (route: (typeof data.routes)[number]): DirectionsResult => ({
      distance_km: Math.round((route.distance / 1000) * 100) / 100,
      duration_minutes: Math.round((route.duration / 60) * 100) / 100,
      polyline: route.geometry,
      steps: convertSteps(route.legs?.[0]?.steps ?? []),
      alternatives: [],
    });

    const result: DirectionsResult = {
      ...buildResult(scored[0].route),
      alternatives: scored.length > 1 ? [buildResult(scored[1].route)] : [],
    };

    await cacheSet(cacheKey, JSON.stringify(result), 300);
    return result;
  } catch (err) {
    logger.error('[geo] directions failed:', (err as Error).message);
    const distance_km =
      Math.round(haversineDistance(origin_lat, origin_lng, dest_lat, dest_lng) * 100) / 100;
    const duration_minutes = Math.max(1, Math.round(distance_km * 3));
    return { distance_km, duration_minutes, polyline: '', steps: [], alternatives: [] };
  }
}

export async function distanceMatrix(
  origin_lat: number,
  origin_lng: number,
  dest_lat: number,
  dest_lng: number,
): Promise<DistanceMatrixResult> {
  try {
    const result = await directions(origin_lat, origin_lng, dest_lat, dest_lng);
    return { distance_km: result.distance_km, duration_minutes: result.duration_minutes };
  } catch (err) {
    logger.error('[geo] distanceMatrix failed:', (err as Error).message);
    const distance_km =
      Math.round(haversineDistance(origin_lat, origin_lng, dest_lat, dest_lng) * 100) / 100;
    const duration_minutes = Math.max(1, Math.round(distance_km * 3));
    return { distance_km, duration_minutes };
  }
}

// Authoritative route resolution for trip creation. The server recomputes the
// route distance/duration from the actual origin/destination and takes the
// maximum against the client-provided values. This removes the "client
// under-reports distance" undercharge vector: even a malicious/buggy client
// cannot push the fare below the real route length. `distanceMatrix` never
// throws (it falls back to the haversine distance), so this always resolves.
export async function resolveRouteDistance(
  clientDistanceKm: number,
  clientDurationMinutes: number,
  origin_lat: number,
  origin_lng: number,
  dest_lat: number,
  dest_lng: number,
): Promise<{ distance_km: number; duration_minutes: number }> {
  const matrix = await distanceMatrix(origin_lat, origin_lng, dest_lat, dest_lng);
  return {
    distance_km: Math.max(clientDistanceKm, matrix.distance_km),
    duration_minutes: Math.max(clientDurationMinutes, matrix.duration_minutes),
  };
}
