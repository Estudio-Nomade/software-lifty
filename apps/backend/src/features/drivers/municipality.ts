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

/** OSM/Photon often labels Villa Dolores streets with county "Pedanía Dolores". */
const ALIASES: Record<string, string> = {
  'v dolores': 'villa dolores',
  'v. dolores': 'villa dolores',
  'villa d': 'villa dolores',
  vd: 'villa dolores',
  'pedania dolores': 'villa dolores',
  'pedania de dolores': 'villa dolores',
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

export function isPedaniaLike(value: string): boolean {
  const n = normalizePlaceName(value);
  return n === 'pedania' || n.startsWith('pedania ');
}

/**
 * If address_line / formatted clearly mentions Villa Dolores (or Pedanía Dolores),
 * force city so Photon county mislabels still match the operational district.
 */
export function hintLocalityFromAddressText(text: string | null | undefined): {
  city: string | null;
  province: string | null;
} {
  if (!text?.trim()) return { city: null, province: null };
  const norm = normalizePlaceName(text);
  let city: string | null = null;
  let province: string | null = null;

  if (
    /\bvilla\s+dolores\b/.test(norm) ||
    /\bv\s*\.?\s*dolores\b/.test(norm) ||
    /\bpedania\s+(de\s+)?dolores\b/.test(norm)
  ) {
    city = 'Villa Dolores';
  }

  if (/\bcordoba\b/.test(norm)) {
    province = 'Córdoba';
  }

  return { city, province };
}

/**
 * Merge Photon/geocode city with address-line hints and aliases.
 * Prefers explicit Villa Dolores in the free-text address over pedanía county.
 */
export function resolveCityForMatch(
  city: string | null,
  province: string | null,
  addressText?: string | null,
): { city: string | null; province: string | null } {
  const hint = hintLocalityFromAddressText(addressText);
  let resolvedCity = city;
  let resolvedProvince = province ?? hint.province;

  if (hint.city) {
    if (!resolvedCity || isPedaniaLike(resolvedCity)) {
      resolvedCity = hint.city;
    } else {
      const cityNorm = applyAlias(normalizePlaceName(resolvedCity));
      if (
        cityNorm !== 'villa dolores' &&
        applyAlias(normalizePlaceName(hint.city)) === 'villa dolores'
      ) {
        resolvedCity = hint.city;
      }
    }
  }

  if (resolvedCity) {
    const aliased = applyAlias(normalizePlaceName(resolvedCity));
    if (aliased === 'villa dolores' && normalizePlaceName(resolvedCity) !== 'villa dolores') {
      resolvedCity = 'Villa Dolores';
    }
  }

  if (!resolvedProvince && hint.province) {
    resolvedProvince = hint.province;
  }

  return { city: resolvedCity, province: resolvedProvince };
}

/**
 * Match resolved city/province against active districts.
 * Prefers name + province when both present; falls back to name-only unique match.
 * Córdoba + city containing "dolores" maps to unique active "Villa Dolores" when present.
 */
export function matchDistrict(
  city: string | null,
  province: string | null,
  candidates: DistrictMatchCandidate[],
  addressText?: string | null,
): DistrictMatchCandidate | null {
  const active = candidates.filter((d) => d.status === 'active');
  if (active.length === 0) return null;

  const resolved = resolveCityForMatch(city, province, addressText);
  const cityNorm = resolved.city ? applyAlias(normalizePlaceName(resolved.city)) : '';
  const provinceNorm = resolved.province ? normalizePlaceName(resolved.province) : '';

  if (!cityNorm) return null;

  const nameMatches = active.filter((d) => {
    const nameNorm = applyAlias(normalizePlaceName(d.name));
    return nameNorm === cityNorm || cityNorm.includes(nameNorm) || nameNorm.includes(cityNorm);
  });

  if (nameMatches.length === 0) {
    // Photon county "Pedanía Dolores" already aliased; also catch bare "dolores" in Córdoba
    // only when a unique active district is Villa Dolores (avoid other provinces).
    if (
      provinceNorm &&
      (provinceNorm === 'cordoba' || provinceNorm.includes('cordoba')) &&
      cityNorm.includes('dolores')
    ) {
      const vd = active.filter((d) => applyAlias(normalizePlaceName(d.name)) === 'villa dolores');
      const cordobaVd = vd.filter((d) => {
        const p = normalizePlaceName(d.province);
        return p === 'cordoba' || p.includes('cordoba');
      });
      if (cordobaVd.length === 1) return cordobaVd[0];
    }
    return null;
  }

  if (provinceNorm) {
    const withProvince = nameMatches.filter((d) => {
      const p = normalizePlaceName(d.province);
      return p === provinceNorm || p.includes(provinceNorm) || provinceNorm.includes(p);
    });
    if (withProvince.length >= 1) return withProvince[0];
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
      address_resolved_city: match.name,
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

/**
 * Photon props: prefer real settlement fields over OSM county.
 * County "Pedanía *" is a cadastral label, not the Lifty municipality name.
 */
export function extractLocalityFromPhotonProps(
  props: Record<string, string | number | undefined>,
): { city: string | null; province: string | null } {
  const settlement = props.city || props.town || props.village || props.municipality || undefined;
  const county = props.county ? String(props.county) : null;
  const name = props.name ? String(props.name) : null;

  let cityRaw: string | null = settlement ? String(settlement) : null;
  if (!cityRaw && county && !isPedaniaLike(county)) {
    cityRaw = county;
  }
  if (!cityRaw && name && !isPedaniaLike(name)) {
    cityRaw = name;
  }
  // Last resort: pedanía county still yields a string; aliases map it to Villa Dolores.
  if (!cityRaw && county) {
    cityRaw = county;
  }

  const provinceRaw = props.state || (county && !isPedaniaLike(county) ? county : undefined);
  return {
    city: cityRaw,
    province: provinceRaw ? String(provinceRaw) : null,
  };
}

/** Parse "Street, City, Province, Country" style formatted addresses when Photon props missing. */
export function parseLocalityFromFormatted(formatted: string): {
  city: string | null;
  province: string | null;
} {
  const hint = hintLocalityFromAddressText(formatted);
  const parts = formatted
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { city: hint.city, province: hint.province };
  }
  // Drop country-ish last token if present
  const withoutCountry = parts.filter((p) => !/^argentina$/i.test(p));
  let city: string | null = null;
  let province: string | null = null;

  if (withoutCountry.length >= 3) {
    city = withoutCountry[withoutCountry.length - 2] ?? null;
    province = withoutCountry[withoutCountry.length - 1] ?? null;
  } else if (withoutCountry.length === 2) {
    city = withoutCountry[0];
    province = withoutCountry[1];
  } else {
    city = withoutCountry[0] ?? null;
  }

  // Prefer Villa Dolores when free text mentions it but comma-token picked Pedanía.
  if (hint.city && (!city || isPedaniaLike(city))) {
    city = hint.city;
  }
  if (hint.province && !province) {
    province = hint.province;
  }

  return { city, province };
}

/**
 * Lightweight re-match for stuck waitlisted drivers (no network).
 * Returns a full result only when the improved rules would now match a district.
 */
export function tryHealWaitlistedMunicipality(
  addressLine: string | null,
  city: string | null,
  province: string | null,
  lat: number | null,
  lng: number | null,
  candidates: DistrictMatchCandidate[],
): MunicipalityResolveResult | null {
  if (!addressLine && !city) return null;
  const line = addressLine?.trim() || '';
  const match = matchDistrict(city, province, candidates, line || city);
  if (!match) return null;
  return buildMunicipalityResult(
    line || match.name,
    { lat, lng, city: city ?? match.name, province: province ?? match.province },
    match,
  );
}
