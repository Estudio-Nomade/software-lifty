import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocationStore } from '../../store/locationStore';
import { theme } from '../../theme';
import { MapErrorFallback } from './MapErrorFallback';
import { DEFAULT_ZOOM, type PassengerMapProps, generateMapHtml } from './mapHtml';
import { useMapController } from './useMapController';

/**
 * Web map transport.
 *
 * Uses an imperative DOM iframe (same pattern as the driver `MapView.web.tsx`)
 * instead of React `createElement('iframe')`. RN-web's synthetic host nodes do
 * not always expose a real `contentWindow`, which silently drops postMessage
 * traffic — markers from the host never reach MapLibre.
 *
 * The iframe document itself also runs `navigator.geolocation` (see mapHtml)
 * so the user pin is correct even if the React→iframe bridge lags.
 *
 * DOM types are intentionally `any` — the passenger tsconfig has no `dom` lib
 * (shared with native). Matches `apps/mobile/src/components/MapView.web.tsx`.
 */

declare const document: any;
declare const window: any;
declare const URL: {
  createObjectURL: (obj: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const LOAD_TIMEOUT_MS = 15_000;

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
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        primary: theme.colors.primary,
        lightGray: theme.colors.lightGray,
      }),
    [],
  );

  const containerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setMountKey((k) => k + 1);
  }, []);

  const postMessage = useCallback((message: unknown) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify(message), '*');
  }, []);

  const { handleRawMessage } = useMapController({
    centerCoordinate,
    zoom,
    markers,
    routeLine,
    userLocation,
    followUserLocation,
    recenterKey,
    onError: handleError,
    isLoaded,
    postMessage,
  });

  // When the iframe resolves browser geolocation first, keep React store in sync
  // so recenter / other UI have coords even if host geo was slow.
  useEffect(() => {
    const onMessage = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'browserLocation' && data.lat != null && data.lng != null) {
          useLocationStore.getState().setCurrent({ lat: data.lat, lng: data.lng });
          useLocationStore.getState().setPermissionGranted(true);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Mount a real DOM iframe into the container (imperative — not RN createElement).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

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
    // Required for navigator.geolocation inside the sandboxed blob document.
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
    };
    iframe.onerror = () => handleError();

    container.appendChild(iframe);
    iframeRef.current = iframe;

    loadTimeoutRef.current = setTimeout(() => {
      setIsLoaded((prev) => prev || true);
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

  // Parent ← iframe messages (filter by source = our iframe window).
  useEffect(() => {
    const onMessage = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const raw = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      handleRawMessage(raw);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRawMessage]);

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
