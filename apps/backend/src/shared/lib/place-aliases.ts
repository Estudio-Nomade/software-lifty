export type PlaceLike = {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
};

/** Class synonyms for water bodies (token replace; not cartesian explosion). */
const WATER_CLASS = ['dique', 'lago', 'embalse', 'represa', 'presa'] as const;

/**
 * Curated colloquial → Photon-preferred query (display form).
 * Keys are normalizePlaceQuery results.
 */
/** Keys MUST be normalizePlaceQuery() forms (connectors already stripped). */
const EXACT_ALIAS_QUERIES: Record<string, string> = {
  'dique fuerte': 'Lago del Fuerte',
  'dique fuerte tandil': 'Lago del Fuerte, Tandil',
  'lago fuerte': 'Lago del Fuerte',
  'lago fuerte tandil': 'Lago del Fuerte, Tandil',
};

const MAX_QUERIES = 3;

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

/**
 * Original + normalized + up to 1–2 expanded variants. Cap 3, deduped.
 */
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

  // Exact curated aliases → preferred Photon query
  for (const [alias, preferred] of Object.entries(EXACT_ALIAS_QUERIES)) {
    if (norm === alias || norm.startsWith(`${alias} `) || norm.endsWith(` ${alias}`)) {
      pushUnique(out, seen, preferred);
    }
  }
  // substring after normalize (connectors stripped → "dique fuerte")
  if (norm.includes('dique fuerte')) {
    pushUnique(out, seen, 'Lago del Fuerte');
  }

  // Class synonym: dique → lago (and reverse once if still room)
  if (out.length < MAX_QUERIES) {
    const hasWater = WATER_CLASS.some((t) => norm.split(' ').includes(t));
    if (hasWater) {
      if (norm.split(' ').includes('dique')) {
        const lago = replaceWaterToken(norm, 'dique', 'lago');
        if (lago) pushUnique(out, seen, lago);
      } else if (norm.split(' ').includes('lago')) {
        const dique = replaceWaterToken(norm, 'lago', 'dique');
        if (dique) pushUnique(out, seen, dique);
      } else if (norm.split(' ').includes('embalse')) {
        const lago = replaceWaterToken(norm, 'embalse', 'lago');
        if (lago) pushUnique(out, seen, lago);
      } else if (norm.split(' ').includes('represa') || norm.split(' ').includes('presa')) {
        const from = norm.split(' ').includes('represa') ? 'represa' : 'presa';
        const lago = replaceWaterToken(norm, from, 'lago');
        if (lago) pushUnique(out, seen, lago);
      }
    }
  }

  // Light av/avda → avenida
  if (out.length < MAX_QUERIES) {
    const avNorm = norm.replace(/\b(avda?)\b/g, 'avenida');
    if (avNorm !== norm) pushUnique(out, seen, avNorm);
  }

  return out.slice(0, MAX_QUERIES);
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Dedupe by place_id then ~5dp coords. First list wins (catalog / preferred).
 */
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
