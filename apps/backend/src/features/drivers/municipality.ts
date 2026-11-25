import {
  type ServiceMarketGeo,
  findPickupMarket,
  isInsidePickupArea,
} from '../../shared/lib/service-area';

/**
 * Territorial resolution for driver domicile.
 *
 * Separation of concerns (see docs/architecture/service-markets-multi-city.md):
 * - Geocoder (Photon/Nominatim): human-readable address labels only.
 * - Service markets (hub + pickup radius): operational fence — coords decide.
 * - Districts: legal annex / intended_district label after market hit.
 *
 * Photon city text MUST NOT grant or deny operational status.
 */

export type MunicipalityStatus = 'unset' | 'operational' | 'waitlisted' | 'unresolved';

/** How the canonical municipality/market was chosen. */
export type ResolutionMethod =
  | 'service_market_hub'
  | 'none'
  | 'accuracy_insufficient'
  | 'coords_missing';

export interface ResolvedAddress {
  address_line: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  province: string | null;
}

export interface DistrictMatchCandidate {
  id: string;
  name: string;
  province: string;
  status: string;
}

export interface MunicipalityResolveResult {
  municipality_status: MunicipalityStatus;
  intended_district_id: string | null;
  intended_district_name: string | null;
  /** Active service_markets.id when resolved via hub fence; null otherwise. */
  service_market_id: string | null;
  resolution_method: ResolutionMethod;
  /** Canonical municipality / market label for UI (never raw Photon pedanía). */
  address_resolved_city: string | null;
  address_resolved_province: string | null;
  /** Raw geocoder locality — audit only; never used as operational gate. */
  geocoder_city: string | null;
  geocoder_province: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_line: string;
}

/** Max horizontal accuracy (meters) accepted for operational assignment. */
export const MAX_GPS_ACCURACY_M = 500;

/**
 * Name aliases for **district/market labels only** (legal annex names).
 * NOT used to interpret Photon reverse-geocode into operational status.
 * Pedanía-style OSM labels are ignored for ops; coords + market fence win.
 */
const DISTRICT_LABEL_ALIASES: Record<string, string> = {
  'v dolores': 'villa dolores',
  'v. dolores': 'villa dolores',
  'villa d': 'villa dolores',
  vd: 'villa dolores',
  'v sarmiento': 'villa sarmiento',
  'v. sarmiento': 'villa sarmiento',
  'villa sarmiento cordoba': 'villa sarmiento',
  'san pedro cordoba': 'san pedro',
  'san pedro cba': 'san pedro',
  's pedro': 'san pedro',
  's. pedro': 'san pedro',
};

/** Strip accents, lowercase, collapse whitespace and punctuation for fuzzy match. */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyDistrictLabelAlias(normalized: string): string {
  return DISTRICT_LABEL_ALIASES[normalized] ?? normalized;
}

/**
 * Match a **known Lifty label** (market name / district name) against active districts.
 * Do not pass raw Photon reverse labels here for operational decisions.
 */
export function matchDistrict(
  city: string | null,
  province: string | null,
  candidates: DistrictMatchCandidate[],
  options?: { requireProvince?: boolean },
): DistrictMatchCandidate | null {
  const active = candidates.filter((d) => d.status === 'active');
  if (active.length === 0) return null;

  const cityNorm = city ? applyDistrictLabelAlias(normalizePlaceName(city)) : '';
  const provinceNorm = province ? normalizePlaceName(province) : '';
  const requireProvince = options?.requireProvince === true;

  if (!cityNorm) return null;
  if (requireProvince && !provinceNorm) return null;

  const nameMatches = active.filter((d) => {
    const nameNorm = applyDistrictLabelAlias(normalizePlaceName(d.name));
    return nameNorm === cityNorm || cityNorm.includes(nameNorm) || nameNorm.includes(cityNorm);
  });

  if (nameMatches.length === 0) return null;

  if (provinceNorm) {
    const withProvince = nameMatches.filter((d) => {
      const p = normalizePlaceName(d.province);
      return p === provinceNorm || p.includes(provinceNorm) || provinceNorm.includes(p);
    });
    if (withProvince.length >= 1) return withProvince[0];
    if (requireProvince) return null;
  }

  if (nameMatches.length === 1) return nameMatches[0];
  return nameMatches[0];
}

