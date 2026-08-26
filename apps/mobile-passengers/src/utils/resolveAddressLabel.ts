import { Platform } from 'react-native';
import { reverseGeocode } from '../api/passenger';

/**
 * Human-readable label for a lat/lng.
 * Never returns raw "lat, lng" — that was the web "Desde" bug.
 *
 * Order:
 * 1. Backend /maps/geocode (auth required)
 * 2. Direct Photon reverse (web only, no auth)
 * 3. "Mi ubicación actual"
 */
export async function resolveAddressLabel(lat: number, lng: number): Promise<string> {
  // 1) Backend proxy
  try {
    const rev = await reverseGeocode(lat, lng);
    const addr = rev.formatted_address?.trim();
    if (addr && !/^Ubicación\s*\(/i.test(addr) && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addr)) {
      return addr;
    }
  } catch {
    // unauthenticated or network — try client Photon on web
  }

  // 2) Public Photon reverse (browser only)
  if (Platform.OS === 'web') {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=default`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{
            properties?: {
              name?: string;
              street?: string;
              housenumber?: string;
              city?: string;
              town?: string;
              village?: string;
              state?: string;
              country?: string;
            };
          }>;
        };
        const p = data.features?.[0]?.properties;
        if (p) {
          const street = [p.street, p.housenumber].filter(Boolean).join(' ');
          const locality = p.city || p.town || p.village || '';
          const parts = [street || p.name, locality, p.state, p.country].filter(
            (s) => typeof s === 'string' && s.length > 0,
          );
          if (parts.length > 0) return parts.join(', ');
        }
      }
    } catch {
      // fall through
    }
  }

  return 'Mi ubicación actual';
}
