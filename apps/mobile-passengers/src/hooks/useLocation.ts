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

function isWebRuntime(): boolean {
  if (Platform.OS === 'web') return true;
  const g = globalThis as { window?: unknown; ReactNativeWebView?: unknown };
  return typeof g.window !== 'undefined' && g.ReactNativeWebView == null;
}

type GeoCoords = { latitude: number; longitude: number; accuracy?: number | null };
type GeoPositionLike = { coords: GeoCoords };
type GeoErrorCallback = (err: { code?: number; message?: string }) => void;
type GeoSuccessCallback = (pos: GeoPositionLike) => void;
type GeoOptions = { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number };

type BrowserGeolocation = {
  getCurrentPosition: (
    success: GeoSuccessCallback,
    error?: GeoErrorCallback,
    options?: GeoOptions,
  ) => void;
  watchPosition: (
    success: GeoSuccessCallback,
    error?: GeoErrorCallback,
    options?: GeoOptions,
  ) => number;
  clearWatch: (id: number) => void;
};

const WEB_GEO_OPTS: GeoOptions = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 0,
};

function readBrowserGeo(): BrowserGeolocation | null {
  const g = globalThis as { navigator?: { geolocation?: BrowserGeolocation } };
  return g.navigator?.geolocation ?? null;
}

function applyPosition(pos: GeoPositionLike, force = false): boolean {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (!isValidLatLng(lat, lng)) return false;
  const accuracy =
    typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
      ? pos.coords.accuracy
      : undefined;
  return useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force });
}

/**
 * Apply a fix coming from the map iframe (secondary web source).
 * Host navigator.geolocation is primary; accuracy gate drops coarse overwrites.
 */
export function applyBrowserLocation(lat: number, lng: number, accuracy?: number): void {
  if (!isValidLatLng(lat, lng)) return;
  useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: false });
}

/**
 * One-shot position.
 * - Web: navigator.geolocation on the host page (works even when map is unmounted).
 * - Native: expo-location.
 */
export async function requestFreshPosition(): Promise<{ lat: number; lng: number } | null> {
  if (isWebRuntime()) {
    const geo = readBrowserGeo();
    if (geo) {
      try {
        const pos = await new Promise<GeoPositionLike>((resolve, reject) => {
          geo.getCurrentPosition(resolve, reject, WEB_GEO_OPTS);
        });
        if (applyPosition(pos, true)) {
          return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        // fall through to store
      }
    }
    const existing = useLocationStore.getState().current;
    if (existing && isValidLatLng(existing.lat, existing.lng)) {
      return { lat: existing.lat, lng: existing.lng };
    }
    return null;
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
    useLocationStore.getState().applyFix(
      {
        lat,
        lng,
        accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
      },
      { force: true },
    );
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Subscribe to the shared location store.
 * - Web: host navigator.geolocation (primary) — survives map unmount.
 * - Native: expo-location.
 */
export function useLocation() {
  const current = useLocationStore((s) => s.current);
  const permissionGranted = useLocationStore((s) => s.permissionGranted);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);

  useEffect(() => {
    if (isWebRuntime()) {
      const geo = readBrowserGeo();
      if (!geo) {
        setPermissionGranted(false);
        return;
      }

      let watchId: number | null = null;
      let cancelled = false;

      geo.getCurrentPosition(
        (pos) => {
          if (!cancelled) applyPosition(pos, true);
        },
        () => {
          if (!cancelled) setPermissionGranted(false);
        },
        WEB_GEO_OPTS,
      );

      try {
        watchId = geo.watchPosition(
          (pos) => {
            if (!cancelled) applyPosition(pos, false);
          },
          () => {},
          WEB_GEO_OPTS,
        );
      } catch {
        // watch optional
      }

      return () => {
        cancelled = true;
        if (watchId != null) {
          try {
            geo.clearWatch(watchId);
          } catch {
            // never throw from cleanup
          }
        }
      };
    }

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

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
        if (!cancelled) {
          applyPosition(
            {
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              },
            },
            true,
          );
        }
      } catch {
        // watch may still deliver
      }
      if (cancelled) return;

      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
          (loc) => {
            applyPosition(
              {
                coords: {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                  accuracy: loc.coords.accuracy,
                },
              },
              false,
            );
          },
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
  }, [setPermissionGranted]);

  const refresh = useCallback(async () => requestFreshPosition(), []);

  return { current, permissionGranted, refresh };
}
