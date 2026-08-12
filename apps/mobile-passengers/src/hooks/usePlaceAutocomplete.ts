import { useEffect, useState } from 'react';
import { searchPlaces } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';

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
        setSuggestions(await searchPlaces(trimmed));
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  return suggestions;
}
