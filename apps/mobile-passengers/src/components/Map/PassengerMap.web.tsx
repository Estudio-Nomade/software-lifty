import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { requestFreshPosition } from '../../hooks/useLocation';
import { useLocationStore } from '../../store/locationStore';
import { theme } from '../../theme';
import { MapErrorFallback } from './MapErrorFallback';
import { DEFAULT_ZOOM, type PassengerMapProps, generateMapHtml } from './mapHtml';
import { useMapController } from './useMapController';

/**
 * Web map transport — fast mount, no city defaults.
 *
 * - Mount the MapLibre iframe immediately (same UX speed as before).
 * - HTML starts at world view [0,0] zoom 2 — never Buenos Aires / city hardcodes.
 * - First real GPS fix (host or iframe navigator.geolocation) centers + teal pin.
 * - postMessage queue so early messages are not dropped before onload.
 * - Parent geolocation is primary; iframe geo is backup.
 */

declare const document: any;
declare const window: any;
declare const URL: {
  createObjectURL: (obj: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const LOAD_TIMEOUT_MS = 15_000;

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
  // Static HTML — no bootstrap remount. GPS arrives via postMessage / iframe geo.
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        primary: theme.colors.primary,
        lightGray: theme.colors.lightGray,
        bootstrap: null,
      }),
    [],
  );

  const containerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueue = useRef<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  const storeCurrent = useLocationStore((s) => s.current);

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

  const effectiveUser: [number, number] | null =
    fixLat != null && fixLng != null ? [fixLng, fixLat] : null;

  // Only pass a real center — never city defaults. [0,0] is ignored by controller/mapHtml.
  const effectiveCenter: [number, number] = effectiveUser
    ? effectiveUser
    : isRealFix(centerCoordinate?.[1], centerCoordinate?.[0])
      ? centerCoordinate
      : [0, 0];

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    setMountKey((k) => k + 1);
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

  // Kick host geolocation immediately (parallel to map CDN load).
  useEffect(() => {
    void requestFreshPosition();
  }, []);

  // Iframe → parent
  useEffect(() => {
    const onMessage = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'browserLocation' && isRealFix(data.lat, data.lng)) {
          useLocationStore.getState().setCurrent({ lat: data.lat, lng: data.lng });
          useLocationStore.getState().setPermissionGranted(true);
        }
        const raw = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        handleRawMessage(raw);
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRawMessage]);

  // Mount iframe immediately (do not wait for GPS).
  useEffect(() => {
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

    const flush = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      while (pendingQueue.current.length > 0) {
        const raw = pendingQueue.current.shift();
        if (raw != null) win.postMessage(raw, '*');
      }
    };

    iframe.onload = () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      setIsLoaded(true);
      setTimeout(flush, 0);
    };
    iframe.onerror = () => handleError();

    container.appendChild(iframe);
    iframeRef.current = iframe;

    loadTimeoutRef.current = setTimeout(() => {
      setIsLoaded((prev) => prev || true);
      flush();
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
  }, [mapHtml, mountKey, handleError]);

  if (hasError) {
    return <MapErrorFallback onRetry={handleRetry} style={style} />;
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
  },
});
