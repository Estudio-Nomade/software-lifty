export type PlaceLike = {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
};

export type CatalogPlace = {
  id: string;
  aliases: string[];
  name: string;
  lat: number;
  lng: number;
  city?: string;
  active?: boolean;
};

/** Keys MUST be normalizePlaceQuery() forms (connectors already stripped). */
const EXACT_ALIAS_QUERIES: Record<string, string> = {
  'dique fuerte': 'Lago del Fuerte',
  'dique fuerte tandil': 'Lago del Fuerte, Tandil',
  'lago fuerte': 'Lago del Fuerte',
  'lago fuerte tandil': 'Lago del Fuerte, Tandil',
};

const MAX_QUERIES = 3;

/** Villa Dolores launch center (Plus Code 3R45+2Q area). */
export const VD_CENTER = { lat: -31.9449, lng: -65.1906 } as const;

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

export function normalizePlaceQuery(q: string): string {
  let s = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');
  s = s.replace(/\b(de la|de los|de las|del|de)\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function pushUnique(out: string[], seen: Set<string>, raw: string): void {
  const t = raw.trim();
  if (!t) return;
  const key = t.toLowerCase().replace(/\s+/g, ' ');
  if (seen.has(key)) return;
  seen.add(key);
  out.push(t);
}

function replaceWaterToken(norm: string, from: string, to: string): string | null {
  const parts = norm.split(' ');
  let hit = false;
  const next = parts.map((p) => {
    if (p === from) {
      hit = true;
      return to;
    }
    return p;
  });
  if (!hit) return null;
  return next.join(' ');
}

export function expandPlaceQueries(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  pushUnique(out, seen, trimmed);

  const norm = normalizePlaceQuery(trimmed);
  const origLower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (norm && norm !== origLower) {
    pushUnique(out, seen, norm);
  }

  for (const [alias, preferred] of Object.entries(EXACT_ALIAS_QUERIES)) {
    if (norm === alias || norm.startsWith(`${alias} `) || norm.endsWith(` ${alias}`)) {
      pushUnique(out, seen, preferred);
    }
  }
  if (norm.includes('dique fuerte')) {
    pushUnique(out, seen, 'Lago del Fuerte');
  }

  if (out.length < MAX_QUERIES) {
    const tokens = norm.split(' ');
    if (tokens.includes('dique')) {
      const lago = replaceWaterToken(norm, 'dique', 'lago');
      if (lago) pushUnique(out, seen, lago);
    } else if (tokens.includes('lago')) {
      const dique = replaceWaterToken(norm, 'lago', 'dique');
      if (dique) pushUnique(out, seen, dique);
    } else if (tokens.includes('embalse')) {
      const lago = replaceWaterToken(norm, 'embalse', 'lago');
      if (lago) pushUnique(out, seen, lago);
    } else if (tokens.includes('represa') || tokens.includes('presa')) {
      const from = tokens.includes('represa') ? 'represa' : 'presa';
      const lago = replaceWaterToken(norm, from, 'lago');
      if (lago) pushUnique(out, seen, lago);
    }
  }

  if (out.length < MAX_QUERIES) {
    const avNorm = norm.replace(/\b(avda?)\b/g, 'avenida');
    if (avNorm !== norm) pushUnique(out, seen, avNorm);
  }

  return out.slice(0, MAX_QUERIES);
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function mergePlaceResults(lists: PlaceLike[][]): PlaceLike[] {
  const out: PlaceLike[] = [];
  const seenId = new Set<string>();
  const seenCoord = new Set<string>();

  for (const list of lists) {
    for (const p of list) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const id = String(p.place_id ?? '');
      if (id && seenId.has(id)) continue;
      const ck = coordKey(p.lat, p.lng);
      if (seenCoord.has(ck)) continue;
      if (id) seenId.add(id);
      seenCoord.add(ck);
      out.push(p);
    }
  }
  return out;
}

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

export function matchCatalogPlaces(
  query: string,
  catalog: CatalogPlace[] = PLACES_CATALOG,
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
    if (best > 0) hits.push({ place, score: best });
  }

  hits.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  const limit = q.length <= 3 ? 3 : 5;
  return hits.slice(0, limit).map((h) => catalogToPlaceResult(h.place));
}
