import { theme } from '@/theme';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { DEFAULT_ZOOM, type MapViewProps, generateMapHtml } from './mapHtml';
import { Text } from './ui/Text';

declare const document: any;
declare const window: any;

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
}) => {
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        turquoise: theme.colors.turquoise,
        lightGray: theme.colors.lightGray,
        amber: theme.colors.amber,
      }),
    [theme.colors.turquoise, theme.colors.lightGray, theme.colors.amber],
  );

  const containerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const initCenterRef = useRef(centerCoordinate);
  initCenterRef.current = centerCoordinate;
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryKey = useRef(0);
  const loadTimeoutRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);

  const sendMessage = useCallback((msg: object) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
  }, []);

  useEffect(() => {
    if (isLoaded) return;
    loadTimeoutRef.current = setTimeout(() => {
      setIsLoaded((prev) => (prev ? prev : true));
    }, 15_000);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [isLoaded]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    const blob = new Blob([mapHtml], { type: 'text/html' } as any);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    const iframe: any = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    iframe.title = 'map';

    iframe.onload = () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      setIsLoaded(true);
    };

    iframe.onerror = () => {
      setHasError(true);
      onError?.();
    };

    container.appendChild(iframe);
    iframeRef.current = iframe;

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'error') {
          setHasError(true);
          onError?.();
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onError]);

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'init', center: initCenterRef.current, zoom });
  }, [isLoaded, sendMessage]);

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
  }, [isLoaded]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    retryKey.current += 1;
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
    ...(StyleSheet.absoluteFill as any),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
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
