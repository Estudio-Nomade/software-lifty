import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { useLocationStore } from '../store/locationStore';
import {
  BG_LOCATION_PERMISSION_MSG,
  BG_LOCATION_UNAVAILABLE_MSG,
  FG_LOCATION_TIME_INTERVAL_MS,
  LOCATION_DENIED_MSG,
  LOCATION_TASK_NAME,
  PRECISE_LOCATION_REQUIRED_MSG,
  type StartTrackingOptions,
  applyLocationCoords,
  buildBackgroundLocationOptions,
  resetLocationSmoothing,
  shouldStartBackgroundUpdates,
} from './locationCore';

export {
  applyLocationCoords,
  BG_LOCATION_PERMISSION_MSG,
  BG_LOCATION_UNAVAILABLE_MSG,
  BG_LOCATION_DISTANCE_INTERVAL_M,
  BG_LOCATION_TIME_INTERVAL_MS,
  buildBackgroundLocationOptions,
  COMPLETE_GPS_ACCURACY_MAX_M,
  isGpsAccuracyTooLow,
  LOCATION_DENIED_MSG,
  LOCATION_TASK_NAME,
  normalizeGpsAccuracyM,
  shouldStartBackgroundUpdates,
  type StartTrackingOptions,
} from './locationCore';

/**
 * Only Platform.OS === 'web' is reliable.
 * RN (and jest-expo) polyfill `window`, so a window-based check falsely
 * treats Expo Go as web and never calls expo-location → lat/lng stay null.
 */
export function isWebRuntime(): boolean {
  return Platform.OS === 'web';
}

type GeoCoords = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
};
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

const SECURE_CONTEXT_MSG =
  'Chrome bloquea el GPS en http://IP-de-red (no es seguro). Abrí http://localhost:8081 en ESTA PC, o usá Expo Go en el teléfono.';

let nativeSubscription: Location.LocationSubscription | null = null;
let webWatchId: number | null = null;

/** Serializes start/stop so rapid online toggles cannot orphan FGS / watch. */
let trackingOpId = 0;
let trackingQueue: Promise<void> = Promise.resolve();

function runExclusive(op: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
  const myId = ++trackingOpId;
  const isCurrent = () => myId === trackingOpId;
  const run = trackingQueue.then(async () => {
    if (!isCurrent()) return;
    await op(isCurrent);
  });
  trackingQueue = run.catch(() => {});
  return run;
}

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
    applyLocationCoords(
      high.pos.coords.latitude,
      high.pos.coords.longitude,
      high.pos.coords.heading,
      high.pos.coords.accuracy,
    )
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
    applyLocationCoords(
      balanced.pos.coords.latitude,
      balanced.pos.coords.longitude,
      balanced.pos.coords.heading,
      balanced.pos.coords.accuracy,
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
        applyLocationCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading,
          pos.coords.accuracy,
        );
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

function stopNativeWatch(): void {
  nativeSubscription?.remove();
  nativeSubscription = null;
}

async function stopBackgroundUpdates(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.error('stopBackgroundUpdates failed:', error);
  }
}

export type BackgroundPermissionReason =
  | 'granted'
  | 'fg_denied'
  | 'bg_denied'
  | 'unavailable'
  | 'error';

export type BackgroundPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
  /**
   * True when Ajustes can actually surface Always / “todo el tiempo”.
   * False on web, Expo Go, missing Always Info.plist keys, or native throw.
   */
  canOpenSettings: boolean;
  reason: BackgroundPermissionReason;
};

/** Foreground first, then background (Android 10+ / iOS Always). */
export async function ensureBackgroundLocationPermission(): Promise<BackgroundPermissionResult> {
  if (isWebRuntime()) {
    return { granted: false, canAskAgain: false, canOpenSettings: false, reason: 'unavailable' };
  }

  try {
    // Always obtain When-In-Use first — callers (GO soft-gate / bg task) rely on this
    // even when Always is unavailable (Expo Go).
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      useLocationStore
        .getState()
        .setLocationError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
      return {
        granted: false,
        canAskAgain: fg.canAskAgain,
        canOpenSettings: !fg.canAskAgain,
        reason: 'fg_denied',
      };
    }

    // Expo Go hosts When-In-Use only on many iOS builds: Settings has no “Siempre”,
    // and requestBackgroundPermissionsAsync often rejects (ERR_LOCATION_INFO_PLIST).
    if (isRunningInExpoGo()) {
      return { granted: false, canAskAgain: false, canOpenSettings: false, reason: 'unavailable' };
    }

    const existing = await Location.getBackgroundPermissionsAsync();
    if (existing.granted) {
      return {
        granted: true,
        canAskAgain: existing.canAskAgain,
        canOpenSettings: false,
        reason: 'granted',
      };
    }
    // Don't re-open the system dialog if the user already denied Always.
    if (!existing.canAskAgain) {
      return {
        granted: false,
        canAskAgain: false,
        canOpenSettings: true,
        reason: 'bg_denied',
      };
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.granted) {
      return {
        granted: true,
        canAskAgain: bg.canAskAgain,
        canOpenSettings: false,
        reason: 'granted',
      };
    }
    return {
      granted: false,
      canAskAgain: bg.canAskAgain,
      // iOS: Always appears in Settings after a native Always request (even if denied).
      canOpenSettings: !bg.canAskAgain || Platform.OS === 'android',
      reason: 'bg_denied',
    };
  } catch (error) {
    // Missing NSLocationAlways* / UIBackgroundModes → throw, not a clean deny.
    const message = error instanceof Error ? error.message : String(error);
    if (__DEV__) {
      console.warn('ensureBackgroundLocationPermission unavailable:', message);
    }
    return { granted: false, canAskAgain: false, canOpenSettings: false, reason: 'error' };
  }
}

