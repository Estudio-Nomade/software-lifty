import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerData } from './mapHtml';

interface UseMapControllerOptions {
  /** [lng, lat]. Omit / null-island until a real fix exists — do not pass city defaults. */
  centerCoordinate: [number, number];
  zoom: number;
  markers: MarkerData[];
  routeLine?: Array<[number, number]>;
  /** [lng, lat] or null */
  userLocation?: [number, number] | null;
  followUserLocation: boolean;
  recenterKey?: number;
  onError?: () => void;
  isLoaded: boolean;
  postMessage: (message: unknown) => void;
}

function isUsableCenter(center: [number, number] | null | undefined): center is [number, number] {
  if (!center || center.length !== 2) return false;
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  // Null island — placeholder while waiting for GPS
  if (lng === 0 && lat === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Shared controller for native WebView and web iframe MapLibre documents.
 * Coordinate convention: `[lng, lat]`. Messages use named `{ lat, lng }`.
 */
export function useMapController({
  centerCoordinate,
  zoom,
  markers,
  routeLine,
  userLocation,
  followUserLocation,
  recenterKey,
  onError,
  isLoaded,
  postMessage,
}: UseMapControllerOptions) {
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const centerRef = useRef(centerCoordinate);
  centerRef.current = centerCoordinate;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  const [syncGen, setSyncGen] = useState(0);
  const programmaticMoveRef = useRef(false);
  const lastRecenterKey = useRef<number | null>(null);

  const userLng = userLocation?.[0] ?? null;
  const userLat = userLocation?.[1] ?? null;

  useEffect(() => {
    if (!isLoaded) {
      setSyncGen(0);
      lastRecenterKey.current = null;
    }
  }, [isLoaded]);

  // 1) follow first so the first userLocation can center the camera
  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, syncGen, postMessage]);

  // 2) user pin + camera (only real fixes — never null spam)
  useEffect(() => {
    if (!isLoaded) return;
    if (userLat == null || userLng == null) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'userLocation', lat: userLat, lng: userLng });
  }, [userLat, userLng, isLoaded, syncGen, postMessage]);

  // 3) init center only when we have a real coordinate (never BA / 0,0 placeholders)
  useEffect(() => {
    if (!isLoaded) return;
    const center = isUsableCenter(userLocationRef.current)
      ? userLocationRef.current
      : isUsableCenter(centerRef.current)
        ? centerRef.current
        : null;
    if (!center) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'init', center, zoom: zoomRef.current });
  }, [isLoaded, syncGen, postMessage, userLat, userLng, centerCoordinate, zoom]);

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'markers', markers });
  }, [markers, isLoaded, syncGen, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'route', coordinates: routeLine || [] });
  }, [routeLine, isLoaded, syncGen, postMessage]);

  useEffect(() => {
    if (!isLoaded || !routeLine || routeLine.length < 2) return;
    if (userManuallyMoved) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'fitRoute', coordinates: routeLine });
  }, [isLoaded, syncGen, routeLine, userManuallyMoved, postMessage]);

  // Recenter: always notify the map. Prefer live store coords; map falls back
  // to its last known fix / browser geo if host coords are missing.
  useEffect(() => {
    if (!isLoaded) return;
    if (recenterKey == null) return;
    if (lastRecenterKey.current === recenterKey) return;
    lastRecenterKey.current = recenterKey;

    const loc = userLocationRef.current;
    setUserManuallyMoved(false);
    programmaticMoveRef.current = true;
    postMessage({
      type: 'recenter',
      lat: loc?.[1] ?? null,
      lng: loc?.[0] ?? null,
    });
  }, [recenterKey, isLoaded, postMessage]);

  const handleRawMessage = useCallback(
    (raw: string) => {
      try {
        const data = JSON.parse(raw);
        if (data.type === 'ready') {
          setSyncGen((g) => g + 1);
        } else if (data.type === 'moved') {
          if (programmaticMoveRef.current) {
            programmaticMoveRef.current = false;
            setUserManuallyMoved(false);
          } else {
            setUserManuallyMoved(true);
          }
        } else if (data.type === 'error') {
          onError?.();
        }
      } catch {
        // ignore non-JSON
      }
    },
    [onError],
  );

  return { handleRawMessage };
}
