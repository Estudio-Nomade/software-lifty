import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkerData } from './mapHtml';

interface UseMapControllerOptions {
  /** [lng, lat] — camera fallback when no route/markers/user pin. */
  centerCoordinate: [number, number];
  zoom: number;
  markers: MarkerData[];
  routeLine?: Array<[number, number]>;
  /** [lng, lat] or null — host GPS (web + native). */
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

function realMarkerCoords(markers: MarkerData[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const mk of markers) {
    const lng = mk.coordinate?.[0];
    const lat = mk.coordinate?.[1];
    if (isRealFix(lng, lat)) out.push([lng, lat]);
  }
  return out;
}

/**
 * Thin bridge: push markers/route/userLocation/followUser/recenter to MapLibre.
 * Host owns GPS; mapHtml only draws the pin from userLocation messages.
 *
 * Camera priority when map becomes ready (and on data changes, unless user panned):
 * 1) route polyline fit
 * 2) origin/dest markers fit
 * 3) user pin (via setUserFix first-center)
 * 4) centerCoordinate jump (never null-island)
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
  const lastRecenterKey = useRef<number | null>(null);
  const programmaticMoveRef = useRef(false);
  /** Absorb MapLibre's initial moveend at WAITING_CENTER [0,0] so fitRoute is not blocked. */
  const suppressMovedUntilProgrammatic = useRef(true);

  const userLng = userLocation?.[0] ?? null;
  const userLat = userLocation?.[1] ?? null;
  const centerLng = centerCoordinate?.[0] ?? null;
  const centerLat = centerCoordinate?.[1] ?? null;

  useEffect(() => {
    if (!isLoaded) {
      lastRecenterKey.current = null;
      suppressMovedUntilProgrammatic.current = true;
      setUserManuallyMoved(false);
    }
  }, [isLoaded]);

  // Parity with driver MapView: enable follow before first userLocation.
  useEffect(() => {
    if (!isLoaded) return;
    postMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, postMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isRealFix(userLng, userLat)) return;
    programmaticMoveRef.current = true;
    suppressMovedUntilProgrammatic.current = false;
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
    if (!isLoaded) return;
    if (userManuallyMoved) return;

    if (routeLine && routeLine.length >= 2) {
      programmaticMoveRef.current = true;
      suppressMovedUntilProgrammatic.current = false;
      postMessage({ type: 'fitRoute', coordinates: routeLine });
      return;
    }

    const pts = realMarkerCoords(markers);
    if (pts.length >= 2) {
      programmaticMoveRef.current = true;
      suppressMovedUntilProgrammatic.current = false;
      postMessage({ type: 'fitRoute', coordinates: pts });
      return;
    }

    if (pts.length === 1) {
      programmaticMoveRef.current = true;
      suppressMovedUntilProgrammatic.current = false;
      postMessage({ type: 'setCenter', lng: pts[0][0], lat: pts[0][1], zoom });
      return;
    }

    // No route / markers / pin yet — still leave null-island if host has a real center.
    if (isRealFix(centerLng, centerLat) && !isRealFix(userLng, userLat)) {
      programmaticMoveRef.current = true;
      suppressMovedUntilProgrammatic.current = false;
      postMessage({ type: 'setCenter', lng: centerLng, lat: centerLat, zoom });
    }
  }, [
    isLoaded,
    routeLine,
    markers,
    userManuallyMoved,
    centerLng,
    centerLat,
    userLng,
    userLat,
    zoom,
    postMessage,
  ]);

  useEffect(() => {
    if (!isLoaded) return;
    if (recenterKey == null) return;
    if (lastRecenterKey.current === recenterKey) return;
    lastRecenterKey.current = recenterKey;

    const loc = userLocationRef.current;
    setUserManuallyMoved(false);
    programmaticMoveRef.current = true;
    suppressMovedUntilProgrammatic.current = false;
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
          if (suppressMovedUntilProgrammatic.current) {
            return;
          }
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
