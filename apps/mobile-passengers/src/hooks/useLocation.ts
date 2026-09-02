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
 * Only Platform.OS === 'web' is reliable.
 * RN (and jest-expo) polyfill `window`, so a window-based check falsely
 * treated Expo Go as web and never called expo-location → current stayed null.
 */
function isWebRuntime(): boolean {
  return Platform.OS === 'web';
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

const WEB_GEO_OPTS_HIGH: GeoOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 0,
};

const WEB_GEO_OPTS_BALANCED: GeoOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5_000,
};

/** Good enough to reverse-geocode a street name. */
export const TARGET_ACCURACY_M = 40;

const LOCATION_DENIED_MSG =
  'No pudimos obtener tu ubicación. Activá el GPS o permití el acceso e intentá de nuevo.';

const SECURE_CONTEXT_MSG =
  'Chrome bloquea el GPS en http://IP-de-red (no es seguro). Abrí http://localhost:8083 en ESTA PC, o usá Expo Go en el teléfono.';

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
/** Cap native getCurrentPosition so a hung BestForNavigation cannot block forever. */
const NATIVE_FIX_TIMEOUT_MS = isJestRuntime() ? 200 : 8_000;

function readBrowserGeo(): BrowserGeolocation | null {
  const g = globalThis as { navigator?: { geolocation?: BrowserGeolocation } };
  return g.navigator?.geolocation ?? null;
}

function isSecureContext(): boolean {
  const g = globalThis as { isSecureContext?: boolean; location?: { hostname?: string } };
  if (typeof g.isSecureContext === 'boolean') return g.isSecureContext;
  const host = g.location?.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function accuracyOf(pos: GeoPositionLike): number {
  const a = pos.coords.accuracy;
  return typeof a === 'number' && Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
}

export type PositionFix = { lat: number; lng: number; accuracy: number };

function setGeoError(message: string | null): void {
  useLocationStore.getState().setLocationError(message);
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

/** Legacy secondary path — host is sole web GPS owner. */
export function applyBrowserLocation(lat: number, lng: number, accuracy?: number): void {
  if (!isValidLatLng(lat, lng)) return;
  useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: false });
}

function geoErrorMessage(err: { code?: number; message?: string } | undefined): string {
  if (!err) return LOCATION_DENIED_MSG;
  // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
  if (err.code === 1) {
    return 'Permiso de ubicación denegado. Activálo en el navegador o en Ajustes.';
  }
  if (err.code === 2 && !isSecureContext()) {
    return SECURE_CONTEXT_MSG;
  }
  if (err.code === 3) {
    return 'La ubicación tardó demasiado. Revisá el GPS e intentá de nuevo.';
  }
  return LOCATION_DENIED_MSG;
}

type BrowserGetResult =
  | { ok: true; pos: GeoPositionLike }
  | { ok: false; err?: { code?: number; message?: string } };

function browserGetCurrent(geo: BrowserGeolocation, opts: GeoOptions): Promise<BrowserGetResult> {
  return new Promise((resolve) => {
    try {
      geo.getCurrentPosition(
        (pos) => resolve({ ok: true, pos }),
        (err) => resolve({ ok: false, err }),
        opts,
      );
    } catch (e) {
      resolve({
        ok: false,
        err: { message: e instanceof Error ? e.message : 'geolocation failed' },
      });
    }
  });
}

/**
 * Collect browser positions until TARGET_ACCURACY_M or timeout.
 * Never force-overwrite a better stored fix with a coarser one.
 * Falls back to enableHighAccuracy:false when high-accuracy times out.
 */