export async function openLocationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // ignore
  }
}

async function startForegroundWatch(): Promise<void> {
  if (nativeSubscription) return;

  nativeSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: FG_LOCATION_TIME_INTERVAL_MS,
      distanceInterval: 0,
    },
    (loc) => {
      applyLocationCoords(
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.heading,
        loc.coords.accuracy,
        loc.coords.speed,
        loc.timestamp,
      );
    },
  );
}

/** Tear down any native location source (bg task + fg watch). */
async function tearDownNativeTracking(): Promise<void> {
  resetLocationSmoothing();
  await stopBackgroundUpdates();
  stopNativeWatch();
}

async function startBackgroundLocationUpdates(isCurrent: () => boolean): Promise<void> {
  const bg = await ensureBackgroundLocationPermission();
  if (!isCurrent()) return;

  if (!bg.granted) {
    // Fall back to foreground watch so map/online still work while app is open.
    await startForegroundWatch();
    if (!isCurrent()) {
      stopNativeWatch();
    }
    return;
  }

  stopNativeWatch();

  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!isCurrent()) return;

  if (!already) {
    await Location.startLocationUpdatesAsync(
      LOCATION_TASK_NAME,
      buildBackgroundLocationOptions(Location.Accuracy.BestForNavigation),
    );
  }

  if (!isCurrent()) {
    // Superseded after start — do not leave an orphan FGS task.
    await tearDownNativeTracking();
  }
}

export async function startTracking(options: StartTrackingOptions = {}): Promise<void> {
  return runExclusive(async (isCurrent) => {
    if (isWebRuntime()) {
      await getWebPositionOnce();
      if (!isCurrent()) return;
      startWebWatch();
      return;
    }

    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return;
      if (!fg.granted) {
        useLocationStore
          .getState()
          .setLocationError(
            'Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.',
          );
        return;
      }
      // Android 12+ lets the user grant approximate only; that defeats precise tracking.
      if (fg.android?.accuracy === 'coarse') {
        useLocationStore.getState().setLocationError(PRECISE_LOCATION_REQUIRED_MSG);
        return;
      }

      useLocationStore.getState().setLocationError(null);

      if (shouldStartBackgroundUpdates(options, false)) {
        await startBackgroundLocationUpdates(isCurrent);
        return;
      }

      // Offline map follow: fg watch only (no FGS / no always permission).
      await tearDownNativeTracking();
      if (!isCurrent()) return;
      await startForegroundWatch();
      if (!isCurrent()) {
        stopNativeWatch();
      }
    } catch (error) {
      console.error('startTracking failed:', error);
      if (isCurrent()) {
        useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
      }
    }
  });
}

export async function stopTracking(): Promise<void> {
  return runExclusive(async () => {
    if (isWebRuntime()) {
      stopWebWatch();
      return;
    }
    await tearDownNativeTracking();
  });
}

/** Returns true only when a fresh fix was applied to the store. */
export async function getCurrentPosition(): Promise<boolean> {
  if (isWebRuntime()) {
    return getWebPositionOnce();
  }

  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      useLocationStore
        .getState()
        .setLocationError('Permiso de ubicación denegado. Activálo en Ajustes e intentá de nuevo.');
      return false;
    }

    const pos =
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      }).catch(() => null)) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(
        () => null,
      )) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
        () => null,
      ));

    if (!pos) {
      useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
      return false;
    }

    return applyLocationCoords(
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.heading,
      pos.coords.accuracy,
      pos.coords.speed,
      pos.timestamp,
    );
  } catch (error) {
    console.error('getCurrentPosition failed:', error);
    useLocationStore.getState().setLocationError(LOCATION_DENIED_MSG);
    return false;
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

export function getBackgroundPermissionCopy(
  result?: Pick<BackgroundPermissionResult, 'reason'>,
): string {
  if (result?.reason === 'unavailable' || result?.reason === 'error') {
    return BG_LOCATION_UNAVAILABLE_MSG;
  }
  return BG_LOCATION_PERMISSION_MSG;
}
