import { type PlaceLike, normalizePlaceQuery } from './place-aliases';

export type CatalogPlace = {
  id: string;
  aliases: string[];
  name: string;
  lat: number;
  lng: number;
  city?: string;
  active?: boolean;
};

/** Villa Dolores launch center (Plus Code 3R45+2Q area). */
export const VD_CENTER = { lat: -31.9449, lng: -65.1906 } as const;

/** Evidence-based seeds (Photon/OSM). No invented VD dique. */
export const PLACES_CATALOG: CatalogPlace[] = [
  {
    id: 'tandil-lago-del-fuerte',
    name: 'Lago del Fuerte',
    lat: -37.3456714,
    lng: -59.1299263,
    city: 'Tandil',
    aliases: [
      'dique del fuerte',
      'dique fuerte',
      'dique del fuerte tandil',
      'lago del fuerte',
      'lago fuerte',
      'lago del fuerte tandil',
    ],
  },
  {
    id: 'vd-terminal-omnibus',
    name: 'Terminal de Ómnibus de Villa Dolores',
    lat: -31.95483,
    lng: -65.18777,
    city: 'Villa Dolores',
    aliases: [
      'terminal',
      'terminal de omnibus',
      'terminal omnibus',
      'terminal villa dolores',
      'terminal de omnibus de villa dolores',
    ],
  },
  {
    id: 'vd-hospital-regional',
    name: 'Hospital Regional Villa Dolores',
    lat: -31.94988,
    lng: -65.16776,
    city: 'Villa Dolores',
    aliases: [
      'hospital',
      'hospital regional',
      'hospital villa dolores',
      'hospital regional villa dolores',
    ],
  },
  {
    id: 'vd-plaza-mitre',
    name: 'Plaza Mitre',
    lat: -31.94513,
    lng: -65.19027,
    city: 'Villa Dolores',
    aliases: ['plaza mitre', 'plaza', 'mitre'],
  },
  {
    id: 'vd-plaza-san-martin',
    name: 'Plaza San Martín',
    lat: -31.95249,
    lng: -65.17395,
    city: 'Villa Dolores',
    aliases: ['plaza san martin', 'plaza san martín'],
  },
  {
    id: 'vd-municipalidad',
    name: 'Municipalidad Villa Dolores',
    lat: -31.94293,
    lng: -65.19028,
    city: 'Villa Dolores',
    aliases: ['municipalidad', 'municipalidad villa dolores', 'centro civico', 'centro cívico'],
  },
  {
    id: 'vd-balneario-municipal',
    name: 'Balneario Municipal de Villa Dolores',
    lat: -31.94111,
    lng: -65.18617,
    city: 'Villa Dolores',
    aliases: [
      'balneario',
      'balneario municipal',
      'balneario villa dolores',
      'balneario municipal de villa dolores',
    ],
  },
];

function catalogDescription(p: CatalogPlace): string {
  return p.city ? `${p.name}, ${p.city}` : p.name;
}

export function catalogToPlaceResult(p: CatalogPlace): PlaceLike {
  return {
    description: catalogDescription(p),
    place_id: `catalog:${p.id}`,
    lat: p.lat,
    lng: p.lng,
  };
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

/** Generic short tokens (terminal/hospital) only near bias. */
const CATALOG_LOCAL_KM = 40;
/**
 * Specific multi-token / exact aliases may surface far pins (Tandil from VD default).
 * Still capped so BA typing "Terminal" never gets VD catalog.
 */
const CATALOG_FAR_ALIAS_KM = 900;

export type MatchCatalogOpts = {
  biasLat?: number;
  biasLng?: number;
};

function allowCatalogByBias(
  place: CatalogPlace,
  q: string,
  score: number,
  biasLat?: number,
  biasLng?: number,
): boolean {
  if (
    typeof biasLat !== 'number' ||
    !Number.isFinite(biasLat) ||
    typeof biasLng !== 'number' ||
    !Number.isFinite(biasLng)
  ) {
    return true;
  }
  const dist = haversineKm(biasLat, biasLng, place.lat, place.lng);
  if (dist <= CATALOG_LOCAL_KM) return true;

  const cityN = place.city ? normalizePlaceQuery(place.city) : '';
  if (cityN && (q.includes(cityN) || q.endsWith(` ${cityN}`))) return dist <= CATALOG_FAR_ALIAS_KM;

  // Far pins only for multi-token / specific queries (e.g. "dique fuerte"),
  // never for single generic tokens like "terminal" / "hospital".
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (qTokens.length >= 2 && score >= 80 && dist <= CATALOG_FAR_ALIAS_KM) return true;

  return false;
}

/**
 * Match when normalize(query) length ≥2 and alias startsWith query
 * or query is a strong substring of alias (query length ≥3).
 * Prefers longer alias hits; filters by proximity to bias for short/generic tokens.
 */
export function matchCatalogPlaces(
  query: string,
  catalog: CatalogPlace[] = PLACES_CATALOG,
  opts?: MatchCatalogOpts,
): PlaceLike[] {
  const q = normalizePlaceQuery(query);
  if (q.length < 2) return [];

  const hits: { place: CatalogPlace; score: number }[] = [];
  for (const place of catalog) {
    if (place.active === false) continue;
    const aliases = place.aliases.map((a) => normalizePlaceQuery(a));
    const nameN = normalizePlaceQuery(place.name);
    const all = [...aliases, nameN];
    let best = 0;
    for (const alias of all) {
      if (!alias) continue;
      if (alias === q) best = Math.max(best, 100);
      else if (alias.startsWith(q)) best = Math.max(best, 80 + Math.min(q.length, 20));
      else if (q.length >= 3 && alias.includes(q))
        best = Math.max(best, 50 + Math.min(q.length, 15));
      else if (q.length >= 4 && q.includes(alias) && alias.length >= 4) best = Math.max(best, 40);
    }
    if (best > 0 && allowCatalogByBias(place, q, best, opts?.biasLat, opts?.biasLng)) {
      hits.push({ place, score: best });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  const limit = q.length <= 3 ? 3 : 5;
  return hits.slice(0, limit).map((h) => catalogToPlaceResult(h.place));
}
