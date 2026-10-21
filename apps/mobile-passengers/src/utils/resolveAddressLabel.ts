import { reverseGeocode } from '../api/passenger';

type PhotonProps = {
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

export type ResolveLabelOptions = {
  /** meters — informational; we still reverse-geocode so Origen shows a real street when possible. */
  accuracy?: number;
};

/**
 * Soft gate: only used when reverse fails entirely.
 * Above this without a street hit → generic fallback (not a frozen wrong street).
 */
export const MAX_LABEL_ACCURACY_M = 100;

/** Client reverse ceiling (native + web) so Origen label is snappy. */
export const REVERSE_CLIENT_TIMEOUT_MS = 2800;

/** Prefer street+number over POI names. Highway `name` counts as the street. */
export function formatStreetLabel(p: PhotonProps): string | null {
  const streetField = typeof p.street === 'string' ? p.street.trim() : '';
  const num = typeof p.housenumber === 'string' ? p.housenumber.trim() : '';
  const name = typeof p.name === 'string' ? p.name.trim() : '';

  const isHighway =
    p.osm_key === 'highway' ||
    p.type === 'street' ||
    p.type === 'road' ||
    p.osm_value === 'residential';
  const street = streetField || (isHighway && name ? name : '');
  const streetLine = [street, num].filter(Boolean).join(' ');
  // Prefer real street; fall back to named place (plaza, dique nearby) over generic.
  const primary = streetLine || name;
  if (!primary) return null;

  const locality =
    (typeof p.city === 'string' && p.city) ||
    (typeof p.town === 'string' && p.town) ||
    (typeof p.village === 'string' && p.village) ||
    '';
  const parts = [primary, locality, p.state, p.country].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

export function hasHouseNumber(label: string): boolean {
  return /\d/.test(label);
}

function isRawCoordsLabel(addr: string): boolean {
  return /^Ubicación\s*\(/i.test(addr) || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addr);
}

function withTimeoutSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function reversePhoton(lat: number, lng: number): Promise<string | null> {
  const { signal, cleanup } = withTimeoutSignal(REVERSE_CLIENT_TIMEOUT_MS);
  try {
    const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=default`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ properties?: PhotonProps }> };
    const props = data.features?.[0]?.properties;
    return props ? formatStreetLabel(props) : null;
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

async function reverseNominatim(lat: number, lng: number): Promise<string | null> {
  const { signal, cleanup } = withTimeoutSignal(REVERSE_CLIENT_TIMEOUT_MS);
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'es' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        road?: string;
        pedestrian?: string;
        house_number?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        country?: string;
      };
    };
    const a = data.address;
    if (!a) return null;
    const street = (a.road || a.pedestrian || '').trim();
    const num = (a.house_number || '').trim();
    if (!street) return null;
    const primary = [street, num].filter(Boolean).join(' ');
    const locality = a.city || a.town || a.village || '';
    return [primary, locality, a.state, a.country].filter(Boolean).join(', ');
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

/**
 * Human-readable label for a lat/lng (Origen / "Usar mi ubicación").
 * Always attempts reverse (backend → Photon client → Nominatim) on **all** platforms
 * so native iOS/Android get a real street, not only "Mi ubicación actual".
 * Generic fallback only when reverse fails.
 */
export async function resolveAddressLabel(
  lat: number,
  lng: number,
  _opts?: ResolveLabelOptions,
): Promise<string> {
  let best: string | null = null;

  try {
    const rev = await reverseGeocode(lat, lng);
    const addr = rev.formatted_address?.trim();
    if (addr && !isRawCoordsLabel(addr)) {
      best = addr;
      if (hasHouseNumber(addr)) return addr;
    }
  } catch {
    // unauthenticated or network — client Photon below
  }

  try {
    const photon = await reversePhoton(lat, lng);
    if (photon) {
      if (!best || (hasHouseNumber(photon) && !hasHouseNumber(best))) best = photon;
      if (best && hasHouseNumber(best)) return best;
    }
  } catch {
    // continue
  }

  try {
    const nomi = await reverseNominatim(lat, lng);
    if (nomi) {
      if (!best || hasHouseNumber(nomi)) return nomi;
      return best;
    }
  } catch {
    // fall through
  }

  return best || 'Mi ubicación actual';
}
