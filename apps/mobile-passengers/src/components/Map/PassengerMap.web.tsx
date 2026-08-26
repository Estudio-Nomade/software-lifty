import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requestFreshPosition } from '../../hooks/useLocation';
import { useLocationStore } from '../../store/locationStore';
import { theme } from '../../theme';
import { MapErrorFallback } from './MapErrorFallback';
import { DEFAULT_ZOOM, type PassengerMapProps, generateMapHtml } from './mapHtml';
import { useMapController } from './useMapController';

/**
 * Web map transport.
 *
 * Critical web rules:
 * 1. Do NOT mount the MapLibre iframe until we have a real GPS fix (or user
 *    explicitly retries). That prevents any city-default flash (e.g. BA).
 * 2. Bake the first fix into the HTML (bootstrap) so the map's first paint is
 *    already at the user.
 * 3. Use an imperative DOM iframe + message queue so postMessage is reliable.
 * 4. Parent navigator.geolocation is the source of truth; iframe geo is backup.
 */

declare const document: any;
declare const window: any;
declare const URL: {
  createObjectURL: (obj: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const LOAD_TIMEOUT_MS = 15_000;
const GPS_WAIT_MS = 25_000;

function isRealFix(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export const PassengerMap: React.FC<PassengerMapProps> = ({
  centerCoordinate,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  userLocation,
  followUserLocation = true,
  recenterKey,
  style,
  onError,
}) => {
  const storeCurrent = useLocationStore((s) => s.current);

  // Prefer prop, fall back to store (useLocation may resolve after first render).
  const propLat = userLocation?.[1] ?? null;
  const propLng = userLocation?.[0] ?? null;
  const fixLat = isRealFix(propLat, propLng)
    ? (propLat as number)
    : storeCurrent && isRealFix(storeCurrent.lat, storeCurrent.lng)
      ? storeCurrent.lat
      : null;
  const fixLng = isRealFix(propLat, propLng)
    ? (propLng as number)
    : storeCurrent && isRealFix(storeCurrent.lat, storeCurrent.lng)
      ? storeCurrent.lng
      : null;
  const hasFix = fixLat != null && fixLng != null;

  const [gpsTimedOut, setGpsTimedOut] = useState(false);
  const [gpsRetry, setGpsRetry] = useState(0);
  const [bootstrap, setBootstrap] = useState<{ lat: number; lng: number } | null>(null);

  // Capture the FIRST real fix as bootstrap and never change it (avoids iframe remount).
  useEffect(() => {
    if (bootstrap) return;
    if (hasFix && fixLat != null && fixLng != null) {
      setBootstrap({ lat: fixLat, lng: fixLng });
    }
  }, [bootstrap, hasFix, fixLat, fixLng]);

  // Actively request GPS on mount / retry — do not wait passively.
  useEffect(() => {
    let cancelled = false;
    setGpsTimedOut(false);
    const timer = setTimeout(() => {
      if (!cancelled) setGpsTimedOut(true);
    }, GPS_WAIT_MS);

    void requestFreshPosition().then((pos) => {
      if (cancelled || !pos) return;
      if (!bootstrap) setBootstrap(pos);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gpsRetry]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional retry key

  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        primary: theme.colors.primary,
        lightGray: theme.colors.lightGray,
        bootstrap,
      }),
    [bootstrap],
  );

  const containerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueue = useRef<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    setBootstrap(null);
    setGpsTimedOut(false);
    setGpsRetry((n) => n + 1);
    setMountKey((k) => k + 1);
  }, []);

  const flushQueue = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    while (pendingQueue.current.length > 0) {
      const raw = pendingQueue.current.shift();
      if (raw != null) win.postMessage(raw, '*');
    }
  }, []);

  const postMessage = useCallback(
    (message: unknown) => {
      const raw = JSON.stringify(message);
      const win = iframeRef.current?.contentWindow;
      if (!win || !isLoaded) {
        pendingQueue.current.push(raw);
        return;
      }
      try {
        win.postMessage(raw, '*');
      } catch {
        pendingQueue.current.push(raw);
      }
    },
    [isLoaded],
  );

  // Effective center/user for the controller: real fix only.
  const effectiveUser: [number, number] | null =
    fixLat != null && fixLng != null ? [fixLng, fixLat] : null;
  const effectiveCenter: [number, number] =
    effectiveUser ??
    (isRealFix(centerCoordinate?.[1], centerCoordinate?.[0])
      ? centerCoordinate
      : bootstrap
        ? [bootstrap.lng, bootstrap.lat]
        : [0, 0]);

  const { handleRawMessage } = useMapController({
    centerCoordinate: effectiveCenter,
    zoom,
    markers,
    routeLine,
    userLocation: effectiveUser,
    followUserLocation,
    recenterKey,
    onError: handleError,
    isLoaded,
    postMessage,
  });

  // Iframe → parent (browserLocation + map events)
  useEffect(() => {
    const onMessage = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'browserLocation' && isRealFix(data.lat, data.lng)) {
          useLocationStore.getState().setCurrent({ lat: data.lat, lng: data.lng });
          useLocationStore.getState().setPermissionGranted(true);
          if (!bootstrap) setBootstrap({ lat: data.lat, lng: data.lng });
        }
        const raw = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        handleRawMessage(raw);
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRawMessage, bootstrap]);

  // Mount iframe ONLY once we have bootstrap GPS.
  useEffect(() => {
    if (!bootstrap) return;
    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

    pendingQueue.current = [];
    setIsLoaded(false);

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const blob = new Blob([mapHtml], { type: 'text/html' } as any);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    const iframe: any = document.createElement('iframe');
    iframe.src = url;
    iframe.title = 'map';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    iframe.setAttribute('allow', 'geolocation');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.background = 'transparent';
    iframe.style.display = 'block';

    iframe.onload = () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      setIsLoaded(true);
      // Flush any messages queued before onload.
      setTimeout(() => {
        const win = iframe.contentWindow;
        if (!win) return;
        while (pendingQueue.current.length > 0) {
          const raw = pendingQueue.current.shift();
          if (raw != null) win.postMessage(raw, '*');
        }
      }, 0);
    };
    iframe.onerror = () => handleError();

    container.appendChild(iframe);
    iframeRef.current = iframe;

    loadTimeoutRef.current = setTimeout(() => {
      setIsLoaded((prev) => prev || true);
      flushQueue();
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeRef.current = null;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [bootstrap, mapHtml, mountKey, handleError, flushQueue]);

  if (hasError) {
    return <MapErrorFallback onRetry={handleRetry} style={style} />;
  }

  // Waiting for first GPS — never paint a city default underneath.
  if (!bootstrap) {
    return (
      <View style={[styles.container, styles.loadingOverlay, style]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.waitText}>
          {gpsTimedOut
            ? 'No pudimos obtener tu ubicación. Activá el GPS y reintentá.'
            : 'Obteniendo tu ubicación…'}
        </Text>
        {gpsTimedOut && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFillObject as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    gap: 12,
    paddingHorizontal: 24,
  },
  waitText: {
    color: theme.colors.mediumGray,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
});
