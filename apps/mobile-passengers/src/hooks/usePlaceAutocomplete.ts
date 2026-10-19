import { useEffect, useState } from 'react';
import { searchPlaces } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { useLocationStore } from '../store/locationStore';

export interface PlaceAutocompleteResult {
  suggestions: PlaceSuggestion[];
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 300;

export function usePlaceAutocomplete(query: string): PlaceAutocompleteResult {
  const current = useLocationStore((s) => s.current);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lat = current?.lat;
  const lng = current?.lng;

  useEffect(() => {
    const trimmed = query.trim();
    // Google-Maps-like: start suggesting after 2 chars (was 3 — felt broken).
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;

    const timeout = setTimeout(() => {
      loadingTimer = setTimeout(() => {
        if (!cancelled) setLoading(true);
      }, 150);

      void (async () => {
        try {
          const results = await searchPlaces(trimmed, lat, lng, controller.signal);
          if (cancelled || controller.signal.aborted) return;
          setSuggestions(results);
          setError(null);
        } catch (err) {
          if (cancelled || controller.signal.aborted) return;
          const isAbort =
            (err as { name?: string; code?: string })?.name === 'CanceledError' ||
            (err as { name?: string; code?: string })?.code === 'ERR_CANCELED' ||
            (err as { name?: string })?.name === 'AbortError';
          if (isAbort) return;
          setSuggestions([]);
          setError('No pudimos buscar calles ni lugares');
        } finally {
          if (!cancelled) setLoading(false);
          if (loadingTimer) clearTimeout(loadingTimer);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (loadingTimer) clearTimeout(loadingTimer);
      controller.abort();
    };
  }, [query, lat, lng]);

  return { suggestions, loading, error };
}
