import { Platform } from 'react-native';
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
  /** meters — when coarse, never invent a street name (WiFi/IP lie). */
  accuracy?: number;
};

/** Above this, reverse-geocode is noise (wrong street like "Margarita Galfre"). */
export const MAX_LABEL_ACCURACY_M = 100;

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

async function reversePhoton(lat: number, lng: number): Promise<string | null> {
  const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=default`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: Array<{ properties?: PhotonProps }> };
  const props = data.features?.[0]?.properties;
  return props ? formatStreetLabel(props) : null;
}

async function reverseNominatim(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&format=json&addressdetails=1&zoom=18`;
  const res = await fetch(url, {
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
}

/**
 * Human-readable label for a lat/lng.
 * Coarse fixes (accuracy > MAX_LABEL_ACCURACY_M) → "Mi ubicación actual"
 * so WiFi/IP never freezes a wrong nearby street name.
 */
export async function resolveAddressLabel(
  lat: number,
  lng: number,
  opts?: ResolveLabelOptions,
): Promise<string> {
  const acc = opts?.accuracy;
  if (typeof acc === 'number' && Number.isFinite(acc) && acc > MAX_LABEL_ACCURACY_M) {
    return 'Mi ubicación actual';
  }

  let best: string | null = null;

  try {
    const rev = await reverseGeocode(lat, lng);
    const addr = rev.formatted_address?.trim();
    if (addr && !isRawCoordsLabel(addr)) {
      best = addr;
      if (hasHouseNumber(addr)) return addr;
    }
  } catch {
    // unauthenticated or network
  }

  if (Platform.OS === 'web') {
    try {
      const photon = await reversePhoton(lat, lng);
      if (photon) {
        if (!best || (hasHouseNumber(photon) && !hasHouseNumber(best))) best = photon;
        else if (!best) best = photon;
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
  }

  return best || 'Mi ubicación actual';
}
