import type React from 'react';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import { MapErrorFallback } from './MapErrorFallback';
import { DEFAULT_ZOOM, type PassengerMapProps, generateMapHtml } from './mapHtml';
import { useMapController } from './useMapController';

interface IframeWindow {
  postMessage: (message: string, targetOrigin: string) => void;
}

interface IframeElement {
  contentWindow?: IframeWindow | null;
}

interface MessageEventLike {
  data?: unknown;
  source?: unknown;
}

interface MessageListenerTarget {
  addEventListener: (type: string, listener: (event: MessageEventLike) => void) => void;
  removeEventListener: (type: string, listener: (event: MessageEventLike) => void) => void;
}

const win = globalThis as unknown as MessageListenerTarget;
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

  const iframeRef = useRef<IframeElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryKey = useRef(0);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    retryKey.current += 1;
  }, []);

  const postMessage = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
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

  // Safety net: if the iframe never fires `onload` (e.g. a CDN script hangs),
  // stop showing the loading overlay instead of spinning forever.
  useEffect(() => {
    if (isLoaded) return;
    const timeout = setTimeout(() => setIsLoaded(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isLoaded]);

  useEffect(() => {
    const handleMessage = (event: MessageEventLike) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      handleRawMessage(String(event.data));
    };

    win.addEventListener('message', handleMessage);
    return () => win.removeEventListener('message', handleMessage);
  }, [handleRawMessage]);

  if (hasError) {
    return <MapErrorFallback onRetry={handleRetry} style={style} />;
  }

  const iframe = createElement(
    'iframe',
    {
      key: retryKey.current,
      ref: iframeRef,
      srcDoc: mapHtml,
      title: 'map',
      sandbox: 'allow-scripts allow-same-origin allow-popups',
      onLoad: () => setIsLoaded(true),
      onError: handleError,
      style: styles.iframe,
    },
    null,
  );

  return (
    <View style={[styles.container, style]}>
      {iframe}
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
  iframe: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFillObject as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
});
