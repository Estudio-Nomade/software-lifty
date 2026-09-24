import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export type PlaceSuggestion = {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
};

export function usePlaceAutocomplete(query: string): PlaceSuggestion[] {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const { data } = await apiClient.get<PlaceSuggestion[]>('/maps/places/autocomplete', {
          params: { input: trimmed },
        });
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  return suggestions;
}
