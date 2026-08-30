import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { useLocationStore } from '../store/locationStore';

/**
 * Only Platform.OS === 'web' is reliable.
 * RN (and jest-expo) polyfill `window`, so a window-based check falsely
 * treats Expo Go as web and never calls expo-location → lat/lng stay null.
 */
export function isWebRuntime(): boolean {
  return Platform.OS === 'web';
}

type GeoCoords = { latitude: number; longitude: number; heading?: number | null };
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

const LOCATION_TASK = 'lifty-location';

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

const LOCATION_DENIED_MSG =
  'No pudimos obtener tu ubicación. Activá el GPS o permití el acceso e intentá de nuevo.';

const SECURE_CONTEXT_MSG =
  'Chrome bloquea el GPS en http://IP-de-red (no es seguro). Abrí http://localhost:8081 en ESTA PC, o usá Expo Go en el teléfono.';

let nativeSubscription: Location.LocationSubscription | null = null;
let webWatchId: number | null = null;

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

function geoErrorMessage(err: { code?: number; message?: string } | undefined): string {
  if (!err) return LOCATION_DENIED_MSG;
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

function applyCoords(lat: number, lng: number, heading?: number | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  useLocationStore.getState().setLocation(lat, lng, heading ?? null);
  useLocationStore.getState().setLocationError(null);
  return true;
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

async function getWebPositionOnce(): Promise<boolean> {
  // Chrome/Safari deny Geolocation on http://LAN-IP (not a secure context).
  // Fail immediately — do not spin 20s+ on timeouts that never resolve usefully.
  if (!isSecureContext()) {
    if (__DEV__) {
      console.warn('[driver-geo] insecure context — geolocation blocked on this origin');
    }
    useLocationStore.getState().setLocationError(SECURE_CONTEXT_MSG);
    return false;
  }

  const geo = readBrowserGeo();
  if (!geo) {
    useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
    return false;
  }

  const high = await browserGetCurrent(geo, WEB_GEO_OPTS_HIGH);
  if (
    high.ok &&
    applyCoords(high.pos.coords.latitude, high.pos.coords.longitude, high.pos.coords.heading)
  ) {
    return true;
  }
  // Permission denied — no point retrying with balanced accuracy.
  if (!high.ok && high.err?.code === 1) {
    useLocationStore.getState().setLocationError(geoErrorMessage(high.err));
    return false;
  }

  const balanced = await browserGetCurrent(geo, WEB_GEO_OPTS_BALANCED);
  if (
    balanced.ok &&
    applyCoords(
      balanced.pos.coords.latitude,
      balanced.pos.coords.longitude,
      balanced.pos.coords.heading,
    )
  ) {
    return true;
  }

  const { lat, lng } = useLocationStore.getState();
  if (lat != null && lng != null) return true;

  useLocationStore
    .getState()
    .setLocationError(
      geoErrorMessage(!balanced.ok ? balanced.err : high.ok ? undefined : high.err),
    );
  return false;
}

function startWebWatch(): void {
  const geo = readBrowserGeo();
  if (!geo) return;
  if (webWatchId != null) return;

  try {
    webWatchId = geo.watchPosition(
      (pos) => {
        applyCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
      },
      (err) => {
        if (__DEV__) {
          console.warn('[driver-geo] watch error', err?.code, err?.message);
        }
        const { lat, lng } = useLocationStore.getState();
        if (lat == null || lng == null) {
          useLocationStore.getState().setLocationError(geoErrorMessage(err));
        }
      },
      WEB_GEO_OPTS_HIGH,
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[driver-geo] watch start failed', error);
    }
  }
}

function stopWebWatch(): void {
  if (webWatchId == null) return;
  const geo = readBrowserGeo();
  try {
    geo?.clearWatch(webWatchId);
  } catch {
    // ignore
  }
  webWatchId = null;
}

export async function startTracking(): Promise<void> {
  if (isWebRuntime()) {
    await getWebPositionOnce();
    startWebWatch();
    return;
  }

  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      useLocationStore
        .getState()
        .setLocationError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
      return;
    }

    useLocationStore.getState().setLocationError(null);

    if (nativeSubscription) return;

    nativeSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
      },
      (loc) => {
        applyCoords(loc.coords.latitude, loc.coords.longitude, loc.coords.heading);
      },
    );
  } catch (error) {
    console.error('startTracking failed:', error);
    useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
  }
}

export async function stopTracking(): Promise<void> {
  if (isWebRuntime()) {
    stopWebWatch();
    return;
  }

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (error) {
    console.error('stopTracking failed:', error);
  } finally {
    nativeSubscription?.remove();
    nativeSubscription = null;
  }
}

export async function getCurrentPosition(): Promise<void> {
  if (isWebRuntime()) {
    await getWebPositionOnce();
    return;
  }

  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      useLocationStore
        .getState()
        .setLocationError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
      return;
    }

    const pos =
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(
        () => null,
      )) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
        () => null,
      ));

    if (!pos) {
      useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
      return;
    }

    applyCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
  } catch (error) {
    console.error('getCurrentPosition failed:', error);
    useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
  }
}

export async function hasPermissions(): Promise<boolean> {
  if (isWebRuntime()) {
    const geo = readBrowserGeo();
    if (!geo) return false;
    // Browser has no sync permission API for all engines; treat geo available as ok.
    return true;
  }

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('hasPermissions failed:', error);
    return false;
  }
}

export async function requestPermissions(): Promise<boolean> {
  if (isWebRuntime()) {
    const ok = await getWebPositionOnce();
    return ok;
  }

  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      useLocationStore
        .getState()
        .setLocationError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
    }
    return granted;
  } catch (error) {
    console.error('requestPermissions failed:', error);
    return false;
  }
}
