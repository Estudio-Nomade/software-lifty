import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerData } from './mapHtml';

interface UseMapControllerOptions {
  centerCoordinate: [number, number];
  zoom: number;
  markers: MarkerData[];
  routeLine?: Array<[number, number]>;
  userLocation?: [number, number] | null;
  followUserLocation: boolean;
  recenterKey?: number;
  onError?: () => void;
  isLoaded: boolean;
  postMessage: (message: unknown) => void;
}

/**
 * Shared controller for the native (WebView) and web (iframe) map implementations.
 *
 * Both transports talk to the same self-contained MapLibre HTML document via
 * `postMessage`, so the message-sending effects and the incoming-message parsing
 * are identical and live here to avoid drift between `PassengerMap.tsx` and
 * `PassengerMap.web.tsx`. Each implementation only owns its transport (the
 * WebView/iframe element) and the loading/error UI.
 *
 * Coordinate convention (everywhere): `[lng, lat]` — MapLibre / GeoJSON order.
 * Messages to the HTML document use named `{ lat, lng }` fields.
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

  const initCenterRef = useRef(centerCoordinate);
  initCenterRef.current = centerCoordinate;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  // Bumps when MapLibre posts `ready` so we re-push state after style load.
  const [syncGen, setSyncGen] = useState(0);
  const programmaticMoveRef = useRef(false);

  // userLocation is always [lng, lat].
  const userLng = userLocation?.[0] ?? null;
  const userLat = userLocation?.[1] ?? null;

  useEffect(() => {
    if (!isLoaded) setSyncGen(0);
  }, [isLoaded]);

  const pushUserLocation = useCallback(
    (lat: number | null, lng: number | null) => {
      postMessage({ type: 'userLocation', lat, lng });
    },
    [postMessage],
  );

  useEffect(() => {
    if (!isLoaded) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'init', center: initCenterRef.current, zoom: zoomRef.current });
  }, [isLoaded, syncGen, postMessage]);

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

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, syncGen, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    // Only push when we have a real fix. Sending null clears the pin on native
    // and is a no-op on web (mapHtml ignores null while browser geo owns the pin).
    // Avoid spamming null on every mount/sync before geolocation resolves.
    if (userLat == null || userLng == null) return;
    pushUserLocation(userLat, userLng);
  }, [userLat, userLng, isLoaded, syncGen, pushUserLocation]);

  useEffect(() => {
    if (!isLoaded || recenterKey == null) return;
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
          // MapLibre style finished loading. Re-push all state so a userLocation
          // that arrived while the style was still loading is applied.
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
      } catch {}
    },
    [onError],
  );

  return { handleRawMessage };
}