/** Map active pickup market → legal district (default_district_id, else name+province). */
export function resolveDistrictForMarket(
  market: ServiceMarketGeo,
  candidates: DistrictMatchCandidate[],
): DistrictMatchCandidate | null {
  if (market.default_district_id) {
    const byId = candidates.find(
      (d) => d.id === market.default_district_id && d.status === 'active',
    );
    if (byId) return byId;
  }
  return matchDistrict(market.name, market.province, candidates, { requireProvince: true });
}

/**
 * Coords-first district resolution.
 * Photon/geocoder city is ignored for the gate — only market hub fence decides.
 */
export function resolveDistrictForAddress(
  _city: string | null,
  _province: string | null,
  candidates: DistrictMatchCandidate[],
  lat: number | null,
  lng: number | null,
): DistrictMatchCandidate | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const market = findPickupMarket(lat, lng);
  if (!market) return null;
  return resolveDistrictForMarket(market, candidates);
}

function emptyResult(
  addressLine: string,
  partial: Partial<MunicipalityResolveResult> & {
    municipality_status: MunicipalityStatus;
    resolution_method: ResolutionMethod;
  },
): MunicipalityResolveResult {
  return {
    intended_district_id: null,
    intended_district_name: null,
    service_market_id: null,
    address_resolved_city: null,
    address_resolved_province: null,
    geocoder_city: null,
    geocoder_province: null,
    address_lat: null,
    address_lng: null,
    address_line: addressLine,
    ...partial,
  };
}

/**
 * Pure territorial resolve from coordinates.
 * Geocoder labels are optional audit/display fields only.
 */
export function resolveTerritoryFromCoords(
  lat: number,
  lng: number,
  candidates: DistrictMatchCandidate[],
  opts?: {
    addressLine?: string;
    geocoderCity?: string | null;
    geocoderProvince?: string | null;
    accuracyM?: number | null;
    maxAccuracyM?: number;
  },
): MunicipalityResolveResult {
  const addressLine = (opts?.addressLine ?? '').trim() || 'Domicilio';
  const geocoderCity = opts?.geocoderCity ?? null;
  const geocoderProvince = opts?.geocoderProvince ?? null;
  const maxAcc = opts?.maxAccuracyM ?? MAX_GPS_ACCURACY_M;
  const accuracyM = opts?.accuracyM;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return emptyResult(addressLine, {
      municipality_status: 'unresolved',
      resolution_method: 'coords_missing',
      geocoder_city: geocoderCity,
      geocoder_province: geocoderProvince,
    });
  }

  if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > maxAcc) {
    return emptyResult(addressLine, {
      municipality_status: 'unresolved',
      resolution_method: 'accuracy_insufficient',
      geocoder_city: geocoderCity,
      geocoder_province: geocoderProvince,
      address_lat: lat,
      address_lng: lng,
    });
  }

  const market = findPickupMarket(lat, lng);
  if (!market) {
    // Outside every active pickup fence → identified as "not in Lifty ops", waitlist.
    // Prefer geocoder labels for human copy only.
    return emptyResult(addressLine, {
      municipality_status: 'waitlisted',
      resolution_method: 'none',
      geocoder_city: geocoderCity,
      geocoder_province: geocoderProvince,
      address_resolved_city: geocoderCity,
      address_resolved_province: geocoderProvince,
      address_lat: lat,
      address_lng: lng,
    });
  }

  const district = resolveDistrictForMarket(market, candidates);
  const canonicalCity = district?.name ?? market.name;
  const canonicalProvince = district?.province ?? market.province;

  return {
    municipality_status: 'operational',
    intended_district_id: district?.id ?? null,
    intended_district_name: district?.name ?? market.name,
    service_market_id: market.id.startsWith('legacy-') ? null : market.id,
    resolution_method: 'service_market_hub',
    address_resolved_city: canonicalCity,
    address_resolved_province: canonicalProvince,
    geocoder_city: geocoderCity,
    geocoder_province: geocoderProvince,
    address_lat: lat,
    address_lng: lng,
    address_line: addressLine,
  };
}

