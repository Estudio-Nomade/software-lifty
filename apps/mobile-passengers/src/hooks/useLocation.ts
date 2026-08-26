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

/** Prefer real GPS; never reuse a cached network fix. */
const WEB_GEO_OPTS: GeoOptions = {
  enableHighAccuracy: true,
  timeout: 25_000,
  maximumAge: 0,
};

/** Stop waiting early once accuracy is this good (meters). */
export const TARGET_ACCURACY_M = 40;
/** Minimum time to wait for a better fix after the first sample (ms). */
const MIN_SAMPLE_MS = 2_000;

function isJestRuntime(): boolean {
  try {
    return (
      typeof process !== 'undefined' &&
      Boolean((process.env as { JEST_WORKER_ID?: string }).JEST_WORKER_ID)
    );
  } catch {
    return false;
  }
}

/** Hard cap while hunting for a tight fix (ms). Short under Jest. */
const MAX_WAIT_MS = isJestRuntime() ? 80 : 14_000;
const MIN_WAIT_MS = isJestRuntime() ? 0 : MIN_SAMPLE_MS;

function readBrowserGeo(): BrowserGeolocation | null {
  const g = globalThis as { navigator?: { geolocation?: BrowserGeolocation } };
  return g.navigator?.geolocation ?? null;
}

function accuracyOf(pos: GeoPositionLike): number {
  const a = pos.coords.accuracy;
  return typeof a === 'number' && Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
}

function applyPosition(pos: GeoPositionLike, force = false): boolean {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (!isValidLatLng(lat, lng)) return false;
  const accuracy = accuracyOf(pos);
  return useLocationStore.getState().applyFix(
    {
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
    },
    { force },
  );
}

/**
 * Secondary path (legacy): map iframe used to own GPS.
 * Host is now the sole web GPS owner — still accept better fixes only.
 */
export function applyBrowserLocation(lat: number, lng: number, accuracy?: number): void {
  if (!isValidLatLng(lat, lng)) return;
  useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: false });
}

type Fix = { lat: number; lng: number; accuracy: number };

/**
 * Collect browser positions until TARGET_ACCURACY_M or timeout.
 * Browsers often return a coarse WiFi/IP fix first; GPS arrives seconds later.
 */
function requestBestWebPosition(): Promise<Fix | null> {
  const geo = readBrowserGeo();
  if (!geo) {
    const cur = useLocationStore.getState().current;
    return Promise.resolve(
      cur && isValidLatLng(cur.lat, cur.lng)
        ? {
            lat: cur.lat,
            lng: cur.lng,
            accuracy: cur.accuracy ?? Number.POSITIVE_INFINITY,
          }
        : null,
    );
  }

  return new Promise((resolve) => {
    let best: Fix | null = null;
    let settled = false;
    let watchId: number | null = null;
    const started = Date.now();

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId != null) {
        try {
          geo.clearWatch(watchId);
        } catch {
          // ignore
        }
      }
      if (best) {
        useLocationStore.getState().applyFix(best, { force: true });
        resolve(best);
        return;
      }
      const cur = useLocationStore.getState().current;
      if (cur && isValidLatLng(cur.lat, cur.lng)) {
        resolve({
          lat: cur.lat,
          lng: cur.lng,
          accuracy: cur.accuracy ?? Number.POSITIVE_INFINITY,
        });
        return;
      }
      resolve(null);
    };

    const onPos = (pos: GeoPositionLike) => {
      if (settled) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isValidLatLng(lat, lng)) return;
      const accuracy = accuracyOf(pos);
      if (!best || accuracy < best.accuracy - 1) {
        best = { lat, lng, accuracy };
        // Publish progressive improvements (no force) so the map pin tracks GPS warm-up.
        useLocationStore.getState().applyFix(best, { force: false });
      }
      const waited = Date.now() - started;
      if (best.accuracy <= TARGET_ACCURACY_M && waited >= MIN_WAIT_MS) {
        finish();
      }
    };

    const onErr = () => {
      // Keep waiting for watch / timeout if we already have something.
      if (!best && Date.now() - started > MAX_WAIT_MS) finish();
    };

    try {
      geo.getCurrentPosition(onPos, onErr, WEB_GEO_OPTS);
      watchId = geo.watchPosition(onPos, onErr, WEB_GEO_OPTS);
    } catch {
      finish();
      return;
    }

    setTimeout(finish, MAX_WAIT_MS);
  });
}

/**
 * One-shot best-effort position.
 * - Web: wait for high-accuracy GPS (not the first coarse WiFi hit).
 * - Native: expo-location High accuracy.
 */
export async function requestFreshPosition(): Promise<{ lat: number; lng: number } | null> {
  if (isWebRuntime()) {
    const best = await requestBestWebPosition();
    return best ? { lat: best.lat, lng: best.lng } : null;
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
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
 * Shared location subscription.
 *
 * Architecture (web):
 *   Host page navigator.geolocation → locationStore → map iframe via userLocation.
 *   The map iframe does NOT call geolocation (avoids dual sources / pin drift).
 *
 * Architecture (native):
 *   expo-location → locationStore → WebView userLocation messages.
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

      // Kick a best-effort hunt once, then keep watching for tighter fixes.
      void requestBestWebPosition().then((fix) => {
        if (!cancelled && fix) setPermissionGranted(true);
      });

      try {
        watchId = geo.watchPosition(
          (pos) => {
            if (!cancelled) applyPosition(pos, false);
          },
          () => {
            if (!cancelled && !useLocationStore.getState().current) {
              setPermissionGranted(false);
            }
          },
          WEB_GEO_OPTS,
        );
      } catch {
        // watch optional after one-shot
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
          accuracy: Location.Accuracy.BestForNavigation,
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
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 5,
          },
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
