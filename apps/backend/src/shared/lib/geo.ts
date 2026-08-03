import { logger } from './logger';
import { getRedis } from './redis';

const PHOTON_URL = process.env.PHOTON_URL || 'https://photon.komoot.io';
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const IS_PROD = process.env.NODE_ENV === 'production';

const GEO_CACHE_TTL = 24 * 60 * 60;

export interface PlaceResult {
  description: string;
  place_id: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
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

function formatPhotonAddress(props: Record<string, string | number | undefined>): string {
  const parts = [
    String(props.name || props.street || ''),
    String(props.city || props.town || props.village || ''),
    String(props.state || ''),
    String(props.country || ''),
  ].filter(Boolean);
  return parts.join(', ');
}

export async function autocomplete(input: string): Promise<PlaceResult[]> {
  if (!input || input.trim().length === 0) return [];

  try {
    if (process.env.NODE_ENV === 'test') {
      return [
        { description: `${input}, Buenos Aires, Argentina`, place_id: 'mock-1' },
        { description: `${input}, Mendoza, Argentina`, place_id: 'mock-2' },
      ];
    }

    const url = new URL(`${PHOTON_URL}/api/`);
    url.searchParams.set('q', input.trim());
    url.searchParams.set('limit', '5');
    url.searchParams.set('lang', 'es');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Photon API error: ${res.status}`);

    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          osm_id: number;
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          country?: string;
        };
      }>;
    };

    return (data.features || []).map((f) => ({
      description: formatPhotonAddress(f.properties),
      place_id: String(f.properties.osm_id),
    }));
  } catch (err) {
    logger.error('[geo] autocomplete failed:', (err as Error).message);
    return [];
  }
}

export async function geocode(params: {
  lat?: number;
  lng?: number;
  address?: string;
}): Promise<GeocodeResult> {
  try {
    if (process.env.NODE_ENV === 'test') {
      if (params.lat !== undefined && params.lng !== undefined) {
        return { lat: params.lat, lng: params.lng, formatted_address: 'Buenos Aires, Argentina' };
      }
      return { lat: -34.6037, lng: -58.3816, formatted_address: 'Buenos Aires, Argentina' };
    }

    let url: string;

    if (params.lat !== undefined && params.lng !== undefined) {
      const reverseUrl = new URL(`${PHOTON_URL}/reverse`);
      reverseUrl.searchParams.set('lat', String(params.lat));
      reverseUrl.searchParams.set('lon', String(params.lng));
      reverseUrl.searchParams.set('lang', 'es');
      url = reverseUrl.toString();
    } else if (params.address) {
      const forwardUrl = new URL(`${PHOTON_URL}/api/`);
      forwardUrl.searchParams.set('q', params.address);
      forwardUrl.searchParams.set('limit', '1');
      forwardUrl.searchParams.set('lang', 'es');
      url = forwardUrl.toString();
    } else {
      return { lat: -34.6037, lng: -58.3816, formatted_address: 'Buenos Aires, Argentina' };
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Photon API error: ${res.status}`);

    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: Record<string, string | undefined>;
      }>;
    };

    const feature = data.features?.[0];
    if (!feature) throw new Error('No geocoding results');

    const [lng, lat] = feature.geometry.coordinates;
    return {
      lat: Math.round(lat * 1000000) / 1000000,
      lng: Math.round(lng * 1000000) / 1000000,
      formatted_address: formatPhotonAddress(feature.properties),
    };
  } catch (err) {
    logger.error('[geo] geocode failed:', (err as Error).message);
    if (params.lat !== undefined && params.lng !== undefined) {
      return {
        lat: params.lat,
        lng: params.lng,
        formatted_address: `Ubicación (${params.lat.toFixed(4)}, ${params.lng.toFixed(4)})`,
      };
    }
    return { lat: -34.6037, lng: -58.3816, formatted_address: 'Buenos Aires, Argentina' };
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
    const duration_minutes = Math.round(distance_km * 3);
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
    const duration_minutes = Math.round(distance_km * 3);
    return { distance_km, duration_minutes };
  }
}
