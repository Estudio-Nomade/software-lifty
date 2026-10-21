import { useEffect, useRef, useState } from 'react';
import { isAbortError, searchPlaces } from '../api/passenger';
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
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    // Google-Maps-like: start suggesting after 2 chars (was 3 — felt broken).
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Loading immediately so empty gate cannot flash "No encontramos…" during debounce.
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    const isStale = () =>
      cancelled || controller.signal.aborted || requestId !== requestIdRef.current;

    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchPlaces(trimmed, lat, lng, controller.signal);
          if (isStale()) return;
          setSuggestions(results);
          setError(null);
        } catch (err) {
          if (isStale()) return;
          if (isAbortError(err, controller.signal)) return;
          setSuggestions([]);
          setError('No pudimos buscar calles ni lugares');
        } finally {
          if (!isStale()) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, lat, lng]);

  return { suggestions, loading, error };
}
