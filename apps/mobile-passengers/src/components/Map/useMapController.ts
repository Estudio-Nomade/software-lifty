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

  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  const programmaticMoveRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    programmaticMoveRef.current = true;
    postMessage({ type: 'init', center: initCenterRef.current, zoom });
  }, [isLoaded, postMessage, zoom]);

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
    postMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    postMessage({
      type: 'userLocation',
      lat: userLocation?.[1] ?? null,
      lng: userLocation?.[0] ?? null,
    });
  }, [userLocation, isLoaded, postMessage]);

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
      } catch {}
    },
    [onError],
  );

  return { handleRawMessage };
}
