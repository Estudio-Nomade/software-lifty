import * as Location from 'expo-location';
import { useEffect } from 'react';
import { useLocationStore } from '../store/locationStore';

type WebPosition = { coords: { latitude: number; longitude: number } };
type WebPositionError = { code: number };

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

function getWebGeolocation(): WebGeolocation | null {
  const nav = (globalThis as { navigator?: { geolocation?: WebGeolocation } }).navigator;
  return nav?.geolocation ?? null;
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
      if (!cancelled) setCurrent({ lat, lng });
    };

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
        granted = await new Promise<boolean>((resolve) => {
          webGeo.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
          );
        });
      }

      setPermissionGranted(granted);
      if (!granted || cancelled) return;

      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000 },
          (loc) => setCurrentSafe(loc.coords.latitude, loc.coords.longitude),
        );
      } catch {
        if (webGeo) {
          webWatchId = webGeo.watchPosition(
            (pos) => setCurrentSafe(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (webWatchId != null && webGeo) {
        webGeo.clearWatch(webWatchId);
      }
    };
  }, [setCurrent, setPermissionGranted]);

  return { current, permissionGranted };
}
