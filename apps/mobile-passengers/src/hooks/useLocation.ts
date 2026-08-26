import * as Location from 'expo-location';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useLocationStore } from '../store/locationStore';

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** MapLibre / GeoJSON order: [longitude, latitude]. */
export function toMapCoordinate(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

/**
 * Apply a fix coming from the map iframe (web sole GPS owner).
 * Native never calls this — expo-location writes the store directly.
 */
export function applyBrowserLocation(lat: number, lng: number): void {
  if (!isValidLatLng(lat, lng)) return;
  useLocationStore.getState().setCurrent({ lat, lng });
  useLocationStore.getState().setPermissionGranted(true);
}

function isWebRuntime(): boolean {
  // Prefer Platform.OS; avoid bare `window` (no DOM lib in this tsconfig).
  if (Platform.OS === 'web') return true;
  const g = globalThis as { window?: unknown; ReactNativeWebView?: unknown };
  return typeof g.window !== 'undefined' && g.ReactNativeWebView == null;
}

/**
 * One-shot position.
 * - Web: NEVER calls navigator.geolocation / expo-location. Polls the store
 *   fed by the map iframe (sole GPS owner via browserLocation).
 * - Native: expo-location.
 */
export async function requestFreshPosition(): Promise<{ lat: number; lng: number } | null> {
  if (isWebRuntime()) {
    // Wait briefly for the iframe GPS owner to publish a fix.
    const existing = useLocationStore.getState().current;
    if (existing && isValidLatLng(existing.lat, existing.lng)) return existing;

    return new Promise((resolve) => {
      const started = Date.now();
      const id = setInterval(() => {
        const cur = useLocationStore.getState().current;
        if (cur && isValidLatLng(cur.lat, cur.lng)) {
          clearInterval(id);
          resolve(cur);
          return;
        }
        if (Date.now() - started > 12_000) {
          clearInterval(id);
          resolve(null);
        }
      }, 200);
    });
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (!isValidLatLng(lat, lng)) return null;
    useLocationStore.getState().setCurrent({ lat, lng });
    useLocationStore.getState().setPermissionGranted(true);
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Subscribe to the shared location store.
 * - Web: store is fed by the map iframe via applyBrowserLocation (NO navigator.geolocation here).
 * - Native: expo-location writes the store.
 */
export function useLocation() {
  const current = useLocationStore((s) => s.current);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const permissionGranted = useLocationStore((s) => s.permissionGranted);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);

  useEffect(() => {
    // Web: the iframe (mapHtml + navigator.geolocation) is the sole GPS owner.
    // Never call expo-location or navigator.geolocation from this hook on web.
    if (isWebRuntime()) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const setCurrentSafe = (lat: number, lng: number) => {
      if (cancelled) return;
      if (!isValidLatLng(lat, lng)) return;
      setCurrent({ lat, lng });
    };

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
        // watch may still deliver
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

  const refresh = useCallback(async () => requestFreshPosition(), []);

  return { current, permissionGranted, refresh };
}
