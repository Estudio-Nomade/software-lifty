import { logger } from './logger';
import { extractPlusCode, resolvePlusCodeCenter } from './open-location-code';
import { expandPlaceQueries, mergePlaceResults, parseStreetQuery } from './place-aliases';
import { VD_CENTER, matchCatalogPlaces } from './places-catalog';
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
/** Local preference radius when bias is in launch footprint (km). */
const GEO_LOCAL_BIAS_KM = 20;
/** Extra score for features inside local radius when bias is near VD. */
const GEO_LOCAL_IN_BBOX_BOOST = 40;
const WATER_POI_KEYS = new Set(['water', 'waterway', 'natural', 'tourism', 'leisure']);

/** Env override only when finite; empty/NaN → launch footprint (never send NaN to Photon). */
export function parseGeoDefaultCoord(raw: string | undefined, fallback: number): number {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const GEO_DEFAULT_LAT = parseGeoDefaultCoord(process.env.GEO_DEFAULT_LAT, GEO_LAUNCH_LAT);
const GEO_DEFAULT_LNG = parseGeoDefaultCoord(process.env.GEO_DEFAULT_LNG, GEO_LAUNCH_LNG);

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

/** True when bias is inside Villa Dolores launch service footprint. */
export function isBiasNearVillaDolores(biasLat?: number, biasLng?: number): boolean {
  if (
    typeof biasLat !== 'number' ||
    !Number.isFinite(biasLat) ||
    typeof biasLng !== 'number' ||
    !Number.isFinite(biasLng)
  ) {
    return false;
  }
  return haversineDistance(biasLat, biasLng, VD_CENTER.lat, VD_CENTER.lng) <= GEO_LOCAL_BIAS_KM;
}

function significantTokens(s: string): string[] {
  return normalizePlaceMatch(s)
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length >= 2 && !['de', 'del', 'la', 'las', 'los', 'el', 'y'].includes(t));
}

function tokenOverlapScore(queryTokens: string[], candidate: string): number {
  if (queryTokens.length === 0 || !candidate) return 0;
  const candTokens = new Set(significantTokens(candidate));
  if (candTokens.size === 0) return 0;
  let hit = 0;
  for (const t of queryTokens) {
    if (candTokens.has(t)) {
      hit += 1;
      continue;
    }
    // prefix token match (ignacio vs ignacios)
    for (const c of candTokens) {
      if (c.startsWith(t) || t.startsWith(c)) {
        hit += 0.6;
        break;
      }
    }
  }
  return hit / queryTokens.length;
}