/**
 * @deprecated Prefer resolveTerritoryFromCoords. Kept for call sites that already
 * separated match; still coords-gated via insidePickup.
 */
export function buildMunicipalityResult(
  addressLine: string,
  resolved: {
    lat: number | null;
    lng: number | null;
    city: string | null;
    province: string | null;
  },
  match: DistrictMatchCandidate | null,
): MunicipalityResolveResult {
  const hasCoords =
    resolved.lat != null &&
    resolved.lng != null &&
    Number.isFinite(resolved.lat) &&
    Number.isFinite(resolved.lng);

  if (!hasCoords) {
    return emptyResult(addressLine, {
      municipality_status: 'unresolved',
      resolution_method: 'coords_missing',
      geocoder_city: resolved.city,
      geocoder_province: resolved.province,
    });
  }

  // Re-run coords-first path; ignore Photon-derived match for gate.
  return resolveTerritoryFromCoords(
    resolved.lat as number,
    resolved.lng as number,
    match ? [match] : [],
    {
      addressLine,
      geocoderCity: resolved.city,
      geocoderProvince: resolved.province,
    },
  );
}

/**
 * Re-evaluate a stored waitlisted/unresolved domicile without re-geocoding.
 * Heals when pin is already inside an active pickup market.
 */
export function tryHealWaitlistedMunicipality(
  stored: {
    address_line: string | null;
    address_lat: number | null;
    address_lng: number | null;
    address_resolved_city: string | null;
    address_resolved_province: string | null;
    geocoder_city?: string | null;
    geocoder_province?: string | null;
  },
  candidates: DistrictMatchCandidate[],
): MunicipalityResolveResult | null {
  const lat = stored.address_lat;
  const lng = stored.address_lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (!isInsidePickupArea(lat, lng)) return null;

  const geocoderCity = stored.geocoder_city ?? stored.address_resolved_city ?? null;
  const geocoderProvince = stored.geocoder_province ?? stored.address_resolved_province ?? null;

  const result = resolveTerritoryFromCoords(lat, lng, candidates, {
    addressLine: stored.address_line?.trim() || undefined,
    geocoderCity,
    geocoderProvince,
  });

  return result.municipality_status === 'operational' ? result : null;
}

export function extractLocalityFromPhotonProps(
  props: Record<string, string | number | undefined>,
): { city: string | null; province: string | null } {
  const cityRaw =
    props.city || props.town || props.village || props.municipality || props.county || props.name;
  const provinceRaw = props.state || props.county;
  return {
    city: cityRaw ? String(cityRaw) : null,
    province: provinceRaw ? String(provinceRaw) : null,
  };
}

/** Parse "Street, City, Province, Country" style formatted addresses when Photon props missing. */
export function parseLocalityFromFormatted(formatted: string): {
  city: string | null;
  province: string | null;
} {
  const parts = formatted
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: null, province: null };
  const withoutCountry = parts.filter((p) => !/^argentina$/i.test(p));
  if (withoutCountry.length >= 3) {
    return {
      city: withoutCountry[withoutCountry.length - 2] ?? null,
      province: withoutCountry[withoutCountry.length - 1] ?? null,
    };
  }
  if (withoutCountry.length === 2) {
    return { city: withoutCountry[0], province: withoutCountry[1] };
  }
  return { city: withoutCountry[0] ?? null, province: null };
}