function requestBestWebPosition(): Promise<PositionFix | null> {
  // Chrome/Safari block navigator.geolocation on http://LAN-IP (not a secure
  // context). Fail fast with an honest message instead of spinning ~16s.
  if (!isSecureContext()) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[passenger-geo] insecure context — geolocation blocked on this origin');
    }
    setGeoError(SECURE_CONTEXT_MSG);
    return Promise.resolve(null);
  }

  const geo = readBrowserGeo();
  if (!geo) {
    const cur = useLocationStore.getState().current;
    if (cur && isValidLatLng(cur.lat, cur.lng)) {
      return Promise.resolve({
        lat: cur.lat,
        lng: cur.lng,
        accuracy: cur.accuracy ?? Number.POSITIVE_INFINITY,
      });
    }
    setGeoError(LOCATION_DENIED_MSG);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let best: PositionFix | null = null;
    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastError: { code?: number; message?: string } | undefined;
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
      setGeoError(geoErrorMessage(lastError));
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

    const onErr = (err: { code?: number; message?: string }) => {
      lastError = err;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[passenger-geo] web geo error', err?.code, err?.message);
      }
    };

    const startWatch = (opts: GeoOptions) => {
      try {
        if (watchId != null) {
          try {
            geo.clearWatch(watchId);
          } catch {
            // ignore
          }
        }
        watchId = geo.watchPosition(onPos, onErr, opts);
      } catch {
        // optional
      }
    };

    void (async () => {
      // High accuracy first, then balanced network fallback (common on desktop/LAN).
      const high = await browserGetCurrent(geo, WEB_GEO_OPTS_HIGH);
      if (settled) return;
      if (high.ok) {
        onPos(high.pos);
      } else if (high.err?.code === 1) {
        // Permission denied — no point retrying balanced or spinning.
        lastError = high.err;
        finish();
        return;
      } else {
        lastError = high.err;
        const balanced = await browserGetCurrent(geo, WEB_GEO_OPTS_BALANCED);
        if (settled) return;
        if (balanced.ok) {
          onPos(balanced.pos);
        } else {
          lastError = balanced.err ?? high.err;
        }
      }
      if (settled) return;
      // Prefer high-accuracy watch until we already have a tight fix.
      const storeAcc = useLocationStore.getState().current?.accuracy;
      const tight =
        typeof storeAcc === 'number' && Number.isFinite(storeAcc) && storeAcc <= TARGET_ACCURACY_M;
      startWatch(tight ? WEB_GEO_OPTS_BALANCED : WEB_GEO_OPTS_HIGH);
    })();

    timer = setTimeout(finish, MAX_WAIT_MS);
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('location_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

async function getNativePositionOnce(
  accuracy: Location.LocationAccuracy,
): Promise<GeoPositionLike | null> {
  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy }),
      NATIVE_FIX_TIMEOUT_MS,
    );
    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort position with accuracy.
 * Web waits for GPS warm-up; still may return coarse WiFi after timeout.
 * Native tries BestForNavigation then Balanced so a hung high-accuracy call cannot block.
 */
export async function requestFreshPosition(): Promise<PositionFix | null> {
  if (isWebRuntime()) {
    return requestBestWebPosition();
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setGeoError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
      useLocationStore.getState().setPermissionGranted(false);
      return null;
    }
    useLocationStore.getState().setPermissionGranted(true);

    const pos =
      (await getNativePositionOnce(Location.Accuracy.BestForNavigation)) ??
      (await getNativePositionOnce(Location.Accuracy.Balanced)) ??
      (await getNativePositionOnce(Location.Accuracy.High));

    if (!pos) {
      setGeoError(LOCATION_DENIED_MSG);
      return null;
    }

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (!isValidLatLng(lat, lng)) {
      setGeoError(LOCATION_DENIED_MSG);
      return null;
    }
    const accuracy =
      typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : Number.POSITIVE_INFINITY;
    useLocationStore.getState().applyFix({ lat, lng, accuracy }, { force: true });
    return { lat, lng, accuracy };
  } catch {
    setGeoError(LOCATION_DENIED_MSG);
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
  const locationError = useLocationStore((s) => s.locationError);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);

  useEffect(() => {
    if (isWebRuntime()) {
      if (!isSecureContext()) {
        setPermissionGranted(false);
        setGeoError(SECURE_CONTEXT_MSG);
        return;
      }

      const geo = readBrowserGeo();
      if (!geo) {
        setPermissionGranted(false);
        setGeoError(LOCATION_DENIED_MSG);
        return;
      }

      let watchId: number | null = null;
      let cancelled = false;

      void requestBestWebPosition().then((fix) => {
        if (cancelled) return;
        if (fix) setPermissionGranted(true);
      });

      try {
        watchId = geo.watchPosition(
          (pos) => {
            if (!cancelled) applyPosition(pos, false);
          },
          (err) => {
            if (cancelled) return;
            if (__DEV__) {
              // eslint-disable-next-line no-console
              console.warn('[passenger-geo] watch error', err?.code, err?.message);
            }
            if (!useLocationStore.getState().current) {
              setPermissionGranted(false);
              setGeoError(geoErrorMessage(err));
            }
          },
          WEB_GEO_OPTS_HIGH,
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
      if (!granted) {
        if (!cancelled)
          setGeoError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
        return;
      }
      if (cancelled) return;

      // Start watch first so a hung getCurrentPosition cannot leave current=null forever.
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
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
        // watch failed — still try one-shot below
      }
      if (cancelled) return;

      // Seed with one-shot (timeout + accuracy fallback). Does not block the watch.
      const pos =
        (await getNativePositionOnce(Location.Accuracy.Balanced)) ??
        (await getNativePositionOnce(Location.Accuracy.High)) ??
        (await getNativePositionOnce(Location.Accuracy.BestForNavigation));

      if (!cancelled && pos) {
        applyPosition(pos, true);
      } else if (!cancelled && !useLocationStore.getState().current) {
        setGeoError(LOCATION_DENIED_MSG);
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

  return { current, permissionGranted, locationError, refresh };
}
