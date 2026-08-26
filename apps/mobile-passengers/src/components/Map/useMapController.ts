import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerData } from './mapHtml';

interface UseMapControllerOptions {
  /** [lng, lat] — unused for camera on web (iframe owns GPS); kept for native. */
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

function isRealFix(lng: number | null | undefined, lat: number | null | undefined): boolean {
  if (lng == null || lat == null) return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng === 0 && lat === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Thin bridge: push markers/route/userLocation/recenter to the MapLibre document.
 * Does NOT send city defaults or init-to-BA. Camera centering is owned by mapHtml
 * on the first real GPS fix (web) or first userLocation message (native).
 */
export function useMapController({
  markers,
  routeLine,
  userLocation,
  recenterKey,
  onError,
  isLoaded,
  postMessage,
}: UseMapControllerOptions) {
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  const lastRecenterKey = useRef<number | null>(null);
  const programmaticMoveRef = useRef(false);

  const userLng = userLocation?.[0] ?? null;
  const userLat = userLocation?.[1] ?? null;

  useEffect(() => {
    if (!isLoaded) {
      lastRecenterKey.current = null;
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isRealFix(userLng, userLat)) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'userLocation', lat: userLat, lng: userLng });
  }, [userLat, userLng, isLoaded, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'markers', markers });
  }, [markers, isLoaded, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'route', coordinates: routeLine || [] });
  }, [routeLine, isLoaded, postMessage]);

  useEffect(() => {
    if (!isLoaded || !routeLine || routeLine.length < 2) return;
    if (userManuallyMoved) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'fitRoute', coordinates: routeLine });
  }, [isLoaded, routeLine, userManuallyMoved, postMessage]);

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
        if (data.type === 'moved') {
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
        // ignore
      }
    },
    [onError],
  );

  return { handleRawMessage };
}
