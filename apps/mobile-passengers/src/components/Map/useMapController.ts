import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerData } from './mapHtml';

interface UseMapControllerOptions {
  /** [lng, lat] */
  centerCoordinate: [number, number];
  zoom: number;
  markers: MarkerData[];
  routeLine?: Array<[number, number]>;
  /** [lng, lat] or null — only real GPS */
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
 * Shared controller for native WebView and web iframe.
 * Convention: props use [lng, lat]; messages use { lat, lng }.
 *
 * Never sends city defaults. Only real GPS goes to the map.
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

  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  const [syncGen, setSyncGen] = useState(0);
  const programmaticMoveRef = useRef(false);
  const lastRecenterKey = useRef<number | null>(null);
  const didInitRef = useRef(false);

  const userLng = userLocation?.[0] ?? null;
  const userLat = userLocation?.[1] ?? null;
  const hasUserFix = isRealFix(userLng, userLat);

  useEffect(() => {
    if (!isLoaded) {
      setSyncGen(0);
      lastRecenterKey.current = null;
      didInitRef.current = false;
    }
  }, [isLoaded]);

  // follow first
  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, syncGen, postMessage]);

  // user pin — only real fixes; first one centers inside mapHtml
  useEffect(() => {
    if (!isLoaded) return;
    if (!hasUserFix) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'userLocation', lat: userLat, lng: userLng });
  }, [userLat, userLng, hasUserFix, isLoaded, syncGen, postMessage]);

  // init ONLY with real user fix (or a real centerCoordinate). Never [0,0] / city defaults.
  useEffect(() => {
    if (!isLoaded) return;
    let center: [number, number] | null = null;
    if (hasUserFix && userLng != null && userLat != null) {
      center = [userLng, userLat];
    } else if (isRealFix(centerCoordinate[0], centerCoordinate[1])) {
      center = centerCoordinate;
    }
    if (!center) return;
    // Avoid re-init spam after the first successful center (recenter uses its own msg).
    if (didInitRef.current && syncGen === 0) return;
    didInitRef.current = true;
    programmaticMoveRef.current = true;
    postMessage({ type: 'init', center, zoom });
  }, [isLoaded, syncGen, postMessage, hasUserFix, userLat, userLng, centerCoordinate, zoom]);

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

  // Recenter always fires a message; map flies to coords or last known / re-queries GPS.
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
        // ignore
      }
    },
    [onError],
  );

  return { handleRawMessage };
}
