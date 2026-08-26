import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import { MapErrorFallback } from './MapErrorFallback';
import { DEFAULT_ZOOM, type PassengerMapProps, generateMapHtml } from './mapHtml';
import { useMapController } from './useMapController';

/**
 * Web MapLibre transport.
 *
 * GPS lives on the host (useLocation → locationStore). This iframe only renders
 * the map and draws the pin from host `userLocation` postMessages.
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
  const pendingRef = useRef<string[]>([]);
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

  const postMessage = useCallback(
    (message: unknown) => {
      const raw = JSON.stringify(message);
      const win = iframeRef.current?.contentWindow;
      if (!win || !isLoaded) {
        pendingRef.current.push(raw);
        return;
      }
      win.postMessage(raw, '*');
    },
    [isLoaded],
  );

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

  useEffect(() => {
    const onMessage = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const raw = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      handleRawMessage(raw);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRawMessage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

    pendingRef.current = [];
    setIsLoaded(false);

    while (container.firstChild) container.removeChild(container.firstChild);
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
    // No geolocation in iframe — host owns GPS.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent';

    const flush = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      while (pendingRef.current.length) {
        win.postMessage(pendingRef.current.shift(), '*');
      }
    };

    let loadTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setIsLoaded(true);
      flush();
    }, LOAD_TIMEOUT_MS);

    iframe.onload = () => {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      setIsLoaded(true);
      setTimeout(flush, 0);
    };
    iframe.onerror = () => handleError();

    container.appendChild(iframe);
    iframeRef.current = iframe;

    return () => {
      if (loadTimer) clearTimeout(loadTimer);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeRef.current = null;
      while (container.firstChild) container.removeChild(container.firstChild);
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
  container: { flex: 1 },
  loadingOverlay: {
    ...(StyleSheet.absoluteFillObject as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
});
