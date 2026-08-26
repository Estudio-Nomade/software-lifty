import * as Location from 'expo-location';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useLocationStore } from '../store/locationStore';

type WebPosition = { coords: { latitude: number; longitude: number } };
type WebPositionError = { code: number; message?: string };

interface WebGeolocation {
  getCurrentPosition: (
    success: (pos: WebPosition) => void,
    error: (err: WebPositionError) => void,
    options?: Record<string, unknown>,
  ) => void;
  watchPosition: (
    success: (pos: WebPosition) => void,
    error: (err: WebPositionError) => void,
    options?: Record<string, unknown>,
  ) => number;
  clearWatch: (id: number) => void;
}

const WEB_GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15_000,
  // Do not reuse a stale cached fix — wrong pin is worse than a short wait.
  maximumAge: 0,
} as const;

function getWebGeolocation(): WebGeolocation | null {
  if (Platform.OS !== 'web') return null;
  const nav = (globalThis as { navigator?: { geolocation?: WebGeolocation } }).navigator;
  return nav?.geolocation ?? null;
}

function isFiniteCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
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
      if (!isFiniteCoord(lat, lng)) return;
      setCurrent({ lat, lng });
    };

    const seedFromWeb = (): Promise<boolean> =>
      new Promise((resolve) => {
        if (!webGeo) {
          resolve(false);
          return;
        }
        webGeo.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setCurrentSafe(latitude, longitude);
            resolve(isFiniteCoord(latitude, longitude));
          },
          () => resolve(false),
          WEB_GEO_OPTIONS,
        );
      });

    (async () => {
      let granted = false;

      // 1. Preferred path: expo-location (native + web with a secure context).
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      } catch {
        granted = false;
      }

      // 2. Web fallback: expo-location can throw or return non-granted when the
      //    Permissions API is unavailable or the context is insecure, even
      //    though `navigator.geolocation` itself works (e.g. localhost/HTTPS).
      if (!granted && webGeo) {
        granted = await seedFromWeb();
      }

      setPermissionGranted(granted);
      if (!granted || cancelled) return;

      if (webGeo) {
        // Web: seed immediately (watch alone can hang or fire late), then watch.
        // Also avoid expo-location's broken subscription.remove() on web
        // (LocationEventEmitter.removeSubscription is missing).
        if (!useLocationStore.getState().current) {
          await seedFromWeb();
        }
        if (cancelled) return;

        webWatchId = webGeo.watchPosition(
          (pos) => setCurrentSafe(pos.coords.latitude, pos.coords.longitude),
          () => {
            // Watch failed (timeout / denied mid-session) — retry a one-shot fix.
            void seedFromWeb();
          },
          WEB_GEO_OPTIONS,
        );
      } else {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          setCurrentSafe(pos.coords.latitude, pos.coords.longitude);
        } catch {
          // Native one-shot failed; watch may still deliver updates.
        }
        if (cancelled) return;

        try {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
            (loc) => setCurrentSafe(loc.coords.latitude, loc.coords.longitude),
          );
        } catch {
          // Native watch failed; `current` stays at last one-shot if any.
        }
      }
    })();

    return () => {
      cancelled = true;
      if (webWatchId != null && webGeo) {
        webGeo.clearWatch(webWatchId);
      }
      if (subscription) {
        try {
          subscription.remove();
        } catch {
          // Defensive: never let a cleanup throw (guards against any platform
          // where `removeSubscription` is missing).
        }
      }
    };
  }, [setCurrent, setPermissionGranted]);

  return { current, permissionGranted };
}
