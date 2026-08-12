import { useEffect, useState } from 'react';
import { searchPlaces } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { useLocationStore } from '../store/locationStore';

export function usePlaceAutocomplete(query: string): PlaceSuggestion[] {
  const current = useLocationStore((s) => s.current);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const lat = current?.lat;
  const lng = current?.lng;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setSuggestions(await searchPlaces(trimmed, lat, lng));
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, lat, lng]);

  return suggestions;
}
