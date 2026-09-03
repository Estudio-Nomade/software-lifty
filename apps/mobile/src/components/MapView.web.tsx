import { theme } from '@/theme';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { DEFAULT_ZOOM, type MapViewProps, generateMapHtml } from './mapHtml';
import { Text } from './ui/Text';

declare const document: {
  createElement: (tag: string) => any;
};
declare const window: {
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener: (type: string, listener: (event: any) => void) => void;
};
declare const URL: {
  createObjectURL: (obj: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const LOAD_TIMEOUT_MS = 15_000;

/**
 * Web MapLibre transport.
 * Host owns GPS (locationStore). Iframe only draws pin/camera from postMessages.
 * Queues messages until the iframe is ready (same pattern as passenger map).
 */
export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  alternativeRouteLine,
  heatmapPoints,
  followUserLocation = false,
  userLocation,
  userIcon,
  style,
  onError,
  onMoveEnd,
  recenterKey,
}) => {
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        turquoise: theme.colors.turquoise,
        lightGray: theme.colors.background,
        amber: theme.colors.amber,
      }),
    [],
  );

  const containerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pendingRef = useRef<string[]>([]);
  const initCenterRef = useRef(centerCoordinate);
  initCenterRef.current = centerCoordinate;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  const sendMessage = useCallback(
    (msg: object) => {
      const raw = JSON.stringify(msg);
      const win = iframeRef.current?.contentWindow;
      if (!win || !isLoaded) {
        pendingRef.current.push(raw);
        return;
      }
      win.postMessage(raw, '*');
    },
    [isLoaded],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

    pendingRef.current = [];
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

    iframe.onerror = () => {
      setHasError(true);
      onError?.();
    };

    container.appendChild(iframe);
    iframeRef.current = iframe;

    return () => {
      if (loadTimer) clearTimeout(loadTimer);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeRef.current = null;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [mapHtml, mountKey, onError]);

  useEffect(() => {
    const handler = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
        if (data.type === 'error') {
          setHasError(true);
          onError?.();
          return;
        }
        if (data.type === 'moved' && data.center && onMoveEndRef.current) {
          onMoveEndRef.current(data.center);
        }
      } catch {
        // ignore non-json
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onError]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'init', center: initCenterRef.current, zoom });
  }, [isLoaded, zoom, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'markers', markers });
  }, [markers, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'route', coordinates: routeLine || [] });
  }, [routeLine, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'alternativeRoute', coordinates: alternativeRouteLine || [] });
  }, [alternativeRouteLine, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'followUser', enabled: followUserLocation });
  }, [followUserLocation, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({
      type: 'userLocation',
      lat: userLocation?.[1] ?? null,
      lng: userLocation?.[0] ?? null,
      icon: userIcon || null,
    });
  }, [userLocation, userIcon, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'heatmap', points: heatmapPoints || [] });
  }, [heatmapPoints, isLoaded, sendMessage]);

  useEffect(() => {
    if (!isLoaded || !routeLine || routeLine.length < 2) return;
    sendMessage({ type: 'fitRoute', coordinates: routeLine });
  }, [isLoaded, routeLine, sendMessage]);

  useEffect(() => {
    if (!isLoaded || recenterKey == null) return;
    const loc = userLocationRef.current;
    sendMessage({
      type: 'recenter',
      lat: loc?.[1] ?? null,
      lng: loc?.[0] ?? null,
    });
  }, [recenterKey, isLoaded, sendMessage]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    setMountKey((k) => k + 1);
  }, []);

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorText}>No se pudo cargar el mapa</Text>
        <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
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
    ...(StyleSheet.absoluteFill as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  retryButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.turquoise,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
});
