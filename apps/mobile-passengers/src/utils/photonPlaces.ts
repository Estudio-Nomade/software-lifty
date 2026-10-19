import type { PlaceSuggestion } from '../api/types';

/** Villa Dolores launch footprint — bias when GPS is unknown. */
export const DEFAULT_PLACE_BIAS = { lat: -31.9456, lng: -65.1895 } as const;

const PHOTON_API = 'https://photon.komoot.io/api/';

type PhotonProps = {
  osm_id?: number | string;
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

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProps;
};

type PhotonResponse = { features?: PhotonFeature[] };

/** Prefer street+number; highway `name` counts as the street. */
export function formatPhotonPlaceLabel(p: PhotonProps): string {
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
  if (!primary) return '';

  const locality =
    (typeof p.city === 'string' && p.city) ||
    (typeof p.town === 'string' && p.town) ||
    (typeof p.village === 'string' && p.village) ||
    '';
  return [primary, locality, p.state, p.country]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(', ');
}

export function mapPhotonFeaturesToPlaces(data: PhotonResponse): PlaceSuggestion[] {
  const features = data.features ?? [];
  const out: PlaceSuggestion[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const props = f.properties;
    if (!coords || coords.length < 2 || !props) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    const description = formatPhotonPlaceLabel(props);
    if (!description) continue;
    out.push({
      description,
      place_id: String(props.osm_id ?? `${lat},${lng}`),
      lat,
      lng,
    });
  }
  return out;
}

/**
 * Direct Photon autocomplete (no backend). Used when /maps/places/autocomplete
 * fails, times out empty, or is unreachable from Expo Go.
 */
export async function searchPhotonPlaces(
  input: string,
  lat?: number,
  lng?: number,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const biasLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : DEFAULT_PLACE_BIAS.lat;
  const biasLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : DEFAULT_PLACE_BIAS.lng;

  const url = new URL(PHOTON_API);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '8');
  url.searchParams.set('lang', 'default');
  url.searchParams.set('lat', String(biasLat));
  url.searchParams.set('lon', String(biasLng));

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as PhotonResponse;
  return mapPhotonFeaturesToPlaces(data);
}
