import * as Location from 'expo-location';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useLocationStore } from '../store/locationStore';

type WebPosition = { coords: { latitude: number; longitude: number } };
type WebPositionError = { code: number; message?: string };

interface WebGeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

interface WebGeolocation {
  getCurrentPosition: (
    success: (pos: WebPosition) => void,
    error?: (err: WebPositionError) => void,
    options?: WebGeoOptions,
  ) => void;
  watchPosition: (
    success: (pos: WebPosition) => void,
    error?: (err: WebPositionError) => void,
    options?: WebGeoOptions,
  ) => number;
  clearWatch: (id: number) => void;
}

/** Browser geolocation options — prefer a fresh, accurate fix. */
const WEB_GEO_OPTIONS: WebGeoOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 5_000,
};

function getWebGeolocation(): WebGeolocation | null {
  if (Platform.OS !== 'web') return null;
  const nav = (globalThis as { navigator?: { geolocation?: WebGeolocation } }).navigator;
  return nav?.geolocation ?? null;
}

/** Reject null-island and non-finite / out-of-range pairs. */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * MapLibre / GeoJSON order: [longitude, latitude].
 * Use this whenever building map props from a {lat,lng} store value.
 */
export function toMapCoordinate(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

export function useLocation() {
  const current = useLocationStore((s) => s.current);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const permissionGranted = useLocationStore((s) => s.permissionGranted);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let webWatchId: number | null = null;
    let cancelled = false;

    const webGeo = getWebGeolocation();

    const setCurrentSafe = (lat: number, lng: number) => {
      if (cancelled) return;
      if (!isValidLatLng(lat, lng)) return;
      setCurrent({ lat, lng });
    };

    // ─── WEB: navigator.geolocation only (never expo-location) ───────────
    // expo-location on web wraps the same API but its permission helper can
    // hang, mis-report GRANTED on timeout, and its watch subscription cleanup
    // crashes (missing removeSubscription). Go straight to the browser API.
    if (webGeo) {
      const onPos = (pos: WebPosition) => {
        setCurrentSafe(pos.coords.latitude, pos.coords.longitude);
        setPermissionGranted(true);
      };
      const onErr = (err: WebPositionError) => {
        // PERMISSION_DENIED = 1
        if (err.code === 1) {
          setPermissionGranted(false);
        }
      };

      webGeo.getCurrentPosition(onPos, onErr, WEB_GEO_OPTIONS);
      webWatchId = webGeo.watchPosition(onPos, onErr, WEB_GEO_OPTIONS);

      return () => {
        cancelled = true;
        if (webWatchId != null) webGeo.clearWatch(webWatchId);
      };
    }

    // ─── NATIVE: expo-location ───────────────────────────────────────────
    (async () => {
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      } catch {
        granted = false;
      }

      setPermissionGranted(granted);
      if (!granted || cancelled) return;

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setCurrentSafe(pos.coords.latitude, pos.coords.longitude);
      } catch {
        // one-shot failed; watch may still deliver
      }
      if (cancelled) return;

      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
          (loc) => setCurrentSafe(loc.coords.latitude, loc.coords.longitude),
        );
      } catch {
        // watch failed
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) {
        try {
          subscription.remove();
        } catch {
          // never throw from cleanup
        }
      }
    };
  }, [setCurrent, setPermissionGranted]);

  return { current, permissionGranted };
}
