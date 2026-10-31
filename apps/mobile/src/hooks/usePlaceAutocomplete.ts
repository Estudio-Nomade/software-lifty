import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { SERVICE_AREA_HUB } from '../lib/serviceArea';

export type PlaceSuggestion = {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
};

export type PlaceAutocompleteResult = {
  suggestions: PlaceSuggestion[];
  loading: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;

/** Villa Dolores bias when GPS unknown — same footprint as passenger / BE catalog. */
const DEFAULT_BIAS = {
  lat: SERVICE_AREA_HUB.lat,
  lng: SERVICE_AREA_HUB.lng,
} as const;

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err == null || typeof err !== 'object') return false;
  const e = err as {
    name?: string;
    code?: string | number;
    message?: string;
    __CANCEL__?: boolean;
  };
  if (e.__CANCEL__ === true) return true;
  if (e.name === 'CanceledError' || e.name === 'AbortError') return true;
  if (e.code === 'ERR_CANCELED' || e.code === 'ABORT_ERR') return true;
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return msg.includes('aborted') || msg === 'canceled' || msg === 'cancelled';
}

function isPlaceSuggestion(value: unknown): value is PlaceSuggestion {
  if (value == null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.description === 'string' &&
    row.description.trim().length > 0 &&
    typeof row.place_id === 'string' &&
    typeof row.lat === 'number' &&
    Number.isFinite(row.lat) &&
    typeof row.lng === 'number' &&
    Number.isFinite(row.lng)
  );
}

/** Backend returns a bare array; tolerate nested `{ data }` / `{ suggestions }`. */
export function normalizeAutocompletePayload(data: unknown): PlaceSuggestion[] {
  const raw: unknown[] = Array.isArray(data)
    ? data
    : data != null && typeof data === 'object'
      ? Array.isArray((data as { data?: unknown }).data)
        ? (data as { data: unknown[] }).data
        : Array.isArray((data as { suggestions?: unknown }).suggestions)
          ? (data as { suggestions: unknown[] }).suggestions
          : []
      : [];

  return raw.filter(isPlaceSuggestion).map((row) => ({
    description: row.description.trim(),
    place_id: row.place_id,
    lat: row.lat,
    lng: row.lng,
  }));
}

/** Optional GPS bias improves ranking near the driver (maps autocomplete lat/lng). */
export function usePlaceAutocomplete(
  query: string,
  bias?: { lat: number; lng: number } | null,
): PlaceAutocompleteResult {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const biasLat = bias?.lat;
  const biasLng = bias?.lng;
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

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
          const params: Record<string, string | number> = { input: trimmed };
          const hasGps =
            biasLat != null &&
            biasLng != null &&
            Number.isFinite(biasLat) &&
            Number.isFinite(biasLng);
          params.lat = hasGps ? biasLat : DEFAULT_BIAS.lat;
          params.lng = hasGps ? biasLng : DEFAULT_BIAS.lng;

          const { data } = await apiClient.get<unknown>('/maps/places/autocomplete', {
            params,
            signal: controller.signal,
            timeout: 8000,
          });
          if (isStale()) return;
          setSuggestions(normalizeAutocompletePayload(data));
          setError(null);
        } catch (err) {
          if (isStale()) return;
          if (isAbortError(err, controller.signal)) return;
          setSuggestions([]);
          setError('No pudimos buscar calles ni lugares. Probá de nuevo o usá tu ubicación.');
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
  }, [query, biasLat, biasLng]);

  return { suggestions, loading, error };
}
