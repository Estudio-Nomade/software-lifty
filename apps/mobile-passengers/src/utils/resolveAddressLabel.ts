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
};

/** Prefer street+number over POI/person names (avoids "Margarita Galfre"). */
export function formatStreetLabel(p: PhotonProps): string | null {
  const street = typeof p.street === 'string' ? p.street.trim() : '';
  const num = typeof p.housenumber === 'string' ? p.housenumber.trim() : '';
  const streetLine = [street, num].filter(Boolean).join(' ');
  const name = typeof p.name === 'string' ? p.name.trim() : '';
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

function isRawCoordsLabel(addr: string): boolean {
  return /^Ubicación\s*\(/i.test(addr) || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addr);
}

/**
 * Human-readable label for a lat/lng.
 * Never returns raw "lat, lng".
 *
 * Order:
 * 1. Backend /maps/geocode (auth required)
 * 2. Direct Photon reverse (web only, no auth)
 * 3. "Mi ubicación actual"
 */
export async function resolveAddressLabel(lat: number, lng: number): Promise<string> {
  try {
    const rev = await reverseGeocode(lat, lng);
    const addr = rev.formatted_address?.trim();
    if (addr && !isRawCoordsLabel(addr)) {
      return addr;
    }
  } catch {
    // unauthenticated or network — try client Photon on web
  }

  if (Platform.OS === 'web') {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=default`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{ properties?: PhotonProps }>;
        };
        const label = data.features?.[0]?.properties
          ? formatStreetLabel(data.features[0].properties)
          : null;
        if (label) return label;
      }
    } catch {
      // fall through
    }
  }

  return 'Mi ubicación actual';
}
