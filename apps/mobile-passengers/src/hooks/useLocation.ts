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
  timeout: 25_000,
  maximumAge: 0,
};

/** Good enough to reverse-geocode a street name. */
export const TARGET_ACCURACY_M = 40;

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

const MAX_WAIT_MS = isJestRuntime() ? 80 : 16_000;
const MIN_WAIT_MS = isJestRuntime() ? 0 : 2_500;

function readBrowserGeo(): BrowserGeolocation | null {
  const g = globalThis as { navigator?: { geolocation?: BrowserGeolocation } };
  return g.navigator?.geolocation ?? null;
}

function accuracyOf(pos: GeoPositionLike): number {
  const a = pos.coords.accuracy;
  return typeof a === 'number' && Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
}

export type PositionFix = { lat: number; lng: number; accuracy: number };

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

/** Legacy secondary path — host is sole web GPS owner. */
export function applyBrowserLocation(lat: number, lng: number, accuracy?: number): void {
  if (!isValidLatLng(lat, lng)) return;
  useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: false });
}

/**
 * Collect browser positions until TARGET_ACCURACY_M or timeout.
 * Never force-overwrite a better stored fix with a coarser one.
 */
function requestBestWebPosition(): Promise<PositionFix | null> {
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
    let best: PositionFix | null = null;
    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      if (watchId != null) {
        try {
          geo.clearWatch(watchId);
        } catch {
          // ignore
        }
      }
      if (best) {
        // Only force if equal-or-better than store (never re-inject coarse over GPS).
        const prev = useLocationStore.getState().current;
        const prevAcc = prev?.accuracy ?? Number.POSITIVE_INFINITY;
        const force = !prev || best.accuracy <= prevAcc + 5;
        useLocationStore.getState().applyFix(best, { force });
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
        useLocationStore.getState().applyFix(best, { force: false });
      }
      const waited = Date.now() - started;
      if (best.accuracy <= TARGET_ACCURACY_M && waited >= MIN_WAIT_MS) {
        finish();
      }
    };

    try {
      geo.getCurrentPosition(onPos, () => {}, WEB_GEO_OPTS);
      watchId = geo.watchPosition(onPos, () => {}, WEB_GEO_OPTS);
    } catch {
      finish();
      return;
    }

    timer = setTimeout(finish, MAX_WAIT_MS);
  });
}

/**
 * Best-effort position with accuracy.
 * Web waits for GPS warm-up; still may return coarse WiFi after timeout.
 */
export async function requestFreshPosition(): Promise<PositionFix | null> {
  if (isWebRuntime()) {
    return requestBestWebPosition();
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
    const accuracy =
      typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : Number.POSITIVE_INFINITY;
    useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: true });
    return { lat, lng, accuracy };
  } catch {
    return null;
  }
}

/**
 * Architecture (web): host navigator.geolocation → locationStore → map userLocation.
 * Architecture (native): expo-location → locationStore → WebView userLocation.
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
        // optional
      }

      return () => {
        cancelled = true;
        if (watchId != null) {
          try {
            geo.clearWatch(watchId);
          } catch {
            // cleanup
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
          // cleanup
        }
      }
    };
  }, [setPermissionGranted]);

  const refresh = useCallback(async () => requestFreshPosition(), []);

  return { current, permissionGranted, refresh };
}
