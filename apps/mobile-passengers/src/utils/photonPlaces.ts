import type { PlaceSuggestion } from '../api/types';
import {
  VD_CENTER,
  expandPlaceQueries,
  matchCatalogPlaces,
  mergePlaceResults,
} from './placeAliases';

/** Villa Dolores launch footprint — bias when GPS is unknown. */
export const DEFAULT_PLACE_BIAS = { lat: -31.9456, lng: -65.1895 } as const;

const PHOTON_API = 'https://photon.komoot.io/api/';
const PHOTON_LIMIT = 10;
/** Client-side ceiling so a hung Komoot host cannot spin the Destino spinner forever. */
export const PHOTON_CLIENT_TIMEOUT_MS = 4000;
const LOCAL_BIAS_KM = 20;
const LOCAL_IN_BBOX_BOOST = 40;
const WATER_POI_KEYS = new Set(['water', 'waterway', 'natural', 'tourism', 'leisure']);

function mergeAbortSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const local = new AbortController();
  const timer = setTimeout(() => local.abort(), timeoutMs);

  const onExternalAbort = () => local.abort();
  if (external) {
    if (external.aborted) {
      clearTimeout(timer);
      local.abort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: local.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

export type PhotonProps = {
  osm_id?: number | string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProps;
};

type PhotonResponse = { features?: PhotonFeature[] };

function isHighwayProps(p: PhotonProps): boolean {
  return (
    p.osm_key === 'highway' ||
    p.type === 'street' ||
    p.type === 'road' ||
    p.osm_value === 'residential'
  );
}

/**
 * Street+number for addresses/highways; **name first** for POIs (amenity, tourism,
 * leisure, natural, waterway, place, …) so dique/calvario/plaza don't collapse to street.
 */
export function formatPhotonPlaceLabel(p: PhotonProps): string {
  const streetField = typeof p.street === 'string' ? p.street.trim() : '';
  const num = typeof p.housenumber === 'string' ? p.housenumber.trim() : '';
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  const highway = isHighwayProps(p);

  let primary = '';
  if (highway) {
    const street = streetField || name;
    primary = [street, num].filter(Boolean).join(' ');
  } else if (num && streetField) {
    // Address node (housenumber) — street line, not resident/POI name on the pin.
    primary = [streetField, num].filter(Boolean).join(' ');
  } else if (name) {
    primary = name;
  } else {
    primary = [streetField, num].filter(Boolean).join(' ');
  }
  if (!primary) return '';

  const locality =
    (typeof p.city === 'string' && p.city) ||
    (typeof p.town === 'string' && p.town) ||
    (typeof p.village === 'string' && p.village) ||
    '';
  return [primary, locality, p.state, p.country]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(', ');
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function isBiasNearVillaDolores(biasLat: number, biasLng: number): boolean {
  return haversineKm(biasLat, biasLng, VD_CENTER.lat, VD_CENTER.lng) <= LOCAL_BIAS_KM;
}

/** Soft-rank: name match + proximity + local-bbox boost near VD. */
export function rankPhotonFeatures(
  features: PhotonFeature[],
  query: string,
  biasLat: number,
  biasLng: number,
): PhotonFeature[] {
  const q = normalizeMatch(query);
  if (!q || features.length <= 1) return features;

  const preferLocal = isBiasNearVillaDolores(biasLat, biasLng);
  const queryHasDigits = /\d/.test(query);

  const scored = features.map((f, index) => {
    const props = f.properties ?? {};
    const name = normalizeMatch(typeof props.name === 'string' ? props.name : '');
    const street = normalizeMatch(typeof props.street === 'string' ? props.street : '');
    const label = normalizeMatch(formatPhotonPlaceLabel(props));
    let match = 0;
    if (name === q || street === q) match = 100;
    else if (name.startsWith(q) || street.startsWith(q)) match = 70;
    else if (name.includes(q) || street.includes(q) || label.includes(q)) match = 45;

    const coords = f.geometry?.coordinates;
    let distKm = 1e9;
    if (coords && coords.length >= 2) {
      const [lng, lat] = coords;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        distKm = haversineKm(biasLat, biasLng, lat, lng);
      }
    }
    const proximity = Number.isFinite(distKm) ? Math.max(0, 150 - distKm) : 0;
    let localBoost = 0;
    if (preferLocal && Number.isFinite(distKm) && distKm <= LOCAL_BIAS_KM) {
      localBoost = LOCAL_IN_BBOX_BOOST;
    }
    let poiBoost = 0;
    const osmKey = typeof props.osm_key === 'string' ? props.osm_key : '';
    if (!queryHasDigits && WATER_POI_KEYS.has(osmKey) && match > 0) {
      poiBoost = 12;
    }
    const score = match + proximity + localBoost + poiBoost;
    return { f, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.f);
}

export function mapPhotonFeaturesToPlaces(
  data: PhotonResponse,
  opts?: { query?: string; biasLat?: number; biasLng?: number },
): PlaceSuggestion[] {
  let features = data.features ?? [];
  const biasLat =
    typeof opts?.biasLat === 'number' && Number.isFinite(opts.biasLat)
      ? opts.biasLat
      : DEFAULT_PLACE_BIAS.lat;
  const biasLng =
    typeof opts?.biasLng === 'number' && Number.isFinite(opts.biasLng)
      ? opts.biasLng
      : DEFAULT_PLACE_BIAS.lng;
  if (opts?.query) {
    features = rankPhotonFeatures(features, opts.query, biasLat, biasLng);
  }

  const out: PlaceSuggestion[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const props = f.properties;
    if (!coords || coords.length < 2 || !props) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    const description = formatPhotonPlaceLabel(props);
    if (!description) continue;
    out.push({
      description,
      place_id: String(props.osm_id ?? `${lat},${lng}`),
      lat,
      lng,
    });
  }
  return out;
}

async function fetchOnePhotonQuery(
  q: string,
  biasLat: number,
  biasLng: number,
  fetchSignal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const url = new URL(PHOTON_API);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(PHOTON_LIMIT));
  url.searchParams.set('lang', 'default');
  url.searchParams.set('lat', String(biasLat));
  url.searchParams.set('lon', String(biasLng));

  const res = await fetch(url.toString(), { signal: fetchSignal });
  if (!res.ok) return [];
  const data = (await res.json()) as PhotonResponse;
  return mapPhotonFeaturesToPlaces(data, { query: q, biasLat, biasLng });
}

/**
 * Direct Photon autocomplete (no backend). Used when /maps/places/autocomplete
 * fails, times out empty, or is unreachable from Expo Go.
 * Expands aliases (≤3 queries) + prepends curated catalog hits.
 */
export async function searchPhotonPlaces(
  input: string,
  lat?: number,
  lng?: number,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const biasLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : DEFAULT_PLACE_BIAS.lat;
  const biasLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : DEFAULT_PLACE_BIAS.lng;

  const catalogHits = matchCatalogPlaces(q) as PlaceSuggestion[];
  const queries = expandPlaceQueries(q);

  const { signal: fetchSignal, cleanup } = mergeAbortSignals(signal, PHOTON_CLIENT_TIMEOUT_MS);
  try {
    const settled = await Promise.allSettled(
      queries.map((query) => fetchOnePhotonQuery(query, biasLat, biasLng, fetchSignal)),
    );

    if (signal?.aborted) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const photonLists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));
    const merged = mergePlaceResults([catalogHits, ...photonLists]) as PlaceSuggestion[];

    // Keep catalog ahead of Photon re-rank so far curated pins stay visible.
    const catalogPart = merged.filter((p) => String(p.place_id).startsWith('catalog:'));
    const photonPart = merged.filter((p) => !String(p.place_id).startsWith('catalog:'));
    let rankedPhoton = photonPart;
    if (photonPart.length > 1) {
      const features: PhotonFeature[] = photonPart.map((p, i) => ({
        geometry: { coordinates: [p.lng, p.lat] as [number, number] },
        properties: {
          osm_id: i,
          name: p.description.split(',')[0]?.trim() || p.description,
        },
      }));
      const ranked = rankPhotonFeatures(features, q, biasLat, biasLng);
      rankedPhoton = ranked
        .map((f) => photonPart[Number(f.properties?.osm_id)])
        .filter((p): p is PlaceSuggestion => !!p);
    }

    return [...catalogPart, ...rankedPhoton].slice(0, 10);
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const isAbort = name === 'AbortError' || signal?.aborted || fetchSignal.aborted;
    if (isAbort) {
      if (signal?.aborted) {
        const abortErr = err instanceof Error ? err : new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      // Local timeout: still surface catalog if any
      return catalogHits.slice(0, 10);
    }
    return catalogHits.slice(0, 10);
  } finally {
    cleanup();
  }
}