/** Soft-rank Photon hits: token overlap + proximity + local-bbox boost near VD. */
export function rankPhotonPlaceFeatures(
  features: PhotonFeature[],
  query: string,
  biasLat?: number,
  biasLng?: number,
): PhotonFeature[] {
  const q = normalizePlaceMatch(query);
  if (!q || features.length <= 1) return features;

  const parsed = parseStreetQuery(query);
  const streetFocus = parsed.streetName ? normalizePlaceMatch(parsed.streetName) : q;
  const focusTokens = significantTokens(streetFocus || q);
  // Drop pure city tokens from overlap so "villa dolores" doesn't inflate every local hit.
  const cityNoise = new Set(['villa', 'dolores', 'cordoba', 'argentina', 'sarmiento']);
  const qTokens = focusTokens.filter((t) => !cityNoise.has(t) && !/^\d+$/.test(t));
  const wantNumber = parsed.housenumber ? normalizePlaceMatch(parsed.housenumber) : null;

  const hasBias =
    typeof biasLat === 'number' &&
    Number.isFinite(biasLat) &&
    typeof biasLng === 'number' &&
    Number.isFinite(biasLng);
  const preferLocal = hasBias && isBiasNearVillaDolores(biasLat, biasLng);
  const queryHasDigits = /\d/.test(query);

  const scored = features.map((f, index) => {
    const props = f.properties ?? {};
    const name = normalizePlaceMatch(props.name ? String(props.name) : '');
    const street = normalizePlaceMatch(props.street ? String(props.street) : '');
    const house = normalizePlaceMatch(props.housenumber ? String(props.housenumber) : '');
    const label = normalizePlaceMatch(formatPhotonAddress(props));
    const streetOrName = street || name;

    let match = 0;
    if (name === q || street === q || streetOrName === streetFocus) match = 100;
    else if (
      (streetFocus && (name.startsWith(streetFocus) || street.startsWith(streetFocus))) ||
      name.startsWith(q) ||
      street.startsWith(q)
    ) {
      match = 70;
    } else if (name.includes(q) || street.includes(q) || label.includes(q)) match = 45;

    const overlap = Math.max(
      tokenOverlapScore(qTokens, name),
      tokenOverlapScore(qTokens, street),
      tokenOverlapScore(qTokens, label),
    );
    match = Math.max(match, Math.round(overlap * 95));

    // Housenumber: boost exact door match; penalize different door on similar street.
    if (wantNumber) {
      if (house && house === wantNumber) match += 25;
      else if (house && house !== wantNumber) match -= 15;
      else if (!house && streetOrName && tokenOverlapScore(qTokens, streetOrName) >= 0.7) {
        // Street geometry only — still useful once we synthesize the number.
        match += 10;
      }
    }

    // Penalize near-homonym streets that miss a distinctive query token (Ignacio vs Ernesto).
    if (qTokens.length >= 2 && streetOrName) {
      const missingDistinctive = qTokens.filter((t) => t.length >= 4 && !streetOrName.includes(t));
      if (missingDistinctive.length > 0 && tokenOverlapScore(qTokens, streetOrName) < 0.8) {
        match -= 20 * missingDistinctive.length;
      }
    }

    let distKm = 1e9;
    if (hasBias && f.geometry?.coordinates?.length >= 2) {
      const [lng, lat] = f.geometry.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        distKm = haversineDistance(biasLat as number, biasLng as number, lat, lng);
      }
    }
    const proximity = Number.isFinite(distKm) ? Math.max(0, 150 - distKm) : 0;
    let localBoost = 0;
    if (preferLocal && Number.isFinite(distKm) && distKm <= GEO_LOCAL_BIAS_KM) {
      localBoost = GEO_LOCAL_IN_BBOX_BOOST;
    }
    let poiBoost = 0;
    const osmKey = props.osm_key ? String(props.osm_key) : '';
    if (!queryHasDigits && WATER_POI_KEYS.has(osmKey) && match > 0) {
      poiBoost = 12;
    }
    const score = match + proximity + localBoost + poiBoost;
    return { f, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.f);
}

/**
 * When the user typed a door number but Photon only returned the street center,
 * attach the number to the label so the list shows "Ignacio Castellano 50, …".
 * Coords stay on the street geometry (OSM often lacks the house node).
 * Strict: every street-name token must appear in the leading label segment, and we
 * never stamp a number onto catalog/OLC pins or labels that already carry a different #.
 */
export function applyHousenumberSynthesis(results: PlaceResult[], query: string): PlaceResult[] {
  const parsed = parseStreetQuery(query);
  if (!parsed.housenumber || !parsed.streetName) return results;
  const want = normalizePlaceMatch(parsed.housenumber);
  const streetFocus = normalizePlaceMatch(parsed.streetName);
  const focusTokens = significantTokens(streetFocus).filter((t) => !/^\d+$/.test(t));
  if (focusTokens.length === 0) return results;

  return results.map((r) => {
    const id = String(r.place_id);
    if (id.startsWith('catalog:') || id.startsWith('olc:')) return r;

    const descN = normalizePlaceMatch(r.description);
    // Already has this door number in the leading street segment.
    const leading = descN.split(',')[0] ?? descN;
    if (new RegExp(`\\b${want}\\b`).test(leading)) return r;

    // All query street tokens must be present (Ignacio≠Ernesto; no POI stamping).
    const allTokensPresent = focusTokens.every((t) => leading.includes(t));
    if (!allTokensPresent) return r;
    // Leading should not introduce an extra distinctive person/place token missing from query
    // (e.g. "ernesto castellano" when query is "ignacio castellano").
    const leadingNameTokens = significantTokens(leading).filter(
      (t) => !/^\d+$/.test(t) && t.length >= 4,
    );
    const extraDistinctive = leadingNameTokens.filter(
      (t) => !focusTokens.some((f) => f === t || f.startsWith(t) || t.startsWith(f)),
    );
    if (extraDistinctive.length > 0) return r;

    // Rebuild description: inject number after street name portion.
    const parts = r.description.split(',').map((p) => p.trim());
    const primary = parts[0] ?? r.description;
    // Avoid double-insert if primary already ends with a different number.
    if (/\d/.test(primary) && !new RegExp(`\\b${want}\\b`, 'i').test(primary)) {
      return r;
    }
    const withNum = /\d/.test(primary) ? primary : `${primary} ${parsed.housenumber}`;
    const rest = parts.slice(1).join(', ');
    const description = rest ? `${withNum}, ${rest}` : withNum;
    return {
      ...r,
      description,
      place_id: `${r.place_id}:hn:${want}`,
    };
  });
}

function plusCodePlaceResult(query: string, biasLat: number, biasLng: number): PlaceResult | null {
  const code = extractPlusCode(query);
  if (!code) return null;
  const resolved = resolvePlusCodeCenter(code, biasLat, biasLng);
  if (!resolved) return null;
  const shortOrFull = code.includes('+') ? code.toUpperCase() : resolved.fullCode;
  const city =
    isBiasNearVillaDolores(resolved.lat, resolved.lng) || isBiasNearVillaDolores(biasLat, biasLng)
      ? 'Villa Dolores'
      : null;
  const description = city
    ? `${shortOrFull}, ${city}, Córdoba, Argentina`
    : `${shortOrFull} (${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)})`;
  return {
    description,
    place_id: `olc:${resolved.fullCode}`,
    lat: resolved.lat,
    lng: resolved.lng,
  };
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

type NominatimHit = {
  place_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  class?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

/** Last-resort street search when Photon is down/empty (OSM Nominatim). */
async function nominatimStreetFallback(
  query: string,
  biasLat: number,
  biasLng: number,
): Promise<PlaceResult[]> {
  const parsed = parseStreetQuery(query);
  const q =
    parsed.streetName && parsed.housenumber
      ? `${parsed.streetName} ${parsed.housenumber}${parsed.cityHint ? `, ${parsed.cityHint}` : ''}`
      : parsed.streetName
        ? `${parsed.streetName}${parsed.cityHint ? `, ${parsed.cityHint}` : ''}`
        : query;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  // ~0.4° box ≈ 40 km around bias
  const d = 0.35;
  url.searchParams.set('viewbox', `${biasLng - d},${biasLat + d},${biasLng + d},${biasLat - d}`);
  url.searchParams.set('bounded', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': GEO_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(GEO_AUTOCOMPLETE_TIMEOUT_MS, 5000)),
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const hits = (await res.json()) as NominatimHit[];
  if (!Array.isArray(hits)) return [];

  const out: PlaceResult[] = [];
  for (const h of hits) {
    const lat = Number(h.lat);
    const lng = Number(h.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const addr = h.address ?? {};
    const street =
      addr.road || addr.pedestrian || addr.residential || addr.street || addr.path || '';
    const house = addr.house_number || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const state = addr.state || '';
    const country = addr.country || '';
    let primary = [street, house].filter(Boolean).join(' ');
    if (!primary) {
      // highway without address breakdown — use first segment of display_name
      primary = (h.display_name || '').split(',')[0]?.trim() || '';
    }
    if (!primary) continue;
    const description = [primary, city, state, country].filter(Boolean).join(', ');
    out.push({
      description,
      place_id: `nominatim:${h.place_id ?? `${lat},${lng}`}`,
      lat,
      lng,
    });
  }
  return applyHousenumberSynthesis(out, query);
}

/** Exported for unit tests — do not use as public API. */
export function normalizeAutocompleteQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function biasBucket(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'none';
  return String(Math.round(value / GEO_BIAS_BUCKET) * GEO_BIAS_BUCKET);
}

/** Exported for unit tests — do not use as public API. Cache v4 = aliases + catalog + OLC + hn. */
export function autocompleteCacheKey(query: string, lat?: number, lng?: number): string {
  return `geo:ac:v4:${normalizeAutocompleteQuery(query)}:${biasBucket(lat)}:${biasBucket(lng)}`;
}

function featuresToPlaceResults(
  features: PhotonFeature[],
  query: string,
  biasLat: number,
  biasLng: number,
): PlaceResult[] {
  const ranked = rankPhotonPlaceFeatures(features, query, biasLat, biasLng);
  const results: PlaceResult[] = [];
  for (const f of ranked) {
    const description = formatPhotonAddress(f.properties);
    if (!description) continue;
    const [flng, flat] = f.geometry.coordinates;
    if (!Number.isFinite(flat) || !Number.isFinite(flng)) continue;
    if (flat === 0 && flng === 0) continue;
    results.push({
      description,
      place_id: String(f.properties.osm_id),
      lat: flat,
      lng: flng,
    });
  }
  return results;
}

function isStreetishQuery(q: string): boolean {
  // Short generic POI tokens get catalog; multi-token street names should not
  // be replaced solely by unrelated catalog noise when Photon has highways.
  const n = normalizePlaceMatch(q);
  if (!n) return false;
  if (/\d/.test(n)) return true;
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return true;
  return false;
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
    const trimmed = input.trim();
    const cacheKey = autocompleteCacheKey(trimmed, biasLat, biasLng);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const hits = JSON.parse(cached) as PlaceResult[];
      logger.info('[geo] autocomplete', {
        ms: Date.now() - t0,
        cache: 'hit',
        count: hits.length,
        qLen: trimmed.length,
      });
      return hits;
    }

    const catalogHits = matchCatalogPlaces(trimmed, undefined, {
      biasLat,
      biasLng,
    }) as PlaceResult[];
    const olcHit = plusCodePlaceResult(trimmed, biasLat, biasLng);
    const olcList: PlaceResult[] = olcHit ? [olcHit] : [];
    const queries = expandPlaceQueries(trimmed);

    const photonLists = await Promise.allSettled(
      queries.map(async (q) => {
        const url = new URL(`${PHOTON_URL}/api/`);
        url.searchParams.set('q', q);
        url.searchParams.set('limit', '10');
        url.searchParams.set('lang', 'default');
        url.searchParams.set('lat', String(biasLat));
        url.searchParams.set('lon', String(biasLng));
        const data = await fetchPhoton(url, GEO_AUTOCOMPLETE_TIMEOUT_MS);
        // Rank once per Photon response (preserves osm_key for poiBoost).
        return featuresToPlaceResults(data.features || [], trimmed, biasLat, biasLng);
      }),
    );

    const photonResults: PlaceResult[][] = photonLists.map((r) =>
      r.status === 'fulfilled' ? applyHousenumberSynthesis(r.value, trimmed) : [],
    );

    // OLC + catalog first, then Photon lists already ranked — no synthetic re-rank.
    let merged = mergePlaceResults([olcList, catalogHits, ...photonResults]) as PlaceResult[];
    merged = applyHousenumberSynthesis(merged, trimmed);

    // Provider fallback when Photon returned nothing useful — even if catalog/OLC
    // already matched (e.g. POI alias). Catalog alone is fine for pure POI queries;
    // streetish free-text still needs a street geom from Photon retry / Nominatim.
    const hasProviderHit = photonResults.some((l) => l.length > 0);
    if (!hasProviderHit && isStreetishQuery(trimmed)) {
      const parsed = parseStreetQuery(trimmed);
      const fallbackQ =
        parsed.streetName && parsed.housenumber
          ? `${parsed.streetName} ${parsed.housenumber}${parsed.cityHint ? `, ${parsed.cityHint}` : ''}`
          : parsed.streetName
            ? `${parsed.streetName}${parsed.cityHint ? `, ${parsed.cityHint}` : ''}`
            : trimmed;
      let providerExtra: PlaceResult[] = [];
      try {
        const url = new URL(`${PHOTON_URL}/api/`);
        url.searchParams.set('q', fallbackQ);
        url.searchParams.set('limit', '10');
        url.searchParams.set('lang', 'default');
        url.searchParams.set('lat', String(biasLat));
        url.searchParams.set('lon', String(biasLng));
        const data = await fetchPhoton(url, Math.max(GEO_AUTOCOMPLETE_TIMEOUT_MS, 5000));
        providerExtra = applyHousenumberSynthesis(
          featuresToPlaceResults(data.features || [], trimmed, biasLat, biasLng),
          trimmed,
        );
      } catch {
        // Photon still down — Nominatim below
      }
      if (providerExtra.length === 0) {
        try {
          providerExtra = await nominatimStreetFallback(trimmed, biasLat, biasLng);
        } catch {
          // keep empty provider side
        }
      }
      if (providerExtra.length > 0) {
        merged = mergePlaceResults([olcList, catalogHits, providerExtra]) as PlaceResult[];
        merged = applyHousenumberSynthesis(merged, trimmed);
      }
    }

    // Street queries: drop weak catalog rows that do not share query tokens
    // (generic plaza/terminal noise). Never drop OLC. Always keep catalogHits
    // already returned by matchCatalogPlaces (alias-scored).
    if (isStreetishQuery(trimmed) && photonResults.some((l) => l.length > 0)) {
      const qn = normalizePlaceMatch(trimmed);
      const qTokens = new Set(qn.split(/[^a-z0-9+]+/).filter((t) => t.length >= 3));
      merged = merged.filter((p) => {
        const id = String(p.place_id);
        if (!id.startsWith('catalog:')) return true;
        if (catalogHits.some((c) => c.place_id === id)) return true;
        const dn = normalizePlaceMatch(p.description);
        for (const t of qTokens) {
          if (dn.includes(t)) return true;
        }
        return false;
      });
    }

    // Prefer local footprint when bias is VD: drop far Photon noise (e.g. bare "148").
    if (isBiasNearVillaDolores(biasLat, biasLng)) {
      const local = merged.filter((p) => {
        const id = String(p.place_id);
        if (id.startsWith('catalog:') || id.startsWith('olc:')) return true;
        return haversineDistance(biasLat, biasLng, p.lat, p.lng) <= GEO_LOCAL_BIAS_KM * 2;
      });
      if (local.length > 0) merged = local;
    }

    const results = merged.slice(0, 10);

    if (results.length > 0) {
      await cacheSet(cacheKey, JSON.stringify(results), GEO_AUTOCOMPLETE_CACHE_TTL);
    }

    logger.info('[geo] autocomplete', {
      ms: Date.now() - t0,
      cache: 'miss',
      count: results.length,
      qLen: trimmed.length,
      queries: queries.length,
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
      if (
        addr.includes('villa sarmiento') ||
        addr.includes('v. sarmiento') ||
        addr.includes('v sarmiento')
      ) {
        return {
          lat: -31.9358863,
          lng: -65.1915949,
          formatted_address: params.address ?? 'Villa Sarmiento, Córdoba, Argentina',
          city: 'Villa Sarmiento',
          province: 'Córdoba',
        };
      }
      // San Pedro Córdoba only — require province cue (not BA San Pedro).
      const isSanPedroName =
        addr.includes('san pedro') || addr.includes('s. pedro') || /\bs pedro\b/.test(addr);
      const isCordobaCue =
        addr.includes('córdoba') || addr.includes('cordoba') || addr.includes('cba');
      if (isSanPedroName && isCordobaCue) {
        return {
          lat: -31.936553,
          lng: -65.2189268,
          formatted_address: params.address ?? 'San Pedro, Córdoba, Argentina',
          city: 'San Pedro',
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
