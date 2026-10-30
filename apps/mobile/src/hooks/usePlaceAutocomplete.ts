import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export type PlaceSuggestion = {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
};

/** Optional GPS bias improves ranking near the driver (maps autocomplete lat/lng). */
export function usePlaceAutocomplete(
  query: string,
  bias?: { lat: number; lng: number } | null,
): PlaceSuggestion[] {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const biasLat = bias?.lat;
  const biasLng = bias?.lng;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const params: Record<string, string | number> = { input: trimmed };
        if (
          biasLat != null &&
          biasLng != null &&
          Number.isFinite(biasLat) &&
          Number.isFinite(biasLng)
        ) {
          params.lat = biasLat;
          params.lng = biasLng;
        }
        const { data } = await apiClient.get<PlaceSuggestion[]>('/maps/places/autocomplete', {
          params,
        });
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, biasLat, biasLng]);

  return suggestions;
}
