export type MunicipalityStatus = 'unset' | 'operational' | 'waitlisted';

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
  address_resolved_city: string | null;
  address_resolved_province: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_line: string;
}

const ALIASES: Record<string, string> = {
  'v dolores': 'villa dolores',
  'v. dolores': 'villa dolores',
  'villa d': 'villa dolores',
  vd: 'villa dolores',
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

function applyAlias(normalized: string): string {
  return ALIASES[normalized] ?? normalized;
}

/**
 * Match resolved city/province against active districts.
 * Prefers name + province when both present; falls back to name-only unique match.
 */
export function matchDistrict(
  city: string | null,
  province: string | null,
  candidates: DistrictMatchCandidate[],
): DistrictMatchCandidate | null {
  const active = candidates.filter((d) => d.status === 'active');
  if (active.length === 0) return null;

  const cityNorm = city ? applyAlias(normalizePlaceName(city)) : '';
  const provinceNorm = province ? normalizePlaceName(province) : '';

  if (!cityNorm) return null;

  const nameMatches = active.filter((d) => {
    const nameNorm = applyAlias(normalizePlaceName(d.name));
    return nameNorm === cityNorm || cityNorm.includes(nameNorm) || nameNorm.includes(cityNorm);
  });

  if (nameMatches.length === 0) return null;

  if (provinceNorm) {
    const withProvince = nameMatches.filter((d) => {
      const p = normalizePlaceName(d.province);
      return p === provinceNorm || p.includes(provinceNorm) || provinceNorm.includes(p);
    });
    if (withProvince.length === 1) return withProvince[0];
    if (withProvince.length > 1) return withProvince[0];
  }

  if (nameMatches.length === 1) return nameMatches[0];
  return nameMatches[0];
}

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
  if (match) {
    return {
      municipality_status: 'operational',
      intended_district_id: match.id,
      intended_district_name: match.name,
      address_resolved_city: resolved.city ?? match.name,
      address_resolved_province: resolved.province ?? match.province,
      address_lat: resolved.lat,
      address_lng: resolved.lng,
      address_line: addressLine,
    };
  }

  return {
    municipality_status: 'waitlisted',
    intended_district_id: null,
    intended_district_name: null,
    address_resolved_city: resolved.city,
    address_resolved_province: resolved.province,
    address_lat: resolved.lat,
    address_lng: resolved.lng,
    address_line: addressLine,
  };
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
  // Drop country-ish last token if present
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
